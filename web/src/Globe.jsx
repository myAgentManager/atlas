import React, { useId } from 'react';
import earth from './assets/earth.jpg';

// The Atlas Network identity: a spinning Earth (real NASA Blue Marble imagery,
// public domain) with a live network wrapped onto its surface — meridians and
// uplink stations that scroll WITH the rotation and wrap around the limb, over
// static latitude rings. Two tiled copies (via <use>) make the scroll seamless.
export default function Globe({ size = 180, busy = false, className = '' }) {
  const uid = useId().replace(/:/g, '');
  const clip = `sph-${uid}`;
  const net = `net-${uid}`;

  return (
    <div
      className={`globe-wrap ${busy ? 'busy' : ''} ${className}`}
      style={{ width: size, height: size, '--gsize': `${size}px` }}
    >
      <div className="globe-sphere" style={{ backgroundImage: `url(${earth})` }} />
      <div className="globe-shade" />
      <div className="globe-glass" />

      <svg className="globe-net" viewBox="0 0 100 100" aria-hidden>
        <defs>
          <clipPath id={clip}><circle cx="50" cy="50" r="43.5" /></clipPath>

          {/* one tile of the network, 100 wide — meridians, links, stations */}
          <g id={net}>
            <g fill="none" stroke="var(--cyan)" strokeOpacity="0.22" strokeWidth="0.7">
              <path d="M8 8 Q 2 50 8 92" /><path d="M28 6 Q 24 50 28 94" />
              <path d="M50 5 Q 50 50 50 95" /><path d="M72 6 Q 76 50 72 94" />
              <path d="M92 8 Q 98 50 92 92" />
            </g>
            <g fill="none" stroke="var(--cyan)" strokeLinecap="round">
              <path d="M14 60 Q 34 40 52 46" strokeWidth="1" opacity="0.75" />
              <path d="M40 30 Q 58 40 74 64" strokeWidth="0.8" opacity="0.55" />
              <path d="M20 44 Q 44 52 66 34" strokeWidth="0.75" opacity="0.5" />
            </g>
            <g fill="var(--cyan)" className="net-nodes">
              <circle cx="14" cy="60" r="1.8" /><circle cx="52" cy="46" r="2.1" />
              <circle cx="40" cy="30" r="1.5" /><circle cx="74" cy="64" r="1.7" />
              <circle cx="20" cy="44" r="1.3" /><circle cx="66" cy="34" r="1.5" />
              <circle cx="86" cy="52" r="1.6" /><circle cx="30" cy="74" r="1.3" />
            </g>
          </g>
        </defs>

        <g clipPath={`url(#${clip})`}>
          {/* static latitude rings */}
          <g fill="none" stroke="var(--cyan)" strokeOpacity="0.13" strokeWidth="0.6">
            <line x1="8" y1="32" x2="92" y2="32" />
            <line x1="6.5" y1="50" x2="93.5" y2="50" />
            <line x1="8" y1="68" x2="92" y2="68" />
          </g>
          {/* scrolling meridians + stations, two tiles wide, seamless wrap */}
          <g className="net-scroll">
            <use href={`#${net}`} />
            <use href={`#${net}`} x="100" />
            <animateTransform attributeName="transform" type="translate"
              from="0 0" to="-100 0" dur="26s" repeatCount="indefinite" />
          </g>
        </g>
      </svg>

      <div className="globe-orbit" />
    </div>
  );
}
