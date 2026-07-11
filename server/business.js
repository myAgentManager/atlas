// The Business Brain — everything the agent needs to run a business's front
// desk: a profile it learns, an FAQ it answers from, a CRM of customers, a
// bookings ledger, and a unified inbox of customer conversations across email /
// web chat / SMS. All per-account, all persisted. From-scratch reply drafting
// (FAQ retrieval + templated professional tone) — no external LLM.
import { randomUUID } from 'node:crypto';
import { getDoc, saveDoc } from './db.js';
import { bus } from './bus.js';
import { tokenize } from './atlas/nlu.js';
import { newVoice, contract, pick } from './atlas/voice.js';
import * as kb from './atlas/kb.js';

let db = getDoc('business', { biz: {} }); // biz[userId] = { profile, faqs, customers, bookings, inbox }
const save = () => saveDoc('business', db);

function biz(userId) {
  db.biz[userId] ||= {
    profile: {
      name: '', tagline: '', about: '', hours: '', services: '', tone: 'friendly', languages: 'English',
      phone: '', email: '', website: '', address: '', routeTo: '', escalateOn: '', trained: false,
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
  b.profile = { ...b.profile, ...patch, trained: true };
  save();
  return b.profile;
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
    const fq = tokenize(f.q + ' ' + f.a);
    const overlap = fq.filter((w) => q.has(w)).length / Math.max(4, fq.length);
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
export function respond(userId, text, { greeted = false, channel = 'chat', can = { booking: true, sales: true } } = {}) {
  const b = biz(userId);
  const p = b.profile;
  const r = newVoice(text + Date.now());
  const low = String(text).toLowerCase();
  const parts = [];
  const intents = new Set();

  // -- direct knowledge: answer the specific things they asked ---------------
  if (/\b(hour|open|close|closing|opening|what time)\b/.test(low) && p.hours) {
    parts.push(pick(r, [`we're open ${p.hours}`, `hours are ${p.hours}`, `you can catch us ${p.hours}`]));
    intents.add('faq');
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

  // Skip anything that restates what we've already said (same idea, other words).
  const said = () => new Set(parts.flatMap((x) => tokenize(x)));
  const restates = (candidate) => {
    const ct = tokenize(candidate).filter((w) => w.length > 3);
    if (!ct.length) return false;
    const have = said();
    return ct.filter((w) => have.has(w)).length / ct.length >= 0.6;
  };

  // -- the FAQ + knowledge database (what Atlas has learned) ------------------
  const faq = bestFaq(userId, text);
  if (faq?.a && !restates(faq.a)) {
    parts.push(pick(r, ['', 'good question — ', 'yep — ', 'so, ']) + faq.a);
    intents.add('faq');
  }
  for (const f of kb.search(userId, text, 2)) {
    if (!restates(f.fact)) { parts.push(f.fact); intents.add('faq'); }
  }

  // -- action intents ----------------------------------------------------------
  const wantsBooking = /\b(book|appointment|schedule|reserve|reservation|availability|slot|come in)\b/i.test(text);
  const wantsOrder = /\b(order|buy|purchase|price|pricing|cost|how much|quote)\b/i.test(text);
  if (wantsBooking && can.booking === false) {
    parts.push(`I've noted your request and someone from the team will follow up to get you scheduled.`);
  } else if (wantsBooking) {
    parts.push(pick(r, [
      `happy to get you booked — what day and time work for you?`,
      `I can set that up. When were you thinking?`,
      `let's get you on the calendar — give me a day and time and I'll confirm.`,
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
  parts.forEach((part, i) => {
    if (i === 0) body = part.charAt(0).toUpperCase() + part.slice(1);
    else body += (/[.!?]$/.test(body) ? ' ' : '. ') + (part.charAt(0).toUpperCase() + part.slice(1));
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
