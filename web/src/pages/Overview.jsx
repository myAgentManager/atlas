import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';

// The Dashboard — the first thing a business owner sees. Tiles, a 7-day trend,
// which agents are pulling the most weight, and the latest conversations.
export default function Overview({ user, gotoView }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.overview().then(setD).catch(() => {}); }, []);
  if (!d) return <div className="overview-page"><div className="empty">Loading…</div></div>;

  const t = d.totals;
  const first = user?.name?.split(' ')[0] || 'there';
  const tiles = [
    ['Agents', t.agents, 'brain', 'deck'],
    ['Handled', t.handled, 'check'],
    ['Bookings', t.bookings, 'calendar'],
    ['Customers', t.customers, 'user', 'customers'],
    ['Open chats', t.open, 'chat'],
  ];
  const fmt = (ts) => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const maxT = Math.max(1, ...d.trend);
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const today = new Date().getDay();

  return (
    <div className="overview-page">
      <div className="page-head">
        <div><h1>{d.businessName ? d.businessName : `Welcome, ${first}`}</h1><p>Here's how your agents are doing.</p></div>
        <button className="gel-btn gel-primary" onClick={() => gotoView?.('deck')}><Icon name="brain" size={15} /> Manage agents</button>
      </div>

      <div className="ov-tiles five">
        {tiles.map(([label, val, icon, go]) => (
          <button key={label} className="ov-tile" onClick={() => go && gotoView?.(go)}>
            <span className="ov-tile-icon"><Icon name={icon} size={16} /></span>
            <span className="ov-num">{val}</span>
            <span className="ov-label">{label}</span>
          </button>
        ))}
      </div>

      <div className="ov-main">
        <div className="panel ov-chart-panel">
          <div className="panel-title"><Icon name="bolt" size={14} /> Conversations · last 7 days</div>
          <div className="bar-chart">
            {d.trend.map((v, i) => (
              <div key={i} className="bar-col">
                <div className="bar" style={{ height: `${(v / maxT) * 100}%` }}><span className="bar-val">{v || ''}</span></div>
                <span className={`bar-label ${i === (today) ? 'today' : ''}`}>{days[(today - 6 + i + 7) % 7]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel ov-top-panel">
          <div className="panel-title"><Icon name="brain" size={14} /> Hardest-working agents</div>
          {d.topAgents.length === 0 && <div className="empty">No agents yet. <button className="text-link" onClick={() => gotoView?.('deck')}>Build one →</button></div>}
          {d.topAgents.map((a, i) => (
            <button key={a.id} className="top-agent" onClick={() => gotoView?.('deck')}>
              <span className="rank">{i + 1}</span>
              <span className={`agent-dot ${a.status === 'active' ? 'on' : ''}`} />
              <span className="top-agent-main"><span className="top-agent-name">{a.name}</span><span className="top-agent-sub">{a.capabilities} skills</span></span>
              <span className="top-agent-stat"><b>{a.handled}</b> handled</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel ov-recent-panel">
        <div className="panel-title"><Icon name="user" size={14} /> Recent conversations</div>
        {d.recent.length === 0 && <div className="empty">No conversations yet — your agents will fill this in as customers reach out.</div>}
        {d.recent.map((c) => (
          <div key={c.id} className="recent-row">
            <span className={`chan-badge ${c.channel}`}>{c.channel}</span>
            <span className="recent-who">{c.customer}</span>
            <span className="recent-subject">{c.subject}</span>
            <span className="recent-agent">{c.agent}</span>
            <span className="recent-when">{fmt(c.updatedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
