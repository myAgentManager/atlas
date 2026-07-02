// ATLAS's hands. Every account gets a private, sandboxed workspace — on local
// disk by default, or inside the cloud database when DATABASE_URL is set (so
// user files persist and stay private on hosts with ephemeral disks). Path
// traversal is rejected in both modes. Browsing helpers fetch public pages
// only (never the local network).
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { dbMode, fileStore } from './db.js';

// Normalized, sandbox-safe relative path ("a/b/c.txt") for both backends.
function safeRel(relPath = '') {
  const norm = path.posix.normalize(String(relPath).replace(/\\/g, '/')).replace(/^\/+/, '');
  if (!norm || norm === '.' || norm.startsWith('..') || norm.includes('/../')) {
    throw new Error('Path escapes the sandboxed workspace.');
  }
  return norm;
}

function fsRoot(userId) {
  const root = path.join(config.workspace, String(userId));
  fssync.mkdirSync(root, { recursive: true });
  return root;
}
function fsResolve(userId, rel) {
  const root = fsRoot(userId);
  const target = path.resolve(root, safeRel(rel));
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('Path escapes the sandboxed workspace.');
  }
  return target;
}

function assertPublicUrl(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error('Invalid URL.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) URLs are allowed.');
  const h = u.hostname;
  if (
    h === 'localhost' || h.endsWith('.local') ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(h) ||
    h === '0.0.0.0' || h === '::1'
  ) throw new Error('Refusing to fetch a private/local address.');
  return u.toString();
}

export function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

// Bind the toolset to one account's sandbox.
export function forUser(userId) {
  const uid = String(userId);

  const fsList = async () => {
    const out = [];
    const walk = async (rel) => {
      let entries;
      try { entries = await fs.readdir(rel ? fsResolve(uid, rel) : fsRoot(uid), { withFileTypes: true }); }
      catch { return; }
      for (const e of entries) {
        const p = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(p);
        else {
          try {
            const st = await fs.stat(fsResolve(uid, p));
            out.push({ path: p, size: st.size, mtime: st.mtimeMs });
          } catch {}
        }
      }
    };
    await walk('');
    return out;
  };

  return {
    // [{ path, size, mtime }] for every file in the workspace
    async list() {
      return dbMode === 'postgres' ? fileStore.list(uid) : fsList();
    },

    async read(rel) {
      rel = safeRel(rel);
      return dbMode === 'postgres'
        ? fileStore.read(uid, rel)
        : fs.readFile(fsResolve(uid, rel), 'utf8');
    },

    async write(rel, content) {
      rel = safeRel(rel);
      if (dbMode === 'postgres') {
        const size = await fileStore.write(uid, rel, content);
        return `Wrote ${size} bytes to ${rel}`;
      }
      const file = fsResolve(uid, rel);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, content ?? '', 'utf8');
      return `Wrote ${Buffer.byteLength(content ?? '')} bytes to ${rel}`;
    },

    async exists(rel) {
      try { rel = safeRel(rel); } catch { return false; }
      if (dbMode === 'postgres') return fileStore.exists(uid, rel);
      return fssync.existsSync(fsResolve(uid, rel)) && !fssync.statSync(fsResolve(uid, rel)).isDirectory();
    },

    async remove(rel) {
      rel = safeRel(rel);
      if (dbMode === 'postgres') return fileStore.remove(uid, rel);
      const file = fsResolve(uid, rel);
      if (!fssync.existsSync(file) || fssync.statSync(file).isDirectory()) return false;
      await fs.rm(file);
      return true;
    },

    async removeAll() {
      if (dbMode === 'postgres') return fileStore.removeAll(uid);
      await fs.rm(fsRoot(uid), { recursive: true, force: true });
    },

    // --- browsing (shared, not per-user) --------------------------------------
    async fetchPage(url) {
      const target = assertPublicUrl(url);
      const res = await fetch(target, {
        headers: { 'User-Agent': 'Mozilla/5.0 (myAgent ATLAS)' },
        signal: AbortSignal.timeout(15_000),
      });
      const text = stripHtml(await res.text());
      return text.slice(0, 8000) || '(no readable text)';
    },

    async webSearch(query) {
      if (!String(query || '').trim()) return [];
      const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
        headers: { 'User-Agent': 'Mozilla/5.0 (myAgent ATLAS)' },
        signal: AbortSignal.timeout(15_000),
      });
      const html = await res.text();
      const results = [];
      const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      let m;
      while ((m = re.exec(html)) && results.length < 6) {
        let url = m[1];
        const uddg = url.match(/uddg=([^&]+)/);
        if (uddg) url = decodeURIComponent(uddg[1]);
        const title = stripHtml(m[2]);
        if (title && /^https?:/.test(url)) results.push({ title, url });
      }
      return results;
    },
  };
}

export const MIME = {
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript',
  md: 'text/markdown', txt: 'text/plain', json: 'application/json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
};
export const mimeFor = (p) => MIME[path.extname(String(p)).slice(1).toLowerCase()] || 'text/plain';
