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
// Pulls the raw RFC822 (first 64KB) and does real MIME parsing — text/plain
// part preferred, HTML converted to readable text, transfer encodings decoded.
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
    const resp = await c.cmd(`FETCH ${from}:${total} (BODY.PEEK[]<0.65536>)`);
    return parseFetch(resp).slice(-limit).reverse();
  } finally {
    c.cmd('LOGOUT').catch(() => {});
    sock.end();
    sock.destroy();
  }
}

// Parse FETCH literals: each "{n}" is followed by n bytes of raw message.
function parseFetch(raw) {
  const out = [];
  const chunks = raw.split(/\* \d+ FETCH /).slice(1);
  for (const chunk of chunks) {
    const parts = chunk.split(/\{(\d+)\}\r\n/);
    for (let i = 1; i < parts.length; i += 2) {
      const len = Number(parts[i]);
      const data = (parts[i + 1] || '').slice(0, len);
      const mail = parseMail(data);
      if (mail.from || mail.subject !== '(no subject)') out.push(mail);
    }
  }
  return out;
}

// --- MIME parsing --------------------------------------------------------------
function splitHeadBody(s) {
  for (const sep of ['\r\n\r\n', '\n\n']) {
    const i = s.indexOf(sep);
    if (i !== -1) return [s.slice(0, i), s.slice(i + sep.length)];
  }
  return [s, ''];
}

export function parseMail(rawBinary) {
  const [head, body] = splitHeadBody(rawBinary);
  const h = (name) => {
    const m = head.match(new RegExp(`^${name}:[ \\t]*([^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*)`, 'im'));
    return m ? m[1].replace(/\r?\n[ \t]+/g, ' ').trim() : '';
  };
  const text = stripQuoted(extractText(h('content-type'), h('content-transfer-encoding'), body));
  return {
    from: decodeHeader(h('from')),
    subject: decodeHeader(h('subject')) || '(no subject)',
    date: h('date'),
    text,
  };
}

// Decode a body per its Content-Transfer-Encoding (input is a binary string).
function decodeBody(cte, s) {
  const enc = String(cte).toLowerCase();
  try {
    if (enc.includes('base64')) return Buffer.from(s.replace(/\s+/g, ''), 'base64').toString('utf8');
    if (enc.includes('quoted-printable')) {
      const qp = s.replace(/=\r?\n/g, ''); // soft line breaks
      const bytes = [];
      for (let i = 0; i < qp.length; i++) {
        if (qp[i] === '=' && /^[0-9A-Fa-f]{2}/.test(qp.slice(i + 1, i + 3))) {
          bytes.push(parseInt(qp.slice(i + 1, i + 3), 16)); i += 2;
        } else bytes.push(qp.charCodeAt(i) & 0xff);
      }
      return Buffer.from(bytes).toString('utf8');
    }
    return Buffer.from(s, 'binary').toString('utf8');
  } catch { return s; }
}

// HTML → readable text: drop style/script, keep line structure, strip tags.
function htmlToText(html) {
  return String(html)
    .replace(/<(style|script|head|title)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
}

// Walk the MIME tree: prefer a text/plain part, fall back to de-tagged HTML.
function extractText(ctype, cte, body, depth = 0) {
  if (depth > 4) return '';
  const ct = String(ctype || 'text/plain').toLowerCase();
  // boundary is case-sensitive — pull it from the original header, not the lowercased copy
  const bm = String(ctype || '').match(/boundary="?([^";\r\n]+)"?/i);
  if (ct.startsWith('multipart') && bm) {
    const segs = body.split('--' + bm[1]).slice(1).filter((s) => !s.startsWith('--'));
    let plain = '', html = '';
    for (const seg of segs) {
      const [ph, pb] = splitHeadBody(seg.replace(/^\r?\n/, ''));
      if (/content-disposition:\s*attachment/i.test(ph)) continue;
      const pct = (ph.match(/content-type:\s*([^\r\n]+)/i) || [])[1] || 'text/plain';
      const pcte = (ph.match(/content-transfer-encoding:\s*([^\r\n]+)/i) || [])[1] || '';
      if (/multipart/i.test(pct)) {
        const t = extractText(pct, pcte, pb, depth + 1);
        if (t && !plain) plain = t;
      } else if (/text\/plain/i.test(pct) && !plain) plain = decodeBody(pcte, pb);
      else if (/text\/html/i.test(pct) && !html) html = decodeBody(pcte, pb);
    }
    return plain.trim() || htmlToText(html);
  }
  const decoded = decodeBody(cte, body);
  return ct.includes('text/html') ? htmlToText(decoded) : decoded.trim();
}

// Drop quoted reply chains and signatures so the agent reads only the new part.
function stripQuoted(t) {
  let out = String(t).split(/\r?\n/).filter((l) => !/^\s*>/.test(l)).join('\n');
  for (const marker of [/^On .{5,120}wrote:\s*$/m, /^-{2,}\s*Original Message\s*-{2,}$/im, /^_{10,}$/m, /^Sent from my /m]) {
    const i = out.search(marker);
    if (i > 40) out = out.slice(0, i);
  }
  return out.replace(/\n{3,}/g, '\n\n').trim().slice(0, 2000);
}
