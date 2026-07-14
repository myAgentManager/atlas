import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon, Mark } from '../icons.jsx';
import { toast } from '../toast.jsx';
import LanguagePicker from '../LanguagePicker.jsx';

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
              <span className={`led ${a.status === 'active' ? 'green pulse' : 'dim'}`} title={a.status === 'active' ? 'online' : 'offline'} />
              <span className="agent-row-main">
                <span className="agent-row-name">{a.name}</span>
                <span className="agent-row-sub">{a.status === 'active' ? 'Online' : 'Offline'} · {a.capabilities.length} skills · {a.stats?.handled || 0} handled</span>
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

/* ---------------- building-agent ceremony ---------------- */
function BuildingAgent({ name }) {
  const stages = ['Waking up your agent…', 'Teaching it your business…', 'Wiring up its skills…', 'Bringing it online…'];
  const [i, setI] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setI((x) => Math.min(x + 1, stages.length - 1)), 640);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="build-agent">
      <div className="build-globe"><Mark size={64} spin /></div>
      <div className="build-name">Building {name || 'your agent'}</div>
      <div className="build-stage thinking-label">{stages[i]}</div>
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
  const [building, setBuilding] = useState(false);
  const [arch, setArch] = useState(null); // what kind of business Atlas knows this is
  const capList = Object.values(catalog.capabilities);

  // Preselect the capabilities that fit this KIND of business — Atlas already
  // knows a café doesn't take bookings but a salon lives on appointments.
  useEffect(() => {
    Promise.all([api.business(), api.archetypes()]).then(([b, list]) => {
      const t = b.profile?.type || b.profile?.typeDetected;
      const a = list.find((x) => x.id === t);
      if (a) { setPicked(new Set(a.caps)); setArch(a); }
    }).catch(() => {});
  }, []);

  const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const create = async () => {
    if (!name.trim()) return toast('Give your agent a name.', 'err');
    setBusy(true); setBuilding(true);
    try {
      // let the build ceremony breathe while the agent is actually created
      const [a] = await Promise.all([
        api.createAgent({ name, role, languages, capabilities: [...picked].filter((c) => caps.includes(c)) }),
        new Promise((r) => setTimeout(r, 2600)),
      ]);
      onCreated(a);
    } catch (e) { toast(e.message, 'err'); setBuilding(false); }
    finally { setBusy(false); }
  };

  if (building) {
    return (
      <div className="modal-backdrop">
        <div className="modal panel build-modal" onClick={(e) => e.stopPropagation()}>
          <BuildingAgent name={name} />
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Build an agent</h2><button className="mini-btn ghost" onClick={onClose}><Icon name="close" size={15} /></button></div>
        <div className="modal-body">
          <label className="auth-label">Name<input className="field" autoFocus placeholder="Front Desk" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="auth-label">What should it do &amp; know?<textarea className="field textarea" rows={3} placeholder="Warm, professional host for our cafe. Knows our menu and hours." value={role} onChange={(e) => setRole(e.target.value)} /></label>
          <div className="cap-pick-label">Languages it speaks</div>
          <LanguagePicker value={languages} onChange={setLanguages} />
          <div className="cap-pick-label">Capabilities</div>
          {arch && <p className="type-note"><Icon name="brain" size={12} /> Preset for a {arch.name.toLowerCase()} — {arch.bookable ? `bookings on (${arch.bookNoun}s)` : 'walk-in, so no booking pitch'}. Tweak as you like.</p>}
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
        <button className={`wtab ${tab === 'convos' ? 'on' : ''}`} onClick={() => setTab('convos')}><Icon name="user" size={14} /> Conversations</button>
        <button className={`wtab ${tab === 'setup' ? 'on' : ''}`} onClick={() => setTab('setup')}><Icon name="gear" size={14} /> Capabilities &amp; tools</button>
      </div>

      {tab === 'test' && <TestChat agent={agent} />}
      {tab === 'convos' && <Conversations agent={agent} />}
      {tab === 'setup' && <Setup agent={agent} catalog={catalog} conns={conns} needed={needed} gotoView={gotoView} />}
    </section>
  );
}

function TestChat({ agent }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const convoRef = useRef(null); // keep the same conversation so it greets once
  const ref = useRef(null);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length, typing]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setText(''); setBusy(true);
    setMsgs((m) => [...m, { who: 'customer', text: t }]);
    try {
      const { reply, conversationId } = await api.messageAgent(agent.id, t, 'You (test)', convoRef.current);
      convoRef.current = conversationId;
      // Show a "thinking → typing" pause so it reads like a person, not instant.
      setTyping(true);
      await new Promise((r) => setTimeout(r, Math.min(3200, reply.thinkMs || 900)));
      setTyping(false);
      setMsgs((m) => [...m, { who: 'agent', text: reply.text, intent: reply.intent }]);
    } catch (e) { setTyping(false); toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div className="panel agent-chat">
      <div className="panel-title"><Icon name="chat" size={14} /> Talk to your agent as a customer would</div>
      <div className="feed-scroll agent-chat-scroll" ref={ref}>
        {msgs.length === 0 && <div className="empty">Say something a customer might — ask about hours, prices, or try to book. Your agent answers from what it knows.</div>}
        {msgs.map((m, i) => (
          <div key={i} className={`bubble-row ${m.who === 'customer' ? 'mine' : 'agent'}`}>
            <div className="bubble">
              <div className="bubble-who">{m.who === 'customer' ? 'Customer' : agent.name}{m.intent && m.intent !== 'general' ? ` · ${m.intent}` : ''}</div>
              <div className="bubble-text">{m.text}</div>
            </div>
          </div>
        ))}
        {typing && (
          <div className="bubble-row agent">
            <div className="bubble typing"><div className="bubble-who">{agent.name}</div><div className="thinking-globe"><Mark size={20} spin /><span className="thinking-label">thinking…</span></div></div>
          </div>
        )}
      </div>
      <div className="chat-bar">
        <input className="field" placeholder="Type as a customer — “do you deliver? can I book for Friday?”" value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} disabled={busy} />
        <button className="gel-btn gel-primary send" disabled={busy || !text.trim()} onClick={send}><Icon name="send" size={16} /></button>
      </div>
    </div>
  );
}

function Conversations({ agent }) {
  const [convos, setConvos] = useState([]);
  const [openId, setOpenId] = useState(null);
  useEffect(() => { api.agentConversations(agent.id).then((c) => setConvos(c.sort((a, b) => b.updatedAt - a.updatedAt))).catch(() => {}); }, [agent.id]);
  const open = convos.find((c) => c.id === openId);
  const fmt = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="convos-grid">
      <div className="panel convos-list">
        <div className="panel-title"><Icon name="user" size={14} /> Customer conversations <span className="count-chip">{convos.length}</span></div>
        <div className="task-scroll">
          {convos.length === 0 && <div className="empty">No customer conversations yet. When this agent handles email or chat, they land here.</div>}
          {convos.map((c) => (
            <button key={c.id} className={`convo-row ${openId === c.id ? 'active' : ''}`} onClick={() => setOpenId(c.id)}>
              <span className={`chan-badge ${c.channel}`}>{c.channel}</span>
              <span className="convo-main">
                <span className="convo-who">{c.customer}</span>
                <span className="convo-subject">{c.subject}</span>
              </span>
              <span className="convo-when">{fmt(c.updatedAt)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="panel feed convo-thread">
        {!open ? <div className="empty" style={{ flex: 1 }}>Select a conversation to read it.</div> : (
          <>
            <div className="feed-head"><div className="panel-title"><Icon name="chat" size={14} /> {open.customer}</div><div className="feed-task-name">{open.subject}</div></div>
            <div className="feed-scroll">
              {open.messages.map((m) => (
                m.from === 'system'
                  ? <div key={m.id} className="convo-system">{m.text}</div>
                  : <div key={m.id} className={`bubble-row ${m.from === 'customer' ? 'mine' : 'agent'}`}>
                      <div className="bubble"><div className="bubble-who">{m.from === 'customer' ? open.customer : agent.name}</div><div className="bubble-text">{m.text}</div></div>
                    </div>
              ))}
            </div>
          </>
        )}
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
