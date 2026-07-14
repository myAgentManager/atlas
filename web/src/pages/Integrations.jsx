import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon, Mark } from '../icons.jsx';
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

  // Copy-paste phone-system setup, with this account's token baked in — shown
  // inside the PBX card once it's connected. No webhook archaeology required.
  function PbxSetup() {
    const [info, setInfo] = useState(null);
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState(null);
    useEffect(() => { api.voipSetup().then(setInfo).catch(() => {}); }, []);
    const copy = (t, label) => navigator.clipboard.writeText(t).then(() => toast(`${label} copied.`, 'ok'));
    const test = async () => {
      setTesting(true); setResult(null);
      try { setResult(await api.testPbx()); }
      catch (e) { setResult({ ok: false, detail: e.message }); }
      finally { setTesting(false); }
    };
    return (
      <div className="pbx-setup">
        <div className="pbx-row">
          <b>Connection test</b>
          <span>Register with your FreePBX/Asterisk to check the port-forwarding and credentials are right.</span>
          <div className="pbx-test-row">
            <button className="gel-btn" disabled={testing} onClick={test}>
              {testing ? <><Mark size={15} spin /> Registering…</> : <><Icon name="plug" size={14} /> Test SIP connection</>}
            </button>
            {result && <span className={`pbx-test-result ${result.ok ? 'ok' : 'err'}`}><Icon name={result.ok ? 'check' : 'close'} size={13} /> {result.detail}</span>}
          </div>
          <p className="dim-note">This proves myAgent can reach and authenticate to your PBX. Answering the live call audio still runs through the IVR bridge below (your PBX handles speech, myAgent handles the conversation).</p>
        </div>
        {!info ? null : <>
        <div className="pbx-setup-title"><Icon name="check" size={13} /> Point your phone system at the agent:</div>
        <div className="pbx-row">
          <b>Twilio</b>
          <span>Set your number's Voice webhook (HTTP POST) to:</span>
          <code className="pbx-code" onClick={() => copy(info.twilio, 'Twilio URL')}>{info.twilio}</code>
        </div>
        <div className="pbx-row">
          <b>Any PBX / IVR (FreePBX, 3CX, Asterisk…)</b>
          <span>Have your IVR POST each caller utterance and speak back the reply's <code>say</code> text:</span>
          <code className="pbx-code" onClick={() => copy(info.curl, 'Example request')}>{info.curl}</code>
        </div>
        <p className="dim-note">Click a snippet to copy it. First request of a call (no <code>text</code>) returns the pickup greeting; replies include <code>hangup</code> when the caller says goodbye.</p>
        </>}
      </div>
    );
  }

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
                <div className="conn-form" onClick={(e) => e.stopPropagation()}>
                  {c.fields.map((f) => (
                    <label key={f.key} className="auth-label">{f.label}
                      <input className="field" type={f.secret ? 'password' : 'text'} placeholder={f.placeholder || ''}
                        value={draft[f.key] || ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                    </label>
                  ))}
                  {c.id === 'pbx' && st.connected && <PbxSetup />}
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
