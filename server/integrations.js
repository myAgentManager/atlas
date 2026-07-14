// Outbound platform integrations. Each account can point task events at a
// generic webhook, Slack, and/or Discord (incoming-webhook URLs). Payloads are
// posted as JSON; failures are logged, never fatal.
import { audit } from './auth.js';

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// event: 'finished' | 'failed' | 'started'
export async function dispatch(user, event, task, detail = '') {
  const ig = user?.settings?.integrations || {};
  const wanted = event === 'failed' ? ig.onFail : ig.onFinish;
  if (!wanted) return;

  const title = task.title;
  const text = event === 'failed'
    ? `⚠ ATLAS: task failed — “${title}”. ${detail}`.trim()
    : `✔ ATLAS: task ${event} — “${title}”. ${detail}`.trim();

  const jobs = [];
  if (ig.webhookUrl) {
    jobs.push(post(ig.webhookUrl, {
      source: 'Atlas', event, taskId: task.id, title, status: task.status,
      result: detail || null, at: new Date().toISOString(),
    }).catch((e) => audit('integration', `webhook failed for ${user.email}: ${e.message}`)));
  }
  if (ig.slackUrl) {
    jobs.push(post(ig.slackUrl, { text }).catch((e) => audit('integration', `slack failed for ${user.email}: ${e.message}`)));
  }
  if (ig.discordUrl) {
    jobs.push(post(ig.discordUrl, { content: text }).catch((e) => audit('integration', `discord failed for ${user.email}: ${e.message}`)));
  }
  await Promise.all(jobs);
}
