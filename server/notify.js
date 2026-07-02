// Twilio SMS notifications — global Twilio credentials (server owner's), each
// account opts in with its own destination number in Settings. Plain REST, no
// SDK.
import { config } from './config.js';
import { audit } from './auth.js';

export function smsReady() {
  const { sid, token, from } = config.twilio;
  return Boolean(sid && token && from);
}

export async function sendSms(to, body) {
  if (!smsReady() || !to) return { ok: false, skipped: true };
  const { sid, token, from } = config.twilio;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const form = new URLSearchParams({ To: to, From: from, Body: String(body).slice(0, 1500) });
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      audit('sms', `send failed: ${res.status} ${detail.slice(0, 120)}`);
      return { ok: false, error: `${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    audit('sms', `send failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

export async function notifyFinished(user, task, status, result) {
  if (!user || task.notify === false) return;
  const s = user.settings || {};
  if (!s.notifySms || !s.smsTo) return;
  const head = status === 'failed' ? `⚠ ${config.agentName}: task failed` : `✔ ${config.agentName}: task done`;
  await sendSms(s.smsTo, `${head}\n“${task.title}”\n\n${String(result || '').slice(0, 600)}`);
}
