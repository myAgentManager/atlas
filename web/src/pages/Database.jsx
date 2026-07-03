import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { toast } from '../toast.jsx';

// Atlas Database — a Firebase-style datastore per project. Create collections,
// add/browse/delete records, and drive it from your own app over the API.
// With `fixedProject` set it embeds inside that project's workspace.
export default function Database({ tasks = [], user, fixedProject = null }) {
  const [overview, setOverview] = useState([]);
  const [project, setProject] = useState(fixedProject || '');
  const [collection, setCollection] = useState(null);
  const [records, setRecords] = useState([]);
  const [newCol, setNewCol] = useState('');
  const [draft, setDraft] = useState('{\n  "name": "Ada",\n  "role": "member"\n}');
  const [showApi, setShowApi] = useState(false);

  const knownProjects = useMemo(() => {
    const fromTasks = tasks.map((t) => t.project).filter(Boolean);
    const fromDb = overview.map((p) => p.project);
    return [...new Set([...fromDb, ...fromTasks])];
  }, [tasks, overview]);

  const load = () => api.dbOverview().then((o) => {
    setOverview(o);
    if (!fixedProject) setProject((p) => p || o[0]?.project || (knownProjects[0] || ''));
  }).catch(() => {});
  useEffect(load, [fixedProject]); // eslint-disable-line

  const current = overview.find((p) => p.project === project);

  const openCollection = (name) => {
    setCollection(name);
    api.dbList(project, name).then(setRecords).catch(() => setRecords([]));
  };

  const createCollection = async () => {
    const nm = newCol.trim();
    if (!nm) return;
    if (!project.trim()) return toast('Pick or type a project first.', 'err');
    try {
      await api.dbCreateCollection(project.trim(), nm);
      setNewCol('');
      await load();
      openCollection(nm.toLowerCase().replace(/[^a-z0-9_-]/g, ''));
      toast('Collection created.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };

  const addRecord = async () => {
    let data;
    try { data = JSON.parse(draft); } catch { return toast('That isn\'t valid JSON.', 'err'); }
    try {
      await api.dbInsert(project, collection, data);
      openCollection(collection);
      load();
      toast('Record added.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };

  const delRecord = async (id) => {
    await api.dbRemove(project, collection, id).catch(() => {});
    openCollection(collection);
    load();
  };

  const base = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="db-grid">
      <section className="col">
        <div className="panel">
          <div className="panel-title"><Icon name="server" size={14} /> Atlas Database</div>
          <p className="dim-note">A private datastore for {fixedProject ? 'this project' : 'your projects'} — store records, count things, and read/write it from your own app. Like Firebase, but yours.</p>
          {!fixedProject && (
            <label className="auth-label">Project
              <input className="field" list="db-projects" placeholder="project name" value={project}
                onChange={(e) => { setProject(e.target.value); setCollection(null); }} />
              <datalist id="db-projects">{knownProjects.map((p) => <option key={p} value={p} />)}</datalist>
            </label>
          )}
        </div>

        <div className="panel">
          <div className="panel-title"><Icon name="file" size={14} /> Collections {current && <span className="count-chip">{current.collections.length}</span>}</div>
          <div className="db-cols">
            {(!current || current.collections.length === 0) && <div className="empty">No collections in this project yet.</div>}
            {current?.collections.map((c) => (
              <button key={c.name} className={`db-col ${collection === c.name ? 'active' : ''}`} onClick={() => openCollection(c.name)}>
                <Icon name="server" size={14} />
                <span className="db-col-name">{c.name}</span>
                <span className="db-col-count">{c.count}</span>
              </button>
            ))}
          </div>
          <div className="db-newcol">
            <input className="field" placeholder="new collection (e.g. users, counters)" value={newCol}
              onChange={(e) => setNewCol(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createCollection()} />
            <button className="gel-btn gel-primary" onClick={createCollection}>Create</button>
          </div>
        </div>

        <button className="gel-btn api-toggle" onClick={() => setShowApi(!showApi)}>
          <Icon name="code" size={14} /> {showApi ? 'Hide' : 'Show'} API for your app
        </button>
        {showApi && (
          <div className="panel db-api">
            <p className="dim-note">Drive this database from your generated site or any app with your account key (Settings → Developer API):</p>
            <pre className="api-demo mono tiny">{`# add a record
curl -X POST ${base}/api/v1/db/${project || 'project'}/${collection || 'users'} \\
  -H "Authorization: Bearer <your-key>" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"a@b.co"}'

# bump a counter
curl -X POST ${base}/api/v1/db/${project || 'project'}/counters/visits/increment \\
  -H "Authorization: Bearer <your-key>" -d '{"by":1}'`}</pre>
          </div>
        )}
      </section>

      <section className="col">
        <div className="panel db-records">
          <div className="feed-head">
            <div className="panel-title"><Icon name="server" size={14} /> Records</div>
            {collection && <div className="feed-task-name">{project}/{collection}</div>}
          </div>
          {!collection && <div className="empty" style={{ flex: 1 }}>Select a collection to view its records.</div>}
          {collection && (
            <>
              <div className="db-add">
                <textarea className="field mono tiny" rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} />
                <button className="gel-btn gel-primary" onClick={addRecord}><Icon name="spark" size={14} /> Add record</button>
              </div>
              <div className="db-rows">
                {records.length === 0 && <div className="empty">No records yet.</div>}
                {records.map((r) => (
                  <div key={r.id} className="db-row">
                    <div className="db-row-id mono">{r.id}</div>
                    <pre className="db-row-json mono tiny">{JSON.stringify(omit(r), null, 1)}</pre>
                    <button className="mini-btn ghost" title="Delete" onClick={() => delRecord(r.id)}><Icon name="close" size={13} /></button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function omit(rec) {
  const { id, _ts, ...rest } = rec;
  return rest;
}
