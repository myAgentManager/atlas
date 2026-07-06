// ATLAS self-study — how the engine grows on its own. Curiosity topics get
// researched from the live web; ATLAS extracts salient sentences + keywords,
// folds new words into its vocabulary, and files durable "lessons" it can
// recall later. Everything persists across restarts via the db layer.
import { getDoc, saveDoc } from '../db.js';
import { summarize, keywords, splitSentences } from './knowledge.js';
import { learnWords } from './nlu.js';

let brain = getDoc('atlas-brain', {
  lessons: [],           // { id, topic, gist, keywords, source, at }
  learnedWords: [],      // vocabulary discovered from reading
  queue: [               // seed curiosity — the platform's own domain
    'personal AI agents', 'static website design patterns',
    'productivity workflows', 'small business websites', 'note taking methods',
  ],
  studied: [],           // topics already covered
  stats: { sessions: 0, lessons: 0, words: 0, lastAt: null },
});

const save = () => saveDoc('atlas-brain', brain);
// Re-seed vocabulary learned in past runs so it survives a restart.
if (brain.learnedWords?.length) learnWords(brain.learnedWords);

export function brainStats() {
  return {
    lessons: brain.lessons.length,
    learnedWords: brain.learnedWords.length,
    queued: brain.queue.length,
    sessions: brain.stats.sessions,
    lastStudied: brain.stats.lastAt,
    recent: brain.lessons.slice(-5).reverse().map((l) => ({ topic: l.topic, at: l.at })),
  };
}

// Operator can point ATLAS at something to go learn.
export function enqueueTopic(topic) {
  const t = String(topic || '').trim();
  if (!t) return false;
  if (!brain.queue.includes(t) && !brain.studied.includes(t)) {
    brain.queue.push(t);
    save();
  }
  return true;
}

// Recall lessons relevant to a query — used to enrich real task output.
export function recall(query, k = 3) {
  const q = new Set(keywords(query, 8));
  return brain.lessons
    .map((l) => ({ l, score: (l.keywords || []).filter((w) => q.has(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.l);
}

// One study session: take a topic, read the web, extract a lesson, grow vocab.
// `tools` is a forUser()-style toolset (webSearch + fetchPage). `log` is optional.
export async function study(tools, log = () => {}) {
  const topic = brain.queue.shift();
  if (!topic) { log('Nothing queued to study right now.'); return null; }

  log(`Studying: “${topic}”`);
  let results = [];
  try { results = await tools.webSearch(topic); } catch (e) { log(`Search failed: ${e.message}`); }
  if (!results.length) {
    // Couldn't reach the web — put it back and bail gracefully.
    brain.queue.push(topic); save();
    return null;
  }

  let text = '';
  const source = results[0];
  try { text = await tools.fetchPage(source.url); }
  catch (e) { log(`Couldn't read ${source.url} (${e.message})`); brain.queue.push(topic); save(); return null; }

  const gist = summarize(text, 3);
  const kw = keywords(text, 12);
  const fresh = learnWords(kw); // returns only genuinely new words

  const lesson = {
    id: 'L' + Date.now().toString(36),
    topic, gist: gist || '(little extractable text)',
    keywords: kw, source: source.url, at: Date.now(),
  };
  brain.lessons.push(lesson);
  if (brain.lessons.length > 500) brain.lessons.splice(0, brain.lessons.length - 500);
  for (const w of fresh) if (!brain.learnedWords.includes(w)) brain.learnedWords.push(w);
  brain.studied.push(topic);

  // Curiosity compounds: spin follow-up topics off what it just learned.
  for (const w of kw.slice(0, 2)) {
    const follow = `${w} ${topic.split(' ').slice(-1)[0]}`;
    if (!brain.studied.includes(follow) && !brain.queue.includes(follow) && brain.queue.length < 40) {
      brain.queue.push(follow);
    }
  }

  brain.stats.sessions++;
  brain.stats.lessons = brain.lessons.length;
  brain.stats.words = brain.learnedWords.length;
  brain.stats.lastAt = Date.now();
  save();

  log(`Learned ${fresh.length} new words from ${new URL(source.url).hostname}. Vocabulary now ${brain.learnedWords.length} learned terms.`);
  return lesson;
}
