// ATLAS Core — text & design generation, from scratch.
// A seeded template grammar with synonym pools produces copy that varies per
// topic but stays deterministic for the same input. Palettes and procedural
// SVG art give every artifact an original look. No AI service calls.

// Seeded PRNG (mulberry32) so the same topic always gets the same "voice".
export function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// --- copy pools -------------------------------------------------------------------
const POOLS = {
  bold: {
    adj: ['relentless', 'electric', 'unmistakable', 'loud and proud', 'built different', 'full-throttle'],
    verb: ['ignites', 'delivers', 'commands', 'owns', 'electrifies'],
    tag: ['Turn it up.', 'No half measures.', 'Made to be heard.', 'All signal, no noise.'],
  },
  calm: {
    adj: ['considered', 'quietly confident', 'timeless', 'effortless', 'refined'],
    verb: ['brings', 'offers', 'delivers', 'crafts', 'shapes'],
    tag: ['Less, but better.', 'Simple on purpose.', 'Quality you can feel.', 'Take a breath.'],
  },
  warm: {
    adj: ['welcoming', 'homegrown', 'made with care', 'down-to-earth', 'genuine'],
    verb: ['shares', 'brings', 'serves up', 'welcomes you with', 'celebrates'],
    tag: ['Come as you are.', 'Made with heart.', 'Good things, done right.', 'You belong here.'],
  },
};

export function heroCopy(topic, tone, r) {
  const p = POOLS[tone] || POOLS.bold;
  const t = topic || 'Something new';
  return {
    headline: pick(r, [`${t}.`, `This is ${t}.`, `Meet ${t}.`, `${t} — ${pick(r, p.tag).toLowerCase().replace(/\.$/, '')}.`]),
    sub: pick(r, [
      `${t} ${pick(r, p.verb)} a ${pick(r, p.adj)} experience — and this is where it starts.`,
      `A ${pick(r, p.adj)} take on what ${t.toLowerCase()} can be.`,
      `${pick(r, p.tag)} ${t} ${pick(r, p.verb)} exactly what you came for.`,
    ]),
    tag: pick(r, p.tag),
  };
}

export function featureCopy(topic, tone, r) {
  const p = POOLS[tone] || POOLS.bold;
  const t = topic || 'this project';
  const cards = [
    { title: pick(r, ['The story', 'Who we are', 'The idea']), body: `${t} started with a simple belief: do the ${pick(r, p.adj)} thing, every time. That belief runs through everything here.` },
    { title: pick(r, ['What you get', 'The experience', 'Why it works']), body: `Every detail ${pick(r, p.verb)} something real — no filler, no fluff, just the parts that matter.` },
    { title: pick(r, ['Stay close', 'What’s next', 'Keep in touch']), body: `New things are always in motion. Follow along and be first to know what ${t.toLowerCase()} does next.` },
  ];
  return cards;
}

// --- palettes ----------------------------------------------------------------------
const PALETTES = [
  { name: 'midnight', bg: '#0a0d12', panel: '#131922', ink: '#e8eef6', dim: '#8b96a5', accent: '#38e0cd', accent2: '#1a9fb0' },
  { name: 'ember', bg: '#120c0a', panel: '#1d1310', ink: '#f6ece6', dim: '#a5928b', accent: '#ff7a45', accent2: '#c2410c' },
  { name: 'violet', bg: '#0d0a14', panel: '#171226', ink: '#ece8f6', dim: '#968ba8', accent: '#a78bfa', accent2: '#6d28d9' },
  { name: 'forest', bg: '#0a1209', panel: '#121d12', ink: '#e9f4e7', dim: '#8ba18a', accent: '#5eea8d', accent2: '#15803d' },
  { name: 'gold', bg: '#111009', panel: '#1c1a10', ink: '#f6f2e4', dim: '#a49d85', accent: '#f2c744', accent2: '#a16207' },
  { name: 'paper', bg: '#f4f1ea', panel: '#ffffff', ink: '#1c1917', dim: '#6b6560', accent: '#0d9488', accent2: '#134e4a' },
];
export function palette(seedStr) {
  const r = rng('pal:' + seedStr);
  return PALETTES[Math.floor(r() * PALETTES.length)];
}

// --- procedural SVG art (original, generated per topic) ------------------------------
export function svgBackdrop(seedStr, accent) {
  const r = rng('svg:' + seedStr);
  const kind = Math.floor(r() * 3);
  if (kind === 0) {
    // layered waves
    const wave = (y, o) => {
      let d = `M0 ${y}`;
      for (let x = 0; x <= 1200; x += 150) d += ` Q ${x + 75} ${y + (r() - 0.5) * 90}, ${x + 150} ${y}`;
      return `<path d="${d} V400 H0 Z" fill="${accent}" opacity="${o}"/>`;
    };
    return `<svg viewBox="0 0 1200 400" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">${wave(180, 0.10)}${wave(240, 0.14)}${wave(300, 0.20)}</svg>`;
  }
  if (kind === 1) {
    // orbit rings + nodes
    let c = '';
    for (let i = 0; i < 5; i++) {
      const cx = 200 + r() * 800, cy = 60 + r() * 280, rad = 40 + r() * 140;
      c += `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${accent}" stroke-opacity="${0.08 + r() * 0.15}" stroke-width="${1 + r() * 2}"/>`;
      c += `<circle cx="${cx + rad}" cy="${cy}" r="${2 + r() * 4}" fill="${accent}" fill-opacity="0.5"/>`;
    }
    return `<svg viewBox="0 0 1200 400" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">${c}</svg>`;
  }
  // diagonal grid shards
  let s = '';
  for (let i = 0; i < 14; i++) {
    const x = r() * 1200, w = 20 + r() * 90;
    s += `<rect x="${x}" y="-50" width="${w}" height="500" fill="${accent}" opacity="${0.03 + r() * 0.08}" transform="rotate(${18 + r() * 8} ${x} 200)"/>`;
  }
  return `<svg viewBox="0 0 1200 400" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">${s}</svg>`;
}

// Small original logo mark for generated sites: initial in an orbit.
export function svgMark(topic, accent) {
  const ch = (topic || 'A').trim()[0]?.toUpperCase() || 'A';
  return `<svg viewBox="0 0 48 48" width="34" height="34" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="20" fill="none" stroke="${accent}" stroke-width="2" stroke-dasharray="70 30" stroke-linecap="round"/><text x="24" y="31" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" font-weight="800" fill="${accent}">${ch}</text></svg>`;
}
