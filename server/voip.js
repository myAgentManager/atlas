// VoIP front desk — myAgent living on a PBX extension. The business's phone
// system (FreePBX / Asterisk / 3CX / Twilio…) routes a call to the extension,
// and its IVR posts each caller utterance (speech-to-text or DTMF) to our
// webhook with the account's IVR token. The agent answers in text; the PBX
// speaks it back with its own TTS. One webhook, per-call continuity, full
// transcript filed into the business inbox. No SIP media stack here — the PBX
// owns the audio; myAgent owns the conversation.
import * as auth from './auth.js';
import * as connectors from './connectors.js';
import * as agentsMod from './agents.js';
import * as biz from './business.js';
import * as billing from './billing.js';

// live calls: callId → { convoId, greeted, lastAt }; pruned after 2h idle
const calls = new Map();
const pruner = setInterval(() => {
  const cutoff = Date.now() - 2 * 3600e3;
  for (const [id, c] of calls) if (c.lastAt < cutoff) calls.delete(id);
}, 10 * 60e3);
pruner.unref?.();

// Which account owns this IVR token? (tokens are per-business, set on the
// pbx connector — the PBX sends it with every webhook hit)
export function findAccountByToken(token) {
  const t = String(token || '');
  if (t.length < 8) return null; // refuse trivially guessable tokens
  for (const u of auth.listUsers()) {
    if (u.disabled) continue;
    const cfg = connectors.getConnectorConfig(u.id, 'pbx');
    if (cfg?.token && cfg.token === t) return u;
  }
  return null;
}

const voipAgent = (userId) =>
  agentsMod.listAgents(userId).find((a) => a.status === 'active' && a.capabilities.includes('voip')) || null;

// Phone answers must be speakable: no markdown, no em-dash pauses, bounded.
const speechify = (t) => String(t || '')
  .replace(/[*_#`~]/g, '')
  .replace(/\s*—\s*/g, ', ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 600);

// One turn of the call. Empty text = the call just connected (agent picks up).
export function handleTurn({ user, callId, caller, text }) {
  if (!billing.entitled(user, 'voip')) {
    return { say: 'Phone support is not enabled on this account.', hangup: true };
  }
  const agent = voipAgent(user.id);
  if (!agent) {
    return { say: 'Sorry, no phone agent is on duty right now. Please call back later.', hangup: true };
  }

  const id = String(callId || caller || 'call').slice(0, 60);
  let call = calls.get(id);
  if (!call) {
    const convo = biz.openConversation(user.id, {
      channel: 'voip',
      customer: caller ? `Caller ${caller}` : 'Caller',
      customerEmail: '',
      subject: `Phone call${caller ? ` from ${caller}` : ''}`,
      agentId: agent.id,
    });
    if (caller) biz.upsertCustomer(user.id, { name: `Caller ${caller}`, phone: String(caller).slice(0, 24) });
    call = { convoId: convo.id, greeted: false, lastAt: Date.now() };
    calls.set(id, call);
  }
  call.lastAt = Date.now();

  // call connected, nothing said yet → the agent picks up the phone
  if (!String(text || '').trim()) {
    const p = biz.getBusiness(user.id).profile;
    const say = `Thanks for calling ${p.name || 'us'}. This is ${agent.name}. How can I help you today?`;
    call.greeted = true;
    biz.addMessage(user.id, call.convoId, 'agent', say);
    return { say: speechify(say), hangup: false };
  }

  const heard = String(text).slice(0, 500);
  biz.addMessage(user.id, call.convoId, 'customer', heard);
  const reply = agentsMod.handle(user.id, agent, heard, { greeted: call.greeted, channel: 'voip' });
  call.greeted = true;
  biz.addMessage(user.id, call.convoId, 'agent', reply.text);

  const done = /\b(bye|goodbye|hang up|that'?s (all|everything)|no,? that'?s it)\b/i.test(heard);
  return { say: speechify(reply.text), hangup: done, needsHuman: Boolean(reply.needsHuman) };
}

// Twilio-compatible XML so <Say>/<Gather>-style IVRs work out of the box.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function toXml({ say, hangup }) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Say>${esc(say)}</Say>${
    hangup ? '<Hangup/>' : '<Gather input="speech dtmf" timeout="6" speechTimeout="auto"/>'
  }</Response>`;
}
