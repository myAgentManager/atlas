import React from 'react';
import earth from './assets/earth.jpg';

// The ATLAS identity: a spinning Earth (real NASA Blue Marble imagery, public
// domain) wrapped as a sphere via a scrolling equirectangular texture, with an
// original "earth network" overlay — great-circle links and glowing nodes.
export default function Globe({ size = 180, busy = false, className = '' }) {
  return (
    <div
      className={`globe-wrap ${busy ? 'busy' : ''} ${className}`}
      style={{ width: size, height: size, '--gsize': `${size}px` }}
    >
      <div className="globe-sphere" style={{ backgroundImage: `url(${earth})` }} />
      <div className="globe-shade" />
      <div className="globe-glass" />

      {/* the network: hand-drawn arcs + uplink nodes, spinning slowly above the surface */}
      <svg className="globe-net" viewBox="0 0 100 100" aria-hidden>
        <g className="net-links" fill="none" stroke="var(--cyan)" strokeLinecap="round">
          <path d="M22 62 Q 38 30 68 36" strokeWidth="1.1" opacity="0.85" />
          <path d="M30 76 Q 55 58 76 64" strokeWidth="0.9" opacity="0.6" />
          <path d="M26 40 Q 47 24 72 50" strokeWidth="0.8" opacity="0.5" />
          <path d="M40 82 Q 60 72 70 78" strokeWidth="0.8" opacity="0.45" />
          <path d="M20 52 Q 42 46 60 24" strokeWidth="0.7" opacity="0.4" />
        </g>
        <g className="net-nodes" fill="var(--cyan)">
          <circle cx="22" cy="62" r="1.9" />
          <circle cx="68" cy="36" r="2.3" />
          <circle cx="30" cy="76" r="1.5" />
          <circle cx="76" cy="64" r="1.9" />
          <circle cx="26" cy="40" r="1.5" />
          <circle cx="72" cy="50" r="1.6" />
          <circle cx="60" cy="24" r="1.7" />
          <circle cx="70" cy="78" r="1.3" />
        </g>
        {/* pulses travelling along the main link */}
        <circle className="net-pulse" r="1.3" fill="#eafffb">
          <animateMotion dur="3.2s" repeatCount="indefinite" path="M22 62 Q 38 30 68 36" />
        </circle>
        <circle className="net-pulse p2" r="1.1" fill="#eafffb">
          <animateMotion dur="4.5s" repeatCount="indefinite" path="M26 40 Q 47 24 72 50" />
        </circle>
      </svg>

      <div className="globe-orbit" />
    </div>
  );
}
