// OAuth sign-in (Google + Apple), from scratch on fetch + node:crypto.
// Providers are configured in the admin console; buttons appear on the login
// page only when enabled. No SDKs — the flows are the standard authorization-
// code exchanges, and Apple's ES256 client-secret JWT is signed right here.
import crypto from 'node:crypto';
import { getPlatform } from './platform.js';
import * as auth from './auth.js';

// Short-lived state tokens to bind the redirect to this browser session.
const states = new Map(); // state -> { provider, exp }
function newState(provider) {
  const s = crypto.randomBytes(16).toString('hex');
  states.set(s, { provider, exp: Date.now() + 10 * 60_000 });
  return s;
}
function takeState(s, provider) {
  const rec = states.get(s);
  states.delete(s);
  return Boolean(rec && rec.provider === provider && rec.exp > Date.now());
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fromB64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

function decodeJwtPayload(jwt) {
  try { return JSON.parse(fromB64url(String(jwt).split('.')[1] || '')); } catch { return null; }
}

// --- Apple client secret: ES256 JWT signed with the developer's .p8 key -------
export function appleClientSecret({ teamId, keyId, serviceId, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const payload = b64url(JSON.stringify({
    iss: teamId, iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: serviceId,
  }));
  const data = `${header}.${payload}`;
  const sig = crypto.sign('sha256', Buffer.from(data), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${data}.${b64url(sig)}`;
}

// --- shared: find or create the account for a verified identity ----------------
function landUser({ provider, providerId, email, name }) {
  let user = auth.listUsers().find((u) => u.provider === provider && u.providerId === providerId);
  if (!user && email) {
    user = auth.getUserByEmail(email); // link an existing local account by email
    if (user) auth.updateUser(user.id, (u) => { u.provider = provider; u.providerId = providerId; });
  }
  if (!user) {
    if (!getPlatform().registrationOpen) throw new Error('registration is closed');
    user = auth.createUser({ email, name: name || email.split('@')[0], provider, providerId });
  }
  if (user.disabled) throw new Error('account disabled');
  auth.audit('auth', `signed in via ${provider}: ${user.email}`);
  return user;
}

const callbackUrl = (provider) => `${getPlatform().baseUrl}/api/auth/oauth/${provider}/callback`;

// --- routes ---------------------------------------------------------------------
export function mountOAuth(app, { urlencoded }) {
  // GOOGLE ------------------------------------------------------------------
  app.get('/api/auth/oauth/google', (req, res) => {
    const g = getPlatform().google;
    if (!g.enabled || !g.clientId) return res.status(404).send('Google sign-in is not configured.');
    const q = new URLSearchParams({
      client_id: g.clientId,
      redirect_uri: callbackUrl('google'),
      response_type: 'code',
      scope: 'openid email profile',
      state: newState('google'),
      prompt: 'select_account',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
  });

  app.get('/api/auth/oauth/google/callback', async (req, res) => {
    try {
      const g = getPlatform().google;
      const { code, state } = req.query;
      if (!takeState(state, 'google') || !code) throw new Error('bad state');
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: g.clientId, client_secret: g.clientSecret,
          redirect_uri: callbackUrl('google'), grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const tokens = await tokenRes.json();
      if (!tokens.id_token) throw new Error(tokens.error_description || 'no id_token');
      // Server-side validation straight against Google.
      const info = await (await fetch(
        'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(tokens.id_token),
        { signal: AbortSignal.timeout(15_000) }
      )).json();
      if (info.aud !== g.clientId || info.email_verified !== 'true') throw new Error('token validation failed');
      const user = landUser({ provider: 'google', providerId: info.sub, email: info.email, name: info.name });
      auth.setCookie(res, 'ma_sess', auth.createSession(user.id), { secure: req.secure });
      res.redirect('/');
    } catch (e) {
      auth.audit('auth', `google sign-in failed: ${e.message}`);
      res.redirect('/?signin=failed');
    }
  });

  // APPLE -------------------------------------------------------------------
  app.get('/api/auth/oauth/apple', (req, res) => {
    const a = getPlatform().apple;
    if (!a.enabled || !a.serviceId || !a.privateKey) return res.status(404).send('Apple sign-in is not configured.');
    const q = new URLSearchParams({
      client_id: a.serviceId,
      redirect_uri: callbackUrl('apple'),
      response_type: 'code',
      response_mode: 'form_post', // Apple posts the result back
      scope: 'name email',
      state: newState('apple'),
    });
    res.redirect(`https://appleid.apple.com/auth/authorize?${q}`);
  });

  // Apple's callback arrives as a form POST.
  app.post('/api/auth/oauth/apple/callback', urlencoded, async (req, res) => {
    try {
      const a = getPlatform().apple;
      const { code, state, user: userJson } = req.body || {};
      if (!takeState(state, 'apple') || !code) throw new Error('bad state');
      const secret = appleClientSecret(a);
      const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: a.serviceId, client_secret: secret,
          redirect_uri: callbackUrl('apple'), grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const tokens = await tokenRes.json();
      if (!tokens.id_token) throw new Error(tokens.error || 'no id_token');
      const claims = decodeJwtPayload(tokens.id_token);
      if (!claims || claims.aud !== a.serviceId || claims.iss !== 'https://appleid.apple.com') {
        throw new Error('token validation failed');
      }
      // Apple sends the name only on first authorization, as a JSON form field.
      let name = '';
      try { const u = JSON.parse(userJson || '{}'); name = [u.name?.firstName, u.name?.lastName].filter(Boolean).join(' '); } catch {}
      const user = landUser({ provider: 'apple', providerId: claims.sub, email: claims.email || `${claims.sub}@privaterelay.appleid.com`, name });
      auth.setCookie(res, 'ma_sess', auth.createSession(user.id), { secure: req.secure });
      res.redirect('/');
    } catch (e) {
      auth.audit('auth', `apple sign-in failed: ${e.message}`);
      res.redirect('/?signin=failed');
    }
  });
}
