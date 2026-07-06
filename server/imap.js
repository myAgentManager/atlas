// A minimal IMAP client on node:tls — no SDK. Enough to log in, select INBOX,
// and fetch recent message envelopes + plain-text bodies so the agent can read
// and triage a business's incoming email. Each business owner configures their
// own mailbox (settings.imap), so the agent reads THEIR inbox.
import tls from 'node:tls';

function imapConnect({ host, port }) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port: Number(port) || 993, servername: host, rejectUnauthorized: false }, () => resolve(sock));
    sock.once('error', reject);
    sock.setTimeout(20_000, () => reject(new Error('IMAP timeout')));
  });
}

// Run a tagged command, collecting the full response until "TAG OK/NO/BAD".
function makeClient(sock) {
  let buf = '';
  let waiter = null;
  sock.on('data', (d) => {
    buf += d.toString('binary');
    if (!waiter) return;
    const re = new RegExp(`^${waiter.tag} (OK|NO|BAD)[^\\n]*$`, 'm');
    const m = buf.match(re);
    if (m) {
      const text = buf; buf = '';
      const w = waiter; waiter = null;
      if (m[1] === 'OK') w.resolve(text);
      else w.reject(new Error(text.split('\n').find((l) => l.includes(m[1])) || m[1]));
    }
  });
  let n = 0;
  const cmd = (line) => new Promise((resolve, reject) => {
    const tag = 'A' + (++n);
    waiter = { tag, resolve, reject };
    sock.write(`${tag} ${line}\r\n`);
  });
  // wait for greeting
  const greeting = new Promise((resolve) => { waiter = { tag: '\\*', resolve, reject: resolve }; setTimeout(resolve, 800); });
  return { cmd, greeting, sock };
}

function decodeHeader(s) {
  // minimal MIME encoded-word handling for subjects/from
  return String(s).replace(/=\?[^?]+\?[bBqQ]\?[^?]*\?=/g, (w) => {
    try {
      const [, , enc, data] = w.match(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/) ? [null, ...w.match(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/).slice(1)] : [];
      if (!enc) return w;
      if (enc.toLowerCase() === 'b') return Buffer.from(data, 'base64').toString('utf8');
      return data.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
    } catch { return w; }
  }).trim();
}

// Fetch up to `limit` most-recent messages: { from, subject, date, text }.
export async function fetchRecent({ host, port, user, pass }, limit = 10) {
  if (!host || !user || !pass) throw new Error('IMAP is not configured (need host, user, password).');
  const sock = await imapConnect({ host, port });
  const c = makeClient(sock);
  try {
    await c.greeting;
    await c.cmd(`LOGIN "${user}" "${pass.replace(/"/g, '\\"')}"`);
    const sel = await c.cmd('SELECT INBOX');
    const total = Number(sel.match(/\* (\d+) EXISTS/)?.[1] || 0);
    if (!total) return [];
    const from = Math.max(1, total - limit + 1);
    // Envelope + text body for the range.
    const resp = await c.cmd(`FETCH ${from}:${total} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)] BODY.PEEK[TEXT])`);
    return parseFetch(resp).slice(-limit).reverse();
  } finally {
    c.cmd('LOGOUT').catch(() => {});
    sock.end();
    sock.destroy();
  }
}

// Parse FETCH literals: each "{n}" is followed by n bytes.
function parseFetch(raw) {
  const out = [];
  const chunks = raw.split(/\* \d+ FETCH /).slice(1);
  for (const chunk of chunks) {
    const item = { from: '', subject: '', date: '', text: '' };
    // literals appear as `{123}\r\n<bytes>`
    const parts = chunk.split(/\{(\d+)\}\r\n/);
    // parts: [pre, len1, data1(+trailer), len2, data2, ...]
    for (let i = 1; i < parts.length; i += 2) {
      const len = Number(parts[i]);
      const data = (parts[i + 1] || '').slice(0, len);
      if (/subject:/i.test(data) || /from:/i.test(data)) {
        item.from = decodeHeader((data.match(/^from:\s*(.*)$/im) || [])[1] || '');
        item.subject = decodeHeader((data.match(/^subject:\s*(.*)$/im) || [])[1] || '(no subject)');
        item.date = (data.match(/^date:\s*(.*)$/im) || [])[1] || '';
      } else {
        // body text: strip quoted-printable soft breaks, keep it short
        item.text = Buffer.from(data, 'binary').toString('utf8')
          .replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
          .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
      }
    }
    if (item.from || item.subject) out.push(item);
  }
  return out;
}
