// A from-scratch SIP REGISTER probe — no SDK. It performs a real SIP
// registration handshake (UDP, MD5 digest auth per RFC 3261/2617) against a
// PBX so a business can VERIFY its FreePBX/Asterisk extension is reachable
// through their port-forwarding and that the credentials are right.
//
// This validates the CONNECTION and CREDENTIALS. It does not carry call audio:
// answering a live call needs RTP media + speech-to-text/text-to-speech, which
// ride the telephony bridge (FreePBX/Twilio → the /api/voip/ivr webhook).
import dgram from 'node:dgram';
import crypto from 'node:crypto';
import os from 'node:os';

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const rand = (n = 8) => crypto.randomBytes(n).toString('hex');

// primary non-internal IPv4 for the Via/Contact headers (rport lets the PBX
// reply to our real source anyway, so this needn't be routable)
function localIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return '127.0.0.1';
}

// Parse a WWW-Authenticate / Proxy-Authenticate "Digest ..." parameter list.
function parseDigest(header) {
  const out = {};
  const re = /(\w+)=(?:"([^"]*)"|([^,\s]*))/g;
  let m;
  while ((m = re.exec(header))) out[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3];
  return out;
}

function friendly(code, host, port, ext) {
  if (code === 200) return { ok: true, status: code, detail: `Registered — ${host} accepted extension ${ext}. Your port-forwarding and credentials are good.` };
  if (code === 401 || code === 407) return { ok: false, status: code, detail: 'The PBX rejected the credentials. Check the extension number and its secret in FreePBX.' };
  if (code === 403) return { ok: false, status: code, detail: 'Forbidden — reached the PBX, but it refused this extension (wrong secret, or it only allows registration from certain IPs).' };
  if (code === 404) return { ok: false, status: code, detail: `The PBX doesn't recognize extension ${ext}.` };
  if (code === 408) return { ok: false, status: code, detail: 'The PBX took too long to answer the registration.' };
  return { ok: false, status: code, detail: `The PBX answered with SIP ${code}.` };
}

// Try to register once. Resolves { ok, status, detail } — never rejects.
export function testRegister({ host, port = 5060, ext, user, secret, timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    host = String(host || '').trim().replace(/^sip:/i, '');
    port = Number(port) || 5060;
    ext = String(ext || '').trim();
    const authUser = String(user || ext).trim();
    if (!host || !ext) return resolve({ ok: false, status: 'config', detail: 'Enter at least the PBX host and the extension.' });

    const sock = dgram.createSocket('udp4');
    const ip = localIp();
    const callId = `${rand(12)}@myagent`;
    const fromTag = rand(6);
    const uri = `sip:${host}`;
    let cseq = 1;
    let triedAuth = false;
    let done = false;

    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); try { sock.close(); } catch { /* already closed */ } resolve(r); };
    const timer = setTimeout(
      () => finish({ ok: false, status: 'timeout', detail: `No response from ${host}:${port}. Make sure UDP ${port} is port-forwarded to your PBX and the host is right. (Repeated failed tries can trip fail2ban — wait a bit between attempts.)` }),
      timeoutMs,
    );
    timer.unref?.();

    const register = (authHeader) => {
      const branch = `z9hG4bK${rand(6)}${cseq}`;
      const lines = [
        `REGISTER ${uri} SIP/2.0`,
        `Via: SIP/2.0/UDP ${ip}:${sock.address().port};branch=${branch};rport`,
        'Max-Forwards: 70',
        `From: <sip:${ext}@${host}>;tag=${fromTag}`,
        `To: <sip:${ext}@${host}>`,
        `Call-ID: ${callId}`,
        `CSeq: ${cseq} REGISTER`,
        `Contact: <sip:${ext}@${ip}:${sock.address().port}>`,
        'Expires: 60',
        'User-Agent: myAgent-ATLAS',
        ...(authHeader ? [authHeader] : []),
        'Content-Length: 0',
        '', '',
      ];
      const buf = Buffer.from(lines.join('\r\n'));
      sock.send(buf, port, host, (err) => {
        if (err) finish({ ok: false, status: 'network', detail: `Couldn't reach ${host}: ${err.message}` });
      });
    };

    sock.on('message', (msg) => {
      const text = msg.toString('utf8');
      const code = Number((text.match(/^SIP\/2\.0 (\d{3})/) || [])[1] || 0);
      if (!code || /^SIP\/2\.0 1\d\d/.test(text)) return; // ignore provisional 1xx

      if ((code === 401 || code === 407) && !triedAuth) {
        triedAuth = true;
        const hdr = (text.match(/^(?:WWW-Authenticate|Proxy-Authenticate):\s*Digest\s*(.+)$/im) || [])[1];
        const d = parseDigest(hdr || '');
        if (!d.nonce || !d.realm) return finish(friendly(code, host, port, ext));
        const ha1 = md5(`${authUser}:${d.realm}:${secret || ''}`);
        const ha2 = md5(`REGISTER:${uri}`);
        const qop = (d.qop || '').split(',').map((s) => s.trim()).includes('auth') ? 'auth' : '';
        let response, extra = '';
        if (qop) {
          const cnonce = rand(6);
          const nc = '00000001';
          response = md5(`${ha1}:${d.nonce}:${nc}:${cnonce}:auth:${ha2}`);
          extra = `, qop=auth, nc=${nc}, cnonce="${cnonce}"`;
        } else {
          response = md5(`${ha1}:${d.nonce}:${ha2}`);
        }
        const name = code === 407 ? 'Proxy-Authorization' : 'Authorization';
        const oc = d.opaque ? `, opaque="${d.opaque}"` : '';
        cseq += 1;
        register(`${name}: Digest username="${authUser}", realm="${d.realm}", nonce="${d.nonce}", uri="${uri}", response="${response}"${extra}${oc}, algorithm=MD5`);
        return;
      }
      finish(friendly(code, host, port, ext));
    });

    sock.on('error', (err) => finish({ ok: false, status: 'network', detail: `Socket error: ${err.message}` }));
    sock.bind(() => register(null)); // ephemeral local port, then send
  });
}
