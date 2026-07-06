import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { toast } from '../toast.jsx';

// The Command Deck — where a business runs its AI agents. Build an agent, give
// it capabilities, watch it handle customers. Files/website builder are gone;
// this is a front-desk automation console.

export default function Dashboard({ agent: meta, user, gotoView }) {
  const [data, setData] = useState({ agents: [], limit: 1, used: 0 });
  const [catalog, setCatalog] = useState(null);
  const [conns, setConns] = useState({});
  const [caps, setCaps] = useState([]); // capabilities this plan entitles
  const [selId, setSelId] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    api.agents().then((d) => { setData(d); setSelId((id) => id || d.agents[0]?.id || null); }).catch(() => {});
    api.connectors().then(setConns).catch(() => {});
  };
  useEffect(() => {
    load();
    api.catalog().then(setCatalog).catch(() => {});
    api.billing().then((b) => setCaps(b.capabilities || [])).catch(() => {});
  }, []);

  const selected = data.agents.find((a) => a.id === selId) || null;
  const atLimit = data.used >= data.limit;

  return (
    <div className="agents-deck">
      <aside className="panel agents-side">
        <div className="panel-title"><Icon name="brain" size={14} /> Your agents <span className="count-chip">{data.used}/{data.limit}</span></div>
        <div className="agents-list">
          {data.agents.length === 0 && <div className="empty">No agents yet. Build your first one — it'll run your front desk.</div>}
          {data.agents.map((a) => (
            <button key={a.id} className={`agent-row ${selId === a.id ? 'active' : ''}`} onClick={() => setSelId(a.id)}>
              <span className={`agent-dot ${a.status === 'active' ? 'on' : ''}`} />
              <span className="agent-row-main">
                <span className="agent-row-name">{a.name}</span>
                <span className="agent-row-sub">{a.capabilities.length} skills · {a.stats?.handled || 0} handled</span>
              </span>
            </button>
          ))}
        </div>
        <button className="gel-btn gel-primary new-agent-btn" onClick={() => atLimit ? gotoView?.('billing') : setCreating(true)}>
          <Icon name="spark" size={15} /> {atLimit ? 'Upgrade for more agents' : 'Build an agent'}
        </button>
      </aside>

      {creating && catalog && (
        <CreateAgent catalog={catalog} caps={caps} onClose={() => setCreating(false)}
          onCreated={(a) => { setCreating(false); load(); setSelId(a.id); toast(`${a.name} is live.`, 'ok'); }} />
      )}

      {!selected ? (
        <div className="agent-empty">
          <Icon name="brain" size={44} />
          <h2>Build your first agent</h2>
          <p>Connect your tools, pick what it should handle, and ATLAS runs your front desk 24/7.</p>
          <button className="gel-btn gel-primary" onClick={() => setCreating(true)}><Icon name="spark" size={15} /> Build an agent</button>
        </div>
      ) : (
        <AgentDetail key={selected.id} agent={selected} catalog={catalog} conns={conns}
          onChange={load} gotoView={gotoView} />
      )}
    </div>
  );
}

/* ---------------- create agent wizard ---------------- */
function CreateAgent({ catalog, caps, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [languages, setLanguages] = useState('English');
  const [picked, setPicked] = useState(new Set(['webchat', 'faq']));
  const [busy, setBusy] = useState(false);
  const capList = Object.values(catalog.capabilities);

  const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const create = async () => {
    if (!name.trim()) return toast('Give your agent a name.', 'err');
    setBusy(true);
    try {
      const a = await api.createAgent({ name, role, languages, capabilities: [...picked].filter((c) => caps.includes(c)) });
      onCreated(a);
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Build an agent</h2><button className="mini-btn ghost" onClick={onClose}><Icon name="close" size={15} /></button></div>
        <div className="modal-body">
          <label className="auth-label">Name<input className="field" autoFocus placeholder="Front Desk" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="auth-label">What should it do &amp; know?<textarea className="field textarea" rows={3} placeholder="Warm, professional host for our cafe. Knows our menu and hours." value={role} onChange={(e) => setRole(e.target.value)} /></label>
          <label className="auth-label">Languages<input className="field" placeholder="English, Spanish" value={languages} onChange={(e) => setLanguages(e.target.value)} /></label>
          <div className="cap-pick-label">Capabilities</div>
          <div className="cap-pick">
            {capList.map((c) => {
              const locked = !caps.includes(c.id);
              return (
                <button key={c.id} type="button" className={`cap-chip ${picked.has(c.id) ? 'on' : ''} ${locked ? 'locked' : ''}`}
                  disabled={locked} onClick={() => toggle(c.id)}>
                  <Icon name={locked ? 'lock' : c.icon} size={14} /> {c.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="modal-foot">
          <button className="gel-btn" onClick={onClose}>Cancel</button>
          <button className="gel-btn gel-primary" disabled={busy} onClick={create}><Icon name="spark" size={14} /> Create agent</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- agent detail ---------------- */
function AgentDetail({ agent, catalog, conns, onChange, gotoView }) {
  const [tab, setTab] = useState('test'); // test | setup
  const toggleStatus = () => api.updateAgent(agent.id, { status: agent.status === 'active' ? 'paused' : 'active' }).then(onChange).catch(() => {});
  const remove = () => { if (confirm(`Delete agent "${agent.name}"?`)) api.deleteAgent(agent.id).then(onChange).then(() => toast('Agent deleted.')).catch(() => {}); };

  // Which connectors this agent's capabilities need, and whether they're wired.
  const needed = useMemo(() => {
    const set = new Set();
    for (const c of agent.capabilities) for (const n of (catalog?.capabilities[c]?.needs || [])) set.add(n);
    return [...set];
  }, [agent, catalog]);

  return (
    <section className="agent-work">
      <header className="panel agent-head">
        <div className="agent-head-id">
          <span className={`agent-orb-mini ${agent.status === 'active' ? 'on' : ''}`}><Icon name="brain" size={18} /></span>
          <div>
            <div className="agent-title">{agent.name}</div>
            <div className="agent-sub">{agent.status === 'active' ? 'Live · handling customers' : 'Paused'} · {agent.languages}</div>
          </div>
        </div>
        <div className="agent-head-actions">
          <button className={`gel-btn ${agent.status === 'active' ? '' : 'gel-primary'}`} onClick={toggleStatus}>
            {agent.status === 'active' ? <><Icon name="stop" size={13} /> Pause</> : <><Icon name="play" size={13} /> Go live</>}
          </button>
          <button className="mini-btn ghost" onClick={remove} title="Delete"><Icon name="close" size={14} /></button>
        </div>
      </header>

      <div className="agent-stats-row">
        <div className="astat"><b>{agent.stats?.handled || 0}</b><span>Handled</span></div>
        <div className="astat"><b>{agent.stats?.bookings || 0}</b><span>Bookings</span></div>
        <div className="astat"><b>{agent.capabilities.length}</b><span>Capabilities</span></div>
        <div className="astat"><b>{needed.filter((n) => conns[n]?.connected).length}/{needed.length}</b><span>Tools wired</span></div>
      </div>

      <div className="wtabs agent-tabs">
        <button className={`wtab ${tab === 'test' ? 'on' : ''}`} onClick={() => setTab('test')}><Icon name="chat" size={14} /> Test &amp; chat</button>
        <button className={`wtab ${tab === 'setup' ? 'on' : ''}`} onClick={() => setTab('setup')}><Icon name="gear" size={14} /> Capabilities &amp; tools</button>
      </div>

      {tab === 'test'
        ? <TestChat agent={agent} />
        : <Setup agent={agent} catalog={catalog} conns={conns} needed={needed} gotoView={gotoView} />}
    </section>
  );
}

function TestChat({ agent }) {
  const [msgs, setMsgs] = useState([{ who: 'agent', text: agent.greeting }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setText(''); setBusy(true);
    setMsgs((m) => [...m, { who: 'customer', text: t }]);
    try {
      const { reply } = await api.messageAgent(agent.id, t, 'You (test)');
      setMsgs((m) => [...m, { who: 'agent', text: reply.text, intent: reply.intent }]);
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div className="panel agent-chat">
      <div className="panel-title"><Icon name="chat" size={14} /> Talk to your agent as a customer would</div>
      <div className="feed-scroll agent-chat-scroll" ref={ref}>
        {msgs.map((m, i) => (
          <div key={i} className={`bubble-row ${m.who === 'customer' ? 'mine' : 'agent'}`}>
            <div className="bubble">
              <div className="bubble-who">{m.who === 'customer' ? 'Customer' : agent.name}{m.intent && m.intent !== 'general' ? ` · ${m.intent}` : ''}</div>
              <div className="bubble-text">{m.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="chat-bar">
        <input className="field" placeholder="Type as a customer — “do you deliver? can I book for Friday?”" value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="gel-btn gel-primary send" disabled={busy || !text.trim()} onClick={send}><Icon name="send" size={16} /></button>
      </div>
    </div>
  );
}

function Setup({ agent, catalog, conns, needed, gotoView }) {
  const capList = Object.values(catalog?.capabilities || {});
  const active = new Set(agent.capabilities);
  return (
    <div className="agent-setup">
      <div className="panel">
        <div className="panel-title"><Icon name="bolt" size={14} /> Capabilities</div>
        <div className="cap-view">
          {capList.filter((c) => active.has(c.id)).map((c) => (
            <span key={c.id} className="cap-tag on"><Icon name={c.icon} size={13} /> {c.name}</span>
          ))}
          {capList.filter((c) => !active.has(c.id)).map((c) => (
            <span key={c.id} className="cap-tag"><Icon name={c.icon} size={13} /> {c.name}</span>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="panel-title"><Icon name="plug" size={14} /> Tools this agent needs</div>
        {needed.length === 0 && <div className="empty">This agent runs without external tools. Connect email or Twilio to unlock more.</div>}
        {needed.map((n) => (
          <div key={n} className="need-row">
            <Icon name={catalog?.connectors[n]?.icon || 'plug'} size={15} />
            <span className="need-name">{catalog?.connectors[n]?.name || n}</span>
            {conns[n]?.connected
              ? <span className="need-badge on"><Icon name="check" size={12} /> Connected</span>
              : <button className="need-badge off" onClick={() => gotoView?.('integrations')}>Connect →</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
