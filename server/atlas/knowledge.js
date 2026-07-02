// ATLAS Core — knowledge & summarization, from scratch.
// TF-IDF sentence scoring for extractive summaries, and a small in-memory
// document index with cosine similarity for retrieval. No embeddings API —
// the math is right here.
import { tokenize } from './nlu.js';

export function splitSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25 && s.length < 500);
}

// Extractive summary: score sentences by TF-IDF, keep the best, restore order.
export function summarize(text, maxSentences = 5) {
  const sentences = splitSentences(text);
  if (sentences.length <= maxSentences) return sentences.join(' ');

  const docs = sentences.map(tokenize);
  const df = new Map();
  for (const doc of docs) for (const w of new Set(doc)) df.set(w, (df.get(w) || 0) + 1);
  const N = docs.length;

  const scored = docs.map((doc, i) => {
    if (!doc.length) return { i, score: 0 };
    const tf = new Map();
    for (const w of doc) tf.set(w, (tf.get(w) || 0) + 1);
    let score = 0;
    for (const [w, f] of tf) score += (f / doc.length) * Math.log(N / (df.get(w) || 1));
    // Slight boost for early sentences (lede bias), penalty for very long ones.
    score *= 1 + 0.3 / (1 + i * 0.5);
    score /= Math.pow(doc.length, 0.15);
    return { i, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.i - b.i)
    .map(({ i }) => sentences[i])
    .join(' ');
}

// Top keywords of a text by TF-IDF against a generic frequency prior.
export function keywords(text, k = 8) {
  const words = tokenize(text);
  const tf = new Map();
  for (const w of words) tf.set(w, (tf.get(w) || 0) + 1);
  return [...tf.entries()]
    .filter(([w]) => w.length > 2)
    .sort((a, b) => b[1] * Math.log(3 + b[0].length) - a[1] * Math.log(3 + a[0].length))
    .slice(0, k)
    .map(([w]) => w);
}

// --- retrieval index ------------------------------------------------------------
export class Index {
  constructor() { this.docs = []; }
  add(id, text, meta = {}) {
    const tokens = tokenize(text);
    const tf = new Map();
    for (const w of tokens) tf.set(w, (tf.get(w) || 0) + 1);
    this.docs.push({ id, text: String(text).slice(0, 4000), tf, len: tokens.length || 1, meta });
    if (this.docs.length > 400) this.docs.shift();
  }
  search(query, k = 3) {
    const q = tokenize(query);
    if (!q.length || !this.docs.length) return [];
    const df = new Map();
    for (const d of this.docs) for (const w of new Set(d.tf.keys())) df.set(w, (df.get(w) || 0) + 1);
    const N = this.docs.length;
    return this.docs
      .map((d) => {
        let s = 0;
        for (const w of q) if (d.tf.has(w)) s += (d.tf.get(w) / d.len) * Math.log(1 + N / (df.get(w) || 1));
        return { doc: d, s };
      })
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, k)
      .map((r) => ({ id: r.doc.id, text: r.doc.text, meta: r.doc.meta, score: r.s }));
  }
  get size() { return this.docs.length; }
}
