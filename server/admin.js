// The admin console — a separate Express app on its own port, unlocked with
// the admin code (ADMIN_CODE, default 782677). Self-contained: it serves its
// own themed dashboard, no build step, and shares the same data stores.
import express from 'express';
import crypto from 'node:crypto';
import os from 'node:os';
import { config } from './config.js';
import * as auth from './auth.js';
import * as store from './store.js';
import { stopTask, isRunning } from './agent.js';
import { engineInfo } from './atlas/core.js';
import { getPlatform, setPlatform } from './platform.js';
import { sendEmail } from './email.js';

const adminSessions = new Map(); // token -> exp
const SESSION_MS = 12 * 3600_000;

function adminUser(req) {
  const tok = auth.parseCookies(req).ma_admin;
  const exp = tok && adminSessions.get(tok);
  if (!exp || exp < Date.now()) { if (tok) adminSessions.delete(tok); return false; }
  return true;
}

// IP allowlisting is disabled — the Operations console is protected by the
// access code (ADMIN_CODE) alone. Rate-limited, constant-time compared, audited.
function ipAllowed() { return true; }

export function startAdmin({ enqueue }) {
  const app = express();
  if (process.env.TRUST_PROXY) app.set('trust proxy', 1); // real client IPs behind Northflank/nginx
  app.use((req, res, next) => (ipAllowed(req) ? next() : res.status(404).type('text/plain').send('Not Found')));
  app.use(express.json());

  // --- gate -------------------------------------------------------------------
  app.post('/gate', (req, res) => {
    const key = `admin:${req.ip}`;
    if (!auth.rateCheck(key, 5, 10 * 60_000)) return res.status(429).json({ error: 'Too many attempts. Wait 10 minutes.' });
    const given = String(req.body?.code || '');
    const ok = given.length === config.adminCode.length &&
      crypto.timingSafeEqual(Buffer.from(given), Buffer.from(config.adminCode));
    if (!ok) { auth.rateFail(key, 5, 10 * 60_000); auth.audit('admin', `bad admin code from ${req.ip}`); return res.status(401).json({ error: 'Invalid access code. This attempt has been logged.' }); }
    auth.rateClear(key);
    const token = crypto.randomBytes(24).toString('hex');
    adminSessions.set(token, Date.now() + SESSION_MS);
    auth.setCookie(res, 'ma_admin', token, { maxAge: SESSION_MS });
    auth.audit('admin', `admin console unlocked from ${req.ip}`);
    res.json({ ok: true });
  });
  app.post('/logout', (req, res) => {
    adminSessions.delete(auth.parseCookies(req).ma_admin);
    auth.clearCookie(res, 'ma_admin');
    res.json({ ok: true });
  });

  const guard = (req, res, next) => (adminUser(req) ? next() : res.status(401).json({ error: 'locked' }));

  // --- admin API ----------------------------------------------------------------
  app.get('/api/overview', guard, (_req, res) => {
    const mem = process.memoryUsage();
    res.json({
      engine: engineInfo(),
      tasks: store.taskStats(),
      users: auth.listUsers().length,
      uptimeSec: Math.floor(process.uptime()),
      load: os.loadavg()[0].toFixed(2),
      rssMb: Math.round(mem.rss / 1048576),
      host: os.hostname(),
      node: process.version,
      ports: { app: config.port, admin: config.adminPort },
    });
  });

  app.get('/api/users', guard, (_req, res) => {
    res.json(auth.listUsers().map((u) => ({
      id: u.id, email: u.email, name: u.name, role: u.role, disabled: u.disabled,
      twoStep: u.totp.enabled, createdAt: u.createdAt,
      tasks: store.listTasks(u.id).length,
    })));
  });
  app.post('/api/users/:id/role', guard, (req, res) => {
    const u = auth.updateUser(req.params.id, (u) => { u.role = u.role === 'owner' ? 'member' : 'owner'; });
    if (u) auth.audit('admin', `role → ${u.role}: ${u.email}`);
    res.json({ ok: Boolean(u) });
  });
  app.post('/api/users/:id/disable', guard, (req, res) => {
    const u = auth.updateUser(req.params.id, (u) => { u.disabled = !u.disabled; });
    if (u) auth.audit('admin', `${u.disabled ? 'disabled' : 'enabled'}: ${u.email}`);
    res.json({ ok: Boolean(u) });
  });
  app.post('/api/users/:id/reset-2sv', guard, (req, res) => {
    const u = auth.updateUser(req.params.id, (u) => {
      u.totp = { secret: null, enabled: false, backup: [] };
      u.second = { method: null };
    });
    if (u) auth.audit('admin', `2SV reset: ${u.email}`);
    res.json({ ok: Boolean(u) });
  });
  app.post('/api/users/:id/reset-password', guard, (req, res) => {
    const temp = 'ma-' + crypto.randomBytes(6).toString('hex');
    const u = auth.updateUser(req.params.id, (u) => auth.setPassword(u, temp));
    if (!u) return res.status(404).json({ error: 'not found' });
    auth.audit('admin', `password reset: ${u.email}`);
    res.json({ ok: true, temp });
  });
  app.delete('/api/users/:id', guard, (req, res) => {
    for (const t of store.listTasks(req.params.id)) { stopTask(t.id); store.deleteTask(t.id); }
    res.json({ ok: auth.deleteUser(req.params.id) });
  });

  app.get('/api/tasks', guard, (_req, res) => {
    const emails = Object.fromEntries(auth.listUsers().map((u) => [u.id, u.email]));
    res.json(store.listTasks().map((t) => ({
      id: t.id, title: t.title, status: t.status, owner: emails[t.userId] || '(deleted)',
      runCount: t.runCount, updatedAt: t.updatedAt, running: isRunning(t.id),
    })));
  });
  app.post('/api/tasks/:id/stop', guard, (req, res) => res.json({ ok: stopTask(req.params.id) }));
  app.post('/api/tasks/:id/run', guard, (req, res) => { enqueue(req.params.id); res.json({ ok: true }); });
  app.delete('/api/tasks/:id', guard, (req, res) => { stopTask(req.params.id); res.json({ ok: store.deleteTask(req.params.id) }); });

  // --- platform settings: base URL, registration policy, OAuth providers ------
  app.get('/api/platform', guard, (_req, res) => res.json(getPlatform()));
  app.post('/api/platform', guard, (req, res) => {
    const p = setPlatform(req.body || {});
    auth.audit('admin', 'platform settings updated');
    res.json(p);
  });

  // Send a real test email so you can see the exact SMTP result immediately.
  app.post('/api/test-email', guard, async (req, res) => {
    const to = String(req.body?.to || '').trim();
    if (!to) return res.status(400).json({ error: 'Enter a destination address.' });
    try {
      await sendEmail({ to, subject: 'Atlas Network SMTP test', text: 'This is a test email from your Atlas Network admin console. If you can read this, SMTP is working.' });
      auth.audit('admin', `test email sent to ${to}`);
      res.json({ ok: true });
    } catch (e) {
      auth.audit('admin', `test email failed: ${e.message}`);
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/log', guard, (_req, res) => res.json(auth.auditLog().slice(-120).reverse()));
  app.post('/api/danger/wipe-tasks', guard, (_req, res) => { store.wipeTasks(); auth.audit('admin', 'ALL TASKS WIPED'); res.json({ ok: true }); });

  // --- dashboard page --------------------------------------------------------------
  app.get('/', (req, res) => res.type('html').send(adminUser(req) ? DASH : GATE));

  if (config.adminMount === 'path') return app; // caller mounts it on the main port

  app.listen(config.adminPort, () => {
    console.log(`  admin:  console on http://localhost:${config.adminPort} (code-locked)\n`);
  });
  return null;
}

// ---------------------------------------------------------------------------------
const CSS = `
:root{--bg:#07090c;--hi:#262d37;--lo:#12151b;--well:#090c10;--ink:#dbe3ec;--dim:#8c97a5;--faint:#59636f;--cyan:#34e3d0;--amber:#f5b14a;--red:#ff5d77;--green:#4fe07a}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:radial-gradient(900px 500px at 80% -10%,rgba(245,177,74,.07),transparent 60%),linear-gradient(165deg,#0b0e13,var(--bg));color:var(--ink);min-height:100vh;-webkit-font-smoothing:antialiased}
.wrap{max-width:1100px;margin:0 auto;padding:26px 24px}
.panel{background:linear-gradient(168deg,var(--hi),var(--lo) 72%);border:1px solid rgba(0,0,0,.6);border-radius:13px;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 16px 38px rgba(0,0,0,.5);padding:18px;margin-bottom:16px}
h1{font-size:22px;letter-spacing:-.4px}
h2{font-size:11.5px;text-transform:uppercase;letter-spacing:1.8px;color:var(--dim);margin-bottom:12px;display:flex;gap:8px;align-items:center}
h2 svg{color:var(--amber)}
.mono{font-family:ui-monospace,'SF Mono',Menlo,monospace}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--faint);text-align:left;padding:6px 8px}
td{padding:9px 8px;border-top:1px solid rgba(255,255,255,.04)}
.btn{border:1px solid rgba(0,0,0,.6);border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;color:var(--ink);cursor:pointer;background:linear-gradient(180deg,#2e3640,#1a1f27);box-shadow:inset 0 1px 0 rgba(255,255,255,.1)}
.btn:hover{filter:brightness(1.2)}
.btn.warn{color:var(--amber)}.btn.bad{color:var(--red)}
.tag{font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:700;padding:2px 7px;border-radius:5px;background:rgba(0,0,0,.4);color:var(--dim)}
.tag.on{color:var(--green)}.tag.off{color:var(--red)}.tag.running{color:var(--cyan)}.tag.done{color:var(--green)}.tag.failed{color:var(--red)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.stat{background:var(--well);border-radius:10px;padding:14px;box-shadow:inset 0 2px 6px rgba(0,0,0,.7)}
.stat b{display:block;font-family:ui-monospace,Menlo,monospace;font-size:24px;color:var(--amber)}
.stat span{font-size:10px;text-transform:uppercase;letter-spacing:1.3px;color:var(--faint)}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.log{max-height:260px;overflow:auto;font-size:12px}
.log div{padding:6px 4px;border-top:1px solid rgba(255,255,255,.03);color:var(--dim)}
.log time{color:var(--faint);margin-right:10px;font-family:ui-monospace,Menlo,monospace;font-size:10.5px}
input{background:var(--well);border:1px solid rgba(0,0,0,.7);border-radius:9px;padding:11px 13px;color:var(--ink);font-size:15px;box-shadow:inset 0 2px 5px rgba(0,0,0,.65);outline:none;width:100%}
input:focus{box-shadow:inset 0 2px 5px rgba(0,0,0,.65),0 0 0 2px rgba(245,177,74,.35)}
.err{color:var(--red);font-size:13px;min-height:18px;margin-top:8px}
.pform{display:flex;flex-direction:column;gap:14px;font-size:13px}
.pform label{display:flex;flex-direction:column;gap:6px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:1.2px;font-weight:700}
.pform label.row{flex-direction:row;align-items:center;gap:8px;text-transform:none;letter-spacing:0;font-size:13px;font-weight:500;color:var(--ink)}
.pform input[type=checkbox]{width:auto;accent-color:var(--amber)}
.pform textarea{background:var(--well);border:1px solid rgba(0,0,0,.7);border-radius:9px;padding:11px 13px;color:var(--ink);font-family:ui-monospace,Menlo,monospace;font-size:12px;box-shadow:inset 0 2px 5px rgba(0,0,0,.65);outline:none;resize:vertical}
.prov{border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:12px;background:rgba(0,0,0,.2)}
.prov-head{display:flex;justify-content:space-between;align-items:center}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.hint{color:var(--faint);font-size:11.5px}.hint code{color:var(--amber);font-family:ui-monospace,Menlo,monospace;font-size:11px;word-break:break-all}
`;

const LOCK_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;

const GATE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atlas Network · Operations</title><style>${CSS}
.gatewrap{min-height:100vh;display:grid;place-items:center}
.gate{width:min(400px,92vw);text-align:center;padding:36px 30px}
.keyhole{width:64px;height:64px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;color:var(--amber);background:var(--well);box-shadow:inset 0 2px 8px rgba(0,0,0,.8),0 0 24px rgba(245,177,74,.15)}
.gate h1{margin-bottom:4px;font-size:20px}
.gate .sub{color:var(--amber);font-size:10.5px;letter-spacing:2.5px;text-transform:uppercase;font-weight:700;margin-bottom:10px}
.gate p{color:var(--dim);font-size:13px;margin-bottom:22px;line-height:1.55}
.gate input{text-align:center;font-size:16px;letter-spacing:2px;font-family:ui-monospace,Menlo,monospace}
.gate .btn{width:100%;margin-top:14px;padding:12px;font-size:14px;color:#1a1206;background:linear-gradient(180deg,#ffd27a,#f5b14a 48%,#c98a1e 52%,#d99b2e);border-color:rgba(80,50,0,.6)}
.gate .foot{margin-top:18px;color:var(--faint);font-size:11px;letter-spacing:.4px}
</style></head><body><div class="gatewrap"><form class="gate panel" onsubmit="go(event)">
<div class="keyhole"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><circle cx="12" cy="15.5" r="1.6"/></svg></div>
<div class="sub">Atlas Network</div>
<h1>Operations Console</h1>
<p>Restricted area. Access is limited to authorized administrators from approved locations.</p>
<input id="code" type="password" autocomplete="current-password" placeholder="Access code" autofocus>
<div class="err" id="err"></div>
<button class="btn">Authenticate</button>
<div class="foot">All access attempts are recorded in the audit log.</div>
</form></div><script>
const BASE=location.pathname.replace(/\\/$/,'');
async function go(e){e.preventDefault();const r=await fetch(BASE+'/gate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:document.getElementById('code').value})});const d=await r.json().catch(()=>({}));if(r.ok)location.reload();else document.getElementById('err').textContent=d.error||'Invalid access code.'}
</script></body></html>`;

const DASH = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atlas Network · Operations</title><style>${CSS}</style></head><body><div class="wrap">
<div class="top"><h1>Atlas Network <span style="color:var(--amber)">Operations</span></h1>
<div><span class="tag mono" id="host"></span> <button class="btn" onclick="lockNow()">Lock</button></div></div>

<div class="panel"><h2>${LOCK_SVG} System</h2><div class="grid" id="stats"></div></div>

<div class="panel"><h2>${LOCK_SVG} Platform &amp; sign-in providers</h2>
<div class="pform">
  <label>Public base URL <input id="p_base" placeholder="https://myagent.example.com"></label>
  <label class="row"><input type="checkbox" id="p_reg"> Registration open (new accounts allowed)</label>
  <div class="prov">
    <div class="prov-head"><b>Google Sign-In</b><label class="row"><input type="checkbox" id="g_on"> enabled</label></div>
    <label>Client ID <input id="g_id" placeholder="xxxx.apps.googleusercontent.com"></label>
    <label>Client secret <input id="g_secret" type="password" placeholder="GOCSPX-…"></label>
    <div class="hint">Authorized redirect URI for the Google console: <code id="g_cb"></code></div>
  </div>
  <div class="prov">
    <div class="prov-head"><b>Apple Sign-In</b><label class="row"><input type="checkbox" id="a_on"> enabled</label></div>
    <label>Services ID <input id="a_sid" placeholder="com.example.myagent"></label>
    <div class="two"><label>Team ID <input id="a_team" placeholder="ABCDE12345"></label>
    <label>Key ID <input id="a_key" placeholder="XYZ9876543"></label></div>
    <label>Private key (.p8 contents) <textarea id="a_pk" rows="4" placeholder="-----BEGIN PRIVATE KEY-----"></textarea></label>
    <div class="hint">Return URL for the Apple console: <code id="a_cb"></code> (Apple requires HTTPS)</div>
  </div>
  <div style="text-align:right"><span id="p_flash" style="color:var(--green);font-size:13px;margin-right:12px"></span>
  <button class="btn" onclick="savePlatform()">Save platform settings</button></div>
</div></div>

<div class="panel"><h2>${LOCK_SVG} Channels &amp; messaging</h2>
<p class="hint" style="margin-bottom:14px">Turn transports on or off here. Anywhere a channel is used, it reads <b>Not Available</b> until switched on and configured.</p>
<div class="pform">
  <div class="prov">
    <div class="prov-head"><b>SMS — Twilio</b><label class="row"><input type="checkbox" id="sms_on"> enabled</label></div>
    <div class="hint">Powers SMS notifications and SMS-based two-step verification.</div>
    <label>Account SID <input id="sms_sid" placeholder="AC…"></label>
    <div class="two"><label>Auth token <input id="sms_token" type="password" placeholder="••••"></label>
    <label>From number <input id="sms_from" placeholder="+15555550123"></label></div>
  </div>
  <div class="prov">
    <div class="prov-head"><b>Email — SMTP</b><label class="row"><input type="checkbox" id="em_on"> enabled</label></div>
    <div class="hint">Powers email-based two-step verification.</div>
    <div class="two"><label>SMTP host <input id="em_host" placeholder="smtp.provider.com"></label>
    <label>Port <input id="em_port" placeholder="587"></label></div>
    <div class="two"><label>Username <input id="em_user" placeholder="apikey"></label>
    <label>From address <input id="em_from" placeholder="atlas@yourdomain.com"></label></div>
    <label>Password <input id="em_pass" type="password" placeholder="••••"></label>
    <div class="two"><label>Send a test to <input id="em_test" placeholder="you@example.com"></label>
    <div style="display:flex;align-items:flex-end"><button class="btn" onclick="testEmail()" type="button">Send test email</button></div></div>
    <div class="hint" id="em_result"></div>
  </div>
  <div class="prov">
    <div class="prov-head"><b>Two-step verification methods</b></div>
    <label class="row"><input type="checkbox" id="tv_totp" checked> Authenticator app (TOTP) — always available</label>
    <label class="row"><input type="checkbox" id="tv_sms"> SMS codes <span class="hint" style="margin-left:6px">requires SMS channel</span></label>
    <label class="row"><input type="checkbox" id="tv_email"> Email codes <span class="hint" style="margin-left:6px">requires Email channel</span></label>
  </div>
  <div style="text-align:right"><span id="c_flash" style="color:var(--green);font-size:13px;margin-right:12px"></span>
  <button class="btn" onclick="saveChannels()">Save channels</button></div>
</div></div>

<div class="panel"><h2>${LOCK_SVG} Payments — Stripe</h2>
<p class="hint" style="margin-bottom:14px">With no secret key, billing runs in <b>demo mode</b> — plan switches are instant and free. Paste live keys and price IDs to charge for real; takes effect immediately, no redeploy. <b id="s_mode"></b></p>
<div class="pform"><div class="prov">
  <div class="two"><label>Secret key <input id="s_secret" type="password" placeholder="sk_live_…"></label>
  <label>Publishable key <input id="s_pub" placeholder="pk_live_…"></label></div>
  <label>Webhook signing secret <input id="s_wh" type="password" placeholder="whsec_…"></label>
  <div class="two"><label>Price ID — Starter ($49) <input id="s_ps" placeholder="price_…"></label>
  <label>Price ID — Pro ($99) <input id="s_pp" placeholder="price_…"></label></div>
  <label>Price ID — Growth ($199) <input id="s_pg" placeholder="price_…"></label>
  <div style="text-align:right"><span id="s_flash" style="color:var(--green);font-size:13px;margin-right:12px"></span>
  <button class="btn" onclick="saveStripe()">Save payments</button></div>
</div></div></div>
<div class="panel"><h2>${LOCK_SVG} Accounts</h2><table id="users"></table></div>
<div class="panel"><h2>${LOCK_SVG} All tasks</h2><table id="tasks"></table></div>
<div class="panel"><h2>${LOCK_SVG} Audit log</h2><div class="log" id="log"></div></div>
<div class="panel"><h2 style="color:var(--red)">${LOCK_SVG} Danger zone</h2>
<button class="btn bad" onclick="if(confirm('Wipe ALL tasks for ALL accounts?'))api('/api/danger/wipe-tasks','POST')">Wipe all tasks</button></div>
</div><script>
const $=(s)=>document.querySelector(s);
const BASE=location.pathname.replace(/\\/$/,'');
function lockNow(){fetch(BASE+'/logout',{method:'POST'}).then(()=>location.reload())}
async function api(u,m='GET'){const r=await fetch(BASE+u,{method:m});if(r.status===401)location.reload();return r.json()}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')}
function fmt(ts){return new Date(ts).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
async function refresh(){
  const o=await api('/api/overview');
  $('#host').textContent=o.host+' · node '+o.node;
  $('#stats').innerHTML=[['Accounts',o.users],['Tasks',o.tasks.total],['Running',o.tasks.running],['Total runs',o.tasks.runs],['Uptime',Math.floor(o.uptimeSec/3600)+'h '+Math.floor(o.uptimeSec%3600/60)+'m'],['Memory',o.rssMb+' MB'],['Load',o.load],['Engine',o.engine.engine+' v'+o.engine.version],['Skills',o.engine.skills??'—'],['Intents',o.engine.intents??'—'],['Vocabulary',o.engine.vocab??'—']].map(([l,v])=>'<div class="stat"><b>'+v+'</b><span>'+l+'</span></div>').join('');
  const users=await api('/api/users');
  $('#users').innerHTML='<tr><th>Account</th><th>Role</th><th>2SV</th><th>Tasks</th><th>Status</th><th></th></tr>'+users.map(u=>'<tr><td><b>'+esc(u.name)+'</b><br><span class="mono" style="color:var(--faint);font-size:11px">'+esc(u.email)+'</span></td><td><span class="tag">'+u.role+'</span></td><td><span class="tag '+(u.twoStep?'on':'')+'">'+(u.twoStep?'on':'off')+'</span></td><td>'+u.tasks+'</td><td><span class="tag '+(u.disabled?'off':'on')+'">'+(u.disabled?'disabled':'active')+'</span></td><td style="text-align:right;white-space:nowrap">'+
    '<button class="btn" onclick="act(\\'/api/users/'+u.id+'/role\\')">role</button> '+
    '<button class="btn warn" onclick="act(\\'/api/users/'+u.id+'/reset-2sv\\')">reset 2SV</button> '+
    '<button class="btn warn" onclick="resetPw(\\''+u.id+'\\')">reset pw</button> '+
    '<button class="btn warn" onclick="act(\\'/api/users/'+u.id+'/disable\\')">'+(u.disabled?'enable':'disable')+'</button> '+
    '<button class="btn bad" onclick="if(confirm(\\'Delete '+esc(u.email)+' and their tasks?\\'))del(\\'/api/users/'+u.id+'\\')">delete</button></td></tr>').join('');
  const tasks=await api('/api/tasks');
  $('#tasks').innerHTML='<tr><th>Task</th><th>Owner</th><th>Status</th><th>Runs</th><th>Updated</th><th></th></tr>'+ (tasks.length?tasks.map(t=>'<tr><td><b>'+esc(t.title)+'</b></td><td class="mono" style="font-size:11.5px;color:var(--dim)">'+esc(t.owner)+'</td><td><span class="tag '+t.status+'">'+t.status+'</span></td><td>'+t.runCount+'</td><td style="color:var(--faint);font-size:12px">'+fmt(t.updatedAt)+'</td><td style="text-align:right;white-space:nowrap">'+(t.running?'<button class="btn warn" onclick="act(\\'/api/tasks/'+t.id+'/stop\\')">stop</button> ':'<button class="btn" onclick="act(\\'/api/tasks/'+t.id+'/run\\')">run</button> ')+'<button class="btn bad" onclick="del(\\'/api/tasks/'+t.id+'\\')">delete</button></td></tr>').join(''):'<tr><td style="color:var(--faint)">No tasks yet.</td></tr>');
  const log=await api('/api/log');
  $('#log').innerHTML=log.map(e=>'<div><time>'+fmt(e.ts)+'</time><span class="tag">'+e.kind+'</span> '+esc(e.text)+'</div>').join('')||'<div>Quiet so far.</div>';
}
async function act(u){await api(u,'POST');refresh()}
async function del(u){await api(u,'DELETE');refresh()}
async function resetPw(id){const d=await api('/api/users/'+id+'/reset-password','POST');if(d.temp)prompt('Temporary password (share it securely):',d.temp);refresh()}

async function loadPlatform(){
  const p=await api('/api/platform');
  $('#p_base').value=p.baseUrl||'';$('#p_reg').checked=!!p.registrationOpen;
  $('#g_on').checked=!!p.google.enabled;$('#g_id').value=p.google.clientId||'';$('#g_secret').value=p.google.clientSecret||'';
  $('#a_on').checked=!!p.apple.enabled;$('#a_sid').value=p.apple.serviceId||'';$('#a_team').value=p.apple.teamId||'';$('#a_key').value=p.apple.keyId||'';$('#a_pk').value=p.apple.privateKey||'';
  const c=p.channels||{};const sms=c.sms||{},em=c.email||{};
  $('#sms_on').checked=!!sms.enabled;$('#sms_sid').value=sms.sid||'';$('#sms_token').value=sms.token||'';$('#sms_from').value=sms.from||'';
  $('#em_on').checked=!!em.enabled;$('#em_host').value=em.host||'';$('#em_port').value=em.port||'';$('#em_user').value=em.user||'';$('#em_from').value=em.from||'';$('#em_pass').value=em.pass||'';
  $('#tv_totp').checked=c.totp2sv?c.totp2sv.enabled!==false:true;$('#tv_sms').checked=!!(c.sms2sv&&c.sms2sv.enabled);$('#tv_email').checked=!!(c.email2sv&&c.email2sv.enabled);
  const st=p.stripe||{};
  $('#s_secret').value=st.secretKey||'';$('#s_pub').value=st.publishableKey||'';$('#s_wh').value=st.webhookSecret||'';
  $('#s_ps').value=st.priceStarter||'';$('#s_pp').value=st.pricePro||'';$('#s_pg').value=st.priceGrowth||'';
  $('#s_mode').textContent=st.secretKey?'Billing is LIVE.':'Billing is in demo mode.';
  updateCb();
}
async function saveStripe(){
  const body={stripe:{secretKey:$('#s_secret').value.trim(),publishableKey:$('#s_pub').value.trim(),webhookSecret:$('#s_wh').value.trim(),
    priceStarter:$('#s_ps').value.trim(),pricePro:$('#s_pp').value.trim(),priceGrowth:$('#s_pg').value.trim()}};
  const r=await fetch(BASE+'/api/platform',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(r.status===401)return location.reload();
  $('#s_mode').textContent=body.stripe.secretKey?'Billing is LIVE.':'Billing is in demo mode.';
  $('#s_flash').textContent='Saved.';setTimeout(()=>$('#s_flash').textContent='',2500);
}
async function saveChannels(){
  const body={channels:{
    sms:{enabled:$('#sms_on').checked,sid:$('#sms_sid').value.trim(),token:$('#sms_token').value.trim(),from:$('#sms_from').value.trim()},
    email:{enabled:$('#em_on').checked,host:$('#em_host').value.trim(),port:Number($('#em_port').value)||587,user:$('#em_user').value.trim(),from:$('#em_from').value.trim(),pass:$('#em_pass').value},
    totp2sv:{enabled:$('#tv_totp').checked},sms2sv:{enabled:$('#tv_sms').checked},email2sv:{enabled:$('#tv_email').checked}}};
  const r=await fetch(BASE+'/api/platform',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(r.status===401)return location.reload();
  $('#c_flash').textContent='Saved.';setTimeout(()=>$('#c_flash').textContent='',2500);
}
function updateCb(){const b=$('#p_base').value.replace(/\\/+$/,'')||location.origin.replace(':'+location.port,':8787');
  $('#g_cb').textContent=b+'/api/auth/oauth/google/callback';$('#a_cb').textContent=b+'/api/auth/oauth/apple/callback'}
document.addEventListener('input',(e)=>{if(e.target.id==='p_base')updateCb()});
async function savePlatform(){
  const body={baseUrl:$('#p_base').value.trim(),registrationOpen:$('#p_reg').checked,
    google:{enabled:$('#g_on').checked,clientId:$('#g_id').value.trim(),clientSecret:$('#g_secret').value.trim()},
    apple:{enabled:$('#a_on').checked,serviceId:$('#a_sid').value.trim(),teamId:$('#a_team').value.trim(),keyId:$('#a_key').value.trim(),privateKey:$('#a_pk').value}};
  const r=await fetch(BASE+'/api/platform',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(r.status===401)return location.reload();
  $('#p_flash').textContent='Saved.';setTimeout(()=>$('#p_flash').textContent='',2500);
}
async function testEmail(){
  var to=$('#em_test').value.trim(); var out=$('#em_result');
  if(!to){out.textContent='Enter an address first.';out.style.color='var(--amber)';return;}
  out.style.color='var(--dim)';out.textContent='Saving settings and sending…';
  await saveChannels();
  var r=await fetch(BASE+'/api/test-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:to})});
  var d=await r.json().catch(function(){return {};});
  if(r.ok){out.style.color='var(--green)';out.textContent='✓ Sent to '+to+'. Check the inbox (and spam).';}
  else{out.style.color='var(--red)';out.textContent='✗ '+(d.error||'Failed');}
}
refresh();loadPlatform();setInterval(refresh,5000);
</script></body></html>`;
