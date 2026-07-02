// Persistence adapter. Two backends behind one tiny API:
//   · files    — JSON on disk (default; zero-config local runs)
//   · postgres — any free cloud Postgres (Neon, Supabase, …) via DATABASE_URL.
//                Documents live in a `docs` table; each account's workspace
//                files live in a private `files` table. Nothing touches the
//                local disk, so it runs on hosts with ephemeral filesystems.
//
// Top-level await: every module that imports db.js sees a ready store.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const url = process.env.DATABASE_URL || '';
export const dbMode = url ? 'postgres' : 'files';

let pool = null;
const docs = new Map(); // in-memory cache in postgres mode

if (dbMode === 'postgres') {
  const { default: pg } = await import('pg');
  const local = /localhost|127\.0\.0\.1/.test(url);
  pool = new pg.Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 5,
  });
  await pool.query(`CREATE TABLE IF NOT EXISTS docs (
    name text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS files (
    user_id text NOT NULL,
    path    text NOT NULL,
    content text NOT NULL,
    size    integer NOT NULL DEFAULT 0,
    mtime   bigint  NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, path)
  )`);
  const { rows } = await pool.query('SELECT name, data FROM docs');
  for (const r of rows) docs.set(r.name, r.data);
  console.log(`  db:     postgres · ${docs.size} documents loaded`);
}

const fileFor = (name) => path.join(config.dataDir, `${name}.json`);

// --- documents (users, tasks, chats, sessions, shares, platform, log) --------
export function getDoc(name, fallback) {
  if (dbMode === 'postgres') {
    return docs.has(name) ? docs.get(name) : structuredClone(fallback);
  }
  try { return JSON.parse(fs.readFileSync(fileFor(name), 'utf8')); } catch { return structuredClone(fallback); }
}

const pending = new Map(); // coalesce rapid writes per doc
export function saveDoc(name, data) {
  if (dbMode === 'files') {
    fs.writeFileSync(fileFor(name), JSON.stringify(data, null, 2));
    return;
  }
  docs.set(name, data);
  clearTimeout(pending.get(name));
  pending.set(name, setTimeout(() => {
    pool
      .query(
        `INSERT INTO docs (name, data, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (name) DO UPDATE SET data = $2, updated_at = now()`,
        [name, JSON.stringify(data)]
      )
      .catch((e) => console.error(`db: saveDoc(${name}) failed:`, e.message));
  }, 120));
}

// --- workspace files (postgres mode only; fs mode handled in tools.js) --------
export const fileStore = {
  async list(userId) {
    const { rows } = await pool.query(
      'SELECT path, size, mtime FROM files WHERE user_id = $1 ORDER BY path', [userId]);
    return rows.map((r) => ({ path: r.path, size: Number(r.size), mtime: Number(r.mtime) }));
  },
  async read(userId, relPath) {
    const { rows } = await pool.query(
      'SELECT content FROM files WHERE user_id = $1 AND path = $2', [userId, relPath]);
    if (!rows.length) throw new Error(`No such file: ${relPath}`);
    return rows[0].content;
  },
  async write(userId, relPath, content) {
    const size = Buffer.byteLength(content ?? '');
    await pool.query(
      `INSERT INTO files (user_id, path, content, size, mtime) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, path) DO UPDATE SET content = $3, size = $4, mtime = $5`,
      [userId, relPath, content ?? '', size, Date.now()]);
    return size;
  },
  async exists(userId, relPath) {
    const { rows } = await pool.query(
      'SELECT 1 FROM files WHERE user_id = $1 AND path = $2', [userId, relPath]);
    return rows.length > 0;
  },
  async remove(userId, relPath) {
    const { rowCount } = await pool.query(
      'DELETE FROM files WHERE user_id = $1 AND path = $2', [userId, relPath]);
    return rowCount > 0;
  },
  async removeAll(userId) {
    await pool.query('DELETE FROM files WHERE user_id = $1', [userId]);
  },
};
