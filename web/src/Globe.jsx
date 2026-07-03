import React from 'react';
import earth from './assets/earth.jpg';

// The ATLAS identity: a spinning Earth (real NASA Blue Marble imagery, public
// domain) wrapped as a sphere via a scrolling equirectangular texture, with an
// original "Atlas Network" overlay — graticule hints, great-circle links, and
// glowing uplink nodes, all clipped to the sphere so nothing drifts off-world.
export default function Globe({ size = 180, busy = false, className = '' }) {
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
          <clipPath id="atlas-sphere"><circle cx="50" cy="50" r="43.5" /></clipPath>
        </defs>
        <g clipPath="url(#atlas-sphere)">
          {/* graticule hints — the classic network-globe lines */}
          <g fill="none" stroke="var(--cyan)" strokeOpacity="0.16" strokeWidth="0.6">
            <ellipse cx="50" cy="50" rx="43.5" ry="14" />
            <ellipse cx="50" cy="50" rx="43.5" ry="30" />
            <ellipse cx="50" cy="50" rx="14" ry="43.5" />
            <ellipse cx="50" cy="50" rx="30" ry="43.5" />
          </g>
          {/* great-circle links between stations */}
          <g fill="none" stroke="var(--cyan)" strokeLinecap="round">
            <path d="M28 64 Q 44 34 70 42" strokeWidth="1.1" opacity="0.8" />
            <path d="M33 36 Q 52 26 68 54" strokeWidth="0.85" opacity="0.55" />
            <path d="M30 52 Q 50 46 64 70" strokeWidth="0.8" opacity="0.5" />
            <path d="M40 74 Q 56 64 72 60" strokeWidth="0.7" opacity="0.4" />
          </g>
          {/* uplink stations */}
          <g fill="var(--cyan)" className="net-nodes">
            <circle cx="28" cy="64" r="1.9" />
            <circle cx="70" cy="42" r="2.2" />
            <circle cx="33" cy="36" r="1.5" />
            <circle cx="68" cy="54" r="1.7" />
            <circle cx="30" cy="52" r="1.4" />
            <circle cx="64" cy="70" r="1.6" />
            <circle cx="40" cy="74" r="1.3" />
            <circle cx="72" cy="60" r="1.4" />
          </g>
          {/* packets travelling the two main links */}
          <circle className="net-pulse" r="1.2" fill="#eafffb">
            <animateMotion dur="3.4s" repeatCount="indefinite" path="M28 64 Q 44 34 70 42" />
          </circle>
          <circle className="net-pulse" r="1" fill="#eafffb">
            <animateMotion dur="4.8s" repeatCount="indefinite" path="M33 36 Q 52 26 68 54" />
          </circle>
        </g>
      </svg>

      <div className="globe-orbit" />
    </div>
  );
}
