// Generates the myAgent social-media brand kit: the glossy globe on themed
// backgrounds, in every ad format, dark + light, with and without the wordmark.
// Output → brand/*.svg (scalable; open in a browser and export PNG at any size).
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../brand/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// The skeuomorphic globe (from the app's <Mark>), placed at (cx,cy) with radius r.
function globe(cx, cy, r, id) {
  const s = r / 28; // the source globe is r=28 around (32,32)
  const tx = cx - 32 * s, ty = cy - 32 * s;
  return `
  <defs>
    <radialGradient id="sea${id}" cx="34%" cy="26%" r="90%">
      <stop offset="0%" stop-color="#5a9be0"/><stop offset="35%" stop-color="#2762ad"/>
      <stop offset="70%" stop-color="#123a77"/><stop offset="100%" stop-color="#050f2b"/>
    </radialGradient>
    <radialGradient id="shade${id}" cx="34%" cy="26%" r="95%">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="72%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000814" stop-opacity="0.55"/>
    </radialGradient>
    <linearGradient id="gloss${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.9"/><stop offset="60%" stop-color="#fff" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="disc${id}"><circle cx="32" cy="32" r="28"/></clipPath>
  </defs>
  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})">
    <circle cx="32" cy="32" r="30" fill="#0a1e42" opacity="0.5"/>
    <circle cx="32" cy="32" r="28" fill="url(#sea${id})"/>
    <g clip-path="url(#disc${id})">
      <g stroke="#bcdcff" stroke-opacity="0.14" stroke-width="0.7" fill="none">
        <ellipse cx="32" cy="32" rx="28" ry="5.6"/>
        <ellipse cx="32" cy="20.5" rx="25.4" ry="4.6"/>
        <ellipse cx="32" cy="11" rx="18.6" ry="3"/>
        <ellipse cx="32" cy="43.5" rx="25.4" ry="4.6"/>
        <ellipse cx="32" cy="53" rx="18.6" ry="3"/>
        <ellipse cx="32" cy="32" rx="9.6" ry="28"/>
        <ellipse cx="32" cy="32" rx="19" ry="28"/>
        <line x1="32" y1="4" x2="32" y2="60"/>
      </g>
      <g fill="#f4f8fd">
        <path d="M21.5 13.5c-3.2.8-5 4-4.4 7.4.5 2.6 2.7 3.6 2.9 6.2.2 3.4-2.4 5.6-1.5 9 .8 3.1 3.6 5.2 5.8 4.3 2.4-1 2.3-4.4 1.4-7-.9-2.5-2.7-3.6-2.4-6.3.3-2.7 2.9-4 3.4-7 .5-3.3-1.6-6.5-5.2-6.6Z" opacity=".96"/>
        <path d="M35 16.5c5-1.6 11 .2 13.4 4.3 1.6 2.7-.2 5.6-2.6 7.2-2.9 2-6.7 1.6-8.6 4.6-1.8 2.8.2 6.6-2.6 8.6-2.7 1.9-6.4-.1-7.4-3.2-1.2-3.7 1.4-6.8 1.6-10.6.2-4.5 1.6-9.2 6.2-10.9Z"/>
        <path d="M45.5 40c3-.4 6 2 5.6 5-.4 2.8-3.6 4-6 2.6-2.3-1.4-2.6-4.8-1.3-6.6.5-.7 1-1 1.7-1Z" opacity=".92"/>
      </g>
      <circle cx="32" cy="32" r="28" fill="url(#shade${id})"/>
      <path d="M7.5 24 C10 10.5 21 4.5 32 4.5 C43 4.5 54 10.5 56.5 24 C46 30.5 18 30.5 7.5 24 Z" fill="url(#gloss${id})" opacity="0.72"/>
      <ellipse cx="22" cy="12.5" rx="7.5" ry="3.6" fill="#fff" opacity="0.85"/>
    </g>
    <circle cx="32" cy="32" r="27.5" stroke="#0a1e42" stroke-opacity="0.85" stroke-width="1" fill="none"/>
    <circle cx="32" cy="32" r="30" fill="none" stroke="#34e3d0" stroke-opacity="0.35" stroke-width="0.6"/>
  </g>`;
}

const themes = {
  dark: { bg0: '#070b15', bg1: '#0d1526', my: '#61708a', agent: '#e9eff9', a: 'rgba(52,227,208,0.16)', b: 'rgba(70,110,255,0.14)', c: 'rgba(150,84,255,0.12)', tag: '#9fadc4' },
  light: { bg0: '#eef1f8', bg1: '#dfe6f4', my: '#8b97a8', agent: '#0e1a2b', a: 'rgba(52,227,208,0.20)', b: 'rgba(96,138,255,0.16)', c: 'rgba(182,128,255,0.12)', tag: '#4d5a6b' },
};

function bg(w, h, t) {
  return `
  <rect width="${w}" height="${h}" fill="${t.bg0}"/>
  <rect width="${w}" height="${h}" fill="url(#grad)"/>
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0%" stop-color="${t.bg1}"/><stop offset="100%" stop-color="${t.bg0}"/></linearGradient>
    <radialGradient id="au1" cx="80%" cy="8%" r="60%"><stop offset="0%" stop-color="${t.a}"/><stop offset="100%" stop-color="transparent"/></radialGradient>
    <radialGradient id="au2" cx="12%" cy="30%" r="55%"><stop offset="0%" stop-color="${t.b}"/><stop offset="100%" stop-color="transparent"/></radialGradient>
    <radialGradient id="au3" cx="65%" cy="105%" r="60%"><stop offset="0%" stop-color="${t.c}"/><stop offset="100%" stop-color="transparent"/></radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#au1)"/>
  <rect width="${w}" height="${h}" fill="url(#au2)"/>
  <rect width="${w}" height="${h}" fill="url(#au3)"/>`;
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif";
function wordmark(cx, y, size, t) {
  return `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="${size}" letter-spacing="-${(size * 0.02).toFixed(1)}">` +
    `<tspan fill="${t.agent}">Atlas</tspan></text>`;
}
function tagline(cx, y, size, t, text) {
  return `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="${size}" letter-spacing="${size * 0.02}" fill="${t.tag}">${text}</text>`;
}

// layout: 'center' (globe+wordmark centered), 'top' (branding up top, space below),
// 'clean' (globe only, room for your own ad copy)
function poster(w, h, themeName, layout) {
  const t = themes[themeName];
  const cx = w / 2;
  const id = `${themeName}${w}${h}${layout}`.replace(/\W/g, '');
  let art = '';
  if (layout === 'center') {
    const r = Math.min(w, h) * 0.17;
    const gy = h * 0.42;
    art = globe(cx, gy, r, id) + wordmark(cx, gy + r + h * 0.11, Math.min(w, h) * 0.11, t) +
      tagline(cx, gy + r + h * 0.11 + Math.min(w, h) * 0.075, Math.min(w, h) * 0.032, t, 'An AI agent for your business');
  } else if (layout === 'top') {
    const r = Math.min(w, h) * 0.12;
    const gy = h * 0.16;
    art = globe(cx, gy, r, id) + wordmark(cx, gy + r + h * 0.06, Math.min(w, h) * 0.075, t);
  } else if (layout === 'clean') {
    const r = Math.min(w, h) * 0.16;
    art = globe(cx, h * 0.34, r, id);
  } else if (layout === 'corner') {
    // small branding, bottom-left — leaves the whole canvas free for ad copy
    const pad = Math.min(w, h) * 0.055;
    const r = Math.min(w, h) * 0.038;
    const gx = pad + r, gy = h - pad - r;
    const size = Math.min(w, h) * 0.05;
    art = globe(gx, gy, r, id) +
      `<text x="${gx + r + size * 0.4}" y="${gy + size * 0.36}" text-anchor="start" font-family="${FONT}" font-weight="800" font-size="${size}" letter-spacing="-${(size * 0.02).toFixed(1)}">` +
      `<tspan fill="${t.agent}">Atlas</tspan></text>`;
  } else {
    // plain — just the themed background, nothing on top (drop your own text)
    art = '';
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg(w, h, t)}${art}</svg>`;
}

const formats = [
  { name: 'square', w: 1080, h: 1080 },
  { name: 'story', w: 1080, h: 1920 },   // phone / IG story / TikTok
  { name: 'wide', w: 1200, h: 630 },     // OG / Twitter / FB link
];
const layouts = ['center', 'top', 'clean', 'corner', 'plain'];

let n = 0;
for (const f of formats) for (const theme of ['dark', 'light']) for (const layout of layouts) {
  const file = `atlas-${f.name}-${theme}-${layout}.svg`;
  writeFileSync(new URL(file, OUT), poster(f.w, f.h, theme, layout));
  n++;
}
console.log(`wrote ${n} brand assets to brand/`);
