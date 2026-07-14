// Team sharing — multiple people on one business. A business is identified by a
// stable id (the original creator's userId, which never changes) where ALL its
// data lives; "owner" is a transferable ROLE, not the storage key, so handing
// ownership over doesn't move any data. Every business-data accessor resolves
// a userId to its business id via businessIdFor(), so membership is transparent
// everywhere. Free plan = 2 seats; any paid plan = unlimited.
import crypto from 'node:crypto';
import { getDoc, saveDoc } from './db.js';

// teams[bizId] = { ownerId, members: [{ id, role, addedAt }], invites: [{ code, email, role, exp }] }
// members ALWAYS includes the owner (role 'owner'). A solo user has no record
// until they invite someone — until then they're the implicit owner of bizId=userId.
let db = getDoc('teams', { teams: {} });
const save = () => saveDoc('teams', db);

let idx = {}; // memberUserId -> bizId (reverse index, rebuilt on change)
function reindex() {
  idx = {};
  for (const [bizId, t] of Object.entries(db.teams)) for (const m of t.members || []) idx[m.id] = bizId;
}
reindex();

// The business a user belongs to (as owner or member). Solo → their own id.
// Once an account forms a team, its data lives under a generated business id
// (never a userId), so a departing owner can't collide back into it.
export function businessIdFor(userId) { return idx[userId] || userId; }
export function isMember(userId) { return Boolean(idx[userId]); }
export const exists = (bizId) => Boolean(db.teams[bizId]);
export const newBusinessId = () => 'biz_' + crypto.randomBytes(8).toString('hex');

// Turn a solo account into a team: record the (already-migrated) business under
// a generated id with this user as owner. Returns the team record.
export function formTeam(bizId, ownerId) {
  db.teams[bizId] = { ownerId, members: [{ id: ownerId, role: 'owner', addedAt: Date.now() }], invites: [] };
  reindex(); save();
  return db.teams[bizId];
}

export function ownerOf(bizId) { return db.teams[bizId]?.ownerId || bizId; }
export function roleOf(userId) {
  const bizId = idx[userId];
  if (!bizId) return 'owner'; // solo owner of their own business
  return db.teams[bizId].members.find((m) => m.id === userId)?.role || 'member';
}
export function isOwner(userId) {
  const bizId = idx[userId] || userId;
  return ownerOf(bizId) === userId;
}
export function memberIds(bizId) { return (db.teams[bizId]?.members || []).map((m) => m.id); }
export function seatCount(bizId) { return db.teams[bizId]?.members.length || 1; }

// Owner invites: returns a join code (7-day TTL). Seat-gated by the caller.
// Assumes the team already exists (formTeam ran on first invite).
export function createInvite(bizId, ownerId, email, role = 'member') {
  const t = db.teams[bizId] || formTeam(bizId, ownerId);
  t.invites = (t.invites || []).filter((i) => i.exp > Date.now()).slice(-20);
  const code = crypto.randomInt(0, 1e8).toString().padStart(8, '0');
  t.invites.push({ code, email: String(email || '').toLowerCase().trim(), role: role === 'admin' ? 'admin' : 'member', exp: Date.now() + 7 * 864e5 });
  save();
  return code;
}

// Invitee redeems a code to join a team. Leaves any team they were in first.
export function redeemInvite(userId, code) {
  // an owner must hand off (or dissolve) their own business before joining another,
  // otherwise their business data would be stranded with no owner in it
  for (const t of Object.values(db.teams)) {
    if (t.ownerId === userId) return { error: 'Transfer or dissolve your current business before joining another.' };
  }
  for (const [bizId, t] of Object.entries(db.teams)) {
    const i = (t.invites || []).findIndex((x) => x.code === String(code || '').trim() && x.exp > Date.now());
    if (i === -1) continue;
    if (bizId === userId || t.members.some((m) => m.id === userId)) { t.invites.splice(i, 1); save(); return { error: "You're already on this business." }; }
    const inv = t.invites[i];
    t.invites.splice(i, 1);
    leave(userId); // detach from any prior team
    t.members.push({ id: userId, role: inv.role, addedAt: Date.now() });
    reindex(); save();
    return { bizId, role: inv.role };
  }
  return { error: 'That invite code is wrong or expired.' };
}

export function removeMember(bizId, userId) {
  const t = db.teams[bizId];
  if (!t || t.ownerId === userId) return false; // never remove the owner this way
  t.members = t.members.filter((m) => m.id !== userId);
  reindex(); save();
  return true;
}

// A member leaves whatever team they're in (owners can't leave — transfer first).
export function leave(userId) {
  const bizId = idx[userId];
  if (!bizId || db.teams[bizId].ownerId === userId) return false;
  return removeMember(bizId, userId);
}

// Hand ownership to a current member. bizId (storage key) stays put, so no data
// moves — the old owner becomes an admin member.
export function transferOwner(bizId, newOwnerId) {
  const t = db.teams[bizId];
  if (!t) return { error: 'No team to transfer.' };
  if (!t.members.some((m) => m.id === newOwnerId)) return { error: 'Transfer to a current team member.' };
  for (const m of t.members) {
    if (m.id === newOwnerId) m.role = 'owner';
    else if (m.role === 'owner') m.role = 'admin';
  }
  t.ownerId = newOwnerId;
  save();
  return { ownerId: newOwnerId };
}

// Full team snapshot for the UI (ids only — the route hydrates names/emails).
export function snapshot(bizId) {
  const t = db.teams[bizId];
  if (!t) return { ownerId: bizId, members: [{ id: bizId, role: 'owner' }], invites: [] };
  return {
    ownerId: t.ownerId,
    members: t.members.map((m) => ({ id: m.id, role: m.role, addedAt: m.addedAt })),
    invites: (t.invites || []).filter((i) => i.exp > Date.now()).map((i) => ({ email: i.email, role: i.role, code: i.code, exp: i.exp })),
  };
}

// Account deletion: dissolve if owner (members go solo), else just leave.
export function removeAllForUser(userId) {
  if (db.teams[userId]) { delete db.teams[userId]; } // dissolving a business the user owned
  const bizId = idx[userId];
  if (bizId && db.teams[bizId]) db.teams[bizId].members = db.teams[bizId].members.filter((m) => m.id !== userId);
  reindex(); save();
}
