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
import dns from 'node:dns/promises';

// SSRF guard: the PBX host is user-supplied, and these tools send UDP to it.
// Block private/loopback/link-local targets so the test can't be used to probe
// the internal network or cloud metadata (169.254.169.254). A real PBX is a
// public, port-forwarded host.
function isPrivateV4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;   // link-local + cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true;                 // multicast/reserved
  return false;
}
export async function resolvePublic(host) {
  const h = String(host || '').trim().replace(/^sips?:/i, '').split(':')[0];
  if (!h) return { ok: false, reason: 'Enter your PBX host.' };
  try {
    const { address } = await dns.lookup(h, { family: 4 }); // SIP tool is IPv4/UDP
    if (isPrivateV4(address)) return { ok: false, reason: "That host is a private/internal address — point Atlas at your PBX's public address (the one you port-forward)." };
    return { ok: true, ip: address };
  } catch { return { ok: false, reason: "Couldn't resolve that host to an IPv4 address — check the address." }; }
}

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
        'User-Agent: Atlas-SIP',
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

// Place a real test call (SIP INVITE) to another extension to prove the line can
// reach it. We don't carry audio — on ringing/answer we immediately CANCEL/BYE.
// Reports whether the target rang, answered, was busy, or is unreachable.
export function placeTestCall({ host, port = 5060, ext, user, secret, toExt, timeoutMs = 10000 } = {}) {
  return new Promise((resolve) => {
    host = String(host || '').trim().replace(/^sip:/i, '');
    port = Number(port) || 5060;
    ext = String(ext || '').trim();
    toExt = String(toExt || '').trim();
    const authUser = String(user || ext).trim();
    if (!host || !ext || !toExt) return resolve({ ok: false, status: 'config', detail: 'Enter your extension and the extension to call.' });

    const sock = dgram.createSocket('udp4');
    const ip = localIp();
    const callId = `${rand(12)}@atlas`;
    const fromTag = rand(6);
    const target = `sip:${toExt}@${host}`;
    let cseq = 1, triedAuth = false, done = false, lastBranch = '';

    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); try { sock.close(); } catch { /* closed */ } resolve(r); };
    const timer = setTimeout(() => finish({ ok: false, status: 'timeout', detail: `No response placing a call to ${toExt}. The PBX may not be routing calls to Atlas's line, or UDP ${port} isn't reachable.` }), timeoutMs);
    timer.unref?.();

    const sdp = [
      'v=0', `o=atlas ${Date.now()} ${Date.now()} IN IP4 ${ip}`, 's=atlas-test',
      `c=IN IP4 ${ip}`, 't=0 0', 'm=audio 40000 RTP/AVP 0', 'a=rtpmap:0 PCMU/8000', 'a=sendrecv', '',
    ].join('\r\n');

    const send = (method, extraHeaders = [], body = '') => {
      lastBranch = `z9hG4bK${rand(6)}${cseq}`;
      const cl = Buffer.byteLength(body);
      const lines = [
        `${method} ${target} SIP/2.0`,
        `Via: SIP/2.0/UDP ${ip}:${sock.address().port};branch=${lastBranch};rport`,
        'Max-Forwards: 70',
        `From: <sip:${ext}@${host}>;tag=${fromTag}`,
        `To: <${target}>`,
        `Call-ID: ${callId}`,
        `CSeq: ${cseq} ${method}`,
        `Contact: <sip:${ext}@${ip}:${sock.address().port}>`,
        'User-Agent: Atlas-SIP',
        ...extraHeaders,
        body ? 'Content-Type: application/sdp' : null,
        `Content-Length: ${cl}`, '', body,
      ].filter((l) => l !== null);
      sock.send(Buffer.from(lines.join('\r\n')), port, host, (err) => {
        if (err) finish({ ok: false, status: 'network', detail: `Couldn't reach ${host}: ${err.message}` });
      });
    };
    const authHeader = (text, code, method) => {
      const hdr = (text.match(/^(?:WWW-Authenticate|Proxy-Authenticate):\s*Digest\s*(.+)$/im) || [])[1];
      const d = parseDigest(hdr || '');
      if (!d.nonce || !d.realm) return null;
      const ha1 = md5(`${authUser}:${d.realm}:${secret || ''}`);
      const ha2 = md5(`${method}:${target}`);
      const useQop = (d.qop || '').split(',').map((s) => s.trim()).includes('auth');
      let response, extra = '';
      if (useQop) { const cn = rand(6); response = md5(`${ha1}:${d.nonce}:00000001:${cn}:auth:${ha2}`); extra = `, qop=auth, nc=00000001, cnonce="${cn}"`; }
      else response = md5(`${ha1}:${d.nonce}:${ha2}`);
      const name = code === 407 ? 'Proxy-Authorization' : 'Authorization';
      const oc = d.opaque ? `, opaque="${d.opaque}"` : '';
      return `${name}: Digest username="${authUser}", realm="${d.realm}", nonce="${d.nonce}", uri="${target}", response="${response}"${extra}${oc}, algorithm=MD5`;
    };
    const done2 = (r, cleanup) => { if (cleanup) cleanup(); finish(r); };

    sock.on('message', (msg) => {
      const text = msg.toString('utf8');
      const code = Number((text.match(/^SIP\/2\.0 (\d{3})/) || [])[1] || 0);
      if (!code) return;
      if (code === 100) return; // Trying — wait
      if ((code === 401 || code === 407) && !triedAuth) {
        triedAuth = true;
        const h = authHeader(text, code, 'INVITE');
        if (!h) return finish({ ok: false, status: code, detail: 'The PBX challenged the call but sent no usable auth — check credentials.' });
        cseq += 1; send('INVITE', [h], sdp);
        return;
      }
      if (code === 180 || code === 183) { // ringing — cancel it, that's a success
        send('CANCEL');
        return done2({ ok: true, status: code, detail: `It's ringing — extension ${toExt} is reachable from Atlas's line. (Call cancelled; this was just a test.)` });
      }
      if (code === 200) { // answered — ACK then BYE
        const toTag = (text.match(/^To:.*tag=([^\s;>]+)/im) || [])[1];
        cseq += 1; send('BYE', toTag ? [`To: <${target}>;tag=${toTag}`] : []);
        return done2({ ok: true, status: 200, detail: `Answered — extension ${toExt} picked up. The line places calls fine. (Hung up; test only.)` });
      }
      if (code === 486 || code === 600) return finish({ ok: true, status: code, detail: `Extension ${toExt} is reachable but busy — the line works.` });
      if (code === 404) return finish({ ok: false, status: 404, detail: `The PBX doesn't have extension ${toExt}.` });
      if (code === 403) return finish({ ok: false, status: 403, detail: `The PBX refused the call (this line may not be allowed to dial ${toExt}).` });
      if (code >= 400) return finish({ ok: false, status: code, detail: `Call to ${toExt} failed with SIP ${code}.` });
    });
    sock.on('error', (err) => finish({ ok: false, status: 'network', detail: `Socket error: ${err.message}` }));
    sock.bind(() => send('INVITE', [], sdp));
  });
}

// Parse a one-line SIP credential string into fields:
//   sip:user:secret@host:port  ·  user:secret@host  ·  user@host:port
export function parseSipLine(line) {
  const s = String(line || '').trim().replace(/^sips?:/i, '');
  const at = s.lastIndexOf('@');
  if (at === -1) return null;
  const creds = s.slice(0, at), hostPart = s.slice(at + 1);
  const [user, secret = ''] = creds.split(':');
  const [host, port] = hostPart.split(':');
  if (!user || !host) return null;
  return { user: user.trim(), ext: user.trim(), secret: secret.trim(), host: host.trim(), port: (port || '5060').trim() };
}
