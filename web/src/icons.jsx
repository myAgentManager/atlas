// Original hand-authored line icons (1.6px stroke) + the myAgent logo mark.
// Everything inline SVG — no icon fonts, no emoji, nothing borrowed.
import React from 'react';

const PATHS = {
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  shield: <><path d="M12 3 5 6v6c0 4 3 6.5 7 9 4-2.5 7-5 7-9V6l-7-3Z" /><path d="m9.5 12 2 2 3.5-4" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.5 6 3.5 9S14.5 18.5 12 21c-2.5-2.5-3.5-6-3.5-9S9.5 5.5 12 3Z" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>,
  chat: <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12Z" />,
  bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8Z" /><path d="M10.5 20a2 2 0 0 0 3 0" /></>,
  bellOff: <><path d="M6 8a6 6 0 0 1 9-5.2M18 8c0 7 3 8 3 8H7" /><path d="M10.5 20a2 2 0 0 0 3 0M3 3l18 18" /></>,
  server: <><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /><rect x="10" y="10" width="4" height="4" rx="1" /></>,
  check: <path d="m5 12 5 5L20 6" />,
  play: <path d="M7 5v14l12-7-12-7Z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />,
  home: <path d="M4 11 12 4l8 7M6 10v10h12V10" />,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12 20 3M16 7l3 3M13 10l2 2" /></>,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19" /></>,
  plug: <><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8Z" /><path d="M12 17v4" /></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="2.6" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  logout: <><path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" /></>,
  brain: <><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="8.5" strokeDasharray="8 5" /><path d="M12 8V5M15.2 13.8l2.6 1.4M8.8 13.8l-2.6 1.4" /></>,
  file: <><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  refresh: <path d="M20 12a8 8 0 1 1-2.3-5.6M20 3v4h-4" />,
  code: <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13 5l-2 14" />,
  sun: <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9" /></>,
  moon: <path d="M20.4 14.2A8.5 8.5 0 0 1 9.8 3.6a8.5 8.5 0 1 0 10.6 10.6Z" />,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.6" /><rect x="13" y="4" width="7" height="7" rx="1.6" /><rect x="4" y="13" width="7" height="7" rx="1.6" /><rect x="13" y="13" width="7" height="7" rx="1.6" /></>,
};

export function Icon({ name, size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`icon ${className}`} aria-hidden>
      {PATHS[name] || null}
    </svg>
  );
}

// The Atlas Networks mark: a skeuomorphic 3D glossy globe — deep navy sphere,
// beveled white continents, a curved glass reflection across the top, and a
// rim of bounced light at the base. Transparent outside the sphere.
export function Mark({ size = 28, spin = false }) {
  const uid = React.useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden
      className={spin ? 'mark-spinning' : undefined}>
      <defs>
        {/* ocean: lit upper-left, falling to near-black navy at the edge */}
        <radialGradient id={`sea${uid}`} cx="34%" cy="26%" r="90%">
          <stop offset="0%" stopColor="#5a9be0" />
          <stop offset="35%" stopColor="#2762ad" />
          <stop offset="70%" stopColor="#123a77" />
          <stop offset="100%" stopColor="#050f2b" />
        </radialGradient>
        {/* inner shading: darkens the sphere's lower-right like a real ball */}
        <radialGradient id={`shade${uid}`} cx="34%" cy="26%" r="95%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0" />
          <stop offset="72%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000814" stopOpacity="0.55" />
        </radialGradient>
        {/* glass window reflection */}
        <linearGradient id={`gloss${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* bounced light on the bottom rim */}
        <linearGradient id={`rim${uid}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#6fb6ff" stopOpacity="0.5" />
          <stop offset="35%" stopColor="#6fb6ff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#6fb6ff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`disc${uid}`}><circle cx="32" cy="32" r="28" /></clipPath>
      </defs>

      <circle cx="32" cy="32" r="28" fill={`url(#sea${uid})`} />

      <g clipPath={`url(#disc${uid})`}>
        {/* continents (spinnable as one landmass under the static gloss) */}
        <g className="mark-land">
          {/* dark offset copy underneath fakes a beveled emboss */}
          <g fill="#0a2a55" transform="translate(0.9 1.2)" opacity="0.85">
            <path d="M20 14c4-3 9-2 11 1s0 6 3 7 8-1 10 2 1 6-2 7-7 0-9 3-1 7-4 8-7-1-8-5 1-6-1-9-6-3-6-7 3-5 6-7Z" />
            <path d="M45 12c3-1 8 0 10 3l1 3c-3 2-7 2-9-1s-4-4-2-5Z" />
            <path d="M27 45c3-1 6 1 6 4s-2 6-5 6-5-3-4-6 1-3 3-4Z" />
            <path d="M48 40c3 0 6 3 5 6s-5 4-7 1 0-7 2-7Z" />
          </g>
          <g fill="#f7fafd">
            <path d="M20 14c4-3 9-2 11 1s0 6 3 7 8-1 10 2 1 6-2 7-7 0-9 3-1 7-4 8-7-1-8-5 1-6-1-9-6-3-6-7 3-5 6-7Z" />
            <path d="M45 12c3-1 8 0 10 3l1 3c-3 2-7 2-9-1s-4-4-2-5Z" opacity=".97" />
            <path d="M27 45c3-1 6 1 6 4s-2 6-5 6-5-3-4-6 1-3 3-4Z" />
            <path d="M48 40c3 0 6 3 5 6s-5 4-7 1 0-7 2-7Z" opacity=".95" />
          </g>
        </g>

        {/* sphere shading + bottom bounce light */}
        <circle cx="32" cy="32" r="28" fill={`url(#shade${uid})`} />
        <path d="M6 44 A28 28 0 0 0 58 44 A34 22 0 0 1 6 44 Z" fill={`url(#rim${uid})`} />

        {/* glass reflection: upper window with a curved belly */}
        <path d="M7.5 24 C10 10.5 21 4.5 32 4.5 C43 4.5 54 10.5 56.5 24 C46 30.5 18 30.5 7.5 24 Z"
          fill={`url(#gloss${uid})`} opacity="0.8" />
        <ellipse cx="22" cy="12.5" rx="7.5" ry="4" fill="#ffffff" opacity="0.9" />
      </g>

      <circle cx="32" cy="32" r="27.5" stroke="#0a1e42" strokeOpacity="0.8" strokeWidth="1" />
    </svg>
  );
}
