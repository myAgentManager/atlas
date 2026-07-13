// Platform-wide settings, managed from the admin console: public base URL,
// registration policy, and OAuth sign-in providers (Google / Apple).
import { getDoc, saveDoc } from './db.js';
import { config } from './config.js';

const DEFAULTS = {
  baseUrl: `http://localhost:${config.port}`,
  registrationOpen: true,
  adminAllowedIps: [], // extra IPs (beyond env ADMIN_ALLOWED_IPS) allowed into Operations
  google: { enabled: false, clientId: '', clientSecret: '' },
  apple: { enabled: false, serviceId: '', teamId: '', keyId: '', privateKey: '' },
  // Stripe billing keys — set here in Operations (env vars still work as fallback).
  stripe: { secretKey: '', publishableKey: '', webhookSecret: '', priceStarter: '', pricePro: '', priceGrowth: '' },
  // Messaging + 2SV channels, all admin-controlled and independently switchable.
  channels: {
    sms: { enabled: false, sid: '', token: '', from: '' },   // Twilio: notifications + SMS 2SV
    email: { enabled: false, from: '', host: '', port: 587, user: '', pass: '' }, // SMTP: email 2SV
    totp2sv: { enabled: true },   // authenticator-app 2SV (built in, no config)
    sms2sv: { enabled: false },   // requires sms channel
    email2sv: { enabled: false }, // requires email channel
  },
};

const saved = getDoc('platform', {});
let state = {
  ...DEFAULTS, ...saved,
  stripe: { ...DEFAULTS.stripe, ...(saved.stripe || {}) },
  channels: { ...DEFAULTS.channels, ...(saved.channels || {}),
    sms: { ...DEFAULTS.channels.sms, ...(saved.channels?.sms || {}) },
    email: { ...DEFAULTS.channels.email, ...(saved.channels?.email || {}) },
  },
};

export function getPlatform() { return state; }

// A channel is "available" only when its master switch is on AND its transport
// is actually configured — otherwise the UI shows "Not Available".
export function channelStatus() {
  const c = state.channels;
  const smsReady = c.sms.enabled && Boolean(c.sms.sid && c.sms.token && c.sms.from);
  const emailReady = c.email.enabled && Boolean(c.email.host && c.email.from);
  return {
    sms: smsReady,
    email: emailReady,
    twoStep: {
      totp: c.totp2sv.enabled !== false,       // always available
      sms: Boolean(c.sms2sv.enabled && smsReady),
      email: Boolean(c.email2sv.enabled && emailReady),
    },
  };
}

export function setPlatform(patch = {}) {
  const pc = patch.channels || {};
  state = {
    ...state,
    ...(typeof patch.baseUrl === 'string' ? { baseUrl: patch.baseUrl.replace(/\/+$/, '') } : {}),
    ...(typeof patch.registrationOpen === 'boolean' ? { registrationOpen: patch.registrationOpen } : {}),
    ...(Array.isArray(patch.adminAllowedIps) ? { adminAllowedIps: patch.adminAllowedIps.map((s) => String(s).trim()).filter(Boolean).slice(0, 50) } : {}),
    google: { ...state.google, ...(patch.google || {}) },
    apple: { ...state.apple, ...(patch.apple || {}) },
    stripe: { ...state.stripe, ...(patch.stripe || {}) },
    channels: {
      ...state.channels,
      sms: { ...state.channels.sms, ...(pc.sms || {}) },
      email: { ...state.channels.email, ...(pc.email || {}) },
      totp2sv: { ...state.channels.totp2sv, ...(pc.totp2sv || {}) },
      sms2sv: { ...state.channels.sms2sv, ...(pc.sms2sv || {}) },
      email2sv: { ...state.channels.email2sv, ...(pc.email2sv || {}) },
    },
  };
  saveDoc('platform', state);
  return state;
}

// What the public /api/agent endpoint may reveal (no secrets).
export function publicPlatform() {
  return {
    registrationOpen: state.registrationOpen,
    providers: {
      google: Boolean(state.google.enabled && state.google.clientId),
      apple: Boolean(state.apple.enabled && state.apple.serviceId && state.apple.privateKey),
    },
    channels: channelStatus(),
  };
}
