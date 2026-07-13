import React, { useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';

// Per-account settings: profile, security (password + 2SV), notifications,
// platform integrations, developer API key, danger zone.
export default function Settings({ user, setUser, agent, onDeleted }) {
  return (
    <div className="settings">
      <Profile user={user} setUser={setUser} />
      <Personalization user={user} setUser={setUser} agent={agent} />
      <Security user={user} setUser={setUser} agent={agent} />
      <Notifications user={user} setUser={setUser} agent={agent} />
      <Integrations user={user} setUser={setUser} />
      <DevApi user={user} setUser={setUser} />
      <Danger onDeleted={onDeleted} />
    </div>
  );
}

const useFlash = () => {
  const [flash, setFlash] = useState('');
  return [flash, (msg) => { setFlash(msg); setTimeout(() => setFlash(''), 3200); }];
};

function Section({ icon, title, children }) {
  return (
    <div className="panel setting">
      <div className="panel-title"><Icon name={icon} size={14} /> {title}</div>
      {children}
    </div>
  );
}

/* ---------- profile ---------- */
function Profile({ user, setUser }) {
  const [name, setName] = useState(user.name);
  const [flash, show] = useFlash();
  const save = () => api.updateMe({ name }).then(({ user }) => { setUser(user); show('Saved.'); }).catch((e) => show(e.message));
  return (
    <Section icon="user" title="Profile">
      <div className="set-row">
        <label className="auth-label">Name<input className="field" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="auth-label">Email<input className="field" value={user.email} disabled /></label>
      </div>
      <div className="set-actions"><span className="flash">{flash}</span><button className="gel-btn" onClick={save}>Save profile</button></div>
    </Section>
  );
}

/* ---------- personalization: how ATLAS speaks to you ---------- */
function Personalization({ user, setUser, agent }) {
  const s = user.settings || {};
  const [callMe, setCallMe] = useState(s.callMe || '');
  const [tone, setTone] = useState(s.tone || 'auto');
  const [flash, show] = useFlash();
  const name = agent?.name || 'ATLAS';
  const save = () =>
    api.updateMe({ settings: { callMe, tone } })
      .then(({ user }) => { setUser(user); show('Saved.'); })
      .catch((e) => show(e.message));
  return (
    <Section icon="spark" title="Personalization">
      <p className="dim-note">{name} adapts to you — what it calls you, and the default voice it writes in.</p>
      <div className="set-row">
        <label className="auth-label">Call me
          <input className="field" placeholder={user.name?.split(' ')[0] || 'Boss'} value={callMe} onChange={(e) => setCallMe(e.target.value)} />
        </label>
        <label className="auth-label">{name}'s voice
          <select className="select" value={tone} onChange={(e) => setTone(e.target.value)}>
            <option value="auto">Auto — read the brief</option>
            <option value="bold">Bold — loud and confident</option>
            <option value="calm">Calm — minimal and refined</option>
            <option value="warm">Warm — friendly and genuine</option>
          </select>
        </label>
      </div>
      <div className="set-actions"><span className="flash">{flash}</span><button className="gel-btn" onClick={save}>Save personalization</button></div>
    </Section>
  );
}

/* ---------- security: password + 2SV method chooser ---------- */
function Security({ user, setUser, agent }) {
  const chan = agent?.channels?.twoStep || { totp: true, email: false, sms: false };
  const active = user.twoStepMethod || null;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [flash, show] = useFlash();
  const [setup, setSetup] = useState(null);       // TOTP: { secret, otpauth }
  const [enrolling, setEnrolling] = useState(null); // 'email' | 'sms' → code entry
  const [hint, setHint] = useState('');
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState(null);     // shown once after TOTP enable

  const changePw = () =>
    api.changePassword(current, next)
      .then(() => { setCurrent(''); setNext(''); show('Password changed.'); })
      .catch((e) => show(e.message));

  const pick = (method) => {
    setSetup(null); setEnrolling(null); setCode('');
    if (method === 'totp') {
      api.setup2sv().then(setSetup).catch((e) => show(e.message));
    } else {
      api.start2svMethod(method)
        .then(({ hint }) => { setEnrolling(method); setHint(hint); })
        .catch((e) => show(e.message));
    }
  };
  const enableTotp = () =>
    api.enable2sv(code)
      .then(({ backup }) => { setBackup(backup); setSetup(null); setCode(''); return api.me(); })
      .then(({ user }) => setUser(user))
      .catch((e) => show(e.message));
  const confirmMethod = () =>
    api.confirm2svMethod(code)
      .then(({ user }) => { setUser(user); setEnrolling(null); setCode(''); show('Sign-in codes are on.'); })
      .catch((e) => show(e.message));
  const turnOff = () => {
    const pw = prompt('Enter your password to turn two-step verification off:');
    if (pw === null) return;
    api.disable2sv({ password: pw })
      .then(({ user }) => { setUser(user); show('2SV turned off.'); })
      .catch((e) => show(e.message));
  };

  const METHODS = [
    ['totp', 'Authenticator app', 'Codes from any TOTP app. Works offline, with backup codes.', true],
    ['email', 'Email code', 'We email a 6-digit code each time you sign in.', chan.email],
    ['sms', 'Text message', 'We text a code to your number from Notifications.', chan.sms],
  ];

  return (
    <Section icon="lock" title="Security">
      <div className="set-row">
        <label className="auth-label">Current password<input className="field" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></label>
        <label className="auth-label">New password<input className="field" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></label>
      </div>
      <div className="set-actions"><span className="flash">{flash}</span><button className="gel-btn" onClick={changePw} disabled={!current || !next}>Change password</button></div>

      <div className="twosv">
        <div className="twosv-head">
          <Icon name="shield" size={16} />
          <div>
            <b>Two-step verification</b>
            <div className="twosv-sub">
              {active
                ? <>On via <b>{{ totp: 'authenticator app', email: 'email codes', sms: 'text messages' }[active]}</b>{active === 'totp' ? ` — ${user.backupCodesLeft} backup codes left` : ''}.</>
                : 'Pick a second lock for your account.'}
            </div>
          </div>
          {active && <button className="gel-btn" onClick={turnOff}>Turn off</button>}
        </div>

        <div className="method-grid">
          {METHODS.map(([id, title, desc, available]) => (
            <button key={id} type="button"
              className={`method-card ${active === id ? 'on' : ''} ${!available ? 'na' : ''}`}
              disabled={!available || active === id}
              onClick={() => pick(id)}>
              <span className="method-title">
                <Icon name={{ totp: 'key', email: 'send', sms: 'chat' }[id]} size={15} /> {title}
              </span>
              <span className="method-desc">{desc}</span>
              <span className={`method-badge ${active === id ? 'live' : !available ? 'off' : ''}`}>
                {active === id ? 'Active' : available ? 'Set up' : 'Not Available'}
              </span>
            </button>
          ))}
        </div>

        {setup && (
          <div className="twosv-setup">
            <p>1 · In your authenticator app (any TOTP app), add an account with this secret:</p>
            <div className="secret-box mono">{setup.secret}</div>
            <p className="dim-note">or paste this URI: <span className="mono tiny">{setup.otpauth}</span></p>
            <p>2 · Enter the 6-digit code it shows:</p>
            <div className="twosv-verify">
              <input className="field code-field" inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="gel-btn gel-primary" onClick={enableTotp} disabled={code.length < 6}>Verify &amp; enable</button>
            </div>
          </div>
        )}

        {enrolling && (
          <div className="twosv-setup">
            <p>We sent a 6-digit code to <b>{hint}</b> — enter it to switch on {enrolling === 'email' ? 'email' : 'text'} sign-in codes:</p>
            <div className="twosv-verify">
              <input className="field code-field" inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="gel-btn gel-primary" onClick={confirmMethod} disabled={code.length < 6}>Verify &amp; enable</button>
            </div>
          </div>
        )}

        {backup && (
          <div className="backup-box">
            <b><Icon name="key" size={14} /> Backup codes — save these now, they're shown once:</b>
            <div className="backup-grid mono">{backup.map((b) => <span key={b}>{b}</span>)}</div>
            <button className="gel-btn" onClick={() => { navigator.clipboard?.writeText(backup.join('\n')); }}>Copy all</button>
            <button className="gel-btn" onClick={() => setBackup(null)}>I saved them</button>
          </div>
        )}
      </div>
    </Section>
  );
}

/* ---------- notifications ---------- */
function Notifications({ user, setUser, agent }) {
  const s = user.settings || {};
  const [smsTo, setSmsTo] = useState(s.smsTo || '');
  const [notifySms, setNotifySms] = useState(Boolean(s.notifySms));
  const [flash, show] = useFlash();
  const save = () =>
    api.updateMe({ settings: { smsTo, notifySms } })
      .then(({ user }) => { setUser(user); show('Saved.'); })
      .catch((e) => show(e.message));
  return (
    <Section icon="bell" title="Notifications">
      {!agent?.sms && <p className="dim-note">Twilio isn't configured on this server yet — the owner adds credentials in <span className="mono tiny">.env</span>. You can still save your number.</p>}
      <div className="set-row">
        <label className="auth-label">Text me at<input className="field" placeholder="+1 555 555 0100" value={smsTo} onChange={(e) => setSmsTo(e.target.value)} /></label>
        <label className="notify-row set-check">
          <input type="checkbox" checked={notifySms} onChange={(e) => setNotifySms(e.target.checked)} />
          <Icon name={notifySms ? 'bell' : 'bellOff'} size={15} /> Text me when an agent needs a human
        </label>
      </div>
      <div className="set-actions"><span className="flash">{flash}</span><button className="gel-btn" onClick={save}>Save notifications</button></div>
    </Section>
  );
}

/* ---------- integrations ---------- */
function Integrations({ user, setUser }) {
  const ig = user.settings?.integrations || {};
  const [webhookUrl, setWebhook] = useState(ig.webhookUrl || '');
  const [slackUrl, setSlack] = useState(ig.slackUrl || '');
  const [discordUrl, setDiscord] = useState(ig.discordUrl || '');
  const [onFinish, setOnFinish] = useState(ig.onFinish !== false);
  const [onFail, setOnFail] = useState(ig.onFail !== false);
  const [flash, show] = useFlash();
  const save = () =>
    api.updateMe({ settings: { integrations: { webhookUrl, slackUrl, discordUrl, onFinish, onFail } } })
      .then(({ user }) => { setUser(user); show('Saved.'); })
      .catch((e) => show(e.message));
  return (
    <Section icon="plug" title="Platform integrations">
      <p className="dim-note">ATLAS posts business events — escalations, new bookings, hot leads — to any platform that accepts a webhook. Paste incoming-webhook URLs from Slack or Discord, or point the generic hook at your own service.</p>
      <label className="auth-label">Generic webhook (JSON POST)<input className="field mono tiny" placeholder="https://your-service/hook" value={webhookUrl} onChange={(e) => setWebhook(e.target.value)} /></label>
      <div className="set-row">
        <label className="auth-label">Slack webhook<input className="field mono tiny" placeholder="https://hooks.slack.com/services/…" value={slackUrl} onChange={(e) => setSlack(e.target.value)} /></label>
        <label className="auth-label">Discord webhook<input className="field mono tiny" placeholder="https://discord.com/api/webhooks/…" value={discordUrl} onChange={(e) => setDiscord(e.target.value)} /></label>
      </div>
      <div className="set-row checks">
        <label className="notify-row set-check"><input type="checkbox" checked={onFinish} onChange={(e) => setOnFinish(e.target.checked)} /> On finish</label>
        <label className="notify-row set-check"><input type="checkbox" checked={onFail} onChange={(e) => setOnFail(e.target.checked)} /> On failure</label>
      </div>
      <div className="set-actions"><span className="flash">{flash}</span><button className="gel-btn" onClick={save}>Save integrations</button></div>
    </Section>
  );
}

/* ---------- developer API ---------- */
function DevApi({ user, setUser }) {
  const [reveal, setReveal] = useState(false);
  const [flash, show] = useFlash();
  const rotate = () => {
    if (!confirm('Rotate your API key? The old one stops working immediately.')) return;
    api.rotateApiKey().then(() => api.me()).then(({ user }) => { setUser(user); show('New key issued.'); }).catch((e) => show(e.message));
  };
  const copy = () => { navigator.clipboard?.writeText(user.apiKey); show('Copied.'); };
  return (
    <Section icon="code" title="Developer API">
      <p className="dim-note">Drive ATLAS from anything that can speak HTTP — shortcuts, scripts, other platforms.</p>
      <div className="apikey-row">
        <div className="secret-box mono grow">{reveal ? user.apiKey : '••••••••••••••••••••••••••••••'}</div>
        <button className="mini-btn" title="Reveal" onClick={() => setReveal(!reveal)}><Icon name="eye" size={14} /></button>
        <button className="mini-btn" title="Copy" onClick={copy}><Icon name="copy" size={14} /></button>
        <button className="gel-btn" onClick={rotate}><Icon name="refresh" size={14} /> Rotate</button>
      </div>
      <pre className="api-demo mono tiny">{`curl -H "Authorization: Bearer <key>" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"Build me a site for my studio"}' \\
  http://<server>:8787/api/v1/tasks`}</pre>
      <span className="flash">{flash}</span>
    </Section>
  );
}

/* ---------- danger ---------- */
function Danger({ onDeleted }) {
  const [flash, show] = useFlash();
  const del = () => {
    const pw = prompt('This deletes your account, agents, customers, and knowledge. Enter your password to confirm:');
    if (!pw) return;
    api.deleteAccount(pw).then(onDeleted).catch((e) => show(e.message));
  };
  return (
    <Section icon="close" title="Danger zone">
      <div className="set-actions danger">
        <span className="flash">{flash}</span>
        <button className="gel-btn danger-btn" onClick={del}>Delete my account</button>
      </div>
    </Section>
  );
}
