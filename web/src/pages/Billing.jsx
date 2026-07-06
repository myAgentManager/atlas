import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { toast } from '../toast.jsx';

const TOOL_LABELS = {
  web_chat: 'Live website chat', faq: 'FAQ answering', web_study: 'Learns from the web',
  site_builder: 'Website + agent builder', email_out: 'Send email', email_in: 'Receive & triage email',
  bookings: 'Appointments & bookings', reminders: 'Reminders & follow-ups', orders: 'Take orders',
  crm: 'Customer CRM & trends', sms: 'SMS / text', multilingual: 'Every language',
  after_hours: 'After-hours coverage', sales: 'Sales pitching', api: 'Developer API', analytics: 'Analytics & graphs',
};

export default function Billing({ user, setUser }) {
  const [state, setState] = useState(null);
  const load = () => { api.billing().then(setState).catch(() => {}); };
  useEffect(() => { load(); }, []);

  const subscribe = async (planId) => {
    try {
      const { url, demo } = await api.checkout(planId);
      if (demo) { toast('Subscribed (demo mode).', 'ok'); api.me().then(({ user }) => setUser(user)); load(); }
      else window.location.href = url; // real Stripe Checkout
    } catch (e) { toast(e.message, 'err'); }
  };
  const cancel = () => {
    if (!confirm('Cancel your subscription and return to Starter?')) return;
    api.cancelPlan().then(({ user }) => { setUser(user); load(); toast('Moved to Starter.'); }).catch((e) => toast(e.message, 'err'));
  };

  if (!state) return <div className="billing"><div className="empty">Loading plans…</div></div>;
  const current = state.plan;

  return (
    <div className="billing">
      <div className="billing-head">
        <h1>Plans &amp; billing</h1>
        <p>Pick how much of the front desk you want ATLAS to run. {state.live ? '' : 'Demo mode — switching plans is instant and free until Stripe keys are added.'}</p>
      </div>
      <div className="plan-grid">
        {state.plans.map((p) => (
          <div key={p.id} className={`plan-card ${current === p.id ? 'current' : ''} ${p.id === 'pro' ? 'featured' : ''}`}>
            {p.id === 'pro' && <div className="plan-flag">Most popular</div>}
            <div className="plan-name">{p.name}</div>
            <div className="plan-price">{p.price === 0 ? 'Free' : <>${p.price}<span>/mo</span></>}</div>
            <div className="plan-blurb">{p.blurb}</div>
            <ul className="plan-tools">
              {p.tools.slice(0, 8).map((t) => (
                <li key={t}><Icon name="check" size={13} /> {TOOL_LABELS[t] || t}</li>
              ))}
              {p.tools.length > 8 && <li className="more">+ {p.tools.length - 8} more</li>}
            </ul>
            {current === p.id ? (
              <button className="gel-btn plan-btn" disabled>Current plan</button>
            ) : (
              <button className="gel-btn gel-primary plan-btn" onClick={() => subscribe(p.id)}>
                {p.price === 0 ? 'Downgrade' : 'Choose ' + p.name}
              </button>
            )}
          </div>
        ))}
      </div>
      {current !== 'free' && (
        <div className="billing-foot">
          <span>You're on <b>{state.planName}</b> · {state.actionLimit.toLocaleString()} agent actions / month.</span>
          <button className="text-link" onClick={cancel}>Cancel subscription</button>
        </div>
      )}
    </div>
  );
}
