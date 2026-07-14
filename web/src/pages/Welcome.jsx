import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon, Mark } from '../icons.jsx';
import { toast } from '../toast.jsx';
import { grasp } from '../understanding.js';
import HoursPicker, { composeHours, defaultGroups } from '../HoursPicker.jsx';
import { formatPhone } from '../format.js';
import ServiceOptions, { fullServiceOptions } from '../ServiceOptions.jsx';

// First-run setup wizard. Name + kind of business → the basics Atlas answers
// with on day one (hours, phone) → plan → optional tools → required 2SV for
// EVERY account — then a little launch ceremony while Atlas studies up.
export default function Welcome({ agent, user, onDone, onGo }) {
  const [step, setStep] = useState(0);
  const [bizName, setBizName] = useState('');
  const [bizType, setBizType] = useState('');
  const [hourGroups, setHourGroups] = useState(defaultGroups());
  const [manualHours, setManualHours] = useState(false);
  const [hours, setHours] = useState('');
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState((user?.name || '').split(' ')[0] || '');
  const [lastName, setLastName] = useState((user?.name || '').split(' ').slice(1).join(' ') || '');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [serviceOpts, setServiceOpts] = useState({});
  const [planId, setPlanId] = useState('free');
  const [plans, setPlans] = useState([]);
  const [archetypes, setArchetypes] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [conns, setConns] = useState({});

  useEffect(() => {
    api.catalog().then(setCatalog).catch(() => {});
    api.connectors().then(setConns).catch(() => {});
    api.archetypes().then(setArchetypes).catch(() => {});
    api.billing().then((b) => setPlans(b.plans || [])).catch(() => {});
  }, []);

  const steps = ['Business', 'Basics', 'Plan', 'Tools', 'Security'];
  const finish = () => { api.updateMe({ welcomed: true }).catch(() => {}); onDone(); };

  const saveName = async () => {
    if (!bizName.trim()) return toast('Give your business a name to continue.', 'err');
    await api.setProfile({ name: bizName.trim(), type: bizType }).catch(() => {});
    setStep(1);
  };
  const saveBasics = async () => {
    const hoursStr = manualHours ? hours.trim() : composeHours(hourGroups);
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (fullName && fullName !== user?.name) api.updateMe({ name: fullName }).catch(() => {});
    await api.setProfile({
      hours: hoursStr,
      phone: formatPhone(phone),
      address: address.trim(),
      website: website.trim(),
      serviceOptions: fullServiceOptions(pickedArch?.services, serviceOpts),
    }).catch(() => {});
    setStep(2);
  };
  const savePlan = async () => {
    if (planId && planId !== 'free') {
      try {
        const { demo, url } = await api.checkout(planId);
        if (demo) toast(`You're on ${plans.find((p) => p.id === planId)?.name || planId} — demo billing.`, 'ok');
        else if (url) window.open(url, '_blank');
      } catch (e) { toast(e.message, 'err'); }
    }
    setStep(3);
  };
  const pickedArch = archetypes.find((a) => a.id === bizType);

  return (
    <div className="wizard">
      <div className="wizard-card panel">
        <div className="wizard-head">
          <Mark size={30} spin={step === 5} />
          <div className="wizard-steps">
            {steps.map((s, i) => (
              <span key={s} className={`wstep ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`}>{i < step ? <Icon name="check" size={12} /> : i + 1} {s}</span>
            ))}
          </div>
        </div>

        {step === 0 && (
          <div className="wizard-body">
            <h1>Welcome to myAgent</h1>
            <p className="wizard-sub">Let's get your business onto the Atlas Network. First — what's it called?</p>
            <input className="field wizard-input" autoFocus placeholder="e.g. Luna Beans Cafe" value={bizName}
              onChange={(e) => setBizName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveName()} />
            <div className="cap-pick-label">What kind of business is it? <span className="dim-note-inline">(or skip — Atlas will work it out)</span></div>
            <div className="type-grid">
              {archetypes.map((a) => (
                <button key={a.id} type="button" className={`type-card ${bizType === a.id ? 'on' : ''}`}
                  onClick={() => setBizType(bizType === a.id ? '' : a.id)}>
                  <Icon name={a.icon} size={15} /> <span>{a.name}</span>
                </button>
              ))}
            </div>
            {pickedArch && <p className="type-note"><Icon name="brain" size={13} /> {grasp(pickedArch)}</p>}
            <div className="wizard-foot">
              <span />
              <button className="gel-btn gel-primary" onClick={saveName}>Continue <Icon name="arrow" size={15} /></button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-body">
            <h1>The basics</h1>
            <p className="wizard-sub">What customers ask first. Your agent answers with these from day one — everything's editable later under Business.</p>
            <div className="biz-grid">
              <label className="auth-label">Your first name
                <input className="field" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Hunter" />
              </label>
              <label className="auth-label">Last name
                <input className="field" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Stamps" />
              </label>
            </div>
            <div className="cap-pick-label">Opening hours <span className="dim-note-inline">(tap the days, drag the handles)</span></div>
            {manualHours ? (
              <>
                <input className="field" placeholder="e.g. Mon–Sat 7am–6pm, Sun 8am–2pm" value={hours} onChange={(e) => setHours(e.target.value)} />
                <button className="text-link hp-add" onClick={() => setManualHours(false)}>Use the picker instead</button>
              </>
            ) : (
              <>
                <HoursPicker groups={hourGroups} setGroups={setHourGroups} />
                <p className="hp-preview">{composeHours(hourGroups) || 'Pick at least one day'} · <button className="text-link" onClick={() => { setHours(composeHours(hourGroups)); setManualHours(true); }}>type manually instead</button></p>
              </>
            )}
            <div className="biz-grid">
              <label className="auth-label">Business phone
                <input className="field" placeholder="+1 (555) 555-0100" value={phone}
                  onChange={(e) => setPhone(e.target.value)} onBlur={(e) => setPhone(formatPhone(e.target.value))} />
              </label>
              <label className="auth-label">Website
                <input className="field" placeholder="https://yourbusiness.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>
            <label className="auth-label">Business address
              <input className="field" placeholder="12 Bean Street, Portland, OR" value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>
            {pickedArch?.services?.length > 0 && (
              <>
                <div className="cap-pick-label">How you operate <span className="dim-note-inline">(so Atlas answers walk-ins, delivery, and the rest correctly)</span></div>
                <ServiceOptions services={pickedArch.services} value={serviceOpts} onChange={setServiceOpts} />
              </>
            )}
            <div className="wizard-foot">
              <button className="gel-btn" onClick={() => setStep(0)}>Back</button>
              <button className="gel-btn gel-primary" onClick={saveBasics}>Continue <Icon name="arrow" size={15} /></button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-body">
            <h1>Pick a plan</h1>
            <p className="wizard-sub">Priced by how many agents you run. Start free — upgrade whenever. Every plan can be changed later under Plans.</p>
            <div className="wplan-grid">
              {plans.map((p) => (
                <button key={p.id} type="button" className={`wplan ${planId === p.id ? 'on' : ''}`} onClick={() => setPlanId(p.id)}>
                  <span className="wplan-name">{p.name}</span>
                  <span className="wplan-price">{p.price === 0 ? 'Free' : `$${p.price}/mo`}</span>
                  <span className="wplan-agents"><Icon name="user" size={12} /> {p.agents} agent{p.agents !== 1 ? 's' : ''}</span>
                  <span className="wplan-blurb">{p.blurb}</span>
                </button>
              ))}
            </div>
            <div className="wizard-foot">
              <button className="gel-btn" onClick={() => setStep(1)}>Back</button>
              <button className="gel-btn gel-primary" onClick={savePlan}>Continue <Icon name="arrow" size={15} /></button>
            </div>
          </div>
        )}

        {step === 3 && (
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
            <p className="dim-note">You'll find all of these under Integrations after setup — nothing here is required today.</p>
            <div className="wizard-foot">
              <button className="gel-btn" onClick={() => setStep(2)}>Back</button>
              <button className="gel-btn gel-primary" onClick={() => setStep(4)}>Continue <Icon name="arrow" size={15} /></button>
            </div>
          </div>
        )}

        {step === 4 && <SecurityStep onBack={() => setStep(3)} onDone={() => setStep(5)} />}
        {step === 5 && <Finale bizName={bizName} onContinue={finish} />}
      </div>
    </div>
  );
}

// Required 2SV setup — every account, staff included. Email codes are the
// default (a 6-digit code lands in your inbox); an authenticator app is the
// fallback for accounts that prefer it or when the mail channel is down.
function SecurityStep({ onBack, onDone }) {
  const [mode, setMode] = useState('email'); // email | totp
  const [hint, setHint] = useState('');
  const [sendErr, setSendErr] = useState('');
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const sendCode = () => {
    setSendErr('');
    api.start2svMethod('email')
      .then((r) => setHint(r.hint || 'your email'))
      .catch((e) => { setSendErr(e.message); setMode('totp'); });
  };
  useEffect(() => { sendCode(); }, []);
  useEffect(() => { if (mode === 'totp' && !setup) api.setup2sv().then(setSetup).catch((e) => toast(e.message, 'err')); }, [mode]);

  const confirm = async () => {
    setBusy(true);
    try {
      if (mode === 'email') { await api.confirm2svMethod(code); }
      else { await api.enable2sv(code); }
      toast('Two-step verification is on.', 'ok');
      onDone();
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div className="wizard-body">
      <h1>Secure your account</h1>
      {mode === 'email' ? (
        <>
          <p className="wizard-sub">
            Two-step verification is required for every account. We just emailed a 6-digit code
            to <b>{hint || 'your email'}</b> — enter it below. You won't be asked again on this
            device for 30 days.
          </p>
          <input className="field code-field wizard-input" autoFocus inputMode="numeric" maxLength={6} placeholder="000000" value={code}
            onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && confirm()} />
          <div className="sec-links">
            <button className="text-link" onClick={sendCode}>Resend code</button>
            <button className="text-link" onClick={() => setMode('totp')}>Use an authenticator app instead</button>
          </div>
        </>
      ) : (
        <>
          <p className="wizard-sub">
            {sendErr ? `Email codes aren't available right now (${sendErr}) — ` : ''}
            Scan the secret with any authenticator app, then enter the 6-digit code.
          </p>
          <div className="secret-box mono">{setup?.secret || '…'}</div>
          <input className="field code-field wizard-input" inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} />
          {!sendErr && <div className="sec-links"><button className="text-link" onClick={() => { setMode('email'); setCode(''); sendCode(); }}>Email me a code instead</button></div>}
        </>
      )}
      <div className="wizard-foot">
        <button className="gel-btn" onClick={onBack}>Back</button>
        <button className="gel-btn gel-primary" disabled={busy || code.length < 6} onClick={confirm}>Turn on 2SV <Icon name="check" size={15} /></button>
      </div>
    </div>
  );
}

// The launch ceremony: ~15s of real setup narrated over a progress bar while
// the globe spins, then the globe sweeps to center and grows, then
// "Welcome to myAgent" fades in with a Continue button.
function Finale({ bizName, onContinue }) {
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState('Waking your agent…');
  const [stage, setStage] = useState('loading'); // loading → globe → welcome

  useEffect(() => {
    // genuinely do the homework while the bar runs: absorb the site if linked
    api.studySite().catch(() => {});
    const lines = [
      [0, 'Waking your agent…'],
      [10, `Studying ${bizName || 'your business'}…`],
      [26, 'Working out what kind of business you run…'],
      [44, 'Seeding your knowledge base…'],
      [62, 'Preparing your agents…'],
      [80, 'Connecting to the Atlas Network…'],
      [93, 'Final checks…'],
    ];
    const t0 = Date.now();
    const DUR = 15000;
    const iv = setInterval(() => {
      const p = Math.min(100, ((Date.now() - t0) / DUR) * 100);
      setPct(p);
      for (let i = lines.length - 1; i >= 0; i--) if (p >= lines[i][0]) { setMsg(lines[i][1]); break; }
      if (p >= 100) {
        clearInterval(iv);
        setStage('globe');
        setTimeout(() => setStage('welcome'), 1700);
      }
    }, 120);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className={`finale ${stage}`}>
      <div className="finale-globe"><Mark size={72} spin /></div>
      {stage === 'loading' && (
        <div className="finale-loading">
          <div className="finale-msg">{msg}</div>
          <div className="finale-bar"><span style={{ width: `${pct}%` }} /></div>
        </div>
      )}
      {stage === 'welcome' && (
        <div className="finale-welcome">
          <h1>Welcome to myAgent</h1>
          <button className="gel-btn gel-primary big" onClick={onContinue}>Continue <Icon name="arrow" size={16} /></button>
        </div>
      )}
    </div>
  );
}
