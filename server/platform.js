// Platform-wide settings, managed from the admin console: public base URL,
// registration policy, and OAuth sign-in providers (Google / Apple).
import { getDoc, saveDoc } from './db.js';
import { config } from './config.js';

const DEFAULTS = {
  baseUrl: `http://localhost:${config.port}`,
  registrationOpen: true,
  google: { enabled: false, clientId: '', clientSecret: '' },
  apple: { enabled: false, serviceId: '', teamId: '', keyId: '', privateKey: '' },
};

let state = { ...DEFAULTS, ...getDoc('platform', {}) };

export function getPlatform() { return state; }

export function setPlatform(patch = {}) {
  state = {
    ...state,
    ...(typeof patch.baseUrl === 'string' ? { baseUrl: patch.baseUrl.replace(/\/+$/, '') } : {}),
    ...(typeof patch.registrationOpen === 'boolean' ? { registrationOpen: patch.registrationOpen } : {}),
    google: { ...state.google, ...(patch.google || {}) },
    apple: { ...state.apple, ...(patch.apple || {}) },
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
  };
}
