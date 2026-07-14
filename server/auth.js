// Accounts, sessions, and two-step verification — all from scratch on
// node:crypto. Passwords are scrypt-hashed, sessions are random tokens in
// httpOnly cookies, and 2SV is real RFC-6238 TOTP (works with any
// authenticator app) plus single-use backup codes.
import crypto from 'node:crypto';
import { getDoc, saveDoc } from './db.js';
import { config } from './config.js';

let usersDb = getDoc('users', { users: [] });
let sessions = getDoc('sessions', {}); // token -> { userId, exp }
let logDb = getDoc('log', { entries: [] });

const saveUsers = () => saveDoc('users', usersDb);
const saveSessions = () => saveDoc('sessions', sessions);

// --- audit log ---------------------------------------------------------------
export function audit(kind, text) {
  logDb.entries.push({ ts: Date.now(), kind, text });
  if (logDb.entries.length > 500) logDb.entries.splice(0, logDb.entries.length - 500);
  saveDoc('log', logDb);
}
export const auditLog = () => logDb.entries;

// --- passwords ---------------------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function checkPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return test.length === ref.length && crypto.timingSafeEqual(test, ref);
}

// --- TOTP (RFC 6238), from scratch -------------------------------------------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  let bits = 0, value = 0; const out = [];
  for (const ch of str.toUpperCase().replace(/=+$/, '')) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
export function totpCode(secretB32, at = Date.now()) {
  const key = base32Decode(secretB32);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = crypto.createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
export function totpVerify(secretB32, code, at = Date.now()) {
  const c = String(code || '').replace(/\s/g, '');
  return [-1, 0, 1].some((w) => totpCode(secretB32, at + w * 30_000) === c);
}

// --- rate limiting (login + admin gate) ---------------------------------------
const attempts = new Map(); // key -> { n, until }
export function rateCheck(key, max = 8, lockMs = 15 * 60_000) {
  const a = attempts.get(key);
  if (a && a.until > Date.now()) return false;
  if (a && a.until <= Date.now()) attempts.delete(key);
  return true;
}
export function rateFail(key, max = 8, lockMs = 15 * 60_000) {
  const a = attempts.get(key) || { n: 0, until: 0 };
  a.n += 1;
  if (a.n >= max) { a.until = Date.now() + lockMs; a.n = 0; }
  attempts.set(key, a);
}
export const rateClear = (key) => attempts.delete(key);

// --- users --------------------------------------------------------------------
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newApiKey = () => 'ma_' + crypto.randomBytes(24).toString('hex');

export const listUsers = () => usersDb.users;
export const getUser = (id) => usersDb.users.find((u) => u.id === id) || null;
export const getUserByEmail = (email) =>
  usersDb.users.find((u) => u.email === String(email || '').toLowerCase().trim()) || null;
export const getUserByApiKey = (key) =>
  key ? usersDb.users.find((u) => u.apiKey === key) || null : null;

export function createUser({ email, name, password, provider, providerId }) {
  email = String(email || '').toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (!name || !name.trim()) throw new Error('Enter your name.');
  if (!provider && String(password || '').length < 8) throw new Error('Password must be at least 8 characters.');
  if (getUserByEmail(email)) throw new Error('An account with that email already exists.');

  const user = {
    id: crypto.randomUUID(),
    email,
    name: name.trim().slice(0, 60),
    pass: provider ? null : hashPassword(password), // null → OAuth-only account
    provider: provider || 'local',
    providerId: providerId || null,
    role: usersDb.users.length === 0 ? 'owner' : 'member',
    disabled: false,
    welcomed: false,
    // Every signup confirms a code emailed to them — company addresses too.
    // Only OAuth identities (provider already verified the email) and the very
    // first account (no email channel exists yet to send through) are exempt.
    emailVerified: Boolean(provider) || usersDb.users.length === 0,
    // Admin privileges belong to @atlasnetworks.com addresses ONLY — the first
    // account no longer gets them by default (the Operations console has its
    // own access code for platform administration).
    founder: email.endsWith('@atlasnetworks.com'),
    plan: 'free',
    subscription: { plan: 'free', status: 'active', since: Date.now(), stripeCustomer: null, stripeSub: null },
    totp: { secret: null, enabled: false, backup: [] },
    second: { method: null }, // 'totp' | 'email' | 'sms' | null
    apiKey: newApiKey(),
    settings: {
      smsTo: '',
      notifySms: false,
      callMe: '',
      tone: 'auto',
      integrations: { webhookUrl: '', slackUrl: '', discordUrl: '', onFinish: true, onFail: true },
    },
    createdAt: Date.now(),
  };
  usersDb.users.push(user);
  saveUsers();
  audit('auth', `account created: ${email}`);
  return user;
}

export function updateUser(id, mutate) {
  const user = getUser(id);
  if (!user) return null;
  mutate(user);
  saveUsers();
  return user;
}

export function deleteUser(id) {
  const i = usersDb.users.findIndex((u) => u.id === id);
  if (i === -1) return false;
  const [u] = usersDb.users.splice(i, 1);
  for (const [tok, s] of Object.entries(sessions)) if (s.userId === id) delete sessions[tok];
  saveUsers(); saveSessions();
  audit('auth', `account deleted: ${u.email}`);
  return true;
}

export function verifyPassword(user, password) {
  if (!user.pass) return false; // OAuth-only account, no password set
  return checkPassword(password, user.pass);
}
export const isOAuthOnly = (user) => !user.pass && user.provider !== 'local';
export function setPassword(user, password) {
  if (String(password || '').length < 8) throw new Error('Password must be at least 8 characters.');
  user.pass = hashPassword(password);
  saveUsers();
}

// --- 2SV lifecycle ------------------------------------------------------------
export function beginTotpSetup(user) {
  const secret = base32Encode(crypto.randomBytes(20));
  user.totp.secret = secret;
  user.totp.enabled = false;
  saveUsers();
  const label = encodeURIComponent(`Atlas:${user.email}`);
  return { secret, otpauth: `otpauth://totp/${label}?secret=${secret}&issuer=Atlas&digits=6&period=30` };
}
export function enableTotp(user, code) {
  if (!user.totp.secret || !totpVerify(user.totp.secret, code)) return null;
  user.totp.enabled = true;
  user.second = { method: 'totp' };
  const plain = Array.from({ length: 6 }, () => crypto.randomBytes(4).toString('hex'));
  user.totp.backup = plain.map(sha);
  saveUsers();
  audit('auth', `2SV enabled (authenticator): ${user.email}`);
  return plain; // shown once
}
export function disableSecond(user) {
  user.totp = { secret: null, enabled: false, backup: [] };
  user.second = { method: null };
  saveUsers();
  audit('auth', `2SV disabled: ${user.email}`);
}
export function setSecondMethod(user, method) {
  user.second = { method };
  saveUsers();
  audit('auth', `2SV enabled (${method}): ${user.email}`);
}
// Active method — tolerant of accounts created before `second` existed.
export function secondMethod(user) {
  return user.second?.method || (user.totp?.enabled ? 'totp' : null);
}

// 6-digit verification code + masked destination for UI hints.
export const genCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
export function maskDest(dest) {
  const s = String(dest || '');
  if (s.includes('@')) {
    const [u, d] = s.split('@');
    return `${u.slice(0, 2)}•••@${d}`;
  }
  return s.length > 4 ? `•••${s.slice(-4)}` : s;
}
export function codeMatches(a, b) {
  const ha = crypto.createHash('sha256').update(String(a || '').trim()).digest();
  const hb = crypto.createHash('sha256').update(String(b || '').trim()).digest();
  return crypto.timingSafeEqual(ha, hb);
}
export function checkSecondFactor(user, code) {
  if (totpVerify(user.totp.secret, code)) return true;
  const h = sha(String(code || '').trim().toLowerCase());
  const i = user.totp.backup.indexOf(h);
  if (i !== -1) { user.totp.backup.splice(i, 1); saveUsers(); return true; }
  return false;
}

// --- sessions -----------------------------------------------------------------
const SESSION_MS = 30 * 24 * 3600_000;
// Short-lived tokens for the pause between password and 2SV code.
const pending = new Map(); // token -> { userId, exp }

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions[token] = { userId, exp: Date.now() + SESSION_MS };
  saveSessions();
  return token;
}
export function destroySession(token) {
  if (token && sessions[token]) { delete sessions[token]; saveSessions(); }
}
export function sessionUser(token) {
  const s = token && sessions[token];
  if (!s) return null;
  if (s.exp < Date.now()) { delete sessions[token]; saveSessions(); return null; }
  const user = getUser(s.userId);
  return user && !user.disabled ? user : null;
}
export function createPending(userId, extra = {}) {
  const token = crypto.randomBytes(24).toString('hex');
  pending.set(token, { userId, exp: Date.now() + 5 * 60_000, ...extra });
  return token;
}
// Returns { user, method, code } — or null if expired/unknown.
export function takePending(token) {
  const p = pending.get(token);
  if (!p || p.exp < Date.now()) return null;
  pending.delete(token);
  const user = getUser(p.userId);
  return user ? { user, method: p.method || 'totp', code: p.code || null } : null;
}

export const rotateApiKey = (user) => { user.apiKey = newApiKey(); saveUsers(); return user.apiKey; };

// --- express helpers ----------------------------------------------------------
export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}
export function setCookie(res, name, value, { maxAge = SESSION_MS, path = '/', secure = false } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, 'HttpOnly', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  if (maxAge) parts.push(`Max-Age=${Math.floor(maxAge / 1000)}`);
  res.append('Set-Cookie', parts.join('; '));
}
export function clearCookie(res, name) {
  res.append('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// --- trusted devices -----------------------------------------------------------
// After one successful 2SV, the browser gets a signed token so day-to-day
// sign-ins skip the second step for 30 days. Stateless — HMAC over
// userId + expiry with the server secret; revoke everywhere by rotating
// MYAGENT_SECRET.
export const TRUST_MS = 30 * 24 * 3600e3;
export function trustToken(userId) {
  const exp = Date.now() + TRUST_MS;
  const sig = crypto.createHmac('sha256', config.secret).update(`${userId}.${exp}`).digest('base64url');
  return `${userId}.${exp}.${sig}`;
}
export function trustValid(token, userId) {
  const [uid, exp, sig] = String(token || '').split('.');
  if (!uid || uid !== userId || !exp || Number(exp) < Date.now() || !sig) return false;
  const want = crypto.createHmac('sha256', config.secret).update(`${uid}.${exp}`).digest('base64url');
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}

export function attach(req, _res, next) {
  req.user = sessionUser(parseCookies(req).ma_sess) || null;
  // coarse presence stamp (≥5-minute granularity) — Operations only ever
  // reveals it once an account has been idle for months
  if (req.user && (!req.user.lastSeen || Date.now() - req.user.lastSeen > 5 * 60_000)) {
    updateUser(req.user.id, (u) => { u.lastSeen = Date.now(); });
  }
  next();
}

// --- Atlas Support codes ---------------------------------------------------------
// An account holder generates a short-lived code in their Settings; staff can
// open the agent-related support view in Operations ONLY while holding it.
const supportCodes = new Map(); // userId -> { code, exp }
export function createSupportCode(userId) {
  const code = crypto.randomInt(0, 100_000_000).toString().padStart(8, '0');
  supportCodes.set(userId, { code, exp: Date.now() + 3600e3 });
  return code;
}
export function checkSupportCode(userId, code) {
  const e = supportCodes.get(userId);
  return Boolean(e && e.exp > Date.now() && String(code || '').trim() === e.code);
}
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'sign in required' });
  next();
}

// Public JSON shape of a user (never leaks hashes/secrets).
export function publicUser(u) {
  const method = secondMethod(u);
  return {
    id: u.id, email: u.email, name: u.name, role: u.role,
    founder: Boolean(u.founder), plan: u.plan || 'free', subscription: u.subscription || { plan: 'free', status: 'active' },
    provider: u.provider || 'local', welcomed: u.welcomed !== false,
    twoStep: Boolean(method), twoStepMethod: method, backupCodesLeft: u.totp.backup.length,
    apiKey: u.apiKey, settings: u.settings, createdAt: u.createdAt,
  };
}
