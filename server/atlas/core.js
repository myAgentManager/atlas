// ATLAS Core — the engine. 100% original, self-contained AI: NLU (naive Bayes
// + entities) → planner → skills → reflection. No Anthropic, no Ollama, no
// external AI service. It boots trained and never needs the network to think.
import { understand, intentCount, vocabSize } from './nlu.js';
import { Index, summarize, keywords } from './knowledge.js';
import { SKILLS, PLANS, reviewArtifact, slugify } from './skills.js';
import { forUser } from '../tools.js';
import { config } from '../config.js';
import { recall, brainStats } from './learn.js';
import { getDoc, saveDoc } from '../db.js';
import { newVoice, contract, compose, greet, ack, thinking, nice, yes, paraphrase, loosen, pick } from './voice.js';

// Long-term memory: everything ATLAS produces or studies gets indexed for
// recall — and persisted, so ATLAS keeps growing across restarts.
const memory = new Index();
const saved = getDoc('memory', { docs: [], lastStudy: null });
for (const d of saved.docs || []) memory.add(d.id, d.text, d.meta || {});

export function remember(id, text, meta = {}) {
  memory.add(id, text, meta);
  saved.docs.push({ id, text: String(text).slice(0, 4000), meta });
  if (saved.docs.length > 400) saved.docs.splice(0, saved.docs.length - 400);
  saveDoc('memory', saved);
}
export function getLastStudy() { return saved.lastStudy; }
export function setLastStudy(entry) { saved.lastStudy = entry; saveDoc('memory', saved); }

export function engineInfo() {
  return {
    engine: 'ATLAS Core',
    version: config.engineVersion,
    kind: 'from-scratch AI — naive-Bayes NLU · planner · TF-IDF knowledge · a voice engine that talks in its own words',
    intents: intentCount(),
    vocab: vocabSize(),
    skills: Object.keys(SKILLS).filter((s) => s !== 'generic_task').length,
    memories: memory.size,
    selfStudy: brainStats(),
    selfContained: true,
  };
}

const INTENT_LABEL = {
  build_website: 'build a website',
  research: 'research on the web',
  write_doc: 'draft a document',
  write_story: 'write long-form fiction',
  summarize_files: 'summarize the workspace',
  organize: 'organize the workspace',
  generic_task: 'produce a working document',
};

// --- task execution ------------------------------------------------------------
// io: { event(type, text, meta?), inbox() -> [messages], cancelled() -> bool }
// prefs: { tone, callMe } from the account's personalization settings.
export async function execute(task, io, prefs = {}) {
  const tools = forUser(task.userId);

  const r = newVoice(task.id);
  io.event('thought', contract(compose(r, pick(r, ['Alright,', 'Okay,', 'Cool,', 'Right,']), pick(r, ['reading what you sent me', 'let me actually read this', 'taking in the brief']), `— “${task.prompt.slice(0, 130)}${task.prompt.length > 130 ? '…' : ''}”`)));
  // Fold in the operator's clarification answer, if they gave one.
  const fullBrief = task.clarify?.answer
    ? `${task.prompt}\n${task.clarify.answer}`
    : task.prompt;
  const understanding = understand(fullBrief);
  if (task.clarify?.answer) {
    io.event('thought', contract(`${pick(r, ['Good', 'Perfect', 'Got it'])} — with your note (“${task.clarify.answer.slice(0, 100)}”) I know exactly what you mean.`));
  }
  // Personalization: account's preferred voice wins unless the brief asks otherwise.
  if (!understanding.entities.toneExplicit && prefs.tone && prefs.tone !== 'auto') {
    understanding.entities.tone = prefs.tone;
  }
  const label = INTENT_LABEL[understanding.intent] || understanding.intent;
  const conf = understanding.confidence > 0.75 ? pick(r, ['pretty sure', "I'm confident", 'no doubt']) : pick(r, ['fairly sure', 'I think', 'reading it as']);
  io.event('thought', contract(compose(r, `${pick(r, ['So', 'Okay so', 'Right'])}, ${conf} you want me to ${label}`, understanding.entities.topic ? `— all about “${understanding.entities.topic}”.` : '.', pick(r, ["Let's do it.", 'Here we go.', "I'm on it."]))));

  if (task.schedule?.deadline) {
    io.event('thought', contract(`${pick(r, ['Noted the deadline', 'Clock\'s set', 'I see the deadline'])} — ${new Date(task.schedule.deadline).toLocaleString()}. ${pick(r, ["I won't rush; I'll keep polishing till then.", "Plenty of time to make it good.", "I'll pace myself and keep improving it."])}`));
  }
  if (io.cancelled()) return null;

  // Chat-ish intents assigned as tasks still deserve a useful artifact.
  const skillName = SKILLS[understanding.intent] ? understanding.intent : 'generic_task';
  const skill = SKILLS[skillName];

  // If the brief points at a live URL, read it first for context.
  if (understanding.entities.urls[0]) {
    const url = understanding.entities.urls[0];
    io.event('tool', `Reading ${url} for context`);
    try {
      const page = await tools.fetchPage(url);
      understanding.webContext = summarize(page, 3);
      io.event('thought', 'Context absorbed — folding it into the work.');
    } catch (e) {
      io.event('tool', `Couldn't read ${url} (${e.message}) — continuing without it.`);
    }
  }

  // Everything this task produces lives under one project folder.
  const project = slugify(task.project || understanding.entities.topic || 'general');

  // Targeted refinement: when the task points at a specific file, route by
  // WHAT is being edited — never by guessing intent from the feedback text.
  let routedSkill = skillName;
  if (task.target) {
    if (/\.html?$/i.test(task.target)) routedSkill = 'build_website';
    else if (/\/story\//.test(task.target)) routedSkill = 'write_story';
    else routedSkill = 'write_doc';
    io.event('thought', `Target file: ${task.target} — this is a focused refinement, not a new build.`);
  }
  const finalSkill = SKILLS[routedSkill] || skill;

  // Think first: lay the plan out loud before touching anything.
  const steps = PLANS[routedSkill] || PLANS.generic_task;
  io.event('plan', `Project: ${project}\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);

  // Bring in anything ATLAS has taught itself that's relevant.
  const lessons = recall(`${understanding.entities.topic || ''} ${task.prompt}`, 2);
  if (lessons.length && routedSkill !== 'build_website') {
    io.event('thought', contract(pick(r, [`Actually — I studied ${lessons.length > 1 ? 'a couple things' : 'something'} about this on my own. Pulling that in.`, `I've got some notes on this from my own reading. Using them.`])));
  }

  const skillIo = {
    think: (t) => io.event('thought', t),
    act: (t, meta) => io.event('tool', t, meta),
    inbox: io.inbox,
    lessons,
  };

  const result = await finalSkill({ understanding, tools, io: skillIo, project, target: task.target || null, lessons });

  // Go over it: re-open the artifact and run the quality checklist.
  if (result?.artifact) {
    io.event('thought', contract(pick(r, ["Okay — let me step back and actually check my own work before I call it done.", "Not done yet. Reopening it to make sure it holds up.", "Now the important part: going over it with fresh eyes."])));
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

// --- conversational chat ----------------------------------------------------
// ATLAS talks like a capable, easygoing coworker — casual, a bit witty, in its
// own words. It reacts to what you actually said instead of reciting a script,
// and stays honest about what it can and can't do.
export function converse({ userId, message, tasks, prefs = {} }) {
  const r = newVoice(message);
  const u = understand(message);
  const msg = String(message || '');
  const low = msg.toLowerCase().trim();
  const name = prefs.callMe || '';
  const mine = tasks.filter((t) => t.userId === userId);
  const running = mine.filter((t) => t.status === 'running');
  const done = mine.filter((t) => t.status === 'done');

  // --- quick conversational reflexes (matched before the classifier) --------
  if (/\b(thanks|thank you|thx|ty|appreciate|cheers)\b/i.test(low)) {
    return contract(compose(r, pick(r, ['Anytime', 'Course', 'No problem at all', 'Happy to help', 'You got it']) + (name ? `, ${name}` : ''), pick(r, ['what else can I get going for you?', "that's what I'm here for.", 'give me the next one.', 'holler if you need anything else.'])));
  }
  if (/\b(how are you|how's it going|how are things|you good|what's up|whats up|sup)\b/i.test(low)) {
    return contract(compose(r, pick(r, ["I'm good — wired in and ready", "Can't complain, I don't sleep", 'Running warm and ready to go', 'Good! Itching to build something']), running.length ? `mid-task on “${running[0].title}” but I can multitask` : 'nothing on my plate right now', pick(r, ['what are we doing?', "what's on your mind?", 'what do you need?'])));
  }
  if (/\b(joke|funny|make me laugh|bored)\b/i.test(low)) {
    return contract(pick(r, [
      "I'd tell you a UDP joke but you might not get it. Anyway — what do you actually need?",
      "Why did the agent cross the road? Because the task was on the other side. …I build sites, not comedy. What's up?",
      "My humor's still compiling. Give me something real to do and watch me cook instead.",
    ]));
  }
  if (/\b(who are you|what are you|your name|are you (chatgpt|gpt|claude|ai))\b/i.test(low)) {
    return contract(compose(r,
      pick(r, ["I'm ATLAS", "Name's ATLAS", "I'm ATLAS — Atlas Networks' own engine"]),
      pick(r, ["not ChatGPT, not Claude, none of that", "no big-tech model under the hood", "built from scratch, right here"]),
      pick(r, ['just original code that reads, plans, and builds.', 'my brain is homegrown — every bit of it.', "and yeah, I actually run your stuff, not just chat."])));
  }

  // --- intent-driven, but phrased fresh each time ---------------------------
  switch (u.intent) {
    case 'greeting_chat':
      return contract(compose(r, greet(r, name),
        running.length ? `I'm in the middle of “${running[0].title}” right now, but I've got ears — what do you need?`
        : done.length ? `just wrapped “${done[0].title}”. What's next?`
        : pick(r, ["what are we building?", "hand me something and I'll run with it.", "what's the mission?"])));

    case 'status_chat': {
      if (running.length) return contract(compose(r, pick(r, ['Right now', 'At the moment', "Currently"]), `I'm on “${running[0].title}”`, pick(r, ["— you can watch me work the live feed, or nudge me if I'm off course.", 'and moving. Poke me there if you want to steer.'])));
      if (done.length) {
        const t = done[0];
        const gist = t.lastResult ? summarize(t.lastResult, 1) || t.lastResult.slice(0, 160) : '';
        return contract(compose(r, pick(r, ['Last thing I finished was', 'Just knocked out', 'Most recent win —']) + ` “${t.title}”`, gist ? `— ${gist}` : '', pick(r, [`that's ${mine.reduce((n, x) => n + (x.runCount || 0), 0)} runs total. What now?`, 'what should I pick up next?'])));
      }
      return contract(compose(r, pick(r, ["Queue's empty", "Nothing cooking yet", "All quiet"]), pick(r, ["— hand me a task and I'll show you how I work.", "so I'm all yours. What do you need done?"])));
    }

    case 'capability_chat':
      return contract(compose(r,
        pick(r, ["Short version:", "Here's the deal:", "What I'm good at:"]),
        pick(r, ["I read the open web, plan things out, and actually build them", "I research, write, and ship real work — not just talk"]),
        pick(r, ['websites, cited research, documents, long stories, the works.', 'and I run a business front desk if you point me at one.']),
        pick(r, ["Give me a deadline and I keep improving it till the clock runs out.", "I'll ask a quick question if your ask is fuzzy, then get moving.", "The more I do, the sharper I get — I study on my own too."])));

    default: {
      // Did we already learn/produce something relevant? Say so, casually.
      const hits = memory.search(message, 2).filter((h) => h.meta.userId === userId);
      if (hits.length) {
        return contract(compose(r, pick(r, ["Oh — I've got notes on this.", "Funny, I looked into this already.", "I remember this one."]), summarize(hits.map((h) => h.text).join(' '), 2), pick(r, ['want me to take it further?', 'say the word and I\'ll dig deeper.'])));
      }
      const label = INTENT_LABEL[u.intent];
      const echo = paraphrase(r, keywords(message, 3));
      if (label && u.intent !== 'generic_task') {
        return contract(compose(r, echo ? `${ack(r)} — ${echo}.` : ack(r) + '.', pick(r, [`sounds like you want me to ${label}`, `I can ${label} for that`]), pick(r, ['spin it up as a task and I\'m off.', 'kick it off and I\'ll handle the rest.'])));
      }
      return contract(compose(r, echo ? `${echo}.` : '', pick(r, ["I can run with that", "Yeah, I can take that on", "That's in my wheelhouse"]), pick(r, ['— toss it to me as a task and I\'ll plan it out loud.', "start it up and watch me work.", "what exactly do you want the end result to be?"])));
    }
  }
}

export const memoryIndex = memory;
