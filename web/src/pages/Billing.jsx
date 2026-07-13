import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { toast } from '../toast.jsx';

const CAP_LABELS = {
  webchat: 'Live website chat', faq: 'Answer FAQs', bookings: 'Appointments & bookings',
  orders: 'Take orders & requests', crm: 'Capture leads & trends', sales: 'Pitch sales & product info',
  reminders: 'Reminders & follow-ups', email: 'Respond to emails', sms: 'Text (SMS)',
  multilingual: 'Every language', afterhours: 'After-hours coverage', alerts: 'Alert staff to issues',
  phone: 'Answer phone calls', api: 'Developer API', analytics: 'Analytics & graphs',
  voip: 'VoIP calls (PBX extension)',
};

export default function Billing({ user, setUser }) {
  const [state, setState] = useState(null);
  const load = () => { api.billing().then(setState).catch(() => {}); };
  useEffect(() => { load(); }, []);

  const subscribe = async (planId) => {
    try {
      const { url, demo } = await api.checkout(planId);
      if (demo) { toast('Subscribed (demo mode).', 'ok'); api.me().then(({ user }) => setUser(user)); load(); }
      else window.location.href = url;
    } catch (e) { toast(e.message, 'err'); }
  };
  const cancel = () => {
    if (!confirm('Cancel your subscription and return to the free trial?')) return;
    api.cancelPlan().then(({ user }) => { setUser(user); load(); toast('Moved to Trial.'); }).catch((e) => toast(e.message, 'err'));
  };

  if (!state) return <div className="billing"><div className="empty">Loading plans…</div></div>;
  const current = state.plan;
  const intro = state.intro || { percent: 60, months: 2 };

  return (
    <div className="billing">
      {state.founder && (
        <div className="founder-banner"><Icon name="shield" size={15} /> Atlas Networks staff — everything's unlocked and comped. Pick any plan below to preview what customers see.</div>
      )}
      <div className="billing-head">
        <h1>Plans &amp; billing</h1>
        <p>Priced by how many AI agents you run. <b className="intro-line">{intro.percent}% off your first {intro.months} months</b> on any plan.{state.live ? '' : ' Demo mode — switching plans is instant and free until Stripe keys are added.'}</p>
      </div>
      <div className="plan-grid four">
        {state.plans.map((p) => {
          const intro2 = p.price ? Math.round(p.price * (1 - intro.percent / 100)) : 0;
          return (
            <div key={p.id} className={`plan-card ${current === p.id ? 'current' : ''} ${p.id === 'pro' ? 'featured' : ''}`}>
              {p.id === 'pro' && <div className="plan-flag">Most popular</div>}
              <div className="plan-name">{p.name}</div>
              <div className="plan-price">{p.price === 0 ? 'Free' : <>${p.price}<span>/mo</span></>}</div>
              {p.price > 0 && <div className="plan-intro">${intro2}/mo for {intro.months} months</div>}
              <div className="plan-agents"><Icon name="user" size={14} /> {p.agents} agent{p.agents !== 1 ? 's' : ''}</div>
              <div className="plan-blurb">{p.blurb}</div>
              {/* every feature, spelled out — businesses see exactly what they're buying */}
              <ul className="plan-tools">
                {(p.capabilities || []).map((t) => (<li key={t}><Icon name="check" size={13} /> {CAP_LABELS[t] || t}</li>))}
              </ul>
              {current === p.id
                ? <button className="gel-btn plan-btn" disabled>Current plan</button>
                : <button className="gel-btn gel-primary plan-btn" onClick={() => subscribe(p.id)}>{p.price === 0 ? 'Downgrade' : 'Choose ' + p.name}</button>}
            </div>
          );
        })}
      </div>
      {current !== 'free' && (
        <div className="billing-foot">
          <span>You're on <b>{state.planName}</b> · up to {state.agents} agents.</span>
          <button className="text-link" onClick={cancel}>Cancel subscription</button>
        </div>
      )}
    </div>
  );
}
