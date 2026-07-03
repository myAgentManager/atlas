// Atlas Database — a lightweight, Firebase-style datastore each account can use
// for its projects: collections of JSON records, plus atomic counters. Backed
// by the same persistence layer as everything else (JSON locally, Postgres in
// the cloud), scoped strictly per (user, project). A user's generated app can
// read/write it over the public API with their Bearer key.
import { randomUUID } from 'node:crypto';
import { getDoc, saveDoc } from './db.js';

let store = getDoc('datastore', { users: {} }); // users[userId][project][collection] = { records:{}, createdAt }
const save = () => saveDoc('datastore', store);

const projOf = (u, project) => {
  const p = String(project || 'general').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40) || 'general';
  store.users[u] ||= {};
  store.users[u][p] ||= {};
  return { p, node: store.users[u][p] };
};
const colName = (c) => String(c || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);

export function overview(userId) {
  const projects = store.users[userId] || {};
  return Object.entries(projects).map(([project, cols]) => ({
    project,
    collections: Object.entries(cols).map(([name, c]) => ({
      name, count: Object.keys(c.records).length, createdAt: c.createdAt,
    })),
  }));
}

export function createCollection(userId, project, collection) {
  const name = colName(collection);
  if (!name) throw new Error('Collection name required (letters, numbers, - and _).');
  const { p, node } = projOf(userId, project);
  if (!node[name]) { node[name] = { records: {}, createdAt: Date.now() }; save(); }
  return { project: p, collection: name };
}

export function dropCollection(userId, project, collection) {
  const { node } = projOf(userId, project);
  const name = colName(collection);
  if (node[name]) { delete node[name]; save(); return true; }
  return false;
}

export function list(userId, project, collection, { limit = 200 } = {}) {
  const { node } = projOf(userId, project);
  const c = node[colName(collection)];
  if (!c) return [];
  return Object.entries(c.records)
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => (b._ts || 0) - (a._ts || 0))
    .slice(0, limit);
}

export function insert(userId, project, collection, data) {
  const { node } = projOf(userId, project);
  const name = colName(collection);
  node[name] ||= { records: {}, createdAt: Date.now() };
  const id = data.id ? String(data.id).slice(0, 60) : randomUUID().slice(0, 8);
  const record = { ...data, _ts: Date.now() };
  delete record.id;
  node[name].records[id] = record;
  save();
  return { id, ...record };
}

export function get(userId, project, collection, id) {
  const { node } = projOf(userId, project);
  const c = node[colName(collection)];
  const rec = c?.records[id];
  return rec ? { id, ...rec } : null;
}

export function update(userId, project, collection, id, patch) {
  const { node } = projOf(userId, project);
  const c = node[colName(collection)];
  if (!c || !c.records[id]) return null;
  c.records[id] = { ...c.records[id], ...patch, _ts: Date.now() };
  save();
  return { id, ...c.records[id] };
}

export function remove(userId, project, collection, id) {
  const { node } = projOf(userId, project);
  const c = node[colName(collection)];
  if (!c || !c.records[id]) return false;
  delete c.records[id];
  save();
  return true;
}

// Atomic counter: increment records[id].field by `by` (default 1), creating as
// needed. Great for "count things" without race conditions (single process).
export function increment(userId, project, collection, id, field = 'count', by = 1) {
  const { node } = projOf(userId, project);
  const name = colName(collection);
  node[name] ||= { records: {}, createdAt: Date.now() };
  const rec = node[name].records[id] ||= { _ts: Date.now() };
  rec[field] = (Number(rec[field]) || 0) + Number(by || 1);
  rec._ts = Date.now();
  save();
  return { id, ...rec };
}

export function removeAllForUser(userId) {
  if (store.users[userId]) { delete store.users[userId]; save(); }
}
