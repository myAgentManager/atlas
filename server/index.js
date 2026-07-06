// myAgent HTTP server: accounts + 2SV, per-account tasks, SSE live feed,
// scheduler, ATLAS chat, settings, public API (Bearer keys), per-user file
// serving, and the built frontend. The admin console runs separately on its
// own port (server/admin.js).
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { config, ROOT } from './config.js';
import { bus } from './bus.js';
import * as store from './store.js';
import * as auth from './auth.js';
import { runTask, stopTask, isRunning, taskChat, atlasChat } from './agent.js';
import { engineInfo, converse } from './atlas/core.js';
import { study, brainStats, enqueueTopic } from './atlas/learn.js';
import * as billing from './billing.js';
import * as biz from './business.js';
import { fetchRecent } from './imap.js';
import { checkContent, declineMessage } from './atlas/guard.js';
import { understand, titleFor } from './atlas/nlu.js';
import { slugify } from './atlas/skills.js';
import { smsReady, sendSms } from './notify.js';
import { sendEmail } from './email.js';
import { channelStatus } from './platform.js';
import { forUser, mimeFor } from './tools.js';
import { startAdmin } from './admin.js';
import { dbMode } from './db.js';
import { getPlatform, publicPlatform } from './platform.js';
import { mountOAuth } from './oauth.js';
import * as shares from './shares.js';
import * as adb from './database.js';

const STARTED_AT = Date.now();
const app = express();
if (process.env.TRUST_PROXY) app.set('trust proxy', 1); // behind nginx/Caddy/CF Tunnel

// --- security headers ---------------------------------------------------------
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// --- CSRF guard: state-changing browser requests must be same-origin -----------
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (req.path.startsWith('/v1/')) return next();          // Bearer-key API
  if (req.path.startsWith('/auth/oauth/')) return next();  // provider form posts
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) {
        return res.status(403).json({ error: 'cross-origin request blocked' });
      }
    } catch { return res.status(403).json({ error: 'bad origin' }); }
  }
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(auth.attach);

const bad = (res, code, error) => res.status(code).json({ error });

// OAuth sign-in (Google / Apple) — enabled per-provider from the admin console.
mountOAuth(app, { urlencoded: express.urlencoded({ extended: false }) });

// ============================================================================
// auth
// ============================================================================
app.post('/api/auth/register', async (req, res) => {
  if (!getPlatform().registrationOpen) return bad(res, 403, 'Registration is currently closed on this server.');
  const key = `reg:${req.ip}`;
  if (!auth.rateCheck(key, 10, 30 * 60_000)) return bad(res, 429, 'Too many signups from this address — try later.');
  let user;
  try {
    user = auth.createUser(req.body || {});
  } catch (e) { auth.rateFail(key, 10, 30 * 60_000); return bad(res, 400, e.message); }

  // Company addresses skip verification; everyone else confirms an emailed code
  // (as long as the email channel is configured — otherwise we can't send).
  if (!user.emailVerified && channelStatus().email) {
    const code = auth.genCode();
    try {
      await sendEmail({ to: user.email, subject: 'Verify your Atlas Network account', text: `Welcome to the Atlas Network.\n\nYour verification code is: ${code}\n\nEnter it to finish creating your account. It expires in 10 minutes.` });
    } catch (e) {
      auth.audit('auth', `signup verify send failed for ${user.email}: ${e.message}`);
      auth.deleteUser(user.id); // roll back the half-made account
      return bad(res, 502, 'Could not send your verification email — check the address, or contact the administrator.');
    }
    return res.status(202).json({ needVerify: true, hint: auth.maskDest(user.email), pending: auth.createPending(user.id, { method: 'signup', code }) });
  }

  auth.setCookie(res, 'ma_sess', auth.createSession(user.id), { secure: req.secure });
  res.status(201).json({ user: auth.publicUser(user) });
});

// Confirm the signup code → verify + sign in.
app.post('/api/auth/verify-signup', (req, res) => {
  const key = `sv:${req.ip}`;
  if (!auth.rateCheck(key)) return bad(res, 429, 'Too many attempts — try again later.');
  const p = auth.takePending(req.body?.pending);
  if (!p || p.method !== 'signup') return bad(res, 400, 'That code expired — sign up again.');
  if (!auth.codeMatches(req.body?.code, p.code)) { auth.rateFail(key); return bad(res, 401, 'That code didn\'t match. Check your email and try again.'); }
  auth.rateClear(key);
  auth.updateUser(p.user.id, (u) => { u.emailVerified = true; });
  auth.setCookie(res, 'ma_sess', auth.createSession(p.user.id), { secure: req.secure });
  auth.audit('auth', `email verified + signed up: ${p.user.email}`);
  res.json({ user: auth.publicUser(auth.getUser(p.user.id)) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const key = `login:${req.ip}:${String(email).toLowerCase()}`;
  if (!auth.rateCheck(key)) return bad(res, 429, 'Too many attempts — try again in 15 minutes.');
  const user = auth.getUserByEmail(email);
  if (user && auth.isOAuthOnly(user)) {
    return bad(res, 400, `This account signs in with ${user.provider[0].toUpperCase() + user.provider.slice(1)} — use that button instead.`);
  }
  if (!user || !auth.verifyPassword(user, password)) {
    auth.rateFail(key);
    return bad(res, 401, 'Wrong email or password.');
  }
  if (user.disabled) return bad(res, 403, 'This account is disabled. Contact the server owner.');
  auth.rateClear(key);

  // Second step — by whichever method the account enrolled in.
  const method = auth.secondMethod(user);
  if (method === 'totp') {
    return res.json({ need2sv: true, method, pending: auth.createPending(user.id, { method }) });
  }
  if (method === 'email' || method === 'sms') {
    if (!channelStatus().twoStep[method]) {
      return bad(res, 503, `${method === 'email' ? 'Email' : 'SMS'} verification is currently unavailable on this server — contact the administrator.`);
    }
    const dest = method === 'email' ? user.email : (user.settings?.smsTo || '');
    if (!dest) return bad(res, 400, 'No destination on file for your verification code — contact the administrator.');
    const code = auth.genCode();
    try {
      if (method === 'email') {
        await sendEmail({ to: dest, subject: 'Your Atlas Network sign-in code', text: `Your sign-in code is: ${code}\n\nIt expires in 5 minutes. If this wasn't you, change your password.` });
      } else {
        const r = await sendSms(dest, `Atlas Network sign-in code: ${code} (expires in 5 minutes)`);
        if (!r.ok) throw new Error(r.error || 'SMS send failed');
      }
    } catch (e) {
      auth.audit('auth', `2SV code send failed for ${user.email}: ${e.message}`);
      return bad(res, 502, 'Could not send your verification code — try again in a minute or contact the administrator.');
    }
    return res.json({ need2sv: true, method, hint: auth.maskDest(dest), pending: auth.createPending(user.id, { method, code }) });
  }

  auth.setCookie(res, 'ma_sess', auth.createSession(user.id), { secure: req.secure });
  auth.audit('auth', `signed in: ${user.email}`);
  res.json({ user: auth.publicUser(user) });
});

app.post('/api/auth/verify', (req, res) => {
  const { pending, code } = req.body || {};
  const key = `2sv:${req.ip}`;
  if (!auth.rateCheck(key)) return bad(res, 429, 'Too many attempts — try again later.');
  const p = auth.takePending(pending);
  if (!p) return bad(res, 400, 'Verification window expired — sign in again.');
  const ok = p.method === 'totp'
    ? auth.checkSecondFactor(p.user, code)   // authenticator or backup code
    : auth.codeMatches(code, p.code);        // emailed / texted code
  if (!ok) {
    auth.rateFail(key);
    return bad(res, 401, p.method === 'totp'
      ? 'That code didn\'t match. Check your authenticator and try again.'
      : 'That code didn\'t match. Check the message we sent and sign in again.');
  }
  auth.rateClear(key);
  auth.setCookie(res, 'ma_sess', auth.createSession(p.user.id), { secure: req.secure });
  auth.audit('auth', `signed in (2SV ${p.method}): ${p.user.email}`);
  res.json({ user: auth.publicUser(p.user) });
});

app.post('/api/auth/logout', (req, res) => {
  auth.destroySession(auth.parseCookies(req).ma_sess);
  auth.clearCookie(res, 'ma_sess');
  res.json({ ok: true });
});

// ============================================================================
// me + settings
// ============================================================================
app.get('/api/me', auth.requireAuth, (req, res) => res.json({ user: auth.publicUser(req.user) }));

app.patch('/api/me', auth.requireAuth, (req, res) => {
  const { name, welcomed, settings } = req.body || {};
  auth.updateUser(req.user.id, (u) => {
    if (name && name.trim()) u.name = name.trim().slice(0, 60);
    if (welcomed === true) u.welcomed = true;
    if (settings && typeof settings === 'object') {
      u.settings = {
        ...u.settings,
        ...(typeof settings.smsTo === 'string' ? { smsTo: settings.smsTo.trim() } : {}),
        ...(typeof settings.notifySms === 'boolean' ? { notifySms: settings.notifySms } : {}),
        ...(typeof settings.callMe === 'string' ? { callMe: settings.callMe.trim().slice(0, 30) } : {}),
        ...(['auto', 'bold', 'calm', 'warm'].includes(settings.tone) ? { tone: settings.tone } : {}),
        ...(settings.imap ? { imap: { ...(u.settings.imap || {}), ...settings.imap } } : {}),
        integrations: { ...u.settings.integrations, ...(settings.integrations || {}) },
      };
    }
  });
  res.json({ user: auth.publicUser(auth.getUser(req.user.id)) });
});

app.post('/api/me/password', auth.requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!auth.verifyPassword(req.user, current)) return bad(res, 401, 'Current password is wrong.');
  try { auth.setPassword(req.user, next); } catch (e) { return bad(res, 400, e.message); }
  auth.audit('auth', `password changed: ${req.user.email}`);
  res.json({ ok: true });
});

app.post('/api/me/2sv/setup', auth.requireAuth, (req, res) => {
  res.json(auth.beginTotpSetup(req.user));
});
app.post('/api/me/2sv/enable', auth.requireAuth, (req, res) => {
  const backup = auth.enableTotp(req.user, req.body?.code);
  if (!backup) return bad(res, 400, 'Code didn\'t match — scan the secret again and retry.');
  res.json({ ok: true, backup });
});
// Enroll in email/SMS codes: we send one to prove the channel works, then
// /confirm locks the method in.
const enrolls = new Map(); // userId -> { method, code, exp }
app.post('/api/me/2sv/method/start', auth.requireAuth, async (req, res) => {
  const method = req.body?.method;
  if (!['email', 'sms'].includes(method)) return bad(res, 400, 'method must be email or sms');
  if (!channelStatus().twoStep[method]) return bad(res, 503, `${method === 'email' ? 'Email' : 'SMS'} verification is Not Available on this server.`);
  const dest = method === 'email' ? req.user.email : (req.user.settings?.smsTo || '');
  if (!dest) return bad(res, 400, 'Add your phone number under Notifications first.');
  const code = auth.genCode();
  try {
    if (method === 'email') {
      await sendEmail({ to: dest, subject: 'Your Atlas Network verification code', text: `Your verification code is: ${code}\n\nEnter it in Settings to turn on email sign-in codes. It expires in 5 minutes.` });
    } else {
      const r = await sendSms(dest, `Atlas Network verification code: ${code} (expires in 5 minutes)`);
      if (!r.ok) throw new Error(r.error || 'SMS send failed');
    }
  } catch (e) {
    auth.audit('auth', `2SV enroll send failed for ${req.user.email}: ${e.message}`);
    return bad(res, 502, `Couldn't send the code (${e.message}). Check the channel settings in the admin console.`);
  }
  enrolls.set(req.user.id, { method, code, exp: Date.now() + 5 * 60_000 });
  res.json({ ok: true, hint: auth.maskDest(dest) });
});
app.post('/api/me/2sv/method/confirm', auth.requireAuth, (req, res) => {
  const e = enrolls.get(req.user.id);
  if (!e || e.exp < Date.now()) return bad(res, 400, 'That code expired — start again.');
  if (!auth.codeMatches(req.body?.code, e.code)) return bad(res, 401, 'That code didn\'t match.');
  enrolls.delete(req.user.id);
  auth.setSecondMethod(req.user, e.method);
  res.json({ user: auth.publicUser(auth.getUser(req.user.id)) });
});

app.post('/api/me/2sv/disable', auth.requireAuth, (req, res) => {
  const method = auth.secondMethod(req.user);
  if (!method) return res.json({ ok: true });
  const { code, password } = req.body || {};
  const ok =
    (password && auth.verifyPassword(req.user, password)) ||
    (method === 'totp' && code && auth.checkSecondFactor(req.user, code)) ||
    auth.isOAuthOnly(req.user);
  if (!ok) return bad(res, 401, 'Confirm with your password (or a current code) to turn 2SV off.');
  auth.disableSecond(req.user);
  res.json({ user: auth.publicUser(auth.getUser(req.user.id)) });
});

app.post('/api/me/apikey/rotate', auth.requireAuth, (req, res) => {
  res.json({ apiKey: auth.rotateApiKey(req.user) });
});

app.delete('/api/me', auth.requireAuth, async (req, res) => {
  const passOk = auth.isOAuthOnly(req.user) || auth.verifyPassword(req.user, req.body?.password);
  if (!passOk) return bad(res, 401, 'Password required to delete your account.');
  for (const t of store.listTasks(req.user.id)) { stopTask(t.id); store.deleteTask(t.id); }
  shares.revokeAllForUser(req.user.id);
  adb.removeAllForUser(req.user.id);
  biz.removeAllForUser(req.user.id);
  await forUser(req.user.id).removeAll().catch(() => {}); // wipe their workspace: privacy
  auth.deleteUser(req.user.id);
  auth.clearCookie(res, 'ma_sess');
  res.json({ ok: true });
});

// ============================================================================
// agent meta
// ============================================================================
app.get('/api/agent', (req, res) => {
  res.json({
    name: config.agentName,
    engine: engineInfo(),
    sms: smsReady(),
    online: true,
    startedAt: STARTED_AT,
    authed: Boolean(req.user),
    ...publicPlatform(), // registrationOpen + enabled sign-in providers
  });
});

// ============================================================================
// tasks (scoped to the signed-in account)
// ============================================================================
const ownTask = (req, res, next) => {
  const task = store.getTask(req.params.id);
  if (!task || task.userId !== req.user.id) return bad(res, 404, 'not found');
  req.task = task;
  next();
};

app.get('/api/tasks', auth.requireAuth, (req, res) => res.json(store.listTasks(req.user.id)));
app.get('/api/tasks/:id', auth.requireAuth, ownTask, (req, res) => res.json(req.task));

app.post('/api/tasks', auth.requireAuth, (req, res) => {
  const { title, prompt, project, schedule, notify, runNow } = req.body || {};
  if (!prompt || !prompt.trim()) return bad(res, 400, 'prompt is required');
  const gate = checkContent(`${title || ''} ${prompt}`);
  if (!gate.ok) return bad(res, 400, declineMessage(gate.topic));
  // ATLAS names the task itself unless the operator supplied a title.
  const finalTitle = title?.trim() || titleFor(understand(prompt));
  const task = store.createTask({ userId: req.user.id, title: finalTitle, prompt, project, schedule, notify, target: req.body?.target });
  if (runNow) enqueue(task.id);
  res.status(201).json(task);
});

app.patch('/api/tasks/:id', auth.requireAuth, ownTask, (req, res) => {
  const { title, prompt, project, schedule, notify } = req.body || {};
  res.json(store.updateTask(req.task.id, { ...(title !== undefined && { title }), ...(prompt !== undefined && { prompt }), ...(project !== undefined && { project: String(project || '').trim().slice(0, 40) || null }), ...(schedule !== undefined && { schedule }), ...(notify !== undefined && { notify }) }));
});

app.delete('/api/tasks/:id', auth.requireAuth, ownTask, (req, res) => {
  stopTask(req.task.id);
  store.deleteTask(req.task.id);
  res.json({ ok: true });
});

app.post('/api/tasks/:id/run', auth.requireAuth, ownTask, (req, res) => {
  if (isRunning(req.task.id)) return bad(res, 409, 'already running');
  enqueue(req.task.id);
  res.json({ ok: true });
});
app.post('/api/tasks/:id/stop', auth.requireAuth, ownTask, (req, res) => res.json({ ok: stopTask(req.task.id) }));

app.post('/api/tasks/:id/chat', auth.requireAuth, ownTask, (req, res) => {
  const message = (req.body?.message || '').trim();
  if (!message) return bad(res, 400, 'message required');
  if (taskChat(req.task.id, message)) enqueue(req.task.id); // clarification answered → go
  res.json({ ok: true });
});

// ============================================================================
// Billing — subscriptions (Stripe-ready, demo mode without keys)
// ============================================================================
app.get('/api/billing', auth.requireAuth, (req, res) => {
  res.json({ ...billing.billingState(req.user), plans: billing.plans() });
});
app.post('/api/billing/checkout', auth.requireAuth, async (req, res) => {
  try {
    const out = await billing.startCheckout(req.user, req.body?.plan, getPlatform().baseUrl);
    res.json(out);
  } catch (e) { bad(res, 400, e.message); }
});
app.post('/api/billing/cancel', auth.requireAuth, async (req, res) => {
  await billing.cancel(req.user);
  res.json({ user: auth.publicUser(auth.getUser(req.user.id)) });
});
app.post('/api/billing/webhook', express.raw({ type: '*/*' }), (req, res) => {
  try { billing.handleWebhook(JSON.parse(req.body.toString('utf8'))); } catch {}
  res.json({ received: true });
});

// ============================================================================
// Business Brain — the agent's front desk (profile, FAQ, CRM, bookings, inbox)
// ============================================================================
app.get('/api/business', auth.requireAuth, (req, res) => {
  const b = biz.getBusiness(req.user.id);
  res.json({ profile: b.profile, faqs: b.faqs, stats: biz.bizStats(req.user.id) });
});
app.patch('/api/business/profile', auth.requireAuth, (req, res) => res.json(biz.setProfile(req.user.id, req.body || {})));
app.put('/api/business/faqs', auth.requireAuth, (req, res) => res.json(biz.setFaqs(req.user.id, req.body?.faqs)));

app.get('/api/business/customers', auth.requireAuth, (req, res) => res.json(biz.listCustomers(req.user.id)));
app.get('/api/business/bookings', auth.requireAuth, (req, res) => res.json(biz.listBookings(req.user.id)));

app.get('/api/business/inbox', auth.requireAuth, (req, res) => res.json(biz.listInbox(req.user.id)));
app.get('/api/business/inbox/:id', auth.requireAuth, (req, res) => {
  const c = biz.getConversation(req.user.id, req.params.id);
  return c ? res.json(c) : bad(res, 404, 'not found');
});

// A customer message arrives (web chat widget, simulated email, SMS). The agent
// drafts a front-desk reply from the Business Brain and can auto-book/CRM.
app.post('/api/business/incoming', auth.requireAuth, (req, res) => {
  const { channel = 'chat', from = 'Guest', subject, text } = req.body || {};
  if (!text || !text.trim()) return bad(res, 400, 'text required');
  const customer = biz.upsertCustomer(req.user.id, { name: from, email: channel === 'email' ? from : '' });
  const convo = biz.openConversation(req.user.id, { channel, customer: customer.name, subject: subject || text.slice(0, 40) });
  biz.addMessage(req.user.id, convo.id, 'customer', text);
  const reply = biz.draftReply(req.user.id, text);
  biz.addMessage(req.user.id, convo.id, 'agent', reply.text);
  if (reply.intent === 'booking') biz.addBooking(req.user.id, { customer: customer.name, service: 'Appointment', when: 'to confirm', notes: text.slice(0, 120) });
  res.json({ conversation: biz.getConversation(req.user.id, convo.id), reply });
});

// Owner (or the agent) sends a reply on a conversation; email channel goes out
// via SMTP if the owner configured their mailbox.
app.post('/api/business/inbox/:id/reply', auth.requireAuth, async (req, res) => {
  const c = biz.getConversation(req.user.id, req.params.id);
  if (!c) return bad(res, 404, 'not found');
  const text = String(req.body?.text || '').trim();
  if (!text) return bad(res, 400, 'text required');
  biz.addMessage(req.user.id, c.id, 'agent', text);
  res.json({ ok: true, conversation: biz.getConversation(req.user.id, c.id) });
});

// Pull new mail from the owner's IMAP inbox → conversations + drafted replies.
app.post('/api/business/check-email', auth.requireAuth, async (req, res) => {
  if (!billing.entitled(req.user, 'email_in')) return bad(res, 402, 'Receiving email is a Pro feature — upgrade to unlock it.');
  const cfg = req.user.settings?.imap;
  if (!cfg?.host) return bad(res, 400, 'Add your mailbox under Settings → Email to let the agent read it.');
  try {
    const msgs = await fetchRecent(cfg, 8);
    let added = 0;
    for (const m of msgs) {
      const convo = biz.openConversation(req.user.id, { channel: 'email', customer: m.from || 'Sender', subject: m.subject });
      biz.addMessage(req.user.id, convo.id, 'customer', m.text || '(no text)');
      const reply = biz.draftReply(req.user.id, `${m.subject} ${m.text}`);
      biz.addMessage(req.user.id, convo.id, 'agent', reply.text);
      added++;
    }
    res.json({ ok: true, pulled: added });
  } catch (e) { bad(res, 502, e.message); }
});

// ============================================================================
// ATLAS self-study — the engine growing on its own
// ============================================================================
app.get('/api/atlas/brain', auth.requireAuth, (_req, res) => res.json(brainStats()));
app.post('/api/atlas/teach', auth.requireAuth, (req, res) => {
  const topic = String(req.body?.topic || '').trim();
  if (!topic) return bad(res, 400, 'topic required');
  enqueueTopic(topic);
  res.json({ ok: true, queued: brainStats().queued });
});

// ============================================================================
// ATLAS chat (general, per account)
// ============================================================================
app.get('/api/atlas/chat', auth.requireAuth, (req, res) => res.json(store.chatHistory(req.user.id)));
app.post('/api/atlas/chat', auth.requireAuth, (req, res) => {
  const message = (req.body?.message || '').trim();
  if (!message) return bad(res, 400, 'message required');
  res.json({ reply: atlasChat(req.user.id, message) });
});

// ============================================================================
// Projects — the organizing unit: merged view of tasks, files, and databases
// ============================================================================
app.get('/api/projects', auth.requireAuth, async (req, res) => {
  const uid = req.user.id;
  const map = new Map();
  const entry = (slug, name) => {
    if (!map.has(slug)) map.set(slug, { slug, name: name || prettify(slug), tasks: 0, running: 0, done: 0, files: 0, collections: 0, updatedAt: 0 });
    return map.get(slug);
  };
  for (const t of store.listTasks(uid)) {
    const e = entry(slugify(t.project || 'general'), t.project);
    e.tasks++;
    if (t.status === 'running' || t.status === 'awaiting-input' || t.status === 'queued') e.running++;
    if (t.status === 'done') e.done++;
    e.updatedAt = Math.max(e.updatedAt, t.updatedAt || 0);
  }
  for (const f of await forUser(uid).list()) {
    const top = f.path.includes('/') ? f.path.split('/')[0] : 'general';
    const e = entry(top);
    e.files++;
    e.updatedAt = Math.max(e.updatedAt, f.mtime || 0);
  }
  for (const p of adb.overview(uid)) entry(p.project).collections = p.collections.length;
  res.json([...map.values()].sort((a, b) => b.updatedAt - a.updatedAt));
});
const prettify = (slug) => String(slug).split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : '')).join(' ');

// Project chat: ask about the project — or click a file and give feedback,
// which spins up a targeted refinement task.
app.get('/api/projects/:slug/chat', auth.requireAuth, (req, res) =>
  res.json(store.projectChatHistory(req.user.id, req.params.slug)));

app.post('/api/projects/:slug/chat', auth.requireAuth, async (req, res) => {
  const slug = req.params.slug;
  const message = String(req.body?.message || '').trim();
  const file = String(req.body?.file || '').trim() || null;
  if (!message) return bad(res, 400, 'message required');
  const gate = checkContent(message);
  store.addProjectChat(req.user.id, slug, 'user', message, file ? { file } : null);
  if (!gate.ok) {
    const reply = store.addProjectChat(req.user.id, slug, 'atlas', declineMessage(gate.topic));
    return res.json({ reply });
  }

  if (file) {
    // Feedback pinned to a file → targeted refinement task.
    if (!file.startsWith(`${slug}/`) || !(await forUser(req.user.id).exists(file))) {
      return bad(res, 404, 'that file is not in this project');
    }
    const base = file.split('/').pop();
    const task = store.createTask({
      userId: req.user.id,
      title: `Refine ${base}`,
      prompt: `Improve ${file} using this feedback from the operator: ${message}`,
      project: slug,
      target: file,
    });
    enqueue(task.id);
    const reply = store.addProjectChat(req.user.id, slug, 'atlas',
      `On it — I'm refining ${base} with that feedback now. Watch “Refine ${base}” in this project's tasks.`);
    return res.json({ reply, taskId: task.id });
  }

  const u = req.user;
  const reply = store.addProjectChat(req.user.id, slug, 'atlas', converse({
    userId: u.id, message, tasks: store.listTasks(),
    prefs: { tone: u.settings?.tone, callMe: u.settings?.callMe },
  }));
  res.json({ reply });
});

// ============================================================================
// Atlas Database — per-account, per-project collections (UI: session cookie)
// ============================================================================
app.get('/api/db', auth.requireAuth, (req, res) => res.json(adb.overview(req.user.id)));
app.post('/api/db/:project/collections', auth.requireAuth, (req, res) => {
  try { res.status(201).json(adb.createCollection(req.user.id, req.params.project, req.body?.name)); }
  catch (e) { bad(res, 400, e.message); }
});
app.delete('/api/db/:project/:collection', auth.requireAuth, (req, res) =>
  res.json({ ok: adb.dropCollection(req.user.id, req.params.project, req.params.collection) }));
app.get('/api/db/:project/:collection', auth.requireAuth, (req, res) =>
  res.json(adb.list(req.user.id, req.params.project, req.params.collection)));
app.post('/api/db/:project/:collection', auth.requireAuth, (req, res) =>
  res.status(201).json(adb.insert(req.user.id, req.params.project, req.params.collection, req.body || {})));
app.delete('/api/db/:project/:collection/:id', auth.requireAuth, (req, res) =>
  res.json({ ok: adb.remove(req.user.id, req.params.project, req.params.collection, req.params.id) }));
app.post('/api/db/:project/:collection/:id/increment', auth.requireAuth, (req, res) =>
  res.json(adb.increment(req.user.id, req.params.project, req.params.collection, req.params.id, req.body?.field, req.body?.by)));

// ============================================================================
// workspace files (each account sees only its own)
// ============================================================================
app.get('/files/*', auth.requireAuth, async (req, res) => {
  try {
    const rel = decodeURIComponent(req.path.replace(/^\/files\//, ''));
    const t = forUser(req.user.id);
    if (!(await t.exists(rel))) return bad(res, 404, 'not found');
    res.type(mimeFor(rel)).send(await t.read(rel));
  } catch { bad(res, 400, 'bad path'); }
});
app.get('/api/files', auth.requireAuth, async (req, res) => {
  res.json(await forUser(req.user.id).list());
});

app.delete('/api/files', auth.requireAuth, async (req, res) => {
  try {
    const rel = String(req.query.path || '');
    const t = forUser(req.user.id);
    if (!(await t.exists(rel))) return bad(res, 404, 'not found');
    await t.remove(rel);
    // revoke any share pointing at it
    for (const s of shares.listShares(req.user.id)) if (s.path === rel) shares.revokeShare(req.user.id, s.token);
    res.json({ ok: true });
  } catch { bad(res, 400, 'bad path'); }
});

// --- share links: private by default, public by explicit token -----------------
app.get('/api/shares', auth.requireAuth, (req, res) => res.json(shares.listShares(req.user.id)));
app.post('/api/shares', auth.requireAuth, async (req, res) => {
  const rel = String(req.body?.path || '');
  if (!(await forUser(req.user.id).exists(rel).catch(() => false))) return bad(res, 404, 'not found');
  const share = shares.createShare(req.user.id, rel);
  res.status(201).json({ ...share, url: `${getPlatform().baseUrl}/share/${share.token}` });
});
app.delete('/api/shares/:token', auth.requireAuth, (req, res) => {
  res.json({ ok: shares.revokeShare(req.user.id, req.params.token) });
});

// Public: serve exactly the shared file, nothing else.
app.get('/share/:token', async (req, res) => {
  const s = shares.resolveShare(req.params.token);
  if (!s) return res.status(404).send('This share link does not exist or was revoked.');
  try {
    const t = forUser(s.userId);
    if (!(await t.exists(s.path))) return res.status(404).send('The shared file no longer exists.');
    res.type(mimeFor(s.path)).send(await t.read(s.path));
  } catch { res.status(400).send('Bad share.'); }
});

// ============================================================================
// public API for platform integrations (Bearer key)
// ============================================================================
const apiAuth = (req, res, next) => {
  const key = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const user = auth.getUserByApiKey(key);
  if (!user || user.disabled) return bad(res, 401, 'invalid API key');
  req.user = user;
  next();
};
app.get('/api/v1/me', apiAuth, (req, res) => res.json({ id: req.user.id, name: req.user.name, email: req.user.email }));
app.get('/api/v1/tasks', apiAuth, (req, res) => res.json(store.listTasks(req.user.id).map(publicTask)));
app.get('/api/v1/tasks/:id', apiAuth, (req, res) => {
  const t = store.getTask(req.params.id);
  if (!t || t.userId !== req.user.id) return bad(res, 404, 'not found');
  res.json(publicTask(t));
});
app.post('/api/v1/tasks', apiAuth, (req, res) => {
  const { title, prompt, project, schedule, runNow = true } = req.body || {};
  if (!prompt || !String(prompt).trim()) return bad(res, 400, 'prompt is required');
  const gate = checkContent(`${title || ''} ${prompt}`);
  if (!gate.ok) return bad(res, 400, declineMessage(gate.topic));
  const finalTitle = title?.trim() || titleFor(understand(String(prompt)));
  const task = store.createTask({ userId: req.user.id, title: finalTitle, prompt: String(prompt), project, schedule });
  if (runNow) enqueue(task.id);
  res.status(201).json(publicTask(task));
});
app.post('/api/v1/chat', apiAuth, (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return bad(res, 400, 'message required');
  res.json({ reply: converse({ userId: req.user.id, message, tasks: store.listTasks() }) });
});

// Public Atlas Database API — a user's generated site/app drives its own DB with
// the account Bearer key. Firebase-shaped: collections, records, counters.
app.get('/api/v1/db/:project/:collection', apiAuth, (req, res) =>
  res.json(adb.list(req.user.id, req.params.project, req.params.collection)));
app.post('/api/v1/db/:project/:collection', apiAuth, (req, res) =>
  res.status(201).json(adb.insert(req.user.id, req.params.project, req.params.collection, req.body || {})));
app.get('/api/v1/db/:project/:collection/:id', apiAuth, (req, res) => {
  const rec = adb.get(req.user.id, req.params.project, req.params.collection, req.params.id);
  return rec ? res.json(rec) : bad(res, 404, 'not found');
});
app.put('/api/v1/db/:project/:collection/:id', apiAuth, (req, res) => {
  const rec = adb.update(req.user.id, req.params.project, req.params.collection, req.params.id, req.body || {});
  return rec ? res.json(rec) : bad(res, 404, 'not found');
});
app.delete('/api/v1/db/:project/:collection/:id', apiAuth, (req, res) =>
  res.json({ ok: adb.remove(req.user.id, req.params.project, req.params.collection, req.params.id) }));
app.post('/api/v1/db/:project/:collection/:id/increment', apiAuth, (req, res) =>
  res.json(adb.increment(req.user.id, req.params.project, req.params.collection, req.params.id, req.body?.field, req.body?.by)));
function publicTask(t) {
  return { id: t.id, title: t.title, prompt: t.prompt, project: t.project, status: t.status, result: t.lastResult, artifact: t.artifact, runCount: t.runCount, createdAt: t.createdAt };
}

// ============================================================================
// live stream (SSE, scoped per account)
// ============================================================================
app.get('/api/stream', auth.requireAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  const uid = req.user.id;
  const onEvent = (p) => { if (p.userId === uid) res.write(`event: event\ndata: ${JSON.stringify(p)}\n\n`); };
  const onTask = (t) => { if (t.userId === uid || t.id === '*') res.write(`event: task\ndata: ${JSON.stringify(t)}\n\n`); };
  const onChat = (c) => { if (c.userId === uid) res.write(`event: chat\ndata: ${JSON.stringify(c.msg)}\n\n`); };
  bus.on('event', onEvent); bus.on('task', onTask); bus.on('chat', onChat);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => { clearInterval(ping); bus.off('event', onEvent); bus.off('task', onTask); bus.off('chat', onChat); });
});

// ============================================================================
// health + admin console
// ============================================================================
app.get('/healthz', (_req, res) => res.json({ ok: true, db: dbMode, uptime: Math.floor(process.uptime()) }));

// On single-port hosts (Render/Heroku-style), set ADMIN_MOUNT=path to serve the
// admin console at /atlas-admin on the main port instead of its own port.
const adminApp = startAdmin({ enqueue });
if (adminApp) app.use('/atlas-admin', adminApp);

// ============================================================================
// frontend
// ============================================================================
const dist = path.join(ROOT, 'web', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/files/') ||
        req.path.startsWith('/share/') || req.path.startsWith('/atlas-admin')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

// ============================================================================
// queue + scheduler
// ============================================================================
const queue = [];
let draining = false;
export function enqueue(id) {
  if (store.getTask(id)) store.updateTask(id, { status: 'queued' });
  queue.push(id);
  drain();
}
async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length) {
    const id = queue.shift();
    if (store.getTask(id)) await runTask(id);
  }
  draining = false;
}
// Wakes anything due: recurring schedules AND deadline improvement passes
// (the agent sets nextRunAt on manual/once tasks while a deadline is ahead).
setInterval(() => {
  const now = Date.now();
  for (const task of store.listTasks()) {
    if (isRunning(task.id) || queue.includes(task.id)) continue;
    if (task.status === 'awaiting-input') continue; // blocked on the operator
    if (task.nextRunAt && now >= task.nextRunAt) {
      store.updateTask(task.id, { nextRunAt: store.computeNextRun(task.schedule, now) });
      enqueue(task.id);
    }
  }
}, 15_000);

// ============================================================================
// Self-study loop: ATLAS reads the web and gets smarter while idle. Interval is
// in minutes (MYAGENT_STUDY_MINUTES, default 45; set 0 to disable). First run
// shortly after boot so it's visibly learning.
const STUDY_MIN = Number(process.env.MYAGENT_STUDY_MINUTES ?? 45);
let studying = false;
async function studyTick() {
  if (studying || STUDY_MIN <= 0) return;
  studying = true;
  try { await study(forUser('_atlas'), (m) => auth.audit('study', m)); }
  catch (e) { auth.audit('study', `session failed: ${e.message}`); }
  finally { studying = false; }
}
if (STUDY_MIN > 0) {
  setTimeout(studyTick, 30_000);
  setInterval(studyTick, STUDY_MIN * 60_000);
}

app.listen(config.port, () => {
  const e = engineInfo();
  console.log(`\n  ${config.agentName} online — myAgent on http://localhost:${config.port}`);
  console.log(`  engine: ${e.engine} v${e.version} · ${e.skills} skills · ${e.intents} intents · self-contained`);
  console.log(`  store:  ${dbMode}${adminApp ? ` · admin mounted at /atlas-admin` : ''}`);
  console.log(`  sms:    ${smsReady() ? 'Twilio ready' : 'off'}`);
  if (!fs.existsSync(dist)) console.log(`  note:   frontend not built — run "npm run build".`);
});
