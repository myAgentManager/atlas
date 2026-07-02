// The task runner. Hands each run to ATLAS Core, narrates onto the feed,
// honors stop requests and mid-run chat, then fans out notifications and
// platform integrations when the run settles.
import { config } from './config.js';
import { addEvent, updateTask, getTask, drainInbox, pushInbox, listTasks, addChat } from './store.js';
import { execute, converse } from './atlas/core.js';
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
      notifyFinished(user, getTask(id), 'done', result.summary).catch(() => {});
      dispatch(user, 'finished', getTask(id), result.summary).catch(() => {});
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

// Chat about a specific task from its feed. Running task → steer it; idle →
// ATLAS answers in the feed with grounded context.
export function taskChat(taskId, text) {
  const task = getTask(taskId);
  if (!task) return;
  addEvent(taskId, { type: 'chat-user', text });
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
}

// General conversation on the ATLAS page (not tied to a task).
export function atlasChat(userId, text) {
  addChat(userId, 'user', text);
  const u = getUser(userId);
  const reply = converse({
    userId, message: text, tasks: listTasks(),
    prefs: { tone: u?.settings?.tone, callMe: u?.settings?.callMe },
  });
  return addChat(userId, 'atlas', reply);
}
