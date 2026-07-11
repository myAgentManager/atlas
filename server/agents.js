// Business agents. A business builds one or more named AI agents; each is a
// configured automation — a persona, a set of capabilities, the connectors it
// draws on, and the business knowledge it answers from. Agents run on ATLAS
// Core (from-scratch) and operate the front desk autonomously.
import { randomUUID } from 'node:crypto';
import { getDoc, saveDoc } from './db.js';
import { CAPABILITIES } from './catalog.js';
import * as biz from './business.js';

let db = getDoc('agents', { agents: [] });
const save = () => saveDoc('agents', db);

export const listAgents = (userId) => db.agents.filter((a) => a.userId === userId);
export const getAgent = (userId, id) => db.agents.find((a) => a.id === id && a.userId === userId) || null;
export const countAgents = (userId) => listAgents(userId).length;

export function createAgent(userId, { name, role, capabilities, languages, greeting }) {
  const agent = {
    id: randomUUID().slice(0, 8),
    userId,
    name: (name || 'Front Desk').trim().slice(0, 40),
    role: (role || 'Handle customer questions warmly and professionally.').trim().slice(0, 400),
    greeting: (greeting || 'Hi! Thanks for reaching out — how can I help?').trim().slice(0, 200),
    languages: (languages || 'English').trim().slice(0, 120),
    capabilities: Array.isArray(capabilities) ? capabilities.filter((c) => CAPABILITIES[c]) : ['webchat', 'faq'],
    status: 'active',
    createdAt: Date.now(),
    stats: { handled: 0, bookings: 0, leads: 0 },
  };
  db.agents.unshift(agent);
  save();
  return agent;
}

export function updateAgent(userId, id, patch) {
  const a = getAgent(userId, id);
  if (!a) return null;
  for (const k of ['name', 'role', 'greeting', 'languages', 'status']) if (patch[k] !== undefined) a[k] = patch[k];
  if (Array.isArray(patch.capabilities)) a.capabilities = patch.capabilities.filter((c) => CAPABILITIES[c]);
  save();
  return a;
}

export function deleteAgent(userId, id) {
  const i = db.agents.findIndex((a) => a.id === id && a.userId === userId);
  if (i === -1) return false;
  db.agents.splice(i, 1);
  save();
  return true;
}

export function bumpStat(userId, id, key, by = 1) {
  const a = getAgent(userId, id);
  if (a) { a.stats[key] = (a.stats[key] || 0) + by; save(); }
}

// The agent handles an incoming customer message using its persona +
// capabilities + the business knowledge. It thinks before it answers: the
// reply comes back answer-first, in the agent's own words, with a thinkMs
// pace so the UI shows it "typing" like a person would.
export function handle(userId, agent, text, opts = {}) {
  const has = (c) => agent.capabilities.includes(c);
  const draft = biz.respond(userId, text, {
    greeted: Boolean(opts.greeted),
    channel: opts.channel || 'chat',
    can: { booking: has('bookings'), sales: has('sales') },
  });

  bumpStat(userId, agent.id, 'handled');
  if (draft.intent === 'booking') bumpStat(userId, agent.id, 'bookings');

  const multi = has('multilingual') && agent.languages && !/^english$/i.test(agent.languages);
  return { ...draft, agent: agent.name, multilingual: multi };
}

export function removeAllForUser(userId) {
  const before = db.agents.length;
  db.agents = db.agents.filter((a) => a.userId !== userId);
  if (db.agents.length !== before) save();
}
