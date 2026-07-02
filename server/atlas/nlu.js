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
    'draft a proposal for the client', 'write a story about a robot',
    'create a guide for beginners', 'write documentation for my project',
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
  if (/calm|minimal|clean|elegant|soft/i.test(src)) { ent.tone = 'calm'; ent.toneExplicit = true; }
  if (/warm|cozy|friendly|rustic/i.test(src)) { ent.tone = 'warm'; ent.toneExplicit = true; }
  if (/bold|loud|edgy|punchy|aggressive/i.test(src)) { ent.tone = 'bold'; ent.toneExplicit = true; }

  return ent;
}

export function understand(text) {
  const { intent, confidence } = classify(text);
  return { intent, confidence, entities: extractEntities(text), raw: String(text || '') };
}

export const intentCount = () => model.intents.length;
export const vocabSize = () => model.vocab.size;
