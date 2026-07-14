// In-app document reader. Anywhere in the app, call openReader(path) to view
// an artifact without leaving myAgent — Markdown is rendered to clean HTML,
// web pages show live in a framed viewport, other files offer a download.
import React, { useEffect, useState } from 'react';
import { Icon } from './icons.jsx';

export function openReader(path) {
  window.dispatchEvent(new CustomEvent('atlas-read', { detail: { path } }));
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Small, safe Markdown → HTML (headings, bold/italic, code, lists, links, rules).
function mdToHtml(md) {
  const lines = String(md).replace(/\r/g, '').split('\n');
  let html = '';
  let inList = false;
  let inCode = false;
  const inline = (t) =>
    esc(t)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, txt, url) => /^(https?:|mailto:)/i.test(url.trim()) ? `<a href="${url}" target="_blank" rel="noreferrer">${txt}</a>` : txt)
      .replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
  for (const raw of lines) {
    if (raw.trim().startsWith('```')) {
      if (inList) { html += '</ul>'; inList = false; }
      inCode = !inCode; html += inCode ? '<pre><code>' : '</code></pre>'; continue;
    }
    if (inCode) { html += esc(raw) + '\n'; continue; }
    const h = raw.match(/^(#{1,6})\s+(.*)/);
    if (h) { if (inList) { html += '</ul>'; inList = false; } html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; continue; }
    if (/^\s*[-*]\s+/.test(raw)) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(raw.replace(/^\s*[-*]\s+/, ''))}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    if (/^\s*---\s*$/.test(raw)) { html += '<hr>'; continue; }
    if (!raw.trim()) { html += ''; continue; }
    html += `<p>${inline(raw)}</p>`;
  }
  if (inList) html += '</ul>';
  if (inCode) html += '</code></pre>';
  return html;
}

export function Reader() {
  const [file, setFile] = useState(null); // { path }
  const [state, setState] = useState(null); // { kind, html?, src? }

  useEffect(() => {
    const on = (e) => setFile({ path: e.detail.path });
    window.addEventListener('atlas-read', on);
    return () => window.removeEventListener('atlas-read', on);
  }, []);

  useEffect(() => {
    if (!file) { setState(null); return; }
    const url = file.path.startsWith('/files/') ? file.path : '/files/' + file.path;
    const ext = (file.path.match(/\.(\w+)$/)?.[1] || '').toLowerCase();
    if (['html', 'htm', 'svg'].includes(ext)) { setState({ kind: 'frame', src: url }); return; }
    if (['md', 'markdown', 'txt', 'json', 'css', 'js'].includes(ext)) {
      fetch(url).then((r) => r.text()).then((t) => {
        setState(ext === 'md' || ext === 'markdown'
          ? { kind: 'md', html: mdToHtml(t) }
          : { kind: 'pre', text: t });
      }).catch(() => setState({ kind: 'error' }));
      return;
    }
    setState({ kind: 'download', src: url });
  }, [file]);

  if (!file) return null;
  const name = file.path.split('/').pop();
  const dl = file.path.startsWith('/files/') ? file.path : '/files/' + file.path;

  return (
    <div className="reader-backdrop" onClick={() => setFile(null)}>
      <div className="reader panel" onClick={(e) => e.stopPropagation()}>
        <div className="reader-head">
          <div className="reader-name"><Icon name="file" size={15} /> {name}</div>
          <div className="reader-actions">
            <a className="mini-btn" href={dl} download title="Download"><Icon name="arrow" size={14} className="down" /></a>
            <a className="mini-btn" href={dl} target="_blank" rel="noreferrer" title="Open in new tab"><Icon name="globe" size={14} /></a>
            <button className="mini-btn ghost" onClick={() => setFile(null)} title="Close"><Icon name="close" size={14} /></button>
          </div>
        </div>
        <div className="reader-body">
          {!state && <div className="empty">Loading…</div>}
          {state?.kind === 'frame' && <iframe className="reader-frame" title={name} src={state.src} sandbox="allow-scripts allow-same-origin" />}
          {state?.kind === 'md' && <article className="reader-doc" dangerouslySetInnerHTML={{ __html: state.html }} />}
          {state?.kind === 'pre' && <pre className="reader-pre mono">{state.text}</pre>}
          {state?.kind === 'download' && <div className="empty">No inline preview for this file type. <a className="text-link" href={state.src} download>Download it</a>.</div>}
          {state?.kind === 'error' && <div className="empty">Couldn't load this file.</div>}
        </div>
      </div>
    </div>
  );
}
