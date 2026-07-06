// A from-scratch SMTP client on node:net / node:tls — no nodemailer, nothing
// borrowed. Speaks EHLO → STARTTLS (587) or implicit TLS (465) → AUTH LOGIN →
// MAIL/RCPT/DATA. Used for email-based two-step verification codes.
import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';
import { getPlatform } from './platform.js';

const CRLF = '\r\n';

// One in-flight reply reader per socket: SMTP is strictly lock-step here.
function makeIO(initialSocket, host) {
  let socket = initialSocket;
  let buffer = '';
  let waiter = null; // { resolve, reject }

  const onData = (chunk) => {
    buffer += chunk.toString('utf8');
    // A reply is complete when its final line is "NNN<space>…"
    const lines = buffer.split(/\r?\n/).filter((l) => l.length);
    const last = lines[lines.length - 1];
    if (last && /^\d{3} /.test(last) && waiter) {
      const reply = { code: Number(last.slice(0, 3)), text: buffer };
      buffer = '';
      const w = waiter; waiter = null;
      w.resolve(reply);
    }
  };
  const onError = (err) => { if (waiter) { const w = waiter; waiter = null; w.reject(err); } };

  const attach = (s) => {
    socket = s;
    socket.setTimeout(15_000, () => onError(new Error('SMTP timeout')));
    socket.on('data', onData);
    socket.on('error', onError);
  };
  attach(socket);

  const read = () => new Promise((resolve, reject) => { waiter = { resolve, reject }; });

  const expect = async (want, label) => {
    const r = await read();
    if (r.code !== want) throw new Error(`SMTP ${label}: expected ${want}, got ${r.code} ${r.text.split('\n')[0]}`);
    return r;
  };

  const cmd = async (line, want, label) => {
    socket.write(line + CRLF);
    return want ? expect(want, label || line.split(' ')[0]) : null;
  };

  const upgrade = () => new Promise((resolve, reject) => {
    socket.removeAllListeners('data');
    socket.removeAllListeners('error');
    const secured = tls.connect(
      { socket, servername: host, rejectUnauthorized: !/^(127\.0\.0\.1|localhost)$/.test(host) },
      () => resolve(secured)
    );
    secured.on('error', reject);
  });

  return {
    expect, cmd,
    async startTls() { attach(await upgrade()); },
    get socket() { return socket; },
  };
}

function connect(host, port, secure) {
  return new Promise((resolve, reject) => {
    const sock = secure
      ? tls.connect({ host, port, servername: host, rejectUnauthorized: !/^(127\.0\.0\.1|localhost)$/.test(host) }, () => resolve(sock))
      : net.connect({ host, port }, () => resolve(sock));
    sock.once('error', reject);
  });
}

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');

export async function sendEmail({ to, subject, text }) {
  const cfg = getPlatform().channels?.email || {};
  if (!cfg.enabled) throw new Error('Email channel is turned off in the admin console.');
  if (!cfg.host) throw new Error('SMTP host is missing.');
  if (!cfg.from) throw new Error('"From" address is missing.');
  const port = Number(cfg.port) || 587;
  const secure = port === 465; // implicit TLS on 465; STARTTLS otherwise

  let socket;
  try { socket = await connect(cfg.host, port, secure); }
  catch (e) { throw new Error(`can't reach ${cfg.host}:${port} (${e.code || e.message}) — check host/port and that the provider allows this connection`); }

  const io = makeIO(socket, cfg.host);
  try {
    await io.expect(220, 'greeting');

    // EHLO, falling back to HELO for old servers.
    let feats;
    try { feats = await io.cmd('EHLO atlas.network', 250, 'EHLO'); }
    catch { feats = await io.cmd('HELO atlas.network', 250, 'HELO'); }

    const isLocal = /^(127\.0\.0\.1|localhost|::1)$/.test(cfg.host);
    if (!secure && /STARTTLS/i.test(feats.text)) {
      await io.cmd('STARTTLS', 220, 'STARTTLS');
      await io.startTls();
      feats = await io.cmd('EHLO atlas.network', 250, 'EHLO/tls');
    } else if (!secure && cfg.user && !isLocal) {
      // Real providers require TLS before AUTH — guide the operator clearly.
      // (Local/dev servers like MailHog are trusted and skip this.)
      throw new Error(`${cfg.host} didn't offer STARTTLS on port ${port}; use port 465 (SSL) or 587 (STARTTLS)`);
    }

    if (cfg.user) {
      if (!/AUTH[ =].*LOGIN/i.test(feats.text)) throw new Error(`${cfg.host} doesn't advertise AUTH LOGIN — check the username/password or provider docs`);
      await io.cmd('AUTH LOGIN', 334, 'AUTH');
      await io.cmd(b64(cfg.user), 334, 'AUTH user');
      await io.cmd(b64(cfg.pass || ''), 235, 'auth (bad username or password?)');
    }

    await io.cmd(`MAIL FROM:<${cfg.from}>`, 250, 'MAIL FROM (is the From address allowed?)');
    await io.cmd(`RCPT TO:<${to}>`, 250, 'RCPT TO (recipient rejected?)');
    await io.cmd('DATA', 354, 'DATA');

    const headers = [
      `From: Atlas Network <${cfg.from}>`,
      `To: <${to}>`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@atlas.network>`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
    ].join(CRLF);
    // dot-stuffing per RFC 5321
    const body = String(text).split(/\r?\n/).map((l) => (l.startsWith('.') ? '.' + l : l)).join(CRLF);
    await io.cmd(headers + CRLF + body + CRLF + '.', 250, 'message');

    io.cmd('QUIT').catch(() => {});
    return { ok: true };
  } finally {
    io.socket.end();
    io.socket.destroy();
  }
}
