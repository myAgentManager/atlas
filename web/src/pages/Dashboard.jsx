import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { toast } from '../toast.jsx';

const STARTERS = [
  ['Website', 'Build me a one-page website for '],
  ['Research', 'Research on the web and write a cited report about '],
  ['Document', 'Draft a structured document about '],
  ['Story', 'Write a story about '],
  ['Digest', 'Summarize everything in my workspace.'],
];

const STATUS_RANK = { running: 0, 'awaiting-input': 1, queued: 2, failed: 3, done: 4, paused: 5, idle: 6 };

export default function Dashboard({ agent, user, tasks, reload }) {
  const name = agent?.name || 'ATLAS';
  const [leftMode, setLeftMode] = useState('projects'); // 'projects' | 'new'
  const [filter, setFilter] = useState(null); // active project filter (null = all)
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [project, setProject] = useState('');
  const [schedule, setSchedule] = useState({ schedule: { type: 'manual' } });
  const [notify, setNotify] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => {
    if (selectedId) return tasks.find((t) => t.id === selectedId) || null;
    return tasks.find((t) => t.status === 'running') || [...tasks].sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
  }, [tasks, selectedId]);

  const projects = useMemo(() => [...new Set(tasks.map((t) => t.project).filter(Boolean))].sort(), [tasks]);

  // One tidy summary per project for the sidebar.
  const projectCards = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      const key = t.project || '__none';
      const c = map.get(key) || { key, name: t.project || 'Unfiled', count: 0, running: 0, done: 0, updatedAt: 0 };
      c.count++;
      if (t.status === 'running' || t.status === 'awaiting-input') c.running++;
      if (t.status === 'done') c.done++;
      c.updatedAt = Math.max(c.updatedAt, t.updatedAt || 0);
      map.set(key, c);
    }
    return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [tasks]);

  const visible = useMemo(() => {
    const list = filter ? tasks.filter((t) => (t.project || '__none') === filter) : tasks;
    return [...list].sort((a, b) =>
      (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || b.updatedAt - a.updatedAt);
  }, [tasks, filter]);

  async function assign(runNow) {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    try {
      const task = await api.create({ title, prompt, project: project || (filter && filter !== '__none' ? projectCards.find((p) => p.key === filter)?.name : ''), schedule: schedule.schedule, notify, runNow });
      setTitle(''); setPrompt('');
      setSelectedId(task.id);
      setLeftMode('projects');
      toast(runNow ? `${name} is on it.` : 'Task queued.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  }

  const filterName = filter === '__none' ? 'Unfiled' : filter;

  return (
    <div className="deck-grid">
      <section className="col col-left">
        {/* toggle: project sidebar vs. new-task composer */}
        <div className="left-switch">
          <button className={`lswitch ${leftMode === 'projects' ? 'on' : ''}`} onClick={() => setLeftMode('projects')}>
            <Icon name="file" size={14} /> Projects
          </button>
          <button className={`lswitch ${leftMode === 'new' ? 'on' : ''}`} onClick={() => { setLeftMode('new'); setProject(filterName && filter !== '__none' ? filterName : ''); }}>
            <Icon name="spark" size={14} /> New task
          </button>
        </div>

        {leftMode === 'new' ? (
          <div className="panel composer">
            <div className="chip-row">
              {STARTERS.map(([label, starter]) => (
                <button key={label} type="button" className="starter-chip" onClick={() => setPrompt(starter)}>{label}</button>
              ))}
            </div>
            <textarea
              className="field textarea"
              placeholder={`Tell ${name} what to do… e.g. "Build me a one-page site for my band by tomorrow morning." ATLAS titles it for you.`}
              value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} autoFocus
            />
            <input className="field" placeholder="Custom title (optional — ATLAS writes one otherwise)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="field project-field" list="project-list" placeholder="Project (groups tasks & files)"
              value={project} onChange={(e) => setProject(e.target.value)} />
            <datalist id="project-list">{projects.map((p) => <option key={p} value={p} />)}</datalist>
            <SchedulePicker onChange={setSchedule} />
            <label className="notify-row">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              <Icon name={notify ? 'bell' : 'bellOff'} size={15} />
              <span>Notify me when it's done {agent && !agent.channels && !agent.sms && <em>(SMS Not Available)</em>}</span>
            </label>
            <div className="composer-actions">
              <button className="gel-btn" disabled={busy || !prompt.trim()} onClick={() => assign(false)}>Queue it</button>
              <button className="gel-btn gel-primary" disabled={busy || !prompt.trim()} onClick={() => assign(true)}>Assign &amp; Run</button>
            </div>
          </div>
        ) : (
          <div className="panel projects-panel">
            <div className="panel-title"><Icon name="file" size={14} /> Projects <span className="count-chip">{projectCards.length}</span></div>
            <div className="proj-scroll">
              <button className={`proj-row all ${!filter ? 'active' : ''}`} onClick={() => setFilter(null)}>
                <span className="proj-name">All tasks</span>
                <span className="proj-count">{tasks.length}</span>
              </button>
              {projectCards.length === 0 && <div className="empty">No projects yet. Start a task and give it a project name.</div>}
              {projectCards.map((p) => (
                <button key={p.key} className={`proj-row ${filter === p.key ? 'active' : ''}`} onClick={() => setFilter(p.key)}>
                  <span className="proj-glyph">{p.name[0].toUpperCase()}</span>
                  <span className="proj-main">
                    <span className="proj-name">{p.name}</span>
                    <span className="proj-sub">{p.count} task{p.count !== 1 ? 's' : ''}{p.done ? ` · ${p.done} done` : ''}</span>
                  </span>
                  {p.running > 0 && <span className="led cyan pulse" />}
                </button>
              ))}
            </div>
            <button className="gel-btn gel-primary new-task-btn" onClick={() => { setLeftMode('new'); setProject(filterName && filter !== '__none' ? filterName : ''); }}>
              <Icon name="spark" size={15} /> New task
            </button>
          </div>
        )}

        <div className="panel tasklist">
          <div className="panel-title">
            <Icon name="bolt" size={14} /> {filter ? filterName : 'All tasks'} <span className="count-chip">{visible.length}</span>
            {filter && <button className="clear-filter" onClick={() => setFilter(null)}>clear</button>}
          </div>
          <div className="task-scroll">
            {visible.length === 0 && <div className="empty">No tasks here yet. Give {name} something to do.</div>}
            {visible.map((t) => (
              <TaskRow key={t.id} task={t} active={selected?.id === t.id} showProject={!filter}
                onSelect={() => setSelectedId(t.id)} reload={reload} />
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
function TaskRow({ task, active, onSelect, reload, showProject }) {
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
          {showProject && task.project && <span className="proj-chip">{task.project}</span>}
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

/* ---------- live feed + chat ---------- */
function Feed({ task, name }) {
  const ref = useRef(null);
  const [msg, setMsg] = useState('');
  const events = task?.events || [];

  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [events.length, task?.id]);

  const send = () => {
    const text = msg.trim();
    if (!text || !task) return;
    setMsg('');
    api.chat(task.id, text).catch((e) => toast(e.message, 'err'));
  };
  const awaiting = task?.status === 'awaiting-input';

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
      </div>

      {task?.lastResult && task.status === 'done' && (
        <div className="result-strip">
          <span className="result-label">Result</span>
          <span className="result-text"><Linkified text={task.lastResult} /></span>
        </div>
      )}

      {awaiting && <div className="awaiting-hint"><Icon name="chat" size={13} /> {name} has a question — answer below to begin.</div>}
      <div className="chat-bar">
        <input
          className="field" placeholder={awaiting ? 'Answer ATLAS…' : task ? `Message ${name} about this task…` : 'Select a task to chat'}
          value={msg} disabled={!task}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="gel-btn gel-primary send" disabled={!task || !msg.trim()} onClick={send}><Icon name="send" size={16} /></button>
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
    const trailing = p.match(/[.·]+$/)?.[0] || '';       // "…index.html." → keep .html, drop the period
    const href = trailing ? p.slice(0, -trailing.length) : p;
    return (
      <React.Fragment key={i}>
        <a className="artifact-link" href={href} target="_blank" rel="noreferrer"><Icon name="file" size={12} /> {href.replace('/files/', '')}</a>
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
