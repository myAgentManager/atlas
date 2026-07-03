// The task runner. Hands each run to ATLAS Core, narrates onto the feed,
// honors stop requests and mid-run chat, then fans out notifications and
// platform integrations when the run settles.
import { config } from './config.js';
import { addEvent, updateTask, getTask, drainInbox, pushInbox, listTasks, addChat } from './store.js';
import { execute, converse } from './atlas/core.js';
import { understand, needsClarification } from './atlas/nlu.js';
import { checkContent, declineMessage } from './atlas/guard.js';
import { getUser } from './auth.js';
import { notifyFinished } from './notify.js';
import { dispatch } from './integrations.js';

const running = new Map(); // taskId -> { cancelled }

export const isRunning = (id) => running.has(id);
export function stopTask(id) {
  const ctl = running.get(id);
  if (ctl) { ctl.cancelled = true; return true; }
  return false;
}

export async function runTask(id) {
  const task = getTask(id);
  if (!task || running.has(id)) return;

  // Ask before assuming: on the very first run, an ambiguous brief gets ONE
  // clarifying question instead of a guess. Reply in the task chat (or hit
  // Run again to proceed as-is).
  if (task.runCount === 0 && !task.clarify && !task.target) {
    const q = needsClarification(understand(task.prompt));
    if (q) {
      addEvent(id, { type: 'chat-agent', text: q.question, meta: { options: q.options || [] } });
      updateTask(id, { status: 'awaiting-input', clarify: { question: q.question, options: q.options || [], askedAt: Date.now(), answer: null } });
      return;
    }
  }

  const ctl = { cancelled: false };
  running.set(id, ctl);
  updateTask(id, { status: 'running', lastRunAt: Date.now() });
  addEvent(id, { type: 'system', text: `${config.agentName} picked up the task.` });

  const user = getUser(task.userId);
  const prefs = { tone: user?.settings?.tone, callMe: user?.settings?.callMe };
  dispatch(user, 'started', task).catch(() => {});

  const io = {
    event: (type, text, meta) => addEvent(id, { type, text, meta }),
    inbox: () => {
      const msgs = drainInbox(id);
      return msgs;
    },
    cancelled: () => ctl.cancelled,
  };

  try {
    const result = await execute(getTask(id), io, prefs);

    if (ctl.cancelled || !result) {
      addEvent(id, { type: 'system', text: 'Run stopped by operator.' });
      updateTask(id, { status: 'paused' });
    } else {
      addEvent(id, { type: 'result', text: result.summary });
      updateTask(id, {
        status: 'done',
        lastResult: result.summary,
        artifact: result.artifact || null,
        runCount: (task.runCount || 0) + 1,
      });

      // Deadline pacing: the work isn't "done" until the hour you set. Space
      // improvement passes across the remaining time and keep refining.
      const deadline = task.schedule?.deadline;
      if (deadline && deadline - Date.now() > 3 * 60_000 && result.artifact) {
        const next = Math.min(Date.now() + passGap(deadline), deadline - 60_000);
        updateTask(id, { nextRunAt: next });
        addEvent(id, {
          type: 'system',
          text: `Deadline is ${new Date(deadline).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} — I'm not done, just pacing myself. Next improvement pass around ${new Date(next).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
        });
      } else {
        notifyFinished(user, getTask(id), 'done', result.summary).catch(() => {});
        dispatch(user, 'finished', getTask(id), result.summary).catch(() => {});
      }
    }
  } catch (err) {
    addEvent(id, { type: 'error', text: `Run failed: ${err.message}` });
    updateTask(id, { status: 'failed' });
    notifyFinished(user, getTask(id), 'failed', err.message).catch(() => {});
    dispatch(user, 'failed', getTask(id), err.message).catch(() => {});
  } finally {
    running.delete(id);
  }
}

// How long between improvement passes: spread ~6 passes across the remaining
// time, never tighter than 8 minutes, never wider than 2 hours.
// (MYAGENT_FAST_PASSES=1 shrinks this to seconds for local testing.)
function passGap(deadline) {
  if (process.env.MYAGENT_FAST_PASSES) return 20_000;
  const remaining = deadline - Date.now();
  return Math.max(8 * 60_000, Math.min(remaining / 6, 2 * 3600_000));
}

// Chat about a specific task from its feed. Running task → steer it; awaiting
// clarification → the reply unblocks the run; idle → ATLAS answers with
// grounded context. Returns true when the caller should enqueue a run.
export function taskChat(taskId, text) {
  const task = getTask(taskId);
  if (!task) return false;
  addEvent(taskId, { type: 'chat-user', text });

  const gate = checkContent(text);
  if (!gate.ok) {
    addEvent(taskId, { type: 'chat-agent', text: declineMessage(gate.topic) });
    return false;
  }

  // Answering the clarifying question un-blocks the task.
  if (task.status === 'awaiting-input' && task.clarify && !task.clarify.answer) {
    updateTask(taskId, { clarify: { ...task.clarify, answer: text, answeredAt: Date.now() } });
    addEvent(taskId, { type: 'chat-agent', text: 'Got it — that settles it. Starting now.' });
    return true;
  }

  if (isRunning(taskId)) {
    pushInbox(taskId, text); // the running skill drains this and adapts
  } else {
    const u = getUser(task.userId);
    const reply = converse({
      userId: task.userId, message: text, tasks: listTasks(),
      prefs: { tone: u?.settings?.tone, callMe: u?.settings?.callMe },
    });
    addEvent(taskId, { type: 'chat-agent', text: reply });
  }
  return false;
}

// General conversation on the ATLAS page (not tied to a task).
export function atlasChat(userId, text) {
  addChat(userId, 'user', text);
  const gate = checkContent(text);
  if (!gate.ok) return addChat(userId, 'atlas', declineMessage(gate.topic));
  const u = getUser(userId);
  const reply = converse({
    userId, message: text, tasks: listTasks(),
    prefs: { tone: u?.settings?.tone, callMe: u?.settings?.callMe },
  });
  return addChat(userId, 'atlas', reply);
}
