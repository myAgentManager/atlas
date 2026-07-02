// ATLAS Core — the engine. 100% original, self-contained AI: NLU (naive Bayes
// + entities) → planner → skills → reflection. No Anthropic, no Ollama, no
// external AI service. It boots trained and never needs the network to think.
import { understand, intentCount, vocabSize } from './nlu.js';
import { Index, summarize } from './knowledge.js';
import { SKILLS, PLANS, reviewArtifact, slugify } from './skills.js';
import { forUser } from '../tools.js';
import { config } from '../config.js';

// Long-term memory: everything ATLAS produces gets indexed for later recall.
const memory = new Index();

export function engineInfo() {
  return {
    engine: 'ATLAS Core',
    version: config.engineVersion,
    kind: 'from-scratch symbolic/statistical AI (naive-Bayes NLU · planner · TF-IDF knowledge · template NLG)',
    intents: intentCount(),
    vocab: vocabSize(),
    skills: Object.keys(SKILLS).filter((s) => s !== 'generic_task').length,
    memories: memory.size,
    selfContained: true,
  };
}

const INTENT_LABEL = {
  build_website: 'build a website',
  research: 'research on the web',
  write_doc: 'draft a document',
  summarize_files: 'summarize the workspace',
  organize: 'organize the workspace',
  generic_task: 'produce a working document',
};

// --- task execution ------------------------------------------------------------
// io: { event(type, text, meta?), inbox() -> [messages], cancelled() -> bool }
// prefs: { tone, callMe } from the account's personalization settings.
export async function execute(task, io, prefs = {}) {
  const tools = forUser(task.userId);

  io.event('thought', `Parsing the brief: “${task.prompt.slice(0, 140)}${task.prompt.length > 140 ? '…' : ''}”`);
  const understanding = understand(task.prompt);
  // Personalization: account's preferred voice wins unless the brief asks otherwise.
  if (!understanding.entities.toneExplicit && prefs.tone && prefs.tone !== 'auto') {
    understanding.entities.tone = prefs.tone;
  }
  const label = INTENT_LABEL[understanding.intent] || understanding.intent;
  io.event('thought', `Understood — intent: ${label} (confidence ${(understanding.confidence * 100).toFixed(0)}%)${understanding.entities.topic ? ` · topic: “${understanding.entities.topic}”` : ''}`);

  if (task.schedule?.deadline) {
    io.event('thought', `Deadline noted: ${new Date(task.schedule.deadline).toLocaleString()}. Planning within it.`);
  }
  if (io.cancelled()) return null;

  // Chat-ish intents assigned as tasks still deserve a useful artifact.
  const skillName = SKILLS[understanding.intent] ? understanding.intent : 'generic_task';
  const skill = SKILLS[skillName];

  // Everything this task produces lives under one project folder.
  const project = slugify(task.project || understanding.entities.topic || 'general');

  // Think first: lay the plan out loud before touching anything.
  const steps = PLANS[skillName] || PLANS.generic_task;
  io.event('plan', `Project: ${project}\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);

  const skillIo = {
    think: (t) => io.event('thought', t),
    act: (t, meta) => io.event('tool', t, meta),
    inbox: io.inbox,
  };

  const result = await skill({ understanding, tools, io: skillIo, project });

  // Go over it: re-open the artifact and run the quality checklist.
  if (result?.artifact) {
    io.event('thought', 'Stepping back to review my work before sign-off.');
    const checks = await reviewArtifact(tools, result.artifact);
    for (const c of checks) io.event('review', `${c.ok ? '✓' : '✗'} ${c.note}`);
    const passed = checks.filter((c) => c.ok).length;
    result.summary += ` · QA: ${passed}/${checks.length} checks passed${passed < checks.length ? ' — flagged items are in the feed' : ''}.`;
  }

  // Reflect: index the outcome into long-term memory for later questions.
  memory.add(`task:${task.id}:${Date.now()}`, `${task.title}. ${task.prompt}. ${result.summary}`, {
    userId: task.userId, taskId: task.id, artifact: result.artifact, at: Date.now(),
  });

  return result;
}

// --- conversational chat ---------------------------------------------------------
// Grounded replies from NLU + the user's own task history. No hallucinated fluff:
// if ATLAS doesn't know, it says so and offers what it can actually do.
export function converse({ userId, message, tasks, prefs = {} }) {
  const u = understand(message);
  const mine = tasks.filter((t) => t.userId === userId);
  const running = mine.filter((t) => t.status === 'running');
  const done = mine.filter((t) => t.status === 'done');
  const hey = prefs.callMe ? `Hey ${prefs.callMe}.` : 'Hey.';

  switch (u.intent) {
    case 'greeting_chat': {
      const line = running.length
        ? `${hey} I'm mid-task on “${running[0].title}” right now — feel free to steer me.`
        : done.length
          ? `${hey} Standing by — last thing I finished was “${done[0].title}”.`
          : `${hey} I'm ready when you are — assign me a task and I'll get moving.`;
      return line;
    }
    case 'status_chat': {
      if (running.length) return `Currently working on “${running[0].title}”. Watch the live feed for each step; message me there to adjust course.`;
      if (done.length) {
        const t = done[0];
        return `Latest: “${t.title}” — done. ${t.lastResult ? summarize(t.lastResult, 2) || t.lastResult.slice(0, 200) : ''} Total finished runs: ${mine.reduce((n, x) => n + (x.runCount || 0), 0)}.`;
      }
      return `Nothing in flight yet — the queue is clean. Give me a task and you'll see every step here.`;
    }
    case 'capability_chat':
      return [
        `I'm ATLAS — a from-scratch AI engine that lives on this server. No cloud model behind me; my NLU, planner, and generators are all local and original.`,
        `What I do best right now: build one-page websites, research topics on the live web with cited reports, draft structured documents, and summarize or organize your workspace.`,
        `Schedule me for overnight runs with deadlines, and I'll text you when I'm done if you've set up SMS in Settings.`,
      ].join(' ');
    default: {
      // Try recall from long-term memory first.
      const hits = memory.search(message, 2).filter((h) => h.meta.userId === userId);
      if (hits.length) {
        return `From my notes: ${summarize(hits.map((h) => h.text).join(' '), 2)} — if you want, assign a follow-up task and I'll take it further.`;
      }
      const label = INTENT_LABEL[u.intent];
      if (label && u.intent !== 'generic_task') {
        return `Sounds like you want me to ${label}. Assign it as a task (so it gets a feed, scheduling, and a saved result) and I'll start.`;
      }
      return `I can take that on as a task — assign it and I'll plan it out. My strongest skills: websites, web research, documents, and workspace summaries.`;
    }
  }
}

export const memoryIndex = memory;
