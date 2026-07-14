import React from 'react';

// The yes/no service questions for a business type — how it actually operates
// (walk-ins, delivery, takeout…) and where customers go for each. This is what
// lets Atlas answer "do you take walk-ins?" from fact instead of guessing.
export default function ServiceOptions({ services, value, onChange }) {
  if (!services?.length) return null;
  const set = (key, patch) => onChange({ ...value, [key]: { enabled: false, detail: '', ...(value[key] || {}), ...patch } });
  return (
    <div className="svc-opts">
      {services.map((s) => {
        const opt = value[s.key] || {};
        const on = opt.enabled === true;
        return (
          <div key={s.key} className={`svc-opt ${on ? 'on' : ''}`}>
            <label className="svc-toggle">
              <input type="checkbox" checked={on} onChange={(e) => set(s.key, { enabled: e.target.checked })} />
              <span className="svc-check" aria-hidden />
              <span className="svc-label">{s.label}</span>
            </label>
            {on && s.detail && (
              <input className="field svc-detail" placeholder={s.detail} value={opt.detail || ''}
                onChange={(e) => set(s.key, { detail: e.target.value })} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Build the complete, explicit map (every service yes/no) for saving — so the
// answers are unambiguous rather than "unset".
export const fullServiceOptions = (services, value = {}) =>
  Object.fromEntries((services || []).map((s) => [s.key, {
    enabled: value[s.key]?.enabled === true,
    detail: String(value[s.key]?.detail || '').trim(),
  }]));
