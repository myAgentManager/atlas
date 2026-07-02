import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import Globe from '../Globe.jsx';

// The ATLAS page: the engine's face. Live internals on the left, an open
// conversation on the right.
export default function Atlas({ agent, user, chat, setChat, tasks }) {
  const engine = agent?.engine || {};
  const running = tasks.some((t) => t.status === 'running');

  return (
    <div className="atlas-grid">
      <section className="col">
        <div className="panel atlas-id">
          <Globe size={150} busy={running} />
          <div className="orb-plate">{agent?.name || 'ATLAS'}</div>
          <p className="atlas-tag">
            A from-scratch AI engine with a worldwide reach: it browses the live web,
            plans, and builds — yet its mind is original code, no external AI behind it.
          </p>
        </div>

        <div className="panel">
          <div className="panel-title"><Icon name="cpu" size={14} /> Engine internals</div>
          <div className="internals">
            <Internal label="Engine" value={`${engine.engine || 'ATLAS Core'} v${engine.version || '1.0'}`} />
            <Internal label="Skills" value={engine.skills ?? '—'} />
            <Internal label="Intents" value={engine.intents ?? '—'} />
            <Internal label="Vocabulary" value={engine.vocab ?? '—'} />
            <Internal label="Memories" value={engine.memories ?? 0} />
            <Internal label="External AI" value="none" accent />
          </div>
          <p className="internals-note">{engine.kind}</p>
        </div>

        <div className="panel">
          <div className="panel-title"><Icon name="bolt" size={14} /> What it does best</div>
          <ul className="skill-list">
            <li><Icon name="globe" size={15} /> Build one-page websites with original art &amp; palettes</li>
            <li><Icon name="eye" size={15} /> Research the live web into cited reports</li>
            <li><Icon name="file" size={15} /> Draft structured documents</li>
            <li><Icon name="spark" size={15} /> Summarize &amp; organize your workspace</li>
          </ul>
        </div>
      </section>

      <section className="col">
        <ChatPanel user={user} chat={chat} setChat={setChat} name={agent?.name || 'ATLAS'} />
      </section>
    </div>
  );
}

function Internal({ label, value, accent }) {
  return (
    <div className="internal">
      <span className={`internal-val ${accent ? 'accent' : ''}`}>{value}</span>
      <span className="internal-label">{label}</span>
    </div>
  );
}

function ChatPanel({ user, chat, setChat, name }) {
  const ref = useRef(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [chat.length]);

  async function send() {
    const text = msg.trim();
    if (!text || busy) return;
    setMsg('');
    setBusy(true);
    // optimistic echo; SSE will reconcile by id
    setChat((prev) => [...prev, { id: 'tmp-' + Date.now(), who: 'user', text, ts: Date.now() }]);
    try { await api.atlasChat(text); } catch (e) { setChat((prev) => [...prev, { id: 'err-' + Date.now(), who: 'atlas', text: `(${e.message})`, ts: Date.now() }]); }
    setBusy(false);
  }

  return (
    <div className="panel feed">
      <div className="feed-head"><div className="panel-title"><Icon name="chat" size={14} /> Talk with {name}</div></div>
      <div className="feed-scroll" ref={ref}>
        {chat.length === 0 && (
          <div className="empty">
            Say hello, ask what {name} can do, or ask how your tasks are going.<br />
            For task work, assign it on the Command Deck — this is the open line.
          </div>
        )}
        {chat.map((m) => (
          <div key={m.id} className={`bubble-row ${m.who === 'user' ? 'mine' : 'agent'}`}>
            <div className="bubble">
              <div className="bubble-who">{m.who === 'user' ? (user?.name?.split(' ')[0] || 'You') : name}</div>
              <div className="bubble-text">{m.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="chat-bar">
        <input className="field" placeholder={`Message ${name}…`} value={msg}
          onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="gel-btn gel-primary send" disabled={!msg.trim() || busy} onClick={send}><Icon name="send" size={16} /></button>
      </div>
    </div>
  );
}
