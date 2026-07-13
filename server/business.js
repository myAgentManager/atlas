// The Business Brain — everything the agent needs to run a business's front
// desk: a profile it learns, an FAQ it answers from, a CRM of customers, a
// bookings ledger, and a unified inbox of customer conversations across email /
// web chat / SMS. All per-account, all persisted. From-scratch reply drafting
// (FAQ retrieval + templated professional tone) — no external LLM.
import { randomUUID } from 'node:crypto';
import { getDoc, saveDoc } from './db.js';
import { bus } from './bus.js';
import { tokenize } from './atlas/nlu.js';
import { newVoice, contract, pick, rephrase } from './atlas/voice.js';
import * as kb from './atlas/kb.js';
import { archetype, detectArchetype } from './atlas/archetypes.js';

let db = getDoc('business', { biz: {} }); // biz[userId] = { profile, faqs, customers, bookings, inbox }
const save = () => saveDoc('business', db);

function biz(userId) {
  db.biz[userId] ||= {
    profile: {
      name: '', tagline: '', about: '', hours: '', services: '', tone: 'friendly', languages: 'English',
      phone: '', email: '', website: '', address: '', routeTo: '', escalateOn: '', trained: false,
      type: '', typeDetected: '', // what KIND of business this is (owner pick / Atlas's own read)
    },
    faqs: [],
    customers: [],
    bookings: [],
    inbox: [],
    seenEmails: [],
  };
  const b = db.biz[userId];
  b.seenEmails ||= [];
  return b;
}

export const getBusiness = (userId) => biz(userId);
export function setProfile(userId, patch) {
  const b = biz(userId);
  const before = b.profile.type || b.profile.typeDetected || '';
  b.profile = { ...b.profile, ...patch, trained: true };
  const p = b.profile;
  // Atlas works out what KIND of business this is from its own words; the
  // owner's explicit pick (p.type) always wins over the guess.
  p.typeDetected = detectArchetype(`${p.name} ${p.tagline}`, `${p.about} ${p.services}`) || p.typeDetected || '';
  const effective = p.type || p.typeDetected || '';
  if (effective && effective !== before) kb.seedArchetype(userId, archetype(effective));
  save();
  return p;
}

// --- FAQ --------------------------------------------------------------------
export function setFaqs(userId, faqs) {
  biz(userId).faqs = (faqs || []).filter((f) => f.q?.trim()).map((f) => ({ q: f.q.trim(), a: (f.a || '').trim() })).slice(0, 100);
  save();
  return biz(userId).faqs;
}
function bestFaq(userId, text) {
  const q = new Set(tokenize(text));
  if (!q.size) return null;
  let best = null, score = 0;
  for (const f of biz(userId).faqs) {
    // match against the QUESTION first — a short customer message shouldn't be
    // diluted by a long answer's word count
    const fq = tokenize(f.q);
    const fa = tokenize(f.q + ' ' + f.a);
    const qScore = fq.filter((w) => q.has(w)).length / Math.max(2, fq.length);
    const aScore = fa.filter((w) => q.has(w)).length / Math.max(4, fa.length);
    const overlap = Math.max(qScore, aScore);
    if (overlap > score) { score = overlap; best = f; }
  }
  return score >= 0.18 ? best : null;
}

// --- customers (CRM) --------------------------------------------------------
export function upsertCustomer(userId, { name, email, phone }) {
  const b = biz(userId);
  const key = (email || phone || name || '').toLowerCase();
  let c = b.customers.find((x) => (x.email || x.phone || x.name || '').toLowerCase() === key);
  if (!c) { c = { id: randomUUID().slice(0, 8), name: name || 'Guest', email: email || '', phone: phone || '', tags: [], notes: '', createdAt: Date.now() }; b.customers.unshift(c); }
  else Object.assign(c, { name: name || c.name, email: email || c.email, phone: phone || c.phone });
  c.lastSeen = Date.now();
  save();
  return c;
}
export const listCustomers = (userId) => biz(userId).customers;

// --- bookings ---------------------------------------------------------------
export function addBooking(userId, { customer, service, when, notes }) {
  const b = biz(userId);
  const bk = { id: randomUUID().slice(0, 8), customer: customer || 'Guest', service: service || 'Appointment', when: when || '', notes: notes || '', status: 'confirmed', createdAt: Date.now() };
  b.bookings.unshift(bk);
  save();
  bus.emit('biz', { userId, kind: 'booking', booking: bk });
  return bk;
}
export const listBookings = (userId) => biz(userId).bookings;

// --- inbox (conversations) --------------------------------------------------
export function openConversation(userId, { channel, customer, subject, agentId, customerEmail }) {
  const b = biz(userId);
  const convo = { id: randomUUID().slice(0, 8), channel: channel || 'chat', agentId: agentId || null, customer: customer || 'Guest', customerEmail: customerEmail || '', subject: subject || '(no subject)', messages: [], status: 'open', createdAt: Date.now(), updatedAt: Date.now() };
  b.inbox.unshift(convo);
  if (b.inbox.length > 300) b.inbox.length = 300;
  save();
  return convo;
}
export const listConversationsForAgent = (userId, agentId) => biz(userId).inbox.filter((c) => c.agentId === agentId);

// Email de-dup so the poller never answers the same message twice.
export function emailKey(m) {
  return `${(m.from || '').slice(0, 40)}|${(m.subject || '').slice(0, 60)}|${(m.date || '').slice(0, 24)}`;
}
export function seenEmail(userId, key) { return biz(userId).seenEmails.includes(key); }
export function markEmail(userId, key) {
  const b = biz(userId);
  b.seenEmails.push(key);
  if (b.seenEmails.length > 500) b.seenEmails.splice(0, b.seenEmails.length - 500);
  save();
}

// CRM detail: a customer plus their conversation history.
export function customerDetail(userId, id) {
  const b = biz(userId);
  const c = b.customers.find((x) => x.id === id);
  if (!c) return null;
  const convos = b.inbox.filter((v) => (v.customerEmail && v.customerEmail === c.email) || v.customer === c.name);
  return { ...c, conversations: convos.map((v) => ({ id: v.id, channel: v.channel, subject: v.subject, updatedAt: v.updatedAt, messages: v.messages.length })) };
}
export function getConversation(userId, id) {
  return biz(userId).inbox.find((c) => c.id === id) || null;
}
export function addMessage(userId, convoId, from, text) {
  const c = getConversation(userId, convoId);
  if (!c) return null;
  const msg = { id: randomUUID().slice(0, 8), from, text, ts: Date.now() };
  c.messages.push(msg);
  c.updatedAt = msg.ts;
  if (from === 'customer') c.status = 'open';
  save();
  bus.emit('biz', { userId, kind: 'message', convoId, msg });
  return msg;
}
export const listInbox = (userId) => biz(userId).inbox;

// --- the agent's front-desk mind ---------------------------------------------
// respond() is how an agent actually thinks about a customer message:
//   1. pull apart what they're asking (can be several things at once)
//   2. answer each part from what it KNOWS — profile, FAQ, the knowledge DB
//   3. say it in its own words (voice engine), greeting only on first contact
//   4. log what it couldn't answer as a knowledge gap, so it studies up
// Returns thinkMs so the UI can pace the reply like someone actually typing.
export function respond(userId, text, { greeted = false, channel = 'chat', can = { booking: true, sales: true }, history = [] } = {}) {
  const b = biz(userId);
  const p = b.profile;
  const r = newVoice(text + Date.now());
  const low = String(text).toLowerCase();
  const parts = [];
  const intents = new Set();

  // -- conversational reflexes: not every message is a question ----------------
  // "thanks!" isn't a knowledge gap — it's a person being nice. Answer like one.
  const bare = low.replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
  const quick = (t) => ({ text: contract(t), intent: 'general', needsHuman: false, routeTo: '', thinkMs: Math.max(500, 300 + t.length * 6) });
  if (/^(thanks|thank you|thank u|thx|ty|perfect|awesome|great|amazing|cool|sounds good|ok|okay|got it)( so much| a lot| you)?$/.test(bare)) {
    return quick(pick(r, [
      'Anytime! Give us a shout if anything else comes up.',
      "You're welcome — happy to help.",
      'Of course! Anything else, just ask.',
    ]));
  }
  if (/^(hi|hii|hey|heyy|hello|yo|howdy|good morning|good afternoon|good evening|what's up|whats up|sup)( there)?$/.test(bare)) {
    return quick(greeted
      ? pick(r, ['Hey again! What else can I do for you?', 'Still here — what can I help with?'])
      : pick(r, [
          p.name ? `Hey! Welcome to ${p.name} — what can I do for you?` : 'Hey! What can I do for you?',
          'Hi there! How can I help today?',
        ]));
  }
  if (/^(bye|goodbye|bye bye|see ya|see you|later|take care|have a good (day|night|one))$/.test(bare)) {
    return quick(pick(r, ['Take care! Come see us soon.', 'Bye for now — reach out anytime.', 'Have a good one!']));
  }

  // What kind of business is this, and what is the customer actually asking?
  // Atlas reads intent through the archetype: "can I come in Friday?" is a
  // visit at a walk-in café, an appointment at a salon, a table at a restaurant.
  const arch = archetype(p.type || p.typeDetected);
  const day = (low.match(/\b(today|tonight|tomorrow|this weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/) || [])[1] || '';
  const Day = /^(mon|tue|wed|thu|fri|sat|sun)/.test(day) ? day[0].toUpperCase() + day.slice(1) : day;
  const explicitBook = /\b(book|appointment|schedule|reserve|reservation|availability|slot)\b/i.test(text);
  const wantsVisit = /\b(come (in|by|over)|stop by|swing by|drop (by|in)|walk in|visit)\b/i.test(text) || (/\bopen\b/.test(low) && Boolean(day));
  const wantsOrder = /\b(order|buy|purchase|price|pricing|cost|how much|quote)\b/i.test(text);
  const noun = arch.bookNoun;
  const nounPhrase = (/^[aeiou]/.test(noun) ? 'an ' : 'a ') + noun;

  // -- direct knowledge: answer the specific things they asked ---------------
  let saidHours = false;
  if (/\b(hours?|open|close[sd]?|closing|opening|what time)\b/.test(low) && p.hours) {
    parts.push(pick(r, [`we're open ${p.hours}`, `hours are ${p.hours}`, `you can catch us ${p.hours}`]));
    intents.add('faq');
    saidHours = true;
  }
  if (/\b(where|address|located|location|directions|find you)\b/.test(low) && p.address) {
    parts.push(pick(r, [`we're at ${p.address}`, `you'll find us at ${p.address}`, `${p.address} — easy to spot`]));
    intents.add('faq');
  }
  if (/\b(phone|call you|number)\b/.test(low) && p.phone) {
    parts.push(pick(r, [`best number to reach us is ${p.phone}`, `you can call ${p.phone}`]));
    intents.add('faq');
  }
  if (/\b(menu|services?|offer|what do you (do|sell|have)|products?)\b/.test(low) && p.services) {
    parts.push(pick(r, [`we do ${p.services}`, `on offer: ${p.services}`, `our lineup is ${p.services}`]));
    intents.add('faq');
  }

  // Conversation memory: what we've already told this customer — both earlier
  // in this reply AND in previous messages of the conversation. Anything that
  // restates it (same idea, any words) gets skipped, so no more reciting the
  // hours every single message.
  const priorTokens = new Set((history || []).slice(-6).flatMap((t) => tokenize(String(t))).filter((w) => w.length > 3));
  const said = () => new Set(parts.flatMap((x) => tokenize(x)));
  const restates = (candidate) => {
    const ct = tokenize(candidate).filter((w) => w.length > 3);
    if (!ct.length) return false;
    const have = said();
    const nowScore = ct.filter((w) => have.has(w)).length / ct.length;
    const beforeScore = ct.filter((w) => priorTokens.has(w)).length / ct.length;
    return nowScore >= 0.6 || beforeScore >= 0.6;
  };
  const saidEarlier = (s) => {
    const ht = tokenize(String(s || '')).filter((w) => w.length > 1);
    return ht.length > 0 && ht.filter((w) => priorTokens.has(w)).length / ht.length >= 0.7;
  };

  // -- the FAQ + knowledge database (what Atlas has learned) ------------------
  // Facts get said in Atlas's own words — copied, rephrased, then given.
  const stem = (w) => w.replace(/(ing|ers?|es|ed|s)$/, '');
  const faq = bestFaq(userId, text);
  let faqStems = null;
  if (faq?.a && !restates(faq.a)) {
    const ans = rephrase(r, faq.a);
    // no "so, Yes," pile-ups — skip the opener when the answer already has one
    const pre = /^(yes|yep|sure|absolutely|for sure|of course)/i.test(ans) ? '' : pick(r, ['', 'good question — ', 'so, ']);
    parts.push(pre + ans);
    intents.add('faq');
    faqStems = new Set(tokenize(faq.q + ' ' + faq.a).map(stem));
  }
  for (const f of kb.search(userId, text, 2)) {
    // the intent branches below answer visit/booking themselves — don't let a
    // knowledge fact say the same thing a second time in different words
    if ((explicitBook || wantsVisit) && /\b(book|booking|reservation|appointment|walk in|visit|class)\b/i.test(f.topic)) continue;
    // the FAQ already covered this topic → one answer is enough
    if (faqStems && tokenize(f.topic).map(stem).filter((w) => faqStems.has(w)).length > 0) continue;
    if (!restates(f.fact)) { parts.push(rephrase(r, f.fact)); intents.add('faq'); }
  }

  // -- action intents: answer them the way THIS business would -----------------
  if ((explicitBook || wantsVisit) && !arch.bookable) {
    // walk-in business: nothing to book — just come on by
    const hoursNote = p.hours && !saidHours && !saidEarlier(`open hours ${p.hours}`);
    const line = pick(r, [
      `no booking needed — we're walk-in, just ${Day ? `swing by ${Day}` : 'swing by'}${hoursNote ? ` (we're open ${p.hours})` : ''}`,
      `${Day ? `${Day} works — ` : ''}just come on by, no appointment needed${hoursNote ? `. We're open ${p.hours}` : ''}`,
    ]);
    if (!restates(line)) parts.push(line);
    intents.add('faq');
  } else if ((explicitBook || wantsVisit) && can.booking === false) {
    parts.push(`I've noted your request and someone from the team will follow up to get you scheduled.`);
  } else if (explicitBook) {
    const ask = noun === 'table' ? 'what date, time, and party size?'
      : noun === 'room' ? 'what dates, and how many guests?'
      : noun === 'class' ? 'which class, and what day?'
      : 'what day and time work for you?';
    parts.push(pick(r, [
      `happy to get your ${noun} set${Day ? ` for ${Day}` : ''} — ${ask}`,
      `I can ${noun === 'table' ? 'hold a table' : `book ${nounPhrase}`} for you${Day ? ` ${Day}` : ''}. ${ask.charAt(0).toUpperCase() + ask.slice(1)}`,
      `let's get you ${noun === 'table' || noun === 'room' ? nounPhrase : 'booked in'}${Day ? ` for ${Day}` : ''} — ${ask}`,
    ]));
    intents.add('booking');
  } else if (wantsVisit) {
    // visit phrasing at a bookable business → offer to set it up, don't presume
    parts.push(pick(r, [
      `we're ${arch.visit}-based — want me to set up ${nounPhrase}${Day ? ` for ${Day}` : ''}?`,
      `I can get ${nounPhrase} on the books${Day ? ` for ${Day}` : ''} if you'd like — just say the word.`,
    ]));
    intents.add('booking');
  } else if (wantsOrder && can.sales !== false) {
    parts.push(pick(r, [
      `I can help with that — tell me a little more about what you're after and I'll get you exact details${p.services ? ` (we do ${p.services})` : ''}.`,
      `sure — what exactly are you looking for? I'll pull together the details and pricing.`,
    ]));
    intents.add('sales');
  }

  // -- nothing matched: be honest, ask a sharp follow-up, and file the gap ----
  if (!parts.length) {
    kb.logGap(userId, text);
    parts.push(pick(r, [
      `good question — I don't want to guess and get it wrong. Can you give me a little more detail so I get you the right answer?`,
      `let me make sure I get this right: can you tell me a bit more about what you need?`,
      `honestly, that one's outside what I know so far — I've flagged it for the team. Anything else I can sort out right now?`,
    ]));
  }

  // -- escalation ---------------------------------------------------------------
  const escalateWords = (p.escalateOn || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
  const upset = /\b(angry|terrible|refund|complaint|awful|worst|cancel|disappointed|broken)\b/i.test(text)
    || escalateWords.some((w) => low.includes(w));
  if (upset) {
    parts.push(pick(r, [
      `I'm looping in a real person on our team to make sure this gets handled properly.`,
      `this deserves a human — I've flagged it to the team and someone will follow up soon.`,
    ]));
  }

  // -- assembly: answer first, greeting only on first contact -----------------
  const opener = greeted ? '' : pick(r, ['Hi! ', 'Hey! ', 'Hey there — ', '']);
  let body = '';
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  parts.forEach((part, i) => {
    if (i === 0) { body = cap(part); return; }
    // vary how the next thought connects — people don't just stack sentences
    const join = pick(r, ['', '', 'also — ', 'and ', 'oh, and ']);
    const tail = join && !/^I\b/.test(part) ? part.charAt(0).toLowerCase() + part.slice(1) : part;
    body += (/[.!?]$/.test(body) ? ' ' : '. ') + cap(join ? join + tail : part);
  });
  if (!/[.!?]$/.test(body)) body += '.';

  // signature only on email (or a first chat touch from a named business)
  const contactLine = [p.phone && `Call: ${p.phone}`, p.website].filter(Boolean).join(' · ');
  const sign = channel === 'email'
    ? `\n\n— ${p.name || 'the team'}${p.hours ? `\nHours: ${p.hours}` : ''}${contactLine ? `\n${contactLine}` : ''}`
    : '';

  const out = contract(opener + body + sign);
  const intent = intents.has('booking') ? 'booking' : intents.has('sales') ? 'sales' : intents.has('faq') ? 'faq' : 'general';
  // pace like a person: read time + typing time, capped
  const thinkMs = Math.min(3200, Math.max(700, 350 + text.length * 9 + out.length * 4));

  return { text: out, intent, needsHuman: upset, routeTo: upset ? (p.routeTo || '') : '', thinkMs };
}

// Back-compat wrapper — older callers (email loop, incoming route) use this.
export function draftReply(userId, text, opts = {}) {
  return respond(userId, text, opts);
}

export function bizStats(userId) {
  const b = biz(userId);
  const open = b.inbox.filter((c) => c.status === 'open').length;
  return {
    customers: b.customers.length,
    bookings: b.bookings.length,
    conversations: b.inbox.length,
    open,
    faqs: b.faqs.length,
    trained: b.profile.trained,
    // simple weekly trend of conversation volume (last 7 days)
    trend: [...Array(7)].map((_, i) => {
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0); dayStart.setDate(dayStart.getDate() - (6 - i));
      const dayEnd = dayStart.getTime() + 864e5;
      return b.inbox.filter((c) => c.createdAt >= dayStart.getTime() && c.createdAt < dayEnd).length;
    }),
  };
}
export function removeAllForUser(userId) { if (db.biz[userId]) { delete db.biz[userId]; save(); } }
