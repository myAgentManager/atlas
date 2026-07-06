import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { toast } from '../toast.jsx';

// The integration tools deck. A business plugs in its own services (IMAP, SMTP,
// Twilio, calendar, CRM). Agents draw on whatever is connected here.
export default function Integrations() {
  const [catalog, setCatalog] = useState(null);
  const [state, setState] = useState({});
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);

  const load = () => { api.connectors().then(setState).catch(() => {}); };
  useEffect(() => { api.catalog().then(setCatalog).catch(() => {}); load(); }, []);

  const open = (id) => {
    setOpenId(id === openId ? null : id);
    setDraft({ ...(state[id]?.values || {}) });
  };
  const save = async (id) => {
    setBusy(true);
    try {
      const { connected } = await api.saveConnector(id, draft);
      toast(connected ? 'Connected.' : 'Saved.', connected ? 'ok' : 'info');
      setOpenId(null);
      load();
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };
  const disconnect = async (id) => {
    await api.clearConnector(id).catch(() => {});
    load();
    toast('Disconnected.');
  };

  if (!catalog) return <div className="integrations"><div className="empty">Loading tools…</div></div>;
  const list = Object.values(catalog.connectors);
  const connectedCount = Object.values(state).filter((s) => s.connected).length;

  return (
    <div className="integrations">
      <div className="page-head">
        <div>
          <h1>Integration tools</h1>
          <p>Plug in your own services once. Your agents use whatever's connected — to send email, text customers, answer calls, and book appointments.</p>
        </div>
        <div className="head-badge"><span className="led green" /> {connectedCount} connected</div>
      </div>

      <div className="conn-grid">
        {list.map((c) => {
          const st = state[c.id] || { connected: false, values: {} };
          const expanded = openId === c.id;
          return (
            <div key={c.id} className={`conn-card ${st.connected ? 'connected' : ''} ${expanded ? 'open' : ''}`}>
              <div className="conn-top" onClick={() => open(c.id)}>
                <div className="conn-icon"><Icon name={c.icon} size={20} /></div>
                <div className="conn-main">
                  <div className="conn-name">{c.name}</div>
                  <div className="conn-blurb">{c.blurb}</div>
                </div>
                <div className={`conn-status ${st.connected ? 'on' : ''}`}>
                  {st.connected ? <><Icon name="check" size={13} /> Connected</> : 'Set up'}
                </div>
              </div>
              {expanded && (
                <div className="conn-form">
                  {c.fields.map((f) => (
                    <label key={f.key} className="auth-label">{f.label}
                      <input className="field" type={f.secret ? 'password' : 'text'} placeholder={f.placeholder || ''}
                        value={draft[f.key] || ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                    </label>
                  ))}
                  <div className="conn-actions">
                    {st.connected && <button className="text-link danger" onClick={() => disconnect(c.id)}>Disconnect</button>}
                    <button className="gel-btn" onClick={() => setOpenId(null)}>Cancel</button>
                    <button className="gel-btn gel-primary" disabled={busy} onClick={() => save(c.id)}>Save connection</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
