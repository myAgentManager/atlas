import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { toast } from '../toast.jsx';
import Files from './Files.jsx';
import Database from './Database.jsx';
import { openReader } from '../reader.jsx';

// The Command Deck: projects are the organizing unit. Pick one in the sidebar
// and its workspace opens — its own tasks, files, database, and chat.

const STARTERS = [
  ['Website', 'Build me a one-page website for '],
  ['Research', 'Research on the web and write a cited report about '],
  ['Document', 'Draft a structured document about '],
  ['Story', 'Write a story about '],
];

const STATUS_RANK = { running: 0, 'awaiting-input': 1, queued: 2, failed: 3, done: 4, paused: 5, idle: 6 };
const slugify = (s) => String(s || 'general').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'general';

export default function Dashboard({ agent, user, tasks, reload }) {
  const name = agent?.name || 'ATLAS';
  const [projects, setProjects] = useState([]);
  const [slug, setSlug] = useState(null);      // selected project
  const [naming, setNaming] = useState(false); // "new project" mini-form
  const [newName, setNewName] = useState('');
  const [query, setQuery] = useState('');      // sidebar search
  const [tab, setTab] = useState('overview');  // overview | tasks | files | database | chat

  // NB: never hand useEffect a promise-returning fn — React calls the return
  // value as "cleanup" on unmount and crashes the whole tree.
  const loadProjects = () => { api.projects().then(setProjects).catch(() => {}); };
  useEffect(() => { loadProjects(); }, []); // eslint-disable-line
  useEffect(() => { loadProjects(); }, [tasks.length]); // new/removed tasks → refresh stats

  // Merge live task state into the sidebar so LEDs are current.
  const cards = useMemo(() => {
    const bySlug = new Map(projects.map((p) => [p.slug, { ...p }]));
    for (const t of tasks) {
      const s = slugify(t.project || 'general');
      if (!bySlug.has(s)) bySlug.set(s, { slug: s, name: t.project || 'General', tasks: 0, running: 0, files: 0, collections: 0, updatedAt: 0 });
      const c = bySlug.get(s);
      c.updatedAt = Math.max(c.updatedAt || 0, t.updatedAt || 0);
    }
    for (const c of bySlug.values()) {
      const mine = tasks.filter((t) => slugify(t.project || 'general') === c.slug);
      c.tasks = mine.length;
      c.running = mine.filter((t) => ['running', 'awaiting-input', 'queued'].includes(t.status)).length;
    }
    return [...bySlug.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [projects, tasks]);

  const current = cards.find((c) => c.slug === slug) || null;
  const projectTasks = useMemo(
    () => tasks.filter((t) => slugify(t.project || 'general') === slug)
      .sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || b.updatedAt - a.updatedAt),
    [tasks, slug]
  );

  const createProject = () => {
    const nm = newName.trim();
    if (!nm) return;
    setSlug(slugify(nm));
    setProjects((prev) => prev.some((p) => p.slug === slugify(nm)) ? prev
      : [{ slug: slugify(nm), name: nm, tasks: 0, running: 0, files: 0, collections: 0, updatedAt: Date.now() }, ...prev]);
    setNewName(''); setNaming(false); setTab('tasks');
  };

  return (
    <div className="pdeck">
      {/* ------- project sidebar ------- */}
      <aside className="panel proj-side">
        <div className="panel-title"><Icon name="globe" size={14} /> Projects <span className="count-chip">{cards.length}</span></div>
        {cards.length > 3 && (
          <input className="field proj-search" placeholder="Search projects…" value={query} onChange={(e) => setQuery(e.target.value)} />
        )}
        <div className="proj-scroll">
          {cards.length === 0 && !naming && (
            <div className="empty">No projects yet.<br />Create one and give {name} its first task.</div>
          )}
          {cards.filter((p) => !query || (p.name || p.slug).toLowerCase().includes(query.toLowerCase())).map((p) => (
            <button key={p.slug} className={`proj-row ${slug === p.slug ? 'active' : ''}`}
              onClick={() => { setSlug(p.slug); setTab('overview'); }}>
              <span className="proj-glyph orb">{(p.name || p.slug)[0].toUpperCase()}</span>
              <span className="proj-main">
                <span className="proj-name">{p.name || p.slug}</span>
                <span className="proj-sub">{p.tasks} task{p.tasks !== 1 ? 's' : ''} · {p.files} file{p.files !== 1 ? 's' : ''}{p.collections ? ` · ${p.collections} db` : ''}</span>
              </span>
              {p.running > 0 && <span className="led cyan pulse" />}
            </button>
          ))}
        </div>
        {naming ? (
          <div className="newproj-form">
            <input className="field" autoFocus placeholder="Project name" value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createProject(); if (e.key === 'Escape') setNaming(false); }} />
            <button className="gel-btn gel-primary" onClick={createProject}>Create</button>
          </div>
        ) : (
          <button className="gel-btn gel-primary new-task-btn" onClick={() => setNaming(true)}>
            <Icon name="spark" size={15} /> New project
          </button>
        )}
      </aside>

      {/* ------- workspace ------- */}
      {!current ? (
        <div className="proj-empty">
          <Icon name="globe" size={42} />
          <h2>Pick a project</h2>
          <p>Each project has its own tasks, files, database, and a direct line to {name}.</p>
        </div>
      ) : (
        <section className="proj-work">
          <header className="panel proj-head">
            <div className="proj-head-id">
              <span className="proj-glyph big">{(current.name || current.slug)[0].toUpperCase()}</span>
              <div>
                <div className="proj-title">{current.name || current.slug}</div>
                <div className="proj-stats">{current.tasks} tasks · {current.files} files{current.collections ? ` · ${current.collections} collections` : ''}</div>
              </div>
            </div>
            <nav className="wtabs">
              {[['overview', 'Overview', 'globe'], ['tasks', 'Tasks', 'bolt'], ['files', 'Files', 'file'], ['database', 'Database', 'server'], ['chat', 'Chat', 'chat']].map(([id, label, icon]) => (
                <button key={id} className={`wtab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
                  <Icon name={icon} size={14} /> {label}
                </button>
              ))}
            </nav>
          </header>

          {tab === 'overview' && <OverviewTab name={name} card={current} tasks={projectTasks} goto={setTab} />}
          {tab === 'tasks' && <TasksTab name={name} agent={agent} slug={current.slug} projectName={current.name} tasks={projectTasks} reload={reload} />}
          {tab === 'files' && <Files project={current.slug} />}
          {tab === 'database' && <Database fixedProject={current.slug} tasks={tasks} user={user} />}
          {tab === 'chat' && <ChatTab name={name} slug={current.slug} onTaskMade={reload} />}
        </section>
      )}
    </div>
  );
}

/* ========================== OVERVIEW TAB =================================== */
function OverviewTab({ name, card, tasks, goto }) {
  const [files, setFiles] = useState([]);
  useEffect(() => {
    api.files().then((all) => setFiles(all.filter((f) => f.path.startsWith(card.slug + '/')).sort((a, b) => b.mtime - a.mtime))).catch(() => {});
  }, [card.slug]);

  // Latest activity across every task in the project.
  const activity = useMemo(() => {
    const evs = [];
    for (const t of tasks) for (const e of (t.events || []).slice(-6)) evs.push({ ...e, taskTitle: t.title });
    return evs.sort((a, b) => b.ts - a.ts).slice(0, 8);
  }, [tasks]);

  const done = tasks.filter((t) => t.status === 'done').length;
  const needsYou = tasks.filter((t) => t.status === 'awaiting-input').length;

  return (
    <div className="overview-grid">
      <div className="ov-tiles">
        <button className="ov-tile panel" onClick={() => goto('tasks')}>
          <span className="ov-num">{card.tasks}</span><span className="ov-label">Tasks</span>
        </button>
        <button className="ov-tile panel" onClick={() => goto('tasks')}>
          <span className="ov-num green">{done}</span><span className="ov-label">Done</span>
        </button>
        <button className="ov-tile panel" onClick={() => goto('files')}>
          <span className="ov-num">{card.files}</span><span className="ov-label">Files</span>
        </button>
        <button className="ov-tile panel" onClick={() => goto('database')}>
          <span className="ov-num">{card.collections}</span><span className="ov-label">Collections</span>
        </button>
      </div>

      {needsYou > 0 && (
        <button className="ov-alert" onClick={() => goto('tasks')}>
          <Icon name="chat" size={15} /> {name} has {needsYou === 1 ? 'a question' : `${needsYou} questions`} waiting — tap to answer.
        </button>
      )}

      <div className="ov-cols">
        <div className="panel ov-panel">
          <div className="panel-title"><Icon name="bolt" size={14} /> Latest activity</div>
          <div className="ov-feed">
            {activity.length === 0 && <div className="empty">Quiet so far. Assign the first task.</div>}
            {activity.map((e) => (
              <div key={e.id} className="ov-line">
                <span className={`feed-icon mini ${e.type}`}><Icon name={eventIcon(e.type)} size={12} /></span>
                <div className="ov-line-main">
                  <span className="ov-line-text">{String(e.text).slice(0, 110)}</span>
                  <span className="ov-line-sub">{e.taskTitle} · {new Date(e.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel ov-panel">
          <div className="panel-title"><Icon name="file" size={14} /> Newest artifacts</div>
          <div className="ov-feed">
            {files.length === 0 && <div className="empty">Nothing built yet — everything {name} makes lands here.</div>}
            {files.slice(0, 6).map((f) => (
              <button key={f.path} type="button" className="ov-file" onClick={() => openReader('/files/' + f.path)}>
                <Icon name="file" size={13} />
                <span className="ov-file-name">{f.path.slice(card.slug.length + 1)}</span>
                <span className="ov-file-sub">{new Date(f.mtime).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
              </button>
            ))}
          </div>
          <div className="ov-actions">
            <button className="gel-btn gel-primary" onClick={() => goto('tasks')}><Icon name="spark" size={14} /> New task</button>
            <button className="gel-btn" onClick={() => goto('chat')}><Icon name="chat" size={14} /> Ask {name}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ TASKS TAB ==================================== */
function TasksTab({ name, agent, slug, projectName, tasks, reload }) {
  const [composing, setComposing] = useState(tasks.length === 0);
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [schedule, setSchedule] = useState({ schedule: { type: 'manual' } });
  const [notify, setNotify] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => {
    if (selectedId) return tasks.find((t) => t.id === selectedId) || null;
    return tasks.find((t) => t.status === 'running') || tasks[0] || null;
  }, [tasks, selectedId]);

  async function assign(runNow) {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    try {
      const task = await api.create({ title, prompt, project: projectName || slug, schedule: schedule.schedule, notify, runNow });
      setPrompt(''); setTitle(''); setComposing(false);
      setSelectedId(task.id);
      toast(runNow ? `${name} is on it.` : 'Task queued.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  }

  return (
    <div className="deck-grid work-grid">
      <section className="col col-left">
        {composing ? (
          <div className="panel composer">
            <div className="panel-title"><Icon name="spark" size={14} /> New task in {projectName || slug}
              {tasks.length > 0 && <button className="clear-filter" onClick={() => setComposing(false)}>close</button>}
            </div>
            <div className="chip-row">
              {STARTERS.map(([label, starter]) => (
                <button key={label} type="button" className="starter-chip" onClick={() => setPrompt(starter)}>{label}</button>
              ))}
            </div>
            <textarea className="field textarea" rows={4} autoFocus
              placeholder={`Tell ${name} what to do for this project…`}
              value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            <input className="field" placeholder="Custom title (optional — ATLAS writes one)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <SchedulePicker onChange={setSchedule} />
            <label className="notify-row">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              <Icon name={notify ? 'bell' : 'bellOff'} size={15} />
              <span>Notify me when it's done {agent?.channels && !agent.channels.sms && <em>(SMS Not Available)</em>}</span>
            </label>
            <div className="composer-actions">
              <button className="gel-btn" disabled={busy || !prompt.trim()} onClick={() => assign(false)}>Queue it</button>
              <button className="gel-btn gel-primary" disabled={busy || !prompt.trim()} onClick={() => assign(true)}>Assign &amp; Run</button>
            </div>
          </div>
        ) : (
          <button className="gel-btn gel-primary new-task-btn" onClick={() => setComposing(true)}>
            <Icon name="spark" size={15} /> New task
          </button>
        )}

        <div className="panel tasklist">
          <div className="panel-title"><Icon name="bolt" size={14} /> Tasks <span className="count-chip">{tasks.length}</span></div>
          <div className="task-scroll">
            {tasks.length === 0 && <div className="empty">No tasks in this project yet.</div>}
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} active={selected?.id === t.id} onSelect={() => setSelectedId(t.id)} reload={reload} />
            ))}
          </div>
        </div>
      </section>

      <section className="col col-right">
        <Feed task={selected} name={name} />
      </section>
    </div>
  );
}

/* ========================= PROJECT CHAT TAB ================================= */
function ChatTab({ name, slug, onTaskMade }) {
  const [msgs, setMsgs] = useState([]);
  const [files, setFiles] = useState([]);
  const [attached, setAttached] = useState(null); // file path pinned to next message
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    api.projectChat(slug).then(setMsgs).catch(() => {});
    api.files().then((all) => setFiles(all.filter((f) => f.path.startsWith(slug + '/')))).catch(() => {});
  }, [slug]);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length]);

  async function send() {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setText('');
    const file = attached;
    setAttached(null);
    setMsgs((prev) => [...prev, { id: 'tmp' + Date.now(), who: 'user', text: message, meta: file ? { file } : null, ts: Date.now() }]);
    try {
      const { reply, taskId } = await api.projectSend(slug, message, file || undefined);
      setMsgs((prev) => [...prev, reply]);
      if (taskId) { toast('Refinement task started.', 'ok'); onTaskMade?.(); }
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  }

  return (
    <div className="chat-grid">
      {/* project files — click one to pin your feedback to it */}
      <aside className="panel chat-files">
        <div className="panel-title"><Icon name="file" size={14} /> Files</div>
        <p className="dim-note tiny-note">Click a file, then say what to change — {name} refines that exact file.</p>
        <div className="task-scroll">
          {files.length === 0 && <div className="empty">No files yet.</div>}
          {files.map((f) => (
            <button key={f.path} className={`chatfile ${attached === f.path ? 'active' : ''}`}
              onClick={() => setAttached(attached === f.path ? null : f.path)}>
              <Icon name="file" size={13} />
              <span className="chatfile-name">{f.path.slice(slug.length + 1)}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="panel feed chat-main">
        <div className="feed-head"><div className="panel-title"><Icon name="chat" size={14} /> Project chat</div></div>
        <div className="feed-scroll" ref={ref}>
          {msgs.length === 0 && (
            <div className="empty">Ask {name} anything about this project — progress, plans, contents.<br />
              Or click a file on the left and tell it what to change.</div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className={`bubble-row ${m.who === 'user' ? 'mine' : 'agent'}`}>
              <div className="bubble">
                <div className="bubble-who">{m.who === 'user' ? 'You' : name}</div>
                {m.meta?.file && <div className="bubble-file"><Icon name="file" size={11} /> {m.meta.file.split('/').pop()}</div>}
                <div className="bubble-text">{m.text}</div>
              </div>
            </div>
          ))}
        </div>
        {attached && (
          <div className="attach-chip">
            <Icon name="file" size={13} /> Feedback on <b>{attached.split('/').pop()}</b>
            <button className="mini-btn ghost" onClick={() => setAttached(null)}><Icon name="close" size={12} /></button>
          </div>
        )}
        <div className="chat-bar">
          <input className="field" placeholder={attached ? `What should change in ${attached.split('/').pop()}?` : `Message ${name} about this project…`}
            value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
          <button className="gel-btn gel-primary send" disabled={busy || !text.trim()} onClick={send}><Icon name="send" size={16} /></button>
        </div>
      </div>
    </div>
  );
}

/* ---------- detailed scheduling ---------- */
const pad = (n) => String(n).padStart(2, '0');
const toDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ts = (date, time) => new Date(`${date}T${time}`).getTime();
const fmt = (e) => new Date(e).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function SchedulePicker({ onChange }) {
  const now = new Date();
  const nextHour = `${pad((now.getHours() + 1) % 24)}:00`;
  const [mode, setMode] = useState('manual');
  const [date, setDate] = useState(toDate(now));
  const [time, setTime] = useState(nextHour);
  const [overnight, setOvernight] = useState('01:00');
  const [everyN, setEveryN] = useState(30);
  const [unit, setUnit] = useState('m');
  const [days, setDays] = useState([]);
  const [dlOn, setDlOn] = useState(false);
  const [dlDate, setDlDate] = useState(toDate(new Date(now.getTime() + 864e5)));
  const [dlTime, setDlTime] = useState('08:00');

  function build() {
    let s = { type: 'manual' };
    if (mode === 'once') s = { type: 'once', at: ts(date, time) };
    else if (mode === 'overnight') {
      const at = new Date(`${toDate(new Date())}T${overnight}`);
      if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1);
      s = { type: 'once', at: at.getTime() };
    } else if (mode === 'interval') s = { type: 'interval', intervalMinutes: Math.max(1, (unit === 'h' ? everyN * 60 : Number(everyN)) || 30) };
    else if (mode === 'daily') s = { type: 'daily', time, days: days.length ? [...days].sort() : undefined };
    if (dlOn && mode !== 'manual') s.deadline = ts(dlDate, dlTime);
    return s;
  }

  useEffect(() => {
    onChange({ schedule: build() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date, time, overnight, everyN, unit, days, dlOn, dlDate, dlTime]);

  const toggleDay = (i) => setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));

  return (
    <div className="sched">
      <div className="sched-modes">
        {[['manual', 'On demand'], ['once', 'At a time'], ['overnight', 'Overnight'], ['interval', 'Repeat'], ['daily', 'Daily']].map(([k, label]) => (
          <button key={k} className={`seg ${mode === k ? 'on' : ''}`} onClick={() => setMode(k)} type="button">{label}</button>
        ))}
      </div>

      <div className="sched-fields">
        {mode === 'once' && (
          <>
            <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input className="field" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </>
        )}
        {mode === 'overnight' && (
          <label className="inline-field"><span>Start tonight at</span>
            <input className="field" type="time" value={overnight} onChange={(e) => setOvernight(e.target.value)} />
          </label>
        )}
        {mode === 'interval' && (
          <label className="inline-field"><span>Every</span>
            <input className="field num" type="number" min="1" value={everyN} onChange={(e) => setEveryN(e.target.value)} />
            <select className="select sm" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="m">minutes</option><option value="h">hours</option>
            </select>
          </label>
        )}
        {mode === 'daily' && (
          <>
            <label className="inline-field"><span>At</span>
              <input className="field" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <div className="day-toggles">
              {DAYS.map((d, i) => (
                <button key={i} type="button" className={`day ${days.includes(i) ? 'on' : ''}`} onClick={() => toggleDay(i)}>{d}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {mode !== 'manual' && (
        <label className="dl-row">
          <input type="checkbox" checked={dlOn} onChange={(e) => setDlOn(e.target.checked)} />
          <Icon name="clock" size={14} /> <span>Deadline</span>
          {dlOn && (
            <>
              <input className="field" type="date" value={dlDate} onChange={(e) => setDlDate(e.target.value)} />
              <input className="field" type="time" value={dlTime} onChange={(e) => setDlTime(e.target.value)} />
            </>
          )}
        </label>
      )}

      <div className="sched-summary"><Icon name="calendar" size={13} /> {summarize(build())}</div>
    </div>
  );
}

function summarize(s) {
  let base;
  if (s.type === 'manual') base = 'Runs on demand.';
  else if (s.type === 'once') base = `Runs once · ${fmt(s.at)}`;
  else if (s.type === 'interval') base = `Every ${s.intervalMinutes >= 60 ? s.intervalMinutes / 60 + 'h' : s.intervalMinutes + 'm'}`;
  else if (s.type === 'daily') base = `Daily at ${s.time}${s.days?.length ? ' · ' + s.days.map((d) => DAYS[d]).join('') : ''}`;
  else base = 'Scheduled';
  if (s.deadline) base += ` · finish by ${fmt(s.deadline)}`;
  return base;
}

/* ---------- task row ---------- */
function TaskRow({ task, active, onSelect, reload }) {
  const [armed, setArmed] = useState(false);
  const running = task.status === 'running';
  const stop = (e) => { e.stopPropagation(); api.stop(task.id).catch(() => {}); };
  const run = (e) => { e.stopPropagation(); api.run(task.id).then(() => toast('Running.', 'ok')).catch((err) => toast(err.message, 'err')); };
  const bell = (e) => { e.stopPropagation(); api.update(task.id, { notify: !task.notify }).catch(() => {}); };
  const del = (e) => { e.stopPropagation(); api.remove(task.id).then(reload).then(() => toast('Task deleted.')).catch((err) => toast(err.message, 'err')); };

  return (
    <div className={`task-row ${active ? 'active' : ''}`} onClick={onSelect}>
      <span className={`led ${ledClass(task.status)}`} />
      <div className="task-main">
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          <span className={`status-tag ${task.status}`}>{statusLabel(task.status)}</span>
          {task.target && <span className="proj-chip"><Icon name="refresh" size={10} /> {task.target.split('/').pop()}</span>}
          <span className="sched-badge">{rowSchedule(task.schedule)}</span>
          {task.schedule?.deadline && <span className="dl-badge"><Icon name="clock" size={11} /> {fmt(task.schedule.deadline)}</span>}
          {task.runCount > 0 && <span className="runs">×{task.runCount}</span>}
        </div>
      </div>
      <div className="task-controls" onClick={(e) => e.stopPropagation()}>
        {armed ? (
          <>
            <button className="mini-btn stop" title="Confirm delete" onClick={del}><Icon name="check" size={13} /></button>
            <button className="mini-btn ghost" title="Cancel" onClick={() => setArmed(false)}><Icon name="close" size={13} /></button>
          </>
        ) : (
          <>
            <button className={`mini-btn ${task.notify ? 'lit' : 'ghost'}`} onClick={bell} title={task.notify ? 'Notifications on' : 'Notifications off'}>
              <Icon name={task.notify ? 'bell' : 'bellOff'} size={13} />
            </button>
            {running
              ? <button className="mini-btn stop" onClick={stop} title="Stop"><Icon name="stop" size={12} /></button>
              : <button className="mini-btn" onClick={run} title="Run now"><Icon name="play" size={12} /></button>}
            <button className="mini-btn ghost" onClick={() => setArmed(true)} title="Delete"><Icon name="close" size={13} /></button>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- live feed + task chat ---------- */
function Feed({ task, name }) {
  const ref = useRef(null);
  const [msg, setMsg] = useState('');
  const events = task?.events || [];

  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [events.length, task?.id]);

  const send = (textOverride) => {
    const text = (textOverride ?? msg).trim();
    if (!text || !task) return;
    setMsg('');
    api.chat(task.id, text).catch((e) => toast(e.message, 'err'));
  };
  const awaiting = task?.status === 'awaiting-input';
  const lastOptionEvent = awaiting
    ? [...events].reverse().find((e) => e.type === 'chat-agent' && e.meta?.options?.length)
    : null;

  return (
    <div className="panel feed">
      <div className="feed-head">
        <div className="panel-title"><Icon name="chat" size={14} /> Live activity</div>
        {task && <div className="feed-task-name">{task.title}</div>}
      </div>
      <div className="feed-scroll" ref={ref}>
        {!task && <div className="empty">Select a task to watch {name} work.</div>}
        {task && events.length === 0 && <div className="empty">No activity yet. Hit <b>Run now</b> to put {name} to work.</div>}
        {events.map((ev) => (
          ev.type === 'chat-user' || ev.type === 'chat-agent'
            ? <ChatBubble key={ev.id} ev={ev} name={name} />
            : <FeedLine key={ev.id} ev={ev} />
        ))}
        {lastOptionEvent && (
          <div className="option-row">
            {lastOptionEvent.meta.options.map((opt) => (
              <button key={opt} className="option-btn" onClick={() => send(opt)}>{opt}</button>
            ))}
          </div>
        )}
      </div>

      {task?.lastResult && task.status === 'done' && (
        <div className="result-strip">
          <span className="result-label">Result</span>
          <span className="result-text"><Linkified text={task.lastResult} /></span>
        </div>
      )}

      {awaiting && <div className="awaiting-hint"><Icon name="chat" size={13} /> {name} has a question — tap an answer or type below.</div>}
      <div className="chat-bar">
        <input
          className="field" placeholder={awaiting ? 'Or type your own answer…' : task ? `Message ${name} about this task…` : 'Select a task to chat'}
          value={msg} disabled={!task}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="gel-btn gel-primary send" disabled={!task || !msg.trim()} onClick={() => send()}><Icon name="send" size={16} /></button>
      </div>
    </div>
  );
}

// Turn "/files/…" references in results into clickable artifact links.
// Keeps extensions intact (index.html) — only sentence punctuation is trimmed.
function Linkified({ text }) {
  const parts = String(text).split(/(\/files\/[^\s,)"']+)/g);
  return parts.map((p, i) => {
    if (!p.startsWith('/files/')) return <span key={i}>{p}</span>;
    const trailing = p.match(/[.·]+$/)?.[0] || '';
    const href = trailing ? p.slice(0, -trailing.length) : p;
    return (
      <React.Fragment key={i}>
        <button type="button" className="artifact-link" onClick={() => openReader(href)}><Icon name="file" size={12} /> {href.replace('/files/', '')}</button>
        {trailing}
      </React.Fragment>
    );
  });
}

function FeedLine({ ev }) {
  return (
    <div className={`feed-line ${ev.type}`}>
      <span className="feed-icon"><Icon name={eventIcon(ev.type)} size={14} /></span>
      <div className="feed-body">
        <div className="feed-text">{ev.text}</div>
        <div className="feed-time">{new Date(ev.ts).toLocaleTimeString()}</div>
      </div>
    </div>
  );
}
function ChatBubble({ ev, name }) {
  const mine = ev.type === 'chat-user';
  return (
    <div className={`bubble-row ${mine ? 'mine' : 'agent'}`}>
      <div className="bubble">
        <div className="bubble-who">{mine ? 'You' : name}</div>
        <div className="bubble-text">{ev.text}</div>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */
function ledClass(s) { return { running: 'cyan pulse', 'awaiting-input': 'amber pulse', done: 'green', failed: 'red', queued: 'amber', paused: 'amber', idle: 'dim' }[s] || 'dim'; }
function statusLabel(s) { return { idle: 'idle', queued: 'queued', running: 'running', 'awaiting-input': 'needs you', done: 'done', failed: 'failed', paused: 'stopped' }[s] || s; }
function rowSchedule(s) {
  if (!s || s.type === 'manual') return 'on demand';
  if (s.type === 'once') return `once · ${fmt(s.at)}`;
  if (s.type === 'interval') return s.intervalMinutes >= 60 ? `every ${s.intervalMinutes / 60}h` : `every ${s.intervalMinutes}m`;
  if (s.type === 'daily') return `daily ${s.time}`;
  return 'scheduled';
}
function eventIcon(t) { return { system: 'clock', thought: 'spark', plan: 'code', tool: 'bolt', review: 'eye', result: 'check', error: 'close' }[t] || 'spark'; }
