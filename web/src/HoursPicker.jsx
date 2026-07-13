import React from 'react';
import { Icon } from './icons.jsx';

// Visual opening-hours builder: tap the days, drag the two handles to the
// right times. Groups compose into a readable string ("Mon–Sat 7am–6pm,
// Sun 8am–2pm") — the same format the agent already answers with, so typing
// hours manually still works everywhere.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const fmtTime = (h) => {
  const H = Math.floor(h);
  const half = h % 1 !== 0;
  const ap = H >= 12 ? 'pm' : 'am';
  const x = H % 12 || 12;
  return half ? `${x}:30${ap}` : `${x}${ap}`;
};

const compressDays = (days) => {
  const idx = [...days].sort((a, b) => a - b);
  const runs = [];
  for (const i of idx) {
    const last = runs[runs.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs.map(([a, b]) => (a === b ? DAYS[a] : b === a + 1 ? `${DAYS[a]}, ${DAYS[b]}` : `${DAYS[a]}–${DAYS[b]}`)).join(', ');
};

export const composeHours = (groups) =>
  groups.filter((g) => g.days.length).map((g) => `${compressDays(g.days)} ${fmtTime(g.from)}–${fmtTime(g.to)}`).join(', ');

export const defaultGroups = () => [{ days: [0, 1, 2, 3, 4], from: 9, to: 17 }];

export default function HoursPicker({ groups, setGroups }) {
  const update = (i, patch) => setGroups(groups.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const toggleDay = (i, d) => {
    const g = groups[i];
    update(i, { days: g.days.includes(d) ? g.days.filter((x) => x !== d) : [...g.days, d] });
  };

  return (
    <div className="hours-picker">
      {groups.map((g, i) => (
        <div key={i} className="hp-group">
          <div className="hp-days">
            {DAYS.map((d, di) => (
              <button key={d} type="button" className={`hp-day ${g.days.includes(di) ? 'on' : ''}`} onClick={() => toggleDay(i, di)}>{d}</button>
            ))}
            {groups.length > 1 && (
              <button type="button" className="mini-btn ghost hp-x" title="Remove these hours" onClick={() => setGroups(groups.filter((_, j) => j !== i))}>
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
          <div className="hp-slider">
            <div className="hp-track">
              <div className="hp-fill" style={{ left: `${(g.from / 24) * 100}%`, width: `${((g.to - g.from) / 24) * 100}%` }} />
              <input type="range" min="0" max="23.5" step="0.5" value={g.from}
                onChange={(e) => update(i, { from: Math.min(Number(e.target.value), g.to - 0.5) })} />
              <input type="range" min="0.5" max="24" step="0.5" value={g.to}
                onChange={(e) => update(i, { to: Math.max(Number(e.target.value), g.from + 0.5) })} />
            </div>
            <div className="hp-times"><b>{fmtTime(g.from)}</b> – <b>{fmtTime(g.to)}</b></div>
          </div>
        </div>
      ))}
      <button type="button" className="text-link hp-add" onClick={() => setGroups([...groups, { days: [], from: 9, to: 17 }])}>
        + Different hours for other days
      </button>
    </div>
  );
}
