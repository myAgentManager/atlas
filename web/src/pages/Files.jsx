import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';

// The workspace: everything ATLAS has made for this account. Private by
// default; each file can be opened, downloaded, shared by link, or deleted.
export default function Files() {
  const [files, setFiles] = useState([]);
  const [shares, setShares] = useState([]);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null); // { kind, content? , src? }
  const [flash, setFlash] = useState('');

  const reload = () => {
    api.files().then(setFiles).catch(() => {});
    api.shares().then(setShares).catch(() => {});
  };
  useEffect(reload, []);

  const groups = useMemo(() => {
    const g = {};
    for (const f of files) {
      const top = f.path.includes('/') ? f.path.split('/')[0] : 'root';
      (g[top] ||= []).push(f);
    }
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [files]);

  const shareFor = (path) => shares.find((s) => s.path === path);

  async function open(f) {
    setSelected(f.path);
    const ext = (f.path.match(/\.(\w+)$/)?.[1] || '').toLowerCase();
    if (ext === 'html' || ext === 'htm' || ext === 'svg') {
      setPreview({ kind: 'frame', src: '/files/' + f.path });
    } else if (['md', 'txt', 'json', 'css', 'js'].includes(ext)) {
      const text = await fetch('/files/' + f.path).then((r) => r.text()).catch(() => '(unreadable)');
      setPreview({ kind: 'text', content: text.slice(0, 20000) });
    } else {
      setPreview({ kind: 'binary' });
    }
  }

  async function toggleShare(f) {
    const existing = shareFor(f.path);
    if (existing) {
      await api.revokeShare(existing.token).catch(() => {});
      say('Share link revoked — the file is private again.');
    } else {
      const s = await api.share(f.path).catch((e) => { say(e.message); return null; });
      if (s) {
        try { await navigator.clipboard.writeText(s.url); say('Public link copied to clipboard.'); }
        catch { say(`Share link: ${s.url}`); }
      }
    }
    reload();
  }

  async function remove(f) {
    if (!confirm(`Delete ${f.path}? This also revokes its share link.`)) return;
    await api.deleteFile(f.path).catch((e) => say(e.message));
    if (selected === f.path) { setSelected(null); setPreview(null); }
    reload();
  }

  function say(msg) { setFlash(msg); setTimeout(() => setFlash(''), 3500); }

  const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b > 1024 ? (b / 1024).toFixed(1) + ' KB' : b + ' B');

  return (
    <div className="files-grid">
      <section className="col">
        <div className="panel tasklist">
          <div className="panel-title"><Icon name="file" size={14} /> Workspace <span className="count-chip">{files.length}</span></div>
          {flash && <div className="files-flash">{flash}</div>}
          <div className="task-scroll">
            {files.length === 0 && (
              <div className="empty">Nothing here yet. Everything ATLAS builds — sites, reports, drafts — lands in your private workspace.</div>
            )}
            {groups.map(([dir, list]) => (
              <div key={dir} className="file-group">
                <div className="file-group-name">{dir}/</div>
                {list.map((f) => {
                  const shared = Boolean(shareFor(f.path));
                  return (
                    <div key={f.path} className={`file-row ${selected === f.path ? 'active' : ''}`} onClick={() => open(f)}>
                      <Icon name="file" size={15} />
                      <div className="file-main">
                        <div className="file-name">{f.path.split('/').pop()}</div>
                        <div className="file-meta">{fmtSize(f.size)} · {new Date(f.mtime).toLocaleDateString([], { month: 'short', day: 'numeric' })}{shared && <span className="shared-tag"><Icon name="globe" size={10} /> public link</span>}</div>
                      </div>
                      <div className="task-controls" onClick={(e) => e.stopPropagation()}>
                        <button className={`mini-btn ${shared ? 'lit' : ''}`} title={shared ? 'Revoke public link' : 'Create public link'} onClick={() => toggleShare(f)}>
                          <Icon name="globe" size={13} />
                        </button>
                        <a className="mini-btn" title="Download" href={'/files/' + f.path} download>
                          <Icon name="arrow" size={13} className="down" />
                        </a>
                        <button className="mini-btn ghost" title="Delete" onClick={() => remove(f)}><Icon name="close" size={13} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="col">
        <div className="panel feed">
          <div className="feed-head">
            <div className="panel-title"><Icon name="eye" size={14} /> Preview</div>
            {selected && <div className="feed-task-name">{selected}</div>}
          </div>
          {!preview && <div className="empty" style={{ flex: 1 }}>Select a file to preview it.</div>}
          {preview?.kind === 'frame' && (
            <iframe className="file-frame" title="preview" src={preview.src} sandbox="allow-same-origin" />
          )}
          {preview?.kind === 'text' && <pre className="file-text mono">{preview.content}</pre>}
          {preview?.kind === 'binary' && <div className="empty" style={{ flex: 1 }}>No inline preview — use download.</div>}
        </div>
      </section>
    </div>
  );
}
