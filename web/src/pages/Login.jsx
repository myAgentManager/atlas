import React, { useState } from 'react';
import { api } from '../api.js';
import { Icon, Mark } from '../icons.jsx';

// Sign in / create account / two-step verification — one focused card.
// OAuth buttons appear when the admin has configured providers.
export default function Login({ agent, onDone, onHome }) {
  const providers = agent?.providers || {};
  const regOpen = agent?.registrationOpen !== false;
  const oauthFailed = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('signin') === 'failed';
  const [mode, setMode] = useState('signin'); // signin | signup | twostep
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(null);
  const [twoMethod, setTwoMethod] = useState('totp'); // totp | email | sms
  const [twoHint, setTwoHint] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const res = await api.register({ email, name, password });
        if (res.needVerify) { setPending(res.pending); setTwoHint(res.hint || ''); setMode('verifysignup'); }
        else onDone(res.user);
      } else if (mode === 'verifysignup') {
        const { user } = await api.verifySignup({ pending, code });
        onDone(user);
      } else if (mode === 'signin') {
        const res = await api.login({ email, password });
        if (res.need2sv) {
          setPending(res.pending);
          setTwoMethod(res.method || 'totp');
          setTwoHint(res.hint || '');
          setMode('twostep');
        } else onDone(res.user);
      } else {
        const { user } = await api.verify2sv({ pending, code });
        onDone(user);
      }
    } catch (ex) {
      setErr(ex.message);
      if (mode === 'twostep' && /expired/i.test(ex.message)) { setMode('signin'); setCode(''); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authwrap">
      <div className="home-grain" />
      <button className="brand-btn auth-brand" onClick={onHome}>
        <Mark size={26} />
        <span className="wordmark sm"><span className="wordmark-my">my</span><span className="wordmark-agent">Agent</span></span>
      </button>

      <form className="panel auth-card" onSubmit={submit}>
        {mode === 'verifysignup' ? (
          <>
            <div className="auth-icon"><Icon name="send" size={24} /></div>
            <h1 className="auth-h1">Verify your email</h1>
            <p className="auth-sub">We sent a 6-digit code to <b>{twoHint}</b>. Enter it to finish creating your account.</p>
            <input className="field code-field" autoFocus inputMode="numeric" maxLength={6}
              placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} />
          </>
        ) : mode === 'twostep' ? (
          <>
            <div className="auth-icon"><Icon name="shield" size={26} /></div>
            <h1 className="auth-h1">Two-step check</h1>
            <p className="auth-sub">
              {twoMethod === 'email' && <>We emailed a 6-digit code to <b>{twoHint}</b>. It expires in 5 minutes.</>}
              {twoMethod === 'sms' && <>We texted a 6-digit code to <b>{twoHint}</b>. It expires in 5 minutes.</>}
              {twoMethod === 'totp' && <>Enter the 6-digit code from your authenticator app — or one of your backup codes.</>}
            </p>
            <input
              className="field code-field" autoFocus inputMode="numeric" maxLength={10}
              placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)}
            />
          </>
        ) : (
          <>
            <div className="auth-icon"><Icon name={mode === 'signup' ? 'user' : 'lock'} size={26} /></div>
            <h1 className="auth-h1">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
            <p className="auth-sub">
              {mode === 'signup'
                ? 'Put an AI agent on your business in minutes.'
                : 'Sign in to check on your agents.'}
            </p>
            {mode === 'signup' && (
              <label className="auth-label">Name
                <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Hunter" />
              </label>
            )}
            <label className="auth-label">Email
              <input className="field" type="email" autoFocus={mode === 'signin'} value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@home.server" autoComplete="username" />
            </label>
            <label className="auth-label">Password
              <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </label>
          </>
        )}

        <div className="auth-err">{err || (oauthFailed ? 'That sign-in didn’t complete — try again.' : '')}</div>
        <button className="gel-btn gel-primary auth-go" disabled={busy || (mode === 'signup' && !regOpen)}>
          {mode === 'signup' ? 'Create account' : mode === 'twostep' || mode === 'verifysignup' ? 'Verify' : 'Sign in'}
          <Icon name="arrow" size={15} />
        </button>

        {mode !== 'twostep' && mode !== 'verifysignup' && (providers.google || providers.apple) && (
          <div className="oauth-block">
            <div className="oauth-divider"><span>or continue with</span></div>
            <div className="oauth-row">
              {providers.google && (
                <a className="gel-btn oauth-btn" href="/api/auth/oauth/google">
                  <GoogleGlyph /> Google
                </a>
              )}
              {providers.apple && (
                <a className="gel-btn oauth-btn" href="/api/auth/oauth/apple">
                  <AppleGlyph /> Apple
                </a>
              )}
            </div>
          </div>
        )}

        {mode !== 'twostep' && mode !== 'verifysignup' && (
          regOpen ? (
            <button type="button" className="text-link auth-switch"
              onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setErr(''); }}>
              {mode === 'signup' ? 'Have an account? Sign in' : 'New here? Create an account'}
            </button>
          ) : (
            <div className="auth-closed">Registration is closed on this server right now.</div>
          )
        )}
      </form>

      <div className="auth-foot">Protected by scrypt hashing &amp; optional two-step verification.</div>
    </div>
  );
}

// Provider glyphs, drawn by hand — simple geometric marks, not brand assets.
function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2.4" strokeDasharray="40 14" strokeLinecap="round" transform="rotate(40 12 12)" />
      <path d="M12 12h8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
function AppleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M15.5 3.5c-.9.1-2 .7-2.6 1.5-.6.7-1 1.7-.9 2.7 1 0 2-.6 2.7-1.4.6-.7 1-1.7.8-2.8ZM12 8.3c-1.1 0-2 .6-2.7.6-.7 0-1.7-.6-2.9-.6-2 0-4 1.8-4 5.1 0 3.4 2.7 7.1 4.3 7.1.8 0 1.6-.6 2.7-.6 1 0 1.7.6 2.7.6 1.7 0 3.4-2.9 4-4.8-2-.8-2.6-3.6-.6-4.9-.8-1.3-2.2-1.7-3.5-1.5Z" />
    </svg>
  );
}
