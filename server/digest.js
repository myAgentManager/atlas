// The morning digest — every business owner gets yesterday in one email:
// conversations handled, bookings taken, new customers, and the top question
// Atlas couldn't answer (with a nudge to teach it). Sent once a day around
// 8am server time, through the owner's own SMTP connector when they have one,
// falling back to the platform email channel.
import * as auth from './auth.js';
import * as biz from './business.js';
import * as kb from './atlas/kb.js';
import * as connectors from './connectors.js';
import { sendEmail, sendVia } from './email.js';
import { channelStatus } from './platform.js';
import { getDoc, saveDoc } from './db.js';

let db = getDoc('digest', { sent: {} }); // sent[userId] = 'YYYY-MM-DD'
const save = () => saveDoc('digest', db);

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

function yesterdayWindow() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return { from: start.getTime() - 864e5, to: start.getTime() };
}

// Build the digest for one account; null when there was nothing to report.
export function composeDigest(userId) {
  const b = biz.getBusiness(userId);
  const { from, to } = yesterdayWindow();
  const convos = b.inbox.filter((c) => c.updatedAt >= from && c.updatedAt < to);
  const bookings = b.bookings.filter((x) => x.createdAt >= from && x.createdAt < to);
  const customers = b.customers.filter((c) => c.createdAt >= from && c.createdAt < to);
  if (!convos.length && !bookings.length && !customers.length) return null;

  const gaps = kb.kbStats(userId).topGaps;
  const name = b.profile.name || 'your business';
  const lines = [
    `Good morning — here's yesterday at ${name}:`,
    '',
    `  Conversations handled: ${convos.length}`,
    `  Bookings taken: ${bookings.length}`,
    `  New customers: ${customers.length}`,
  ];
  const open = convos.filter((c) => c.status === 'open').length;
  if (open) lines.push(`  Still open: ${open} — worth a look.`);
  if (gaps.length) {
    lines.push('', `Customers asked something I couldn't answer:`);
    for (const g of gaps.slice(0, 3)) lines.push(`  · "${g.q}"${g.count > 1 ? ` (asked ${g.count}×)` : ''}`);
    lines.push("Teach me on the Knowledge page and I'll handle it next time.");
  }
  lines.push('', '— ATLAS, your agent on the Atlas Network');
  return { subject: `${name} yesterday: ${convos.length} conversation${convos.length !== 1 ? 's' : ''}, ${bookings.length} booking${bookings.length !== 1 ? 's' : ''}`, text: lines.join('\n') };
}

async function sendDigest(user) {
  const msg = composeDigest(user.id);
  if (!msg) return false;
  const to = biz.getBusiness(user.id).profile.routeTo || user.email;
  const smtp = connectors.getConnectorConfig(user.id, 'smtp');
  if (smtp?.host && smtp?.from) await sendVia(smtp, { ...msg, to, fromName: 'ATLAS' });
  else if (channelStatus().email) await sendEmail({ ...msg, to });
  else return false;
  return true;
}

// Hourly tick: around 8am, send to anyone who hasn't gotten today's yet.
export async function digestTick(hour = new Date().getHours()) {
  if (hour < 8 || hour > 10) return; // 8–10am window in case a tick is missed
  const today = dayKey();
  for (const user of auth.listUsers()) {
    if (user.disabled || db.sent[user.id] === today) continue;
    try {
      const sent = await sendDigest(user);
      db.sent[user.id] = today; // don't retry-spam even when there was nothing to send
      save();
      if (sent) auth.audit('digest', `morning digest sent to ${user.email}`);
    } catch (e) {
      auth.audit('digest', `digest failed for ${user.email}: ${e.message}`);
    }
  }
}
