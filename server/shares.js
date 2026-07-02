// Public share links for workspace artifacts. Files are private by default;
// a share mints an unguessable token that serves exactly one file, and can be
// revoked any time.
import crypto from 'node:crypto';
import { getDoc, saveDoc } from './db.js';

let shares = getDoc('shares', {});
const save = () => saveDoc('shares', shares);

export function createShare(userId, relPath) {
  // one share per (user, path) — return the existing token if present
  const existing = Object.entries(shares).find(([, s]) => s.userId === userId && s.path === relPath);
  if (existing) return { token: existing[0], ...existing[1] };
  const token = crypto.randomBytes(16).toString('hex');
  shares[token] = { userId, path: relPath, createdAt: Date.now() };
  save();
  return { token, ...shares[token] };
}

export function listShares(userId) {
  return Object.entries(shares)
    .filter(([, s]) => s.userId === userId)
    .map(([token, s]) => ({ token, ...s }));
}

export function revokeShare(userId, token) {
  if (shares[token] && shares[token].userId === userId) {
    delete shares[token];
    save();
    return true;
  }
  return false;
}

export function resolveShare(token) {
  return shares[token] || null;
}

export function revokeAllForUser(userId) {
  let changed = false;
  for (const [t, s] of Object.entries(shares)) if (s.userId === userId) { delete shares[t]; changed = true; }
  if (changed) save();
}
