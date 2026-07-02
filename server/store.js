// Flat-file persistence for tasks (per account) + activity feeds + ATLAS chat
// threads. Every mutation writes to disk and emits onto the bus for SSE.
import { randomUUID } from 'node:crypto';
import { getDoc, saveDoc } from './db.js';
import { bus } from './bus.js';

const MAX_EVENTS = 240;

let state = getDoc('tasks', { tasks: [] });
if (!Array.isArray(state.tasks)) state.tasks = [];
let chats = getDoc('chats', {}); // userId -> [{who, text, ts}]

const write = () => saveDoc('tasks', state);
const writeChats = () => saveDoc('chats', chats);

export const listTasks = (userId) =>
  userId ? state.tasks.filter((t) => t.userId === userId) : state.tasks;
export const getTask = (id) => state.tasks.find((t) => t.id === id) || null;

export function createTask({ userId, title, prompt, project, schedule, notify }) {
  const now = Date.now();
  const task = {
    id: randomUUID(),
    userId,
    title: title?.trim() || prompt.trim().slice(0, 52) || 'Untitled task',
    prompt: prompt.trim(),
    project: String(project || '').trim().slice(0, 40) || null,
    status: 'idle', // idle | queued | running | done | failed | paused
    schedule: normalizeSchedule(schedule),
    notify: notify !== false,
    createdAt: now,
    updatedAt: now,
    lastRunAt: null,
    nextRunAt: computeNextRun(schedule, now),
    lastResult: null,
    artifact: null,
    runCount: 0,
    inbox: [],
    events: [],
  };
  state.tasks.unshift(task);
  write();
  bus.emit('task', task);
  return task;
}

export function updateTask(id, patch) {
  const task = getTask(id);
  if (!task) return null;
  if (patch.schedule) patch.schedule = normalizeSchedule(patch.schedule);
  Object.assign(task, patch, { updatedAt: Date.now() });
  if (patch.schedule) task.nextRunAt = computeNextRun(task.schedule, Date.now());
  write();
  bus.emit('task', task);
  return task;
}

export function deleteTask(id) {
  const i = state.tasks.findIndex((t) => t.id === id);
  if (i === -1) return false;
  const [removed] = state.tasks.splice(i, 1);
  write();
  bus.emit('task', { ...removed, deleted: true });
  return true;
}

export function addEvent(id, { type, text, meta }) {
  const task = getTask(id);
  if (!task) return null;
  const event = { id: randomUUID(), ts: Date.now(), type, text, meta: meta || null };
  task.events.push(event);
  if (task.events.length > MAX_EVENTS) task.events.splice(0, task.events.length - MAX_EVENTS);
  task.updatedAt = event.ts;
  write();
  bus.emit('event', { taskId: id, userId: task.userId, event });
  return event;
}

export function pushInbox(id, text) {
  const task = getTask(id);
  if (!task) return;
  (task.inbox ||= []).push(text);
  write();
}
export function drainInbox(id) {
  const task = getTask(id);
  if (!task || !task.inbox?.length) return [];
  const msgs = task.inbox.splice(0);
  write();
  return msgs;
}

// --- ATLAS chat threads (per account, separate from task feeds) ---------------
export function chatHistory(userId) {
  return chats[userId] || [];
}
export function addChat(userId, who, text) {
  const msg = { id: randomUUID(), who, text, ts: Date.now() };
  (chats[userId] ||= []).push(msg);
  if (chats[userId].length > 200) chats[userId].splice(0, chats[userId].length - 200);
  writeChats();
  bus.emit('chat', { userId, msg });
  return msg;
}

// --- schedule helpers -----------------------------------------------------------
function normalizeSchedule(s) {
  if (!s || !s.type) return { type: 'manual' };
  const out = { type: s.type };
  if (s.type === 'once') out.at = Number(s.at) || Date.now() + 60_000;
  if (s.type === 'interval') out.intervalMinutes = Math.max(1, Number(s.intervalMinutes) || 30);
  if (s.type === 'daily') {
    out.time = /^\d{1,2}:\d{2}$/.test(s.time || '') ? s.time : '09:00';
    if (Array.isArray(s.days) && s.days.length) out.days = s.days.map(Number);
  }
  if (s.deadline) out.deadline = Number(s.deadline);
  return out;
}

export function computeNextRun(schedule, from = Date.now()) {
  const s = normalizeSchedule(schedule);
  if (s.type === 'manual') return null;
  if (s.type === 'once') return s.at > from ? s.at : null;
  if (s.type === 'interval') return from + s.intervalMinutes * 60_000;
  if (s.type === 'daily') {
    const [h, m] = s.time.split(':').map(Number);
    for (let i = 0; i < 8; i++) {
      const d = new Date(from);
      d.setDate(d.getDate() + i);
      d.setHours(h, m, 0, 0);
      if (d.getTime() <= from) continue;
      if (s.days && !s.days.includes(d.getDay())) continue;
      return d.getTime();
    }
  }
  return null;
}

// Admin helpers
export function wipeTasks() {
  state.tasks = [];
  write();
  bus.emit('task', { deleted: true, id: '*' });
}
export const taskStats = () => ({
  total: state.tasks.length,
  running: state.tasks.filter((t) => t.status === 'running').length,
  runs: state.tasks.reduce((n, t) => n + (t.runCount || 0), 0),
});
