import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon, Mark } from '../icons.jsx';
import { toast } from '../toast.jsx';

// First-run setup wizard. Every new business names itself, can optionally wire
// up a tool or two, and — unless it's an Atlas Networks staff account — must
// turn on two-step verification before finishing.
export default function Welcome({ agent, user, onDone, onGo }) {
  const isStaff = user?.founder || /@atlasnetworks\.com$/i.test(user?.email || '');
  const [step, setStep] = useState(0);
  const [bizName, setBizName] = useState('');
  const [catalog, setCatalog] = useState(null);
  const [conns, setConns] = useState({});

  useEffect(() => { api.catalog().then(setCatalog).catch(() => {}); api.connectors().then(setConns).catch(() => {}); }, []);

  const steps = ['Business', 'Tools', isStaff ? null : 'Security'].filter(Boolean);

  const saveName = async () => {
    if (!bizName.trim()) return toast('Give your business a name to continue.', 'err');
    await api.setProfile({ name: bizName.trim() }).catch(() => {});
    setStep(1);
  };
  const finish = () => { api.updateMe({ welcomed: true }).catch(() => {}); onDone(); };

  return (
    <div className="wizard">
      <div className="wizard-card panel">
        <div className="wizard-head">
          <Mark size={30} />
          <div className="wizard-steps">
            {steps.map((s, i) => (
              <span key={s} className={`wstep ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`}>{i < step ? <Icon name="check" size={12} /> : i + 1} {s}</span>
            ))}
          </div>
        </div>

        {step === 0 && (
          <div className="wizard-body">
            <h1>Welcome to myAgent</h1>
            <p className="wizard-sub">Let's set up your AI front desk. First — what's your business called?</p>
            <input className="field wizard-input" autoFocus placeholder="e.g. Luna Beans Cafe" value={bizName}
              onChange={(e) => setBizName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveName()} />
            <div className="wizard-foot">
              <span />
              <button className="gel-btn gel-primary" onClick={saveName}>Continue <Icon name="arrow" size={15} /></button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-body">
            <h1>Connect your tools</h1>
            <p className="wizard-sub">Optional — link a service now so your agents can act on it. You can always do this later under Integrations.</p>
            <div className="wizard-conns">
              {catalog && Object.values(catalog.connectors).slice(0, 6).map((c) => (
                <div key={c.id} className={`wizard-conn ${conns[c.id]?.connected ? 'on' : ''}`}>
                  <Icon name={c.icon} size={16} />
                  <span>{c.name}</span>
                  {conns[c.id]?.connected && <Icon name="check" size={13} className="wc-check" />}
                </div>
              ))}
            </div>
            <button className="text-link" onClick={() => { api.updateMe({ welcomed: true }).catch(() => {}); onGo('integrations'); }}>Open Integrations to connect tools →</button>
            <div className="wizard-foot">
              <button className="gel-btn" onClick={() => setStep(0)}>Back</button>
              <button className="gel-btn gel-primary" onClick={() => setStep(isStaff ? 99 : 2)}>{isStaff ? 'Finish' : 'Continue'} <Icon name="arrow" size={15} /></button>
            </div>
            {isStaff && step === 1 && <StaffFinish finish={finish} />}
          </div>
        )}

        {step === 2 && !isStaff && <SecurityStep onBack={() => setStep(1)} onDone={finish} />}
        {step === 99 && isStaff && <StaffFinish finish={finish} auto />}
      </div>
    </div>
  );
}

function StaffFinish({ finish, auto }) {
  useEffect(() => { if (auto) finish(); }, [auto]); // company accounts skip security
  return null;
}

// Required TOTP setup for non-staff accounts.
function SecurityStep({ onBack, onDone }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.setup2sv().then(setSetup).catch((e) => toast(e.message, 'err')); }, []);

  const enable = async () => {
    setBusy(true);
    try { await api.enable2sv(code); toast('Two-step verification is on.', 'ok'); onDone(); }
    catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div className="wizard-body">
      <h1>Secure your account</h1>
      <p className="wizard-sub">Two-step verification is required. Scan the secret with any authenticator app, then enter the 6-digit code.</p>
      <div className="secret-box mono">{setup?.secret || '…'}</div>
      <input className="field code-field wizard-input" inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} />
      <div className="wizard-foot">
        <button className="gel-btn" onClick={onBack}>Back</button>
        <button className="gel-btn gel-primary" disabled={busy || code.length < 6} onClick={enable}>Finish setup <Icon name="check" size={15} /></button>
      </div>
    </div>
  );
}
