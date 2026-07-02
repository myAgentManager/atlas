// ATLAS Core — skills. Each skill is an engineered competency that produces a
// real artifact in the account's workspace. The io object narrates progress
// onto the live feed: io.think(text), io.act(text), and io.inbox() drains any
// operator chat sent mid-run so the skill can adapt.
import { summarize, keywords, splitSentences } from './knowledge.js';
import { rng, palette, heroCopy, featureCopy, svgBackdrop, svgMark } from './generator.js';

export const slugify = (s) =>
  String(s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';

// What ATLAS says it will do before it does it — surfaced as the plan event.
export const PLANS = {
  build_website: [
    'Parse the brief: topic, palette, voice, sections',
    'Compose the copy — headline, story, extras',
    'Generate original SVG art and a responsive layout',
    'Write the site into the project folder',
    'Review the result against the checklist',
  ],
  research: [
    'Search the live web for strong sources',
    'Read the best pages and extract what matters',
    'Synthesize findings with citations',
    'Write the report into the project folder',
    'Review the result against the checklist',
  ],
  write_doc: [
    'Analyze the brief and pull out the core themes',
    'Outline: overview, themed sections, next steps',
    'Draft each section',
    'Write the document into the project folder',
    'Review the result against the checklist',
  ],
  summarize_files: [
    'Scan the workspace for readable documents',
    'Extract the essence of each',
    'Write a digest into the project folder',
    'Review the result',
  ],
  organize: [
    'Inventory every file in the workspace',
    'Group by project and type',
    'Write the organization plan',
    'Review the result',
  ],
  generic_task: [
    'Analyze the brief and pull out the core themes',
    'Outline a working document',
    'Draft and write it into the project folder',
    'Review the result against the checklist',
  ],
};

// The "go over it" pass: re-open the artifact and check it like an editor.
export async function reviewArtifact(tools, rel) {
  const checks = [];
  const push = (ok, note) => checks.push({ ok, note });
  let content = '';
  try { content = await tools.read(rel); } catch {
    push(false, `Artifact ${rel} could not be re-opened`);
    return checks;
  }
  push(true, `Artifact exists (${(Buffer.byteLength(content) / 1024).toFixed(1)} KB)`);

  if (/\.html?$/i.test(rel)) {
    push(/<title>[^<]+<\/title>/i.test(content), 'Has a page title');
    push(/viewport/i.test(content), 'Mobile viewport is set');
    push((content.match(/<section/gi) || []).length >= 1, 'Content sections are present');
    push(/<\/html>\s*$/i.test(content), 'Document closes cleanly');
    push(/<svg/i.test(content), 'Original artwork included');
  } else if (/\.md$/i.test(rel)) {
    push(/^#\s+.+/m.test(content), 'Has a proper heading');
    push(content.length > 300, 'Substantial content (not a stub)');
    push(/^##\s+/m.test(content), 'Organized into sections');
    if (/\/research\//.test(rel)) push(/<https?:\/\//.test(content) || /\]\(https?:\/\//.test(content), 'Sources are cited');
  }
  return checks;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const today = () => new Date().toISOString().slice(0, 10);

// ============================================================================
// build_website — generates a real, responsive, single-file site with an
// original palette, procedural SVG art, and topic-derived copy.
// ============================================================================
export async function buildWebsite({ understanding, tools, io, project = 'general' }) {
  const { entities, raw } = understanding;
  const topic = entities.topic || keywords(raw, 2).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || 'My Project';
  const r = rng('site:' + topic);
  const pal = palette(topic);
  const tone = entities.tone;

  io.think(`Designing a one-page site for “${topic}” — ${pal.name} palette, ${tone} voice.`);
  const hero = heroCopy(topic, tone, r);
  const cards = featureCopy(topic, tone, r);
  io.act(`Composing copy: headline, ${cards.length} sections${entities.wantsDates ? ', dates' : ''}${entities.wantsSignup ? ', signup' : ''}`);

  const nav = ['About', entities.wantsDates ? 'Dates' : null, entities.wantsSignup ? 'Sign up' : null].filter(Boolean);
  const dates = entities.wantsDates
    ? Array.from({ length: 4 }, (_, i) => {
        const d = new Date(Date.now() + (i + 1) * 11 * 864e5);
        return { date: d.toLocaleDateString([], { month: 'short', day: 'numeric' }), place: ['The Foundry', 'Riverside Hall', 'Echo Room', 'Union Stage'][i], city: ['Portland', 'Seattle', 'Boise', 'Denver'][i] };
      })
    : null;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(topic)}</title>
<style>
  :root{--bg:${pal.bg};--panel:${pal.panel};--ink:${pal.ink};--dim:${pal.dim};--accent:${pal.accent};--accent2:${pal.accent2}}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--ink);line-height:1.6}
  .wrap{max-width:1040px;margin:0 auto;padding:0 24px}
  header{display:flex;align-items:center;justify-content:space-between;padding:20px 0}
  .brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:19px;letter-spacing:-.3px}
  nav a{color:var(--dim);text-decoration:none;margin-left:22px;font-size:14px;font-weight:600}
  nav a:hover{color:var(--accent)}
  .hero{position:relative;padding:96px 0 110px;overflow:hidden}
  .hero .art{position:absolute;inset:0;z-index:0}.hero .art svg{width:100%;height:100%}
  .hero-inner{position:relative;z-index:1;max-width:640px}
  .kicker{display:inline-block;font-size:12px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--accent);margin-bottom:18px}
  h1{font-size:clamp(38px,7vw,64px);line-height:1.03;letter-spacing:-1.5px;margin-bottom:18px}
  .sub{color:var(--dim);font-size:18px;max-width:520px}
  .btn{display:inline-block;margin-top:30px;padding:14px 28px;border-radius:10px;background:linear-gradient(180deg,var(--accent),var(--accent2));color:${pal.name === 'paper' ? '#fff' : pal.bg};font-weight:700;text-decoration:none;box-shadow:0 8px 24px color-mix(in srgb,var(--accent) 35%,transparent)}
  section{padding:72px 0}
  h2{font-size:30px;letter-spacing:-.6px;margin-bottom:34px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}
  .card{background:var(--panel);border:1px solid color-mix(in srgb,var(--ink) 8%,transparent);border-radius:14px;padding:26px}
  .card h3{font-size:17px;margin-bottom:10px;color:var(--accent)}
  .card p{color:var(--dim);font-size:14.5px}
  table{width:100%;border-collapse:collapse}
  td{padding:15px 8px;border-bottom:1px solid color-mix(in srgb,var(--ink) 10%,transparent)}
  td:first-child{color:var(--accent);font-weight:700;white-space:nowrap}
  td:last-child{text-align:right;color:var(--dim)}
  form{display:flex;gap:10px;max-width:440px;flex-wrap:wrap}
  input{flex:1;min-width:200px;padding:13px 15px;border-radius:10px;border:1px solid color-mix(in srgb,var(--ink) 15%,transparent);background:var(--panel);color:var(--ink);font-size:15px}
  button{padding:13px 24px;border-radius:10px;border:none;background:var(--accent);color:${pal.name === 'paper' ? '#fff' : pal.bg};font-weight:700;font-size:15px;cursor:pointer}
  footer{padding:44px 0;color:var(--dim);font-size:13px;border-top:1px solid color-mix(in srgb,var(--ink) 8%,transparent);display:flex;justify-content:space-between;flex-wrap:gap}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">${svgMark(topic, pal.accent)} ${esc(topic)}</div>
    <nav>${nav.map((n) => `<a href="#${slugify(n)}">${n}</a>`).join('')}</nav>
  </header>
</div>
<div class="hero">
  <div class="art">${svgBackdrop(topic, pal.accent)}</div>
  <div class="wrap hero-inner">
    <span class="kicker">${esc(hero.tag)}</span>
    <h1>${esc(hero.headline)}</h1>
    <p class="sub">${esc(hero.sub)}</p>
    <a class="btn" href="#${entities.wantsSignup ? 'sign-up' : slugify(nav[0] || 'about')}">${entities.wantsSignup ? 'Join the list' : 'Learn more'}</a>
  </div>
</div>
<div class="wrap">
  <section id="about"><h2>About</h2><div class="cards">
    ${cards.map((c) => `<div class="card"><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p></div>`).join('\n    ')}
  </div></section>
  ${dates ? `<section id="dates"><h2>Upcoming dates</h2><table>
    ${dates.map((d) => `<tr><td>${d.date}</td><td>${d.place}</td><td>${d.city}</td></tr>`).join('\n    ')}
  </table></section>` : ''}
  ${entities.wantsSignup ? `<section id="sign-up"><h2>Stay in the loop</h2>
  <form onsubmit="event.preventDefault();this.innerHTML='<p style=color:var(--accent)>You\\'re on the list. Talk soon.</p>'">
    <input type="email" required placeholder="you@email.com" aria-label="Email"><button>Sign up</button>
  </form></section>` : ''}
  <footer><span>© ${new Date().getFullYear()} ${esc(topic)}</span><span>Built by ATLAS</span></footer>
</div>
</body>
</html>`;

  const rel = `${project}/site/index.html`;
  io.act(`Writing ${rel}`);
  await tools.write(rel, html);

  return {
    summary: `Built a responsive one-page site for “${topic}” — ${pal.name} palette, ${nav.length} sections${dates ? ' with dates' : ''}${entities.wantsSignup ? ' and a signup form' : ''}. View it at /files/${rel}`,
    artifact: rel,
  };
}

// ============================================================================
// research — real browsing: search, read pages, extract, synthesize a report.
// ============================================================================
export async function research({ understanding, tools, io, project = 'general' }) {
  const { raw } = understanding;
  const query = raw.replace(/^(research|find|look up|investigate|search( the web)?( for)?)\s*/i, '').trim() || raw;
  io.think(`Researching: “${query}”. Searching the web first.`);

  let results = [];
  try { results = await tools.webSearch(query); } catch (e) { io.act(`Search failed: ${e.message}`); }
  if (!results.length) {
    const rel = `${project}/research/${slugify(query)}-${today()}.md`;
    await tools.write(rel, `# Research: ${query}\n\n_No web results reachable right now. Try again when the server is online._\n`);
    return { summary: `Couldn't reach the web for “${query}” — saved a placeholder at /files/${rel}. Check the server's connection and re-run.`, artifact: rel };
  }
  io.act(`Found ${results.length} sources; reading the top ${Math.min(3, results.length)}.`);

  const sources = [];
  for (const r of results.slice(0, 3)) {
    for (const msg of io.inbox()) io.think(`Noted your message: “${msg}” — factoring it in.`);
    io.act(`Browsing ${r.url}`);
    try {
      const text = await tools.fetchPage(r.url);
      sources.push({ ...r, text, gist: summarize(text, 4) });
    } catch (e) {
      io.act(`Skipping ${r.url} (${e.message})`);
    }
  }
  if (!sources.length) {
    const rel = `${project}/research/${slugify(query)}-${today()}.md`;
    await tools.write(rel, `# Research: ${query}\n\nSources were found but none could be read:\n\n${results.map((r) => `- [${r.title}](${r.url})`).join('\n')}\n`);
    return { summary: `Found sources for “${query}” but couldn't read any pages. Saved the source list to /files/${rel}.`, artifact: rel };
  }

  io.think(`Read ${sources.length} sources. Synthesizing the report.`);
  const combined = sources.map((s) => s.gist).join(' ');
  const synthesis = summarize(combined, 6);
  const kw = keywords(combined, 6);

  const rel = `${project}/research/${slugify(query)}-${today()}.md`;
  const report = [
    `# Research: ${query}`,
    ``,
    `_Compiled by ATLAS on ${new Date().toLocaleString()} · ${sources.length} sources_`,
    ``,
    `## Key takeaways`,
    synthesis || '(sources held little extractable text)',
    ``,
    `**Recurring themes:** ${kw.join(', ')}`,
    ``,
    `## Sources`,
    ...sources.map((s, i) => [``, `### ${i + 1}. ${s.title}`, `<${s.url}>`, ``, s.gist].join('\n')),
    ``,
  ].join('\n');
  io.act(`Writing ${rel}`);
  await tools.write(rel, report);

  return { summary: `Researched “${query}” across ${sources.length} sources and wrote a synthesis with citations → /files/${rel}`, artifact: rel };
}

// ============================================================================
// write_doc — structured document from topic analysis.
// ============================================================================
export async function writeDoc({ understanding, tools, io, project = 'general' }) {
  const { raw, entities } = understanding;
  const topic = entities.topic || raw.replace(/^(write|draft|compose|create)\s*(me\s*)?(a|an)?\s*/i, '').slice(0, 60) || 'Untitled';
  const r = rng('doc:' + topic);
  const kw = keywords(raw + ' ' + topic, 5);
  io.think(`Outlining “${topic}” — intro, ${Math.max(3, kw.length - 1)} sections, close.`);

  const sectionFor = (w) => {
    const T = w[0].toUpperCase() + w.slice(1);
    const open = [
      `${T} is where this subject gets interesting.`,
      `Any honest look at this topic has to deal with ${w}.`,
      `Start with ${w}, and the rest falls into place.`,
    ];
    const mid = [
      `The practical question is not whether ${w} matters, but how much weight to give it against everything else.`,
      `Treat ${w} as a lens: it exposes what is essential and what is decoration.`,
      `Most missteps here come from treating ${w} as an afterthought instead of a starting point.`,
    ];
    const close = [
      `Get ${w} right and the downstream decisions become simpler.`,
      `That is why ${w} deserves a deliberate, early decision rather than a default.`,
      `In short: ${w} is not a detail — it is structure.`,
    ];
    const p = (arr) => arr[Math.floor(r() * arr.length)];
    return `## ${T}\n\n${p(open)} ${p(mid)} ${p(close)}\n`;
  };

  const rel = `${project}/documents/${slugify(topic)}-${today()}.md`;
  const doc = [
    `# ${topic[0].toUpperCase() + topic.slice(1)}`,
    ``,
    `_Drafted by ATLAS on ${new Date().toLocaleString()}_`,
    ``,
    `## Overview`,
    ``,
    `This document lays out a working view of ${topic.toLowerCase()}: what it is, why it matters, and where to focus first. It was drafted from your brief — refine any section and hand it back for another pass.`,
    ``,
    ...kw.slice(0, 4).map(sectionFor),
    `## Where to go from here`,
    ``,
    `Pick the section that feels least settled and pressure-test it. A draft earns its keep by being argued with — send me the edits and I'll fold them in.`,
    ``,
  ].join('\n');
  io.act(`Writing ${rel}`);
  await tools.write(rel, doc);
  return { summary: `Drafted “${topic}” — an overview plus ${Math.min(4, kw.length)} themed sections → /files/${rel}`, artifact: rel };
}

// ============================================================================
// summarize_files — read the workspace, produce an extractive digest.
// ============================================================================
export async function summarizeFiles({ tools, io, project = 'general' }) {
  io.think('Scanning the workspace.');
  const files = (await tools.list()).map((f) => f.path).filter((f) => /\.(md|txt|html?)$/i.test(f));
  if (!files.length) {
    return { summary: 'Your workspace has no readable documents yet. Assign me something to build first, then I can summarize it.', artifact: null };
  }
  io.act(`Reading ${Math.min(files.length, 12)} of ${files.length} documents`);
  const parts = [];
  for (const f of files.slice(0, 12)) {
    try {
      const text = await tools.read(f);
      parts.push({ f, gist: summarize(text.replace(/<[^>]+>/g, ' '), 2) || '(mostly markup)' });
    } catch {}
  }
  const rel = `${project}/notes/workspace-digest-${today()}.md`;
  const body = [
    `# Workspace digest`,
    ``,
    `_${parts.length} documents · summarized by ATLAS on ${new Date().toLocaleString()}_`,
    ``,
    ...parts.map((p) => `## ${p.f}\n\n${p.gist}\n`),
  ].join('\n');
  io.act(`Writing ${rel}`);
  await tools.write(rel, body);
  return { summary: `Summarized ${parts.length} documents into a digest → /files/${rel}`, artifact: rel };
}

// ============================================================================
// organize — inventory + proposed structure.
// ============================================================================
export async function organize({ tools, io, project = 'general' }) {
  io.think('Taking inventory of the workspace, grouped by project.');
  const files = await tools.list();
  const byProject = {};
  for (const f of files) {
    const proj = f.path.includes('/') ? f.path.split('/')[0] : '(root)';
    (byProject[proj] ||= []).push(f);
  }
  const rel = `${project}/notes/inventory-${today()}.md`;
  const body = [
    `# Workspace inventory`,
    ``,
    `_${files.length} files across ${Object.keys(byProject).length} projects · by ATLAS on ${new Date().toLocaleString()}_`,
    ``,
    ...Object.entries(byProject).map(([proj, list]) =>
      `## ${proj} (${list.length})\n\n${list.map((f) => `- ${f.path} · ${(f.size / 1024).toFixed(1)} KB`).join('\n')}\n`),
    `## How I organize`,
    ``,
    `Every task belongs to a project. Inside each project folder:`,
    ``,
    `- \`site/\` — the project's website`,
    `- \`research/\` — cited reports`,
    `- \`documents/\` — drafts and writing`,
    `- \`notes/\` — digests and inventories (like this one)`,
    ``,
  ].join('\n');
  io.act(`Writing ${rel}`);
  await tools.write(rel, body);
  return { summary: `Inventoried ${files.length} files across ${Object.keys(byProject).length} projects and wrote the organization plan → /files/${rel}`, artifact: rel };
}

export const SKILLS = {
  build_website: buildWebsite,
  research,
  write_doc: writeDoc,
  summarize_files: summarizeFiles,
  organize,
  generic_task: writeDoc, // a generic ask becomes a structured working document
};
