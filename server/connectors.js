// Per-account integration tools (connector credentials). A business fills these
// in once; their agents draw on them. Secrets are stored but never returned to
// the client in full — the UI only sees which connectors are "connected".
import { getDoc, saveDoc } from './db.js';
import { CONNECTORS, connectorStatus } from './catalog.js';

let db = getDoc('connectors', { byUser: {} });
const save = () => saveDoc('connectors', db);

const raw = (userId) => (db.byUser[userId] ||= {});

export function saveConnector(userId, id, fields) {
  if (!CONNECTORS[id]) throw new Error('Unknown connector.');
  const u = raw(userId);
  u[id] = { ...(u[id] || {}), ...fields };
  save();
  return connectorStatus(u)[id];
}

export function clearConnector(userId, id) {
  const u = raw(userId);
  delete u[id];
  save();
}

export const getConnectorConfig = (userId, id) => raw(userId)[id] || null;
export const status = (userId) => connectorStatus(raw(userId));

// Safe view for the UI: masked field values + connected flag.
export function publicConnectors(userId) {
  const u = raw(userId);
  const st = connectorStatus(u);
  const out = {};
  for (const [id, def] of Object.entries(CONNECTORS)) {
    const cfg = u[id] || {};
    out[id] = {
      connected: st[id],
      values: Object.fromEntries(def.fields.map((f) => {
        const v = cfg[f.key] || '';
        return [f.key, f.secret && v ? '••••••••' : v];
      })),
    };
  }
  return out;
}

export function removeAllForUser(userId) {
  if (db.byUser[userId]) { delete db.byUser[userId]; save(); }
}
