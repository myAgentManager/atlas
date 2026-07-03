import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { toast } from '../toast.jsx';

// The workspace file browser. Standalone it shows everything; with a `project`
// prop it scopes to that project's folder (paths shown relative). Preview,
// share, download, delete — and push feedback to refine a specific file.
export default function Files({ project = null }) {
  const [files, setFiles] = useState([]);
  const [shares, setShares] = useState([]);
  const [open, setOpen] = useState(new Set());
  const [selected, setSelected] = useState(null); // full path
  const [preview, setPreview] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [refining, setRefining] = useState(false);

  const reload = () => {
    api.files().then((all) => {
      const scoped = project
        ? all.filter((x) => x.path.startsWith(project + '/'))
            .map((x) => ({ ...x, full: x.path, path: x.path.slice(project.length + 1) }))
        : all.map((x) => ({ ...x, full: x.path }));
      setFiles(scoped);
      // open top-level folders by default
      setOpen((prev) => { const n = new Set(prev); for (const x of scoped) n.add(x.path.split('/')[0]); return n; });
    }).catch(() => {});
    api.shares().then(setShares).catch(() => {});
  };
  useEffect(reload, [project]); // eslint-disable-line

  const tree = useMemo(() => buildTree(files), [files]);
  const shareFor = (full) => shares.find((s) => s.path === full);
  const toggle = (p) => setOpen((prev) => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n; });

  async function openFile(f) {
    setSelected(f.full);
    setFeedback('');
    const ext = (f.path.match(/\.(\w+)$/)?.[1] || '').toLowerCase();
    if (['html', 'htm', 'svg'].includes(ext)) setPreview({ kind: 'frame', src: '/files/' + f.full });
    else if (['md', 'txt', 'json', 'css', 'js'].includes(ext)) {
      const text = await fetch('/files/' + f.full).then((r) => r.text()).catch(() => '(unreadable)');
      setPreview({ kind: 'text', content: text.slice(0, 40000) });
    } else setPreview({ kind: 'binary' });
  }

  async function toggleShare(f) {
    const existing = shareFor(f.full);
    if (existing) { await api.revokeShare(existing.token).catch(() => {}); toast('Link revoked — file is private again.'); }
    else {
      const s = await api.share(f.full).catch((e) => { toast(e.message, 'err'); return null; });
      if (s) { try { await navigator.clipboard.writeText(s.url); toast('Public link copied.', 'ok'); } catch { toast(s.url); } }
    }
    reload();
  }

  async function remove(f) {
    await api.deleteFile(f.full).catch((e) => toast(e.message, 'err'));
    if (selected === f.full) { setSelected(null); setPreview(null); }
    reload();
    toast('File deleted.');
  }

  // Push feedback → a refinement task targeted at this exact file.
  async function pushFeedback() {
    const note = feedback.trim();
    if (!note || !selected) return;
    const proj = project || selected.split('/')[0];
    setRefining(true);
    try {
      await api.create({
        project: proj,
        target: selected,
        prompt: `Improve ${selected} using this feedback from the operator: ${note}`,
        runNow: true,
      });
      setFeedback('');
      toast(`ATLAS is refining ${selected.split('/').pop()}.`, 'ok');
    } catch (e) { toast(e.message, 'err'); }
    finally { setRefining(false); }
  }

  return (
    <div className="files-grid">
      <section className="col">
        <div className="panel tasklist">
          <div className="panel-title"><Icon name="file" size={14} /> {project ? 'Project files' : 'Workspace'} <span className="count-chip">{files.length}</span></div>
          <div className="task-scroll">
            {files.length === 0 && <div className="empty">Nothing here yet. Everything ATLAS builds for this project lands here.</div>}
            <Tree node={tree} depth={0} open={open} toggle={toggle} selected={selected}
              onFile={openFile} shareFor={shareFor} onShare={toggleShare} onDelete={remove} />
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
          {preview?.kind === 'frame' && <iframe className="file-frame" title="preview" src={preview.src} sandbox="allow-same-origin" />}
          {preview?.kind === 'text' && <pre className="file-text mono">{preview.content}</pre>}
          {preview?.kind === 'binary' && <div className="empty" style={{ flex: 1 }}>No inline preview — use download.</div>}

          {selected && (
            <div className="refine-bar">
              <input className="field" placeholder={`Tell ${'ATLAS'} what to change about this file…`}
                value={feedback} onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && pushFeedback()} />
              <button className="gel-btn gel-primary" disabled={refining || !feedback.trim()} onClick={pushFeedback}>
                <Icon name="refresh" size={15} /> Refine
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// --- folder tree ------------------------------------------------------------
function buildTree(files) {
  const root = { name: '', dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!node.dirs.has(seg)) node.dirs.set(seg, { name: seg, path: parts.slice(0, i + 1).join('/'), dirs: new Map(), files: [] });
      node = node.dirs.get(seg);
    }
    node.files.push(f);
  }
  return root;
}

function Tree({ node, depth, open, toggle, selected, onFile, shareFor, onShare, onDelete }) {
  const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b > 1024 ? (b / 1024).toFixed(1) + ' KB' : b + ' B');
  return (
    <>
      {[...node.dirs.values()].map((dir) => {
        const isOpen = open.has(dir.path);
        return (
          <div key={dir.path} className="tree-dir">
            <button className="tree-folder" style={{ paddingLeft: 6 + depth * 14 }} onClick={() => toggle(dir.path)}>
              <Icon name="arrow" size={12} className={isOpen ? 'twist open' : 'twist'} />
              <span className="folder-name">{dir.name}</span>
              <span className="folder-count">{countFiles(dir)}</span>
            </button>
            {isOpen && <Tree node={dir} depth={depth + 1} open={open} toggle={toggle} selected={selected}
              onFile={onFile} shareFor={shareFor} onShare={onShare} onDelete={onDelete} />}
          </div>
        );
      })}
      {node.files.map((f) => {
        const shared = Boolean(shareFor(f.full));
        return (
          <div key={f.full} className={`tree-file ${selected === f.full ? 'active' : ''}`}
            style={{ paddingLeft: 10 + depth * 14 }} onClick={() => onFile(f)}>
            <Icon name="file" size={14} />
            <div className="file-main">
              <div className="file-name">{f.path.split('/').pop()}</div>
              <div className="file-meta">{fmtSize(f.size)}{shared && <span className="shared-tag"><Icon name="globe" size={10} /> public</span>}</div>
            </div>
            <div className="task-controls" onClick={(e) => e.stopPropagation()}>
              <button className={`mini-btn ${shared ? 'lit' : ''}`} title={shared ? 'Revoke link' : 'Public link'} onClick={() => onShare(f)}><Icon name="globe" size={13} /></button>
              <a className="mini-btn" title="Download" href={'/files/' + f.full} download><Icon name="arrow" size={13} className="down" /></a>
              <button className="mini-btn ghost" title="Delete" onClick={() => onDelete(f)}><Icon name="close" size={13} /></button>
            </div>
          </div>
        );
      })}
    </>
  );
}

function countFiles(dir) {
  let n = dir.files.length;
  for (const d of dir.dirs.values()) n += countFiles(d);
  return n;
}
