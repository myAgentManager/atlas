import React, { useState } from 'react';
import { Icon } from './icons.jsx';

// Tap the languages your agent speaks instead of typing them. Stored as a
// comma-separated string (what the backend already expects). "+ Add" lets you
// type any language not in the common list.
const COMMON = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Chinese', 'Japanese', 'Korean', 'Arabic', 'Hindi', 'Russian', 'Vietnamese', 'Tagalog'];

const toList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const toStr = (arr) => arr.join(', ');

export default function LanguagePicker({ value, onChange }) {
  const [custom, setCustom] = useState('');
  const [adding, setAdding] = useState(false);
  const picked = toList(value);
  const has = (l) => picked.some((p) => p.toLowerCase() === l.toLowerCase());
  const toggle = (l) => onChange(toStr(has(l) ? picked.filter((p) => p.toLowerCase() !== l.toLowerCase()) : [...picked, l]));
  const addCustom = () => { const l = custom.trim(); if (l && !has(l)) onChange(toStr([...picked, l])); setCustom(''); setAdding(false); };

  const extras = picked.filter((p) => !COMMON.some((c) => c.toLowerCase() === p.toLowerCase()));
  return (
    <div className="lang-picker">
      <div className="lang-chips">
        {COMMON.map((l) => (
          <button key={l} type="button" className={`lang-chip ${has(l) ? 'on' : ''}`} onClick={() => toggle(l)}>
            {has(l) && <Icon name="check" size={12} />} {l}
          </button>
        ))}
        {extras.map((l) => (
          <button key={l} type="button" className="lang-chip on" onClick={() => toggle(l)}><Icon name="check" size={12} /> {l}</button>
        ))}
        {adding
          ? <input className="field lang-add-input" autoFocus placeholder="Language…" value={custom}
              onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()} onBlur={addCustom} />
          : <button type="button" className="lang-chip add" onClick={() => setAdding(true)}><Icon name="spark" size={12} /> Add</button>}
      </div>
    </div>
  );
}
