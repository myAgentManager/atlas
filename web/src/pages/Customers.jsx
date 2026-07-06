import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';

// The CRM — every customer an agent has talked to, their contact details, and
// their conversation history.
export default function Customers() {
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => { api.customers().then(setList).catch(() => {}); }, []);
  useEffect(() => { if (sel) api.customerDetail(sel).then(setDetail).catch(() => setDetail(null)); }, [sel]);

  const filtered = list.filter((c) => !q || `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(q.toLowerCase()));
  const fmt = (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <div className="customers-page">
      <aside className="panel cust-list-panel">
        <div className="panel-title"><Icon name="user" size={14} /> Customers <span className="count-chip">{list.length}</span></div>
        {list.length > 6 && <input className="field cust-search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />}
        <div className="cust-scroll">
          {list.length === 0 && <div className="empty">No customers yet. When your agents talk to people, they'll show up here with everything they asked.</div>}
          {filtered.map((c) => (
            <button key={c.id} className={`cust-row ${sel === c.id ? 'active' : ''}`} onClick={() => setSel(c.id)}>
              <span className="cust-avatar">{(c.name || '?')[0].toUpperCase()}</span>
              <span className="cust-main">
                <span className="cust-name">{c.name}</span>
                <span className="cust-sub">{c.email || c.phone || 'no contact on file'}</span>
              </span>
              <span className="cust-when">{fmt(c.lastSeen || c.createdAt)}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="cust-detail">
        {!detail ? (
          <div className="agent-empty"><Icon name="user" size={40} /><h2>Customer records</h2><p>Select someone to see their details and every conversation your agents have had with them.</p></div>
        ) : (
          <>
            <div className="panel cust-head">
              <span className="cust-avatar big">{(detail.name || '?')[0].toUpperCase()}</span>
              <div className="cust-head-main">
                <div className="cust-title">{detail.name}</div>
                <div className="cust-contact">
                  {detail.email && <span><Icon name="send" size={12} /> {detail.email}</span>}
                  {detail.phone && <span><Icon name="chat" size={12} /> {detail.phone}</span>}
                  <span><Icon name="clock" size={12} /> Last seen {fmt(detail.lastSeen || detail.createdAt)}</span>
                </div>
              </div>
            </div>
            <div className="panel cust-convos">
              <div className="panel-title"><Icon name="chat" size={14} /> Conversations <span className="count-chip">{detail.conversations.length}</span></div>
              {detail.conversations.length === 0 && <div className="empty">No conversations recorded yet.</div>}
              {detail.conversations.sort((a, b) => b.updatedAt - a.updatedAt).map((v) => (
                <div key={v.id} className="cust-convo">
                  <span className={`chan-badge ${v.channel}`}>{v.channel}</span>
                  <span className="cust-convo-subject">{v.subject}</span>
                  <span className="cust-convo-meta">{v.messages} msgs · {fmt(v.updatedAt)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
