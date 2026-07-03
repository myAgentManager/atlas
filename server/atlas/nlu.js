// ATLAS Core — natural-language understanding, from scratch.
// A multinomial naive-Bayes intent classifier trained on a seed corpus at boot,
// plus a rule-based entity extractor. No external AI anywhere.

const STOP = new Set(('a an the and or but if then else for to of in on at by with from as is are was were be been ' +
  'am do does did done can could should would will wont dont cant not no yes it its this that these those i you he ' +
  'she we they me my your our their his her them us so just very really please also about into over under out up ' +
  'down again more most some any each such own same than too there here when where why how what which who whom').split(' '));

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
}

// For intent classification we keep question words ("what can you do" is all
// stopwords!) and only drop pure glue.
const GLUE = new Set('a an the and or but to of in on at is are was were be am so very really please'.split(' '));
function tokenizeIntent(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !GLUE.has(w));
}

// --- seed corpus: intent -> example utterances --------------------------------
const CORPUS = {
  build_website: [
    'build me a website', 'make a site for my band', 'create a landing page',
    'build a one page website overnight', 'i need a webpage for my shop',
    'make me a portfolio site', 'design a homepage for my business',
    'create a web page with a signup form', 'build a site with tour dates',
    'improve the website', 'refine the site with this feedback',
    'update the landing page', 'change the homepage hero', 'make the website more professional',
  ],
  research: [
    'research the best suppliers', 'find information about solar panels',
    'look up reviews for standing desks', 'search the web for news about space',
    'investigate competitors in my area', 'compare prices for laptops',
    'find out what people say about this product', 'gather sources on this topic',
    'browse the web and report on ai trends',
  ],
  write_doc: [
    'write a blog post about coffee', 'draft an essay on climate',
    'write me a business plan', 'compose an article about hiking',
    'draft a proposal for the client',
    'create a guide for beginners', 'write documentation for my project',
  ],
  write_story: [
    'write a story about a robot', 'write me a novel', 'write a 200 page story',
    'write fiction about a lost city', 'compose a short story', 'write a book about dragons',
    'novel about a detective in space', 'write a long story with chapters',
  ],
  summarize_files: [
    'summarize the files in my workspace', 'summarize my notes',
    'give me a summary of what is in the workspace', 'condense these documents',
    'tldr my files', 'review my workspace and summarize it',
  ],
  organize: [
    'organize my workspace', 'clean up my files', 'tidy the workspace folder',
    'sort my documents into folders', 'make an inventory of my files',
  ],
  status_chat: [
    'how is the task going', 'what are you working on', 'did you finish',
    'what did you do today', 'give me a status update', 'progress report',
    'how did it go', 'are you done yet', 'whats your status',
  ],
  capability_chat: [
    'what can you do', 'help', 'what are your features', 'how do you work',
    'what tasks can i give you', 'what are you capable of', 'who are you',
    'tell me about yourself', 'what is atlas',
  ],
  greeting_chat: [
    'hello', 'hi atlas', 'hey there', 'good morning', 'good evening',
    'whats up', 'yo', 'hey how are you',
  ],
};

// --- naive bayes ---------------------------------------------------------------
const model = { intents: [], prior: {}, counts: {}, totals: {}, vocab: new Set() };

function train() {
  let totalDocs = 0;
  for (const [intent, docs] of Object.entries(CORPUS)) {
    model.intents.push(intent);
    model.counts[intent] = {};
    model.totals[intent] = 0;
    model.prior[intent] = docs.length;
    totalDocs += docs.length;
    for (const doc of docs) {
      for (const w of tokenizeIntent(doc)) {
        model.counts[intent][w] = (model.counts[intent][w] || 0) + 1;
        model.totals[intent] += 1;
        model.vocab.add(w);
      }
    }
  }
  for (const intent of model.intents) model.prior[intent] = Math.log(model.prior[intent] / totalDocs);
}
train();

export function classify(text) {
  const words = tokenizeIntent(text);
  const V = model.vocab.size;
  let best = { intent: 'generic_task', score: -Infinity, margin: 0 };
  const scores = [];
  for (const intent of model.intents) {
    let s = model.prior[intent];
    for (const w of words) {
      s += Math.log(((model.counts[intent][w] || 0) + 1) / (model.totals[intent] + V));
    }
    scores.push({ intent, s });
    if (s > best.score) best = { intent, score: s };
  }
  scores.sort((a, b) => b.s - a.s);
  const margin = scores.length > 1 ? scores[0].s - scores[1].s : 1;
  // Low-confidence utterances fall through to generic handling.
  if (words.length === 0) return { intent: 'greeting_chat', confidence: 0.3 };
  const confidence = Math.min(1, margin / 3 + 0.35);
  return { intent: margin < 0.15 ? 'generic_task' : best.intent, confidence };
}

// --- entity extraction -----------------------------------------------------------
export function extractEntities(text) {
  const src = String(text || '');
  const ent = { topic: null, urls: [], deadline: null, wantsSignup: false, wantsDates: false, tone: 'bold' };

  ent.urls = (src.match(/https?:\/\/[^\s)]+/g) || []).slice(0, 5);

  // topic: "for my band, The Night Shift" / "about X" / "called X" / quoted
  const quoted = src.match(/["“']([^"”']{2,48})["”']/);
  const called = src.match(/(?:called|named|titled)\s+([A-Z][\w'&-]*(?:\s+[A-Z][\w'&-]*){0,4})/);
  const forMy = src.match(/(?:for|about)\s+(?:my|our|a|an|the)?\s*([\w'&-]+(?:\s+[\w'&-]+){0,4}?)(?=[,.;!?]|\s+(?:with|that|which|overnight|by|before|tonight)\b|$)/i);
  // "my coffee shop, Luna Beans" — the appositive name after the comma wins
  const cap = src.match(/(?:my|our)\s+[\w' -]{2,28}?,\s+([A-Z][\w'&-]*(?:\s+[A-Z][\w'&-]*){0,3})/);
  ent.topic = (quoted?.[1] || called?.[1] || cap?.[1] || forMy?.[1] || '').trim() || null;
  if (ent.topic) ent.topic = ent.topic.replace(/\s+/g, ' ').slice(0, 48);

  if (/sign\s*-?up|newsletter|mailing\s*list|subscribe|contact form/i.test(src)) ent.wantsSignup = true;
  if (/tour|dates|schedule|events?|shows?|calendar/i.test(src)) ent.wantsDates = true;
  if (/overnight|tonight|by (?:the )?morning|by \d{1,2}\s*(?:am|pm)|tomorrow/i.test(src)) ent.deadline = 'overnight';
  const pages = src.match(/(\d{1,4})\s*[- ]?page/i);
  if (pages) ent.pages = Math.min(1000, Number(pages[1]));
  if (/calm|minimal|clean|elegant|soft/i.test(src)) { ent.tone = 'calm'; ent.toneExplicit = true; }
  if (/warm|cozy|friendly|rustic/i.test(src)) { ent.tone = 'warm'; ent.toneExplicit = true; }
  if (/bold|loud|edgy|punchy|aggressive/i.test(src)) { ent.tone = 'bold'; ent.toneExplicit = true; }

  return ent;
}

// Deterministic guards: unmistakable keywords beat the classifier, so a
// website brief can never fall through to the document writer again.
const FORCE_INTENT = [
  [/\b(web\s?site|webpage|web page|landing page|homepage|one[- ]?page site|site for)\b/i, 'build_website'],
  [/\b(story|novel|fiction|chapters?|screenplay)\b/i, 'write_story'],
  [/\b(research|cited report|sources|look up|find out about)\b/i, 'research'],
];

export function understand(text) {
  let { intent, confidence } = classify(text);
  for (const [re, forced] of FORCE_INTENT) {
    if (re.test(String(text || ''))) { intent = forced; confidence = Math.max(confidence, 0.9); break; }
  }
  return { intent, confidence, entities: extractEntities(text), raw: String(text || '') };
}

export const intentCount = () => model.intents.length;
export const vocabSize = () => model.vocab.size;

// --- self-generated titles --------------------------------------------------
// ATLAS names its own tasks from what it understood — never a raw slice of the
// operator's words.
const titleCase = (s) => String(s).replace(/\b\w/g, (c) => c.toUpperCase()).trim();
// Local keyword pick (no cross-module import — nlu stays standalone).
function topWords(text, k = 3) {
  const tf = new Map();
  for (const w of tokenize(text)) if (w.length > 2) tf.set(w, (tf.get(w) || 0) + 1);
  return [...tf.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([w]) => w);
}
export function titleFor(u) {
  const t = u.entities.topic;
  const words = topWords(u.raw, 3).map(titleCase).join(' ');
  switch (u.intent) {
    case 'build_website': return t ? `${titleCase(t)} — Website` : 'New Website';
    case 'write_story': return t ? `${titleCase(t)} — Story` : 'New Story';
    case 'write_doc': return t ? `${titleCase(t)} — Document` : (words ? `${words} — Notes` : 'New Document');
    case 'research': {
      const q = (t || u.raw.replace(/^(research|find|look up|investigate|search( the web)?( for)?)\s*/i, '')).trim();
      return `Research: ${titleCase(q).slice(0, 40) || 'the web'}`;
    }
    case 'summarize_files': return 'Workspace Digest';
    case 'organize': return 'Workspace Organization';
    default: return t ? titleCase(t) : (words ? `${words} — Task` : 'New Task');
  }
}

// --- clarifying questions ---------------------------------------------------
// Before doing work, ATLAS checks whether the brief is ambiguous the way a
// good assistant would — and asks ONE sharp question instead of guessing.
const BRANDS = /\b(iphone|ipad|macbook|apple|tesla|nike|adidas|google|android|samsung|galaxy|playstation|xbox|nintendo|netflix|spotify|amazon|starbucks|disney)\b/i;

// Returns { question, options } — options render as one-tap answer buttons
// (plus the free-text bar) in the task feed, Claude-style.
export function needsClarification(u) {
  const src = u.raw || '';
  const brand = src.match(BRANDS);

  // "make a website for the new iPhone release" — theirs, or the brand's?
  if (brand && /\b(release|launch|announcement|drop|event|review)\b/i.test(src)) {
    const b = brand[0][0].toUpperCase() + brand[0].slice(1);
    return {
      question: `Quick check before I start: when you say “${brand[0]}”, do you mean the actual ${b} release — or your own project that shares the name?`,
      options: [`The real ${b} — research the actual thing`, `My own project called “${b}”`],
    };
  }
  // A website with no discernible subject.
  if (u.intent === 'build_website' && !u.entities.topic) {
    return {
      question: `Happy to build this — I just need the subject. What's the site for, and is there a name I should put on it?`,
      options: ['A business', 'A band or artist', 'A product', 'A personal site'],
    };
  }
  // A story with no subject at all.
  if (u.intent === 'write_story' && !u.entities.topic && u.raw.split(/\s+/).length < 6) {
    return {
      question: `I'll write it — give me the seed first: what's it about, and what mood?`,
      options: ['Mystery', 'Sci-fi', 'Cozy & warm', 'Dark & moody'],
    };
  }
  return null;
}
