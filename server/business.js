// The Business Brain — everything the agent needs to run a business's front
// desk: a profile it learns, an FAQ it answers from, a CRM of customers, a
// bookings ledger, and a unified inbox of customer conversations across email /
// web chat / SMS. All per-account, all persisted. From-scratch reply drafting
// (FAQ retrieval + templated professional tone) — no external LLM.
import { randomUUID } from 'node:crypto';
import { getDoc, saveDoc } from './db.js';
import { bus } from './bus.js';
import { tokenize } from './atlas/nlu.js';

let db = getDoc('business', { biz: {} }); // biz[userId] = { profile, faqs, customers, bookings, inbox }
const save = () => saveDoc('business', db);

function biz(userId) {
  db.biz[userId] ||= {
    profile: { name: '', tagline: '', about: '', hours: '', services: '', tone: 'friendly', languages: 'English', trained: false },
    faqs: [],
    customers: [],
    bookings: [],
    inbox: [],
  };
  return db.biz[userId];
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
export function openConversation(userId, { channel, customer, subject }) {
  const b = biz(userId);
  const convo = { id: randomUUID().slice(0, 8), channel: channel || 'chat', customer: customer || 'Guest', subject: subject || '(no subject)', messages: [], status: 'open', createdAt: Date.now(), updatedAt: Date.now() };
  b.inbox.unshift(convo);
  if (b.inbox.length > 300) b.inbox.length = 300;
  save();
  return convo;
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

// --- the agent's front-desk reply ------------------------------------------
// Drafts a professional, on-brand answer to a customer message using the
// business profile + FAQ. Detects booking intent and light sentiment so the UI
// can flag "needs a human".
export function draftReply(userId, text) {
  const b = biz(userId);
  const p = b.profile;
  const name = p.name || 'our team';
  const hello = { friendly: 'Hi there!', formal: 'Hello,', warm: 'Hey, thanks for reaching out!' }[p.tone] || 'Hi there!';
  const sign = `\n\n— ${name}${p.hours ? `\nHours: ${p.hours}` : ''}`;

  const wantsBooking = /\b(book|appointment|schedule|reserve|reservation|availability|slot|come in)\b/i.test(text);
  const wantsOrder = /\b(order|buy|purchase|price|pricing|cost|how much|quote)\b/i.test(text);
  const upset = /\b(angry|terrible|refund|complaint|awful|worst|cancel|disappointed|broken)\b/i.test(text);

  const faq = bestFaq(userId, text);
  let body;
  if (faq) body = faq.a || `Great question — here's what I can share: ${faq.q}`;
  else if (wantsBooking) body = `I'd be glad to get you booked${p.services ? ` for ${p.services.split(',')[0].trim()}` : ''}. What day and time work best for you? I'll confirm right away.`;
  else if (wantsOrder) body = `Happy to help with that${p.services ? ` — we offer ${p.services}` : ''}. Tell me a bit more about what you're looking for and I'll get you exact details and pricing.`;
  else if (p.about) body = `Thanks for reaching out! ${p.about.slice(0, 200)} How can I help you today?`;
  else body = `Thanks for reaching out! How can I help you today?`;

  return {
    text: `${hello} ${body}${sign}`,
    intent: wantsBooking ? 'booking' : wantsOrder ? 'sales' : faq ? 'faq' : 'general',
    needsHuman: upset,
  };
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
