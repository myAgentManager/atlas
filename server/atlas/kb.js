// The Atlas Knowledge Database — a per-business long-term memory the agent
// fills by researching: it studies the business's website, absorbs the FAQ,
// and files every fact as a row it can recall when a customer asks. Questions
// it couldn't answer become "gaps" — a study queue — so Atlas keeps getting
// smarter about each business instead of staying a canned greeter.
import { randomUUID } from 'node:crypto';
import { getDoc, saveDoc } from '../db.js';
import { tokenize } from './nlu.js';
import { splitSentences, keywords } from './knowledge.js';

let db = getDoc('kb', { users: {} }); // users[uid] = { facts: [], gaps: [] }
const save = () => saveDoc('kb', db);

function node(userId) {
  db.users[userId] ||= { facts: [], gaps: [] };
  return db.users[userId];
}

// --- facts -------------------------------------------------------------------
export function addFact(userId, { topic, fact, source }) {
  const n = node(userId);
  const clean = String(fact || '').replace(/\s+/g, ' ').trim();
  if (clean.length < 12) return null;
  // de-dupe on near-identical text
  const sig = clean.toLowerCase().slice(0, 80);
  if (n.facts.some((f) => f.fact.toLowerCase().slice(0, 80) === sig)) return null;
  const row = {
    id: randomUUID().slice(0, 8),
    topic: String(topic || keywords(clean, 2).join(' ') || 'general').slice(0, 60),
    fact: clean.slice(0, 400),
    source: String(source || 'owner').slice(0, 120),
    learnedAt: Date.now(),
    uses: 0,
  };
  n.facts.unshift(row);
  if (n.facts.length > 400) n.facts.length = 400;
  save();
  return row;
}

export function removeFact(userId, id) {
  const n = node(userId);
  const i = n.facts.findIndex((f) => f.id === id);
  if (i === -1) return false;
  n.facts.splice(i, 1);
  save();
  return true;
}

// Retrieval: token-overlap scoring against fact + topic, best k rows.
export function search(userId, text, k = 2) {
  const q = new Set(tokenize(text));
  if (!q.size) return [];
  const scored = node(userId).facts
    .map((f) => {
      const fw = tokenize(f.topic + ' ' + f.fact);
      const overlap = fw.filter((w) => q.has(w)).length;
      return { f, score: overlap / Math.max(5, fw.length * 0.6) };
    })
    .filter((x) => x.score >= 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  for (const { f } of scored) f.uses++;
  if (scored.length) save();
  return scored.map((x) => x.f);
}

// --- gaps: questions Atlas couldn't answer ------------------------------------
export function logGap(userId, question) {
  const n = node(userId);
  const q = String(question || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (q.length < 6) return;
  const sig = q.toLowerCase().slice(0, 60);
  const existing = n.gaps.find((g) => g.q.toLowerCase().slice(0, 60) === sig);
  if (existing) { existing.count++; existing.lastAt = Date.now(); }
  else n.gaps.unshift({ id: randomUUID().slice(0, 8), q, count: 1, lastAt: Date.now() });
  if (n.gaps.length > 100) n.gaps.length = 100;
  save();
}

// Owner answers a gap → it becomes a fact and leaves the queue.
export function resolveGap(userId, gapId, answer) {
  const n = node(userId);
  const i = n.gaps.findIndex((g) => g.id === gapId);
  if (i === -1) return null;
  const [gap] = n.gaps.splice(i, 1);
  save();
  return addFact(userId, { topic: gap.q.slice(0, 60), fact: answer, source: 'owner answer' });
}

// --- research: study the business's website ------------------------------------
// Pulls the page (plus /about and /faq if reachable), keeps the informative
// sentences, and files each as a fact. Real reading, not a stub.
export async function studyWebsite(userId, url, fetchPage) {
  const base = String(url || '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) throw new Error('Connect your website (with https://) under Integrations first.');
  const pages = [base, `${base}/about`, `${base}/faq`];
  let added = 0;
  let read = 0;
  for (const p of pages) {
    let text;
    try { text = await fetchPage(p); read++; } catch { continue; }
    const sentences = splitSentences(text)
      .filter((s) => s.length >= 40 && s.length <= 240)
      .filter((s) => /[a-z]/i.test(s) && !/cookie|javascript|browser|copyright ©/i.test(s))
      .slice(0, p === base ? 10 : 6);
    for (const s of sentences) {
      if (addFact(userId, { topic: keywords(s, 2).join(' '), fact: s, source: p })) added++;
    }
  }
  if (!read) throw new Error(`Couldn't reach ${base} — check the URL.`);
  return { added, pagesRead: read };
}

// Absorb the owner's profile + FAQ as first-class knowledge.
export function absorbBusiness(userId, profile, faqs) {
  let added = 0;
  const p = profile || {};
  if (p.about) added += addFact(userId, { topic: 'about us', fact: p.about, source: 'profile' }) ? 1 : 0;
  if (p.hours) added += addFact(userId, { topic: 'hours open', fact: `Our hours are ${p.hours}.`, source: 'profile' }) ? 1 : 0;
  if (p.services) added += addFact(userId, { topic: 'services products menu', fact: `We offer ${p.services}.`, source: 'profile' }) ? 1 : 0;
  if (p.address) added += addFact(userId, { topic: 'address location where', fact: `You can find us at ${p.address}.`, source: 'profile' }) ? 1 : 0;
  for (const f of faqs || []) {
    if (f.q && f.a) added += addFact(userId, { topic: f.q, fact: f.a, source: 'faq' }) ? 1 : 0;
  }
  return added;
}

export function kbStats(userId) {
  const n = node(userId);
  return {
    facts: n.facts.length,
    gaps: n.gaps.length,
    topGaps: [...n.gaps].sort((a, b) => b.count - a.count).slice(0, 5),
    recent: n.facts.slice(0, 8).map((f) => ({ id: f.id, topic: f.topic, fact: f.fact, source: f.source, uses: f.uses })),
    sources: [...new Set(n.facts.map((f) => f.source.startsWith('http') ? 'website' : f.source))],
  };
}

export function removeAllForUser(userId) {
  if (db.users[userId]) { delete db.users[userId]; save(); }
}
