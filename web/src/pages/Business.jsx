import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { toast } from '../toast.jsx';
import { grasp } from '../understanding.js';
import HoursPicker, { composeHours, defaultGroups } from '../HoursPicker.jsx';
import { formatPhone } from '../format.js';
import ServiceOptions, { fullServiceOptions } from '../ServiceOptions.jsx';
import LanguagePicker from '../LanguagePicker.jsx';

// Agent sharing: who's on this business. Owner (transferable) manages seats;
// free plan allows two people, any paid plan is unlimited.
function TeamPanel() {
  const [t, setT] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [invite, setInvite] = useState('');
  const load = () => api.team().then(setT).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!t) return null;
  const iAmOwner = t.myRole === 'owner';
  const full = t.seats != null && t.used >= t.seats;

  const doInvite = () => api.inviteTeam(invite.trim()).then((r) => {
    setInvite('');
    navigator.clipboard?.writeText(r.code).catch(() => {});
    toast(`Invite code ${r.code} copied — share it with your teammate.`, 'ok');
    load();
  }).catch((e) => toast(e.message, 'err'));
  const doJoin = () => api.joinTeam(joinCode.trim()).then(() => { setJoinCode(''); toast('You joined the business.', 'ok'); location.reload(); }).catch((e) => toast(e.message, 'err'));
  const remove = (id, you) => { if (!you && !confirm('Remove this person from the business?')) return; api.removeTeamMember(id).then(() => { if (you) location.reload(); else load(); }).catch((e) => toast(e.message, 'err')); };
  const transfer = (id, name) => { if (!confirm(`Transfer ownership to ${name}? You'll become an admin.`)) return; api.transferOwner(id).then(() => { toast('Ownership transferred.', 'ok'); load(); }).catch((e) => toast(e.message, 'err')); };

  return (
    <div className="panel biz-panel">
      <div className="panel-title"><Icon name="user" size={14} /> Team &amp; agent sharing
        <span className="count-chip">{t.used}{t.seats != null ? ` / ${t.seats}` : ''} {t.seats == null ? 'unlimited' : 'seats'}</span>
      </div>
      <p className="dim-note">Everyone here shares the same agents, knowledge, and inbox. The owner can hand ownership to anyone on the team.</p>
      <div className="team-list">
        {t.members.map((m) => (
          <div key={m.id} className="team-row">
            <div className="team-who">
              <span className="team-name">{m.name}{m.you && <span className="team-you"> · you</span>}</span>
              <span className="team-email">{m.email}</span>
            </div>
            <span className={`team-role ${m.role}`}>{m.role}</span>
            <div className="team-actions">
              {iAmOwner && m.role !== 'owner' && <button className="text-link" onClick={() => transfer(m.id, m.name)}>Make owner</button>}
              {(iAmOwner && m.role !== 'owner') && <button className="mini-btn ghost" title="Remove" onClick={() => remove(m.id, false)}><Icon name="close" size={12} /></button>}
              {m.you && m.role !== 'owner' && <button className="text-link danger" onClick={() => remove(m.id, true)}>Leave</button>}
            </div>
          </div>
        ))}
      </div>
      {iAmOwner && (
        <div className="team-invite">
          {full
            ? <p className="dim-note">You're at your {t.seats}-seat limit. <b>Upgrade to any paid plan for unlimited team members.</b></p>
            : <div className="team-invite-row">
                <input className="field" placeholder="Teammate's email (optional)" value={invite} onChange={(e) => setInvite(e.target.value)} />
                <button className="gel-btn gel-primary" onClick={doInvite}>Create invite code</button>
              </div>}
        </div>
      )}
      <div className="team-join">
        <span className="dim-note">Got an invite code?</span>
        <input className="field code-field-sm" placeholder="8-digit code" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
        <button className="gel-btn" disabled={!joinCode.trim()} onClick={doJoin}>Join a business</button>
      </div>
    </div>
  );
}

// What the agents learn: the business profile, contact details, human routing,
// and the FAQ. A clean form panel, like the integrations deck.
export default function Business() {
  const [p, setP] = useState(null);
  const [faqs, setFaqs] = useState([]);
  const [archetypes, setArchetypes] = useState([]);
  const [savingP, setSavingP] = useState(false);
  const [savingF, setSavingF] = useState(false);
  const [pickHours, setPickHours] = useState(false);
  const [hourGroups, setHourGroups] = useState(defaultGroups());

  useEffect(() => {
    api.business().then((b) => { setP(b.profile); setFaqs(b.faqs.length ? b.faqs : [{ q: '', a: '' }]); }).catch(() => {});
    api.archetypes().then(setArchetypes).catch(() => {});
  }, []);
  const effectiveArch = archetypes.find((a) => a.id === (p?.type || p?.typeDetected));

  const field = (k) => ({ value: p?.[k] || '', onChange: (e) => setP({ ...p, [k]: e.target.value }) });

  // One-click "typical setup" for this kind of business: fills whatever's
  // still empty (never overwrites what the owner already wrote) and adds the
  // pack's FAQ suggestions. The old-fashioned way — typing it all — still works.
  const loadPack = () => {
    const pack = effectiveArch?.pack;
    if (!pack) return;
    setP({ ...p, services: p.services || pack.services, about: p.about || pack.about });
    const have = new Set(faqs.map((f) => f.q.trim().toLowerCase()).filter(Boolean));
    const add = (pack.faqs || []).filter((f) => !have.has(f.q.toLowerCase()));
    if (add.length) setFaqs([...faqs.filter((f) => f.q.trim() || f.a.trim()), ...add]);
    toast(`Loaded the ${effectiveArch.name.toLowerCase()} starter pack — tweak anything, then save.`, 'ok');
  };
  const saveProfile = () => { setSavingP(true); api.setProfile(p).then((np) => { setP(np); toast('Business details saved.', 'ok'); }).catch((e) => toast(e.message, 'err')).finally(() => setSavingP(false)); };
  const saveFaqs = () => { setSavingF(true); api.setFaqs(faqs.filter((f) => f.q.trim())).then(() => toast('FAQ saved.', 'ok')).catch((e) => toast(e.message, 'err')).finally(() => setSavingF(false)); };
  const setFaq = (i, k, v) => setFaqs(faqs.map((f, j) => j === i ? { ...f, [k]: v } : f));

  if (!p) return <div className="business-page"><div className="empty">Loading…</div></div>;

  return (
    <div className="business-page">
      <div className="page-head">
        <div><h1>Your business</h1><p>Everything here teaches your agents how to represent you — your hours, how to reach you, and what to say.</p></div>
      </div>

      <TeamPanel />

      <div className="panel biz-panel">
        <div className="panel-title"><Icon name="brain" size={14} /> Profile</div>
        <div className="biz-grid">
          <label className="auth-label">Business name<input className="field" {...field('name')} placeholder="Luna Beans Cafe" /></label>
          <label className="auth-label">Tagline<input className="field" {...field('tagline')} placeholder="Specialty coffee, done right" /></label>
        </div>
        <label className="auth-label">Business type — how Atlas reads customer intent
          <select className="select" value={p.type || ''} onChange={(e) => setP({ ...p, type: e.target.value })}>
            <option value="">
              {p.typeDetected ? `Auto — Atlas detected: ${archetypes.find((a) => a.id === p.typeDetected)?.name || p.typeDetected}` : 'Auto — let Atlas detect it'}
            </option>
            {archetypes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        {effectiveArch && (
          <p className="type-note">
            <Icon name="brain" size={13} />
            <span>
              {grasp(effectiveArch)}
              {effectiveArch.pack?.services && (
                <> <button className="text-link pack-link" onClick={loadPack}>Load a typical {effectiveArch.name.toLowerCase()} setup →</button></>
              )}
            </span>
          </p>
        )}
        {effectiveArch?.services?.length > 0 && (
          <>
            <div className="cap-pick-label">How you operate <span className="dim-note-inline">(Atlas answers these from what you set here)</span></div>
            <ServiceOptions services={effectiveArch.services}
              value={p.serviceOptions || {}}
              onChange={(v) => setP({ ...p, serviceOptions: fullServiceOptions(effectiveArch.services, v) })} />
          </>
        )}
        <label className="auth-label">About — what should agents know?<textarea className="field textarea" rows={3} {...field('about')} placeholder="A cozy neighborhood cafe specializing in single-origin espresso and fresh pastries. We also cater events." /></label>
        <div className="biz-grid">
          <label className="auth-label">Hours
            <input className="field" {...field('hours')} placeholder="Mon–Sat 7am–6pm, Sun 8am–2pm" />
            <button type="button" className="text-link hp-add" onClick={() => setPickHours(!pickHours)}>{pickHours ? 'Hide the picker' : 'Build them visually instead'}</button>
          </label>
          <label className="auth-label">Services / products<input className="field" {...field('services')} placeholder="espresso, pastries, catering" /></label>
        </div>
        {pickHours && (
          <div className="hp-inline">
            <HoursPicker groups={hourGroups} setGroups={setHourGroups} />
            <div className="set-actions">
              <span className="hp-preview">{composeHours(hourGroups) || 'Pick at least one day'}</span>
              <button type="button" className="gel-btn" onClick={() => { setP({ ...p, hours: composeHours(hourGroups) }); setPickHours(false); }}>Use these hours</button>
            </div>
          </div>
        )}
        <div className="biz-grid">
          <label className="auth-label">Languages
            <LanguagePicker value={p.languages} onChange={(v) => setP({ ...p, languages: v })} />
          </label>
          <label className="auth-label">Tone
            <select className="select" value={p.tone || 'friendly'} onChange={(e) => setP({ ...p, tone: e.target.value })}>
              <option value="friendly">Friendly</option><option value="warm">Warm</option><option value="formal">Formal</option>
            </select>
          </label>
        </div>
        <div className="set-actions"><button className="gel-btn gel-primary" disabled={savingP} onClick={saveProfile}>Save details</button></div>
      </div>

      <div className="panel biz-panel">
        <div className="panel-title"><Icon name="plug" size={14} /> Contact &amp; routing</div>
        <p className="dim-note">Agents share these with customers, and hand off to a real person when things get sensitive.</p>
        <div className="biz-grid">
          <label className="auth-label">Phone<input className="field" {...field('phone')} onBlur={(e) => setP({ ...p, phone: formatPhone(e.target.value) })} placeholder="+1 (555) 555-0100" /></label>
          <label className="auth-label">Public email<input className="field" {...field('email')} placeholder="hello@business.com" /></label>
        </div>
        <div className="biz-grid">
          <label className="auth-label">Website<input className="field" {...field('website')} placeholder="yourbusiness.com" /></label>
          <label className="auth-label">Address<input className="field" {...field('address')} placeholder="12 Bean Street, Portland" /></label>
        </div>
        <div className="biz-grid">
          <label className="auth-label">Route to a human (email)<input className="field" {...field('routeTo')} placeholder="owner@business.com" /></label>
          <label className="auth-label">Escalate on keywords<input className="field" {...field('escalateOn')} placeholder="lawyer, urgent, refund" /></label>
        </div>
        <div className="set-actions"><button className="gel-btn gel-primary" disabled={savingP} onClick={saveProfile}>Save contact &amp; routing</button></div>
      </div>

      <div className="panel biz-panel">
        <div className="panel-title"><Icon name="chat" size={14} /> FAQ — answers your agents give</div>
        <div className="faq-list">
          {faqs.map((f, i) => (
            <div key={i} className="faq-row">
              <input className="field faq-q" placeholder="Question (e.g. Do you have parking?)" value={f.q} onChange={(e) => setFaq(i, 'q', e.target.value)} />
              <input className="field faq-a" placeholder="Answer" value={f.a} onChange={(e) => setFaq(i, 'a', e.target.value)} />
              <button className="mini-btn ghost" onClick={() => setFaqs(faqs.filter((_, j) => j !== i))}><Icon name="close" size={13} /></button>
            </div>
          ))}
        </div>
        <div className="set-actions">
          <button className="gel-btn" onClick={() => setFaqs([...faqs, { q: '', a: '' }])}><Icon name="spark" size={13} /> Add question</button>
          <button className="gel-btn gel-primary" disabled={savingF} onClick={saveFaqs}>Save FAQ</button>
        </div>
      </div>
    </div>
  );
}
