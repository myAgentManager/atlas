// ATLAS's voice — the part that makes it sound like a person, not a form.
// Everything Atlas Core says out loud runs through here: it contracts words,
// varies phrasing, adds a little personality, and paraphrases instead of
// reciting. From-scratch, deterministic-ish variation seeded per utterance.
import { rng } from './generator.js';

export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
// include `s` with probability p (adds natural, optional flourishes)
const maybe = (r, p, s) => (r() < p ? s : '');

// A fresh voice per utterance so repeated messages don't sound identical.
export function newVoice(seed = '') {
  return rng('voice:' + seed + ':' + Math.random().toString(36).slice(2, 7));
}

// --- contractions: the single biggest "sounds human" lever ------------------
const CONTRACT = [
  [/\bI will\b/g, "I'll"], [/\bI am\b/g, "I'm"], [/\bI have\b/g, "I've"], [/\bI would\b/g, "I'd"],
  [/\byou are\b/g, "you're"], [/\byou will\b/g, "you'll"], [/\byou have\b/g, "you've"],
  [/\bwe are\b/g, "we're"], [/\bwe will\b/g, "we'll"], [/\bwe have\b/g, "we've"], [/\blet us\b/g, "let's"],
  [/\bthat is\b/g, "that's"], [/\bit is\b/g, "it's"], [/\bthere is\b/g, "there's"], [/\bhere is\b/g, "here's"],
  [/\bwhat is\b/g, "what's"], [/\bwho is\b/g, "who's"], [/\bcannot\b/g, "can't"], [/\bdo not\b/g, "don't"],
  [/\bdoes not\b/g, "doesn't"], [/\bdid not\b/g, "didn't"], [/\bis not\b/g, "isn't"], [/\bare not\b/g, "aren't"],
  [/\bwill not\b/g, "won't"], [/\bwould not\b/g, "wouldn't"], [/\bshould not\b/g, "shouldn't"],
  [/\bwas not\b/g, "wasn't"], [/\bhave not\b/g, "haven't"], [/\bgoing to\b/g, "gonna"],
];
export function contract(s) {
  let out = String(s);
  for (const [re, r] of CONTRACT) out = out.replace(re, r);
  // keep sentence starts capitalized after we mangled them
  return out.replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

// --- word pools -------------------------------------------------------------
const OK = ['Alright', 'Okay', 'Got it', 'Sure thing', 'On it', 'Cool', 'Right', 'Sweet', 'Say no more'];
const HEY = ['Hey', 'Hi', 'Heya', 'Oh hey', 'Yo', 'Hey there', "What's up"];
const THINK = ['Let me think', 'Hmm', 'Okay so', 'Right, so', 'Lemme see', 'One sec', 'Thinking'];
const NICE = ['Nice', 'Love it', 'Perfect', 'Great', 'Solid', 'Beautiful', 'Awesome'];
const HEDGE = ['I think', 'honestly', 'basically', 'pretty much', 'if I had to guess', 'near as I can tell'];
const YEP = ['Yep', 'For sure', 'Absolutely', '100%', 'Totally', 'You bet', 'Of course'];
const FILLER = ['', '', ' — ', ' … ', ', so ', '. And ', '. '];

// --- reusable phrase generators ---------------------------------------------
export function greet(r, name) {
  const who = name ? ` ${name}` : '';
  return pick(r, [`${pick(r, HEY)}${who}!`, `${pick(r, HEY)}${who}.`, `${pick(r, HEY)}${who} —`]);
}
export function ack(r) { return pick(r, OK); }
export function thinking(r) { return pick(r, THINK); }
export function nice(r) { return pick(r, NICE); }
export function yes(r) { return pick(r, YEP); }

// Reflect what the user said back, in ATLAS's own words, using their keywords.
export function paraphrase(r, words) {
  const w = (words || []).slice(0, 3).join(', ');
  if (!w) return '';
  return pick(r, [
    `so this is about ${w}`,
    `sounds like ${w} is the heart of it`,
    `${w} — got the gist`,
    `okay, ${w}`,
  ]);
}

// Turn a plain, stiff status line into a casual first-person one.
export function loosen(r, stiff) {
  const lead = pick(r, ['', '', `${ack(r)}, `, `${thinking(r)}… `, 'Okay, ']);
  return contract(lead + stiff.charAt(0).toLowerCase() + stiff.slice(1));
}

// Compose a multi-bit reply naturally: joins fragments with varied connectors
// and contracts the result.
export function compose(r, ...parts) {
  const bits = parts.filter((b) => b && String(b).trim());
  let out = '';
  bits.forEach((b, i) => {
    b = String(b).trim();
    if (i === 0) { out = b; return; }
    // Pick a joiner from how the previous fragment ends and how this one starts.
    const prevPunct = /[—:,.!?]$/.test(out);
    const nextPunct = /^[—,.!?:]/.test(b);
    const joiner = (prevPunct || nextPunct) ? ' ' : pick(r, [' ', ' ', '. ', ' — ']);
    out += joiner + b;
  });
  return contract(out
    .replace(/\s+([.!?,])/g, '$1')          // no space before punctuation
    .replace(/[—:]\s*([.!?,])/g, '$1')       // "— ." / ": ," → "." / ","
    .replace(/([.:!?])\s*—/g, '$1')          // ". —" → "."
    .replace(/([—:])\s*[—:]/g, '$1')         // "— —", ": —"
    .replace(/\.\s*\./g, '.')                // ".."
    .replace(/\s{2,}/g, ' ')
    .trim());
}
