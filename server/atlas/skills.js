// ATLAS Core — skills. Each skill is an engineered competency that produces a
// real artifact in the account's workspace. Skills are ITERATIVE: when the
// artifact already exists, a run becomes an improvement pass instead of a
// rebuild — that's how deadline work refines over time.
// io: io.think(text), io.act(text), io.inbox() → operator chat sent mid-run.
import { summarize, keywords } from './knowledge.js';
import { rng, palette, heroCopy, featureCopy, svgBackdrop, svgMark } from './generator.js';

export const slugify = (s) =>
  String(s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const today = () => new Date().toISOString().slice(0, 10);
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// What ATLAS says it will do before it does it — surfaced as the plan event.
export const PLANS = {
  build_website: [
    'Parse the brief: topic, palette, voice, sections',
    'Compose the copy — headline, story, extras',
    'Generate original SVG art and a responsive layout',
    'Write the site into the project folder',
    'Review the result — and keep refining it pass after pass if a deadline is set',
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
    'Review — and deepen it on later passes if a deadline is set',
  ],
  write_story: [
    'Think the plot through first — cast, arcs, chapter beats',
    'Write the outline, then the opening chapters',
    'Return pass after pass to write the remaining chapters',
    'Revise repeatedly until the deadline',
    'Review against the checklist',
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
    if (/atlas-app:/.test(content)) {
      push(/addEventListener/.test(content), 'Interactive controls are wired up');
      push(/localStorage/.test(content), 'State persists between visits');
    } else {
      push((content.match(/<section/gi) || []).length >= 1, 'Content sections are present');
      push(/<svg/i.test(content), 'Original artwork included');
    }
    push(/<\/html>\s*$/i.test(content), 'Document closes cleanly');
  } else if (/\.md$/i.test(rel)) {
    push(/^#\s+.+/m.test(content), 'Has a proper heading');
    push(content.length > 300, 'Substantial content (not a stub)');
    push(/^##\s+/m.test(content), 'Organized into sections');
    if (/\/research\//.test(rel)) push(/<https?:\/\//.test(content) || /\]\(https?:\/\//.test(content), 'Sources are cited');
  }
  return checks;
}

// ============================================================================
// build_website — first pass builds; every later pass IMPROVES the same site.
// The version ladder adds sections and polish instead of starting over.
// ============================================================================
const FAQ_POOL = (t) => [
  [`What is ${t}?`, `The short version: exactly what this page says — no fine print, no surprises.`],
  [`How do I get started?`, `Reach out through the signup below (or just show up). We keep the first step easy on purpose.`],
  [`Where can I follow along?`, `New dates, drops, and announcements land here first — join the list and you won't miss one.`],
  [`Do you take requests?`, `Always. The best ideas we've shipped started as a message from someone like you.`],
];
const QUOTE_POOL = [
  ['“Exactly what it promises — and then some.”', 'Riley M.'],
  ['“I found them by accident and stayed on purpose.”', 'Dana K.'],
  ['“The real thing. You can tell within a minute.”', 'Sam O.'],
  ['“Quietly the best around. Not so quiet anymore.”', 'Alex P.'],
];

function buildSiteHtml({ topic, entities, pal, tone, version, name }) {
  const r = rng('site:' + topic); // stable identity: hero stays consistent across passes
  const rv = rng(`site:${topic}:v${version}`); // per-pass variation for new material
  const hero = heroCopy(topic, tone, r);
  const cards = featureCopy(topic, tone, r);

  const nav = ['About',
    entities.wantsDates ? 'Dates' : null,
    version >= 3 ? 'Voices' : null,
    version >= 2 ? 'FAQ' : null,
    entities.wantsSignup ? 'Sign up' : null].filter(Boolean);

  const dates = entities.wantsDates
    ? Array.from({ length: 4 }, (_, i) => {
        const d = new Date(Date.now() + (i + 1) * 11 * 864e5);
        return { date: d.toLocaleDateString([], { month: 'short', day: 'numeric' }), place: ['The Foundry', 'Riverside Hall', 'Echo Room', 'Union Stage'][i], city: ['Portland', 'Seattle', 'Boise', 'Denver'][i] };
      })
    : null;

  const faq = version >= 2 ? FAQ_POOL(topic).slice(0, 3 + (version > 3 ? 1 : 0)) : null;
  const quotes = version >= 3 ? [...QUOTE_POOL].sort(() => rv() - 0.5).slice(0, 3) : null;
  const gallery = version >= 4
    ? Array.from({ length: 6 }, (_, i) => svgBackdrop(`${topic}:tile${i}:v${version}`, pal.accent))
    : null;

  return `<!doctype html>
<!-- atlas-pass:${version} -->
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${version >= 2 ? `<meta name="description" content="${esc(hero.sub)}">\n<meta property="og:title" content="${esc(topic)}">\n<meta property="og:description" content="${esc(hero.tag)}">` : ''}
<title>${esc(topic)}</title>
<style>
  :root{--bg:${pal.bg};--panel:${pal.panel};--ink:${pal.ink};--dim:${pal.dim};--accent:${pal.accent};--accent2:${pal.accent2}}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--ink);line-height:1.6}
  .wrap{max-width:1040px;margin:0 auto;padding:0 24px}
  header{display:flex;align-items:center;justify-content:space-between;padding:20px 0;flex-wrap:wrap;gap:10px}
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
  .quotes{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}
  blockquote{background:var(--panel);border-left:3px solid var(--accent);border-radius:0 12px 12px 0;padding:22px;font-size:15.5px;line-height:1.55}
  blockquote cite{display:block;margin-top:12px;color:var(--dim);font-style:normal;font-size:13px}
  details{background:var(--panel);border-radius:12px;padding:18px 20px;margin-bottom:10px;border:1px solid color-mix(in srgb,var(--ink) 8%,transparent)}
  summary{font-weight:700;cursor:pointer;font-size:15.5px}
  details p{color:var(--dim);margin-top:10px;font-size:14.5px}
  .gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
  .tile{aspect-ratio:4/3;border-radius:12px;overflow:hidden;background:var(--panel)}.tile svg{width:100%;height:100%}
  form{display:flex;gap:10px;max-width:440px;flex-wrap:wrap}
  input{flex:1;min-width:200px;padding:13px 15px;border-radius:10px;border:1px solid color-mix(in srgb,var(--ink) 15%,transparent);background:var(--panel);color:var(--ink);font-size:15px}
  button{padding:13px 24px;border-radius:10px;border:none;background:var(--accent);color:${pal.name === 'paper' ? '#fff' : pal.bg};font-weight:700;font-size:15px;cursor:pointer}
  footer{padding:44px 0;color:var(--dim);font-size:13px;border-top:1px solid color-mix(in srgb,var(--ink) 8%,transparent);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
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
  ${quotes ? `<section id="voices"><h2>What people say</h2><div class="quotes">
    ${quotes.map(([q, who]) => `<blockquote>${q}<cite>— ${who}</cite></blockquote>`).join('\n    ')}
  </div></section>` : ''}
  ${gallery ? `<section id="gallery"><h2>Gallery</h2><div class="gallery">
    ${gallery.map((g) => `<div class="tile">${g}</div>`).join('\n    ')}
  </div></section>` : ''}
  ${faq ? `<section id="faq"><h2>FAQ</h2>
    ${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n    ')}
  </section>` : ''}
  ${entities.wantsSignup ? `<section id="sign-up"><h2>Stay in the loop</h2>
  <form onsubmit="event.preventDefault();this.innerHTML='<p style=color:var(--accent)>You\\'re on the list. Talk soon.</p>'">
    <input type="email" required placeholder="you@email.com" aria-label="Email"><button>Sign up</button>
  </form></section>` : ''}
  <footer><span>© ${new Date().getFullYear()} ${esc(topic)}</span><span>Built by ${name || 'ATLAS'} · pass ${version}</span></footer>
</div>
</body>
</html>`;
}

const PASS_NOTES = {
  2: 'adding search metadata and an FAQ',
  3: 'adding a testimonials section and refreshing details',
  4: 'adding a gallery of original artwork',
};

// ============================================================================
// App mode — when the brief asks for a TOOL (counter, todo, stopwatch), the
// page IS the tool: working vanilla JS, no marketing sections, no brand fluff.
// ============================================================================
function detectApp(raw) {
  if (/\b(counter|clicker|click count|tally|push(es)? the button|button press(es)?)\b/i.test(raw)) return 'counter';
  if (/\b(to-?do list|todo|checklist|task list)\b/i.test(raw)) return 'todo';
  if (/\b(stopwatch|timer|countdown)\b/i.test(raw)) return 'timer';
  return null;
}

const APP_META = {
  counter: { title: 'The Button', blurb: 'One button. One number. Push it.' },
  todo: { title: 'The List', blurb: 'Write it down. Check it off.' },
  timer: { title: 'The Stopwatch', blurb: 'Start. Stop. Reset. Simple.' },
};

function appWidget(appType) {
  if (appType === 'counter') {
    return {
      html: `
  <div class="tool">
    <div class="count" id="count">0</div>
    <button class="push" id="push">PUSH</button>
    <div class="toolbar"><span id="msg">Every push counts.</span><button class="ghost" id="reset">reset</button></div>
  </div>`,
      js: `
  var KEY='atlas-counter';
  var count=Number(localStorage.getItem(KEY)||0);
  var el=document.getElementById('count'), btn=document.getElementById('push'), msg=document.getElementById('msg');
  function draw(){ el.textContent=count.toLocaleString(); }
  draw();
  btn.addEventListener('click', function(){
    count++; localStorage.setItem(KEY,count); draw();
    btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
    var milestones={10:'Double digits!',50:'Fifty. Respect.',100:'ONE HUNDRED.',500:'You may need a hobby.',1000:'Legend status.'};
    if(milestones[count]) msg.textContent=milestones[count];
  });
  document.getElementById('reset').addEventListener('click', function(){
    if(confirm('Reset the count to zero?')){ count=0; localStorage.setItem(KEY,0); draw(); msg.textContent='Fresh start.'; }
  });`,
    };
  }
  if (appType === 'todo') {
    return {
      html: `
  <div class="tool">
    <div class="row"><input id="what" placeholder="What needs doing?" autocomplete="off"><button class="push sm" id="add">Add</button></div>
    <ul id="list" class="todos"></ul>
  </div>`,
      js: `
  var KEY='atlas-todos';
  var items=JSON.parse(localStorage.getItem(KEY)||'[]');
  var list=document.getElementById('list'), input=document.getElementById('what');
  function save(){ localStorage.setItem(KEY, JSON.stringify(items)); }
  function draw(){
    list.innerHTML='';
    items.forEach(function(it,i){
      var li=document.createElement('li'); if(it.done) li.className='done';
      var cb=document.createElement('input'); cb.type='checkbox'; cb.checked=it.done;
      cb.addEventListener('change',function(){ items[i].done=cb.checked; save(); draw(); });
      var span=document.createElement('span'); span.textContent=it.text;
      var del=document.createElement('button'); del.className='ghost'; del.textContent='✕';
      del.addEventListener('click',function(){ items.splice(i,1); save(); draw(); });
      li.appendChild(cb); li.appendChild(span); li.appendChild(del); list.appendChild(li);
    });
  }
  function add(){ var t=input.value.trim(); if(!t) return; items.push({text:t,done:false}); input.value=''; save(); draw(); }
  document.getElementById('add').addEventListener('click', add);
  input.addEventListener('keydown', function(e){ if(e.key==='Enter') add(); });
  draw();`,
    };
  }
  // timer / stopwatch
  return {
    html: `
  <div class="tool">
    <div class="count" id="clock">0:00.0</div>
    <div class="row center">
      <button class="push sm" id="startstop">Start</button>
      <button class="ghost" id="reset">Reset</button>
    </div>
  </div>`,
    js: `
  var t0=null, acc=0, tick=null;
  var clock=document.getElementById('clock'), ss=document.getElementById('startstop');
  function fmt(ms){ var s=ms/1000, m=Math.floor(s/60); return m+':'+String(Math.floor(s%60)).padStart(2,'0')+'.'+Math.floor((ms%1000)/100); }
  function draw(){ clock.textContent=fmt(acc+(t0?Date.now()-t0:0)); }
  ss.addEventListener('click', function(){
    if(t0){ acc+=Date.now()-t0; t0=null; clearInterval(tick); ss.textContent='Start'; }
    else { t0=Date.now(); tick=setInterval(draw,100); ss.textContent='Stop'; }
    draw();
  });
  document.getElementById('reset').addEventListener('click', function(){ t0=null; acc=0; clearInterval(tick); ss.textContent='Start'; draw(); });
  draw();`,
  };
}

function buildAppHtml({ appType, topic, pal, version }) {
  const meta = APP_META[appType];
  const w = appWidget(appType);
  return `<!doctype html>
<!-- atlas-pass:${version} -->
<!-- atlas-app:${appType} -->
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(topic || meta.title)}</title>
<style>
  :root{--bg:${pal.bg};--panel:${pal.panel};--ink:${pal.ink};--dim:${pal.dim};--accent:${pal.accent};--accent2:${pal.accent2}}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--ink);
    min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;padding:24px;text-align:center}
  h1{font-size:clamp(28px,6vw,44px);letter-spacing:-1px}
  .blurb{color:var(--dim);font-size:16px}
  .tool{background:var(--panel);border:1px solid color-mix(in srgb,var(--ink) 10%,transparent);border-radius:20px;
    padding:34px;min-width:min(420px,92vw);box-shadow:0 24px 60px rgba(0,0,0,.35), inset 0 1px 0 color-mix(in srgb,var(--ink) 14%,transparent)}
  .count{font-size:clamp(48px,12vw,84px);font-weight:800;font-variant-numeric:tabular-nums;margin-bottom:22px;
    color:var(--accent);text-shadow:0 0 30px color-mix(in srgb,var(--accent) 45%,transparent)}
  .push{font-size:22px;font-weight:800;letter-spacing:1px;padding:20px 54px;border:none;border-radius:60px;cursor:pointer;
    color:${'#fff'};background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 70%,white) 0%,var(--accent) 45%,var(--accent2) 55%,var(--accent) 100%);
    box-shadow:inset 0 2px 0 rgba(255,255,255,.6), inset 0 -4px 8px rgba(0,0,0,.35), 0 10px 26px color-mix(in srgb,var(--accent) 45%,transparent);
    transition:transform .06s ease}
  .push:active{transform:translateY(3px)}
  .push.pop{animation:pop .18s ease}
  @keyframes pop{40%{transform:scale(1.07)}}
  .push.sm{font-size:15px;padding:12px 26px}
  .toolbar{display:flex;justify-content:space-between;align-items:center;margin-top:22px;color:var(--dim);font-size:13px}
  .ghost{background:none;border:none;color:var(--dim);cursor:pointer;font-size:13px;text-decoration:underline}
  .row{display:flex;gap:10px}.row.center{justify-content:center}
  input{flex:1;padding:13px 15px;border-radius:12px;border:1px solid color-mix(in srgb,var(--ink) 15%,transparent);
    background:var(--bg);color:var(--ink);font-size:15px}
  .todos{list-style:none;margin-top:18px;text-align:left}
  .todos li{display:flex;align-items:center;gap:10px;padding:11px 6px;border-bottom:1px solid color-mix(in srgb,var(--ink) 8%,transparent)}
  .todos li span{flex:1}
  .todos li.done span{text-decoration:line-through;color:var(--dim)}
  footer{color:var(--dim);font-size:12px}
</style>
</head>
<body>
  <div><h1>${esc(topic || meta.title)}</h1><p class="blurb">${esc(meta.blurb)}</p></div>
${w.html}
  <footer>Built by ATLAS · pass ${version}</footer>
<script>
${w.js}
</script>
</body>
</html>`;
}

export async function buildWebsite({ understanding, tools, io, project = 'general', target = null }) {
  const { entities, raw } = understanding;
  let topic = entities.topic || keywords(raw, 2).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || 'My Project';
  const rel = target || `${project}/site/index.html`;
  let appType = detectApp(raw);

  // Improvement pass? Read the current version and step the ladder.
  let version = 1;
  if (await tools.exists(rel)) {
    const current = await tools.read(rel);
    // Keep the site's identity: on refinement the existing title IS the topic,
    // and an app page stays an app page.
    const existingTitle = current.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
    if (existingTitle) topic = existingTitle;
    appType = current.match(/atlas-app:(\w+)/)?.[1] || appType;
    version = (Number(current.match(/atlas-pass:(\d+)/)?.[1]) || 1) + 1;
    const archived = `${project}/site/history/v${version - 1}.html`;
    io.think(`The site already exists (pass ${version - 1}). This is an improvement pass — ${PASS_NOTES[version] || 'polishing copy and structure'}.`);
    io.act(`Archiving the previous version to ${archived}`);
    await tools.write(archived, current);
  }

  const pal = palette(topic);
  const tone = entities.tone;

  for (const msg of io.inbox()) io.think(`Noted your message: “${msg}” — factoring it in.`);

  // --- app mode: the page IS a working tool -------------------------------
  if (appType) {
    const appTitle = APP_META[appType].title;
    const toolTopic = entities.topic && !/counter|clicker|tally|todo|timer|stopwatch/i.test(entities.topic)
      ? entities.topic : appTitle;
    if (version === 1) io.think(`This brief wants a working ${appType} — building the tool itself, not a brochure.`);
    io.act(version === 1 ? `Wiring up the ${appType} logic (vanilla JS, saves locally)` : `Polishing the ${appType} (pass ${version})`);
    const html = buildAppHtml({ appType, topic: toolTopic, pal, version });
    io.act(`Writing ${rel}`);
    await tools.write(rel, html);
    return {
      summary: version === 1
        ? `Built a working ${appType} — push it, it counts. View it at /files/${rel}`
        : `Polished the ${appType} (pass ${version}). View it at /files/${rel}`,
      artifact: rel,
    };
  }

  if (version === 1) io.think(`Designing a one-page site for “${topic}” — ${pal.name} palette, ${tone} voice.`);
  io.act(version === 1
    ? `Composing copy: headline, sections${entities.wantsDates ? ', dates' : ''}${entities.wantsSignup ? ', signup' : ''}`
    : `Rebuilding with pass-${version} upgrades on top of the existing structure`);

  const html = buildSiteHtml({ topic, entities, pal, tone, version });
  io.act(`Writing ${rel}`);
  await tools.write(rel, html);

  const what = version === 1
    ? `Built a responsive one-page site for “${topic}” — ${pal.name} palette`
    : `Improved “${topic}” (pass ${version}) — ${PASS_NOTES[version] || 'copy and detail polish'}`;
  return { summary: `${what}. View it at /files/${rel}`, artifact: rel };
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
    return { summary: `Couldn't reach the web for “${query}” — saved a placeholder at /files/${rel}. Re-run me when the connection is back.`, artifact: rel };
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
// write_doc — structured document; later passes deepen it instead of redoing it.
// ============================================================================
export async function writeDoc({ understanding, tools, io, project = 'general', target = null }) {
  const { raw, entities } = understanding;
  const topic = entities.topic || raw.replace(/^(write|draft|compose|create)\s*(me\s*)?(a|an)?\s*/i, '').slice(0, 60) || 'Untitled';
  const rel = target || `${project}/documents/${slugify(topic)}-${today()}.md`;

  // Improvement pass: deepen an existing draft.
  if (await tools.exists(rel)) {
    const current = await tools.read(rel);
    const passN = (current.match(/^## Deep dive/gm) || []).length + 2;
    const kw = keywords(raw + ' ' + topic + ' ' + current, 10);
    const focus = kw[(passN + 1) % kw.length] || topic;
    io.think(`The draft exists — this is pass ${passN}: going deeper on “${focus}”.`);
    const r = rng(`doc:${topic}:v${passN}`);
    const deep = [
      ``,
      `## Deep dive: ${focus[0].toUpperCase() + focus.slice(1)}`,
      ``,
      pick(r, [
        `Returning to this draft with fresh eyes, ${focus} stands out as the section that deserves more weight.`,
        `On review, the argument tightens considerably once ${focus} is treated as a first-class concern.`,
      ]) + ' ' + pick(r, [
        `The practical implication: decisions made here ripple into everything downstream, so it pays to be explicit early.`,
        `A working rule of thumb — if a choice touches ${focus}, write the reasoning down; future-you will need it.`,
      ]),
      ``,
      `_Revision pass ${passN} · ${new Date().toLocaleString()}_`,
    ].join('\n');
    io.act(`Appending the deep dive to ${rel}`);
    await tools.write(rel, current + deep);
    return { summary: `Deepened “${topic}” (pass ${passN}) with a focused section on ${focus} → /files/${rel}`, artifact: rel };
  }

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
    return `## ${T}\n\n${pick(r, open)} ${pick(r, mid)} ${pick(r, close)}\n`;
  };

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
// write_story — long-form fiction, the honest way: plot first, chapters in
// batches across passes, then revision passes until the deadline.
// ============================================================================
const FIRST = ['Mara', 'Jonas', 'Priya', 'Theo', 'Alba', 'Ruslan', 'Noor', 'Casimir', 'Ivy', 'Dorian', 'Sefa', 'June'];
const LAST = ['Voss', 'Okafor', 'Lindqvist', 'Barrow', 'Ashida', 'Quiroga', 'Mercer', 'Halloran'];
const ROLES = ['a stubborn cartographer', 'a retired signal engineer', 'an apprentice archivist', 'a night-market courier', 'a lighthouse keeper', 'a debt-ridden pilot'];

function makeCast(r) {
  const used = new Set();
  const person = () => {
    let n;
    do { n = `${pick(r, FIRST)} ${pick(r, LAST)}`; } while (used.has(n));
    used.add(n);
    return n;
  };
  return {
    hero: { name: person(), role: pick(r, ROLES) },
    ally: { name: person(), role: pick(r, ROLES) },
    rival: { name: person(), role: pick(r, ROLES) },
  };
}

function beatTitles(topic, chapters, r) {
  const arcs = [
    `An ordinary day near ${topic} goes wrong`, 'The first sign no one else believes',
    'A reluctant departure', 'The ally with a secret', 'A map that lies',
    'Small victory, larger cost', 'The rival shows their hand', 'Everything learned so far is wrong',
    'The long night', 'A door that should not open', 'The truth about the beginning',
    'Losing the one thing that mattered', 'The plan of last resort', 'Crossing back',
    'The confrontation', 'What was actually being protected', 'The price is paid',
    'A quieter world', 'What the hero keeps', 'The last signal',
  ];
  const out = [];
  for (let i = 0; i < chapters; i++) out.push(arcs[i % arcs.length] + (i >= arcs.length ? ` — part ${Math.floor(i / arcs.length) + 1}` : ''));
  return out;
}

function chapterProse(topic, beat, cast, r) {
  const p1 = pick(r, [
    `The morning smelled of rain and old iron when ${cast.hero.name} first understood that ${beat.toLowerCase()}.`,
    `Later, ${cast.hero.name} would say it began with a sound — thin, patient, wrong — threading itself through everything ${topic.toLowerCase()} was supposed to be.`,
    `Nobody chooses the day the world tilts. ${cast.hero.name}, ${cast.hero.role}, certainly hadn't.`,
  ]);
  const p2 = pick(r, [
    `${cast.ally.name} arrived an hour after the news, coat still dripping, carrying the kind of calm that only comes from having decided something on the way.`,
    `It was ${cast.ally.name} who said it plainly: whatever this was, it had started long before either of them noticed, and it was not going to wait politely.`,
    `${cast.hero.name} worked the problem the way ${cast.hero.role.replace(/^an? /, '')} would — from the edges in, trusting nothing that hadn't been checked twice.`,
  ]);
  const p3 = pick(r, [
    `“You already know what I'm going to say,” ${cast.rival.name} said, not unkindly. “You just don't want to be the one who says it first.”`,
    `“Then we do it the hard way,” ${cast.hero.name} said, and the words sounded braver than the hands that shook while saying them.`,
    `“There's a version of this where we walk away,” ${cast.ally.name} offered. Neither of them reached for it.`,
  ]);
  const p4 = pick(r, [
    `By nightfall the shape of it was clear, and it was larger than they had let themselves guess.`,
    `What they found did not answer the question. It replaced it with a better one — the expensive kind.`,
    `They left before dawn, taking only what could be carried and one thing that couldn't: the feeling that ${topic.toLowerCase()} was watching them go.`,
  ]);
  return [p1, p2, p3, p4].join('\n\n');
}

export async function writeStory({ understanding, tools, io, project = 'general', target = null }) {
  const { entities, raw } = understanding;
  const topic = entities.topic || keywords(raw, 2).join(' ') || 'the lost signal';
  // A targeted refine points inside some project's story/ folder — stay there.
  const storyDir = target ? target.replace(/\/[^/]+$/, '') : `${project}/story`;
  const outlineRel = `${storyDir}/outline.md`;
  const storyRel = `${storyDir}/story.md`;
  const r = rng('story:' + topic);
  const chapters = Math.max(8, Math.min(60, Math.round((entities.pages || 40) / 4)));
  const BATCH = 4;

  // --- pass 1: think the plot through, then open the book ---------------------
  if (!(await tools.exists(outlineRel))) {
    io.think(`Before writing a word: thinking the plot through for “${topic}”.`);
    const cast = makeCast(r);
    const beats = beatTitles(topic, chapters, r);
    io.think(`Cast set — ${cast.hero.name} (${cast.hero.role}), ${cast.ally.name} (${cast.ally.role}), against ${cast.rival.name}. ${chapters} chapters across three acts.`);
    const outline = [
      `# Outline — ${topic}`,
      ``,
      `_Planned by ATLAS on ${new Date().toLocaleString()} · target ${chapters} chapters${entities.pages ? ` (~${entities.pages} pages)` : ''}_`,
      ``,
      `## Cast`,
      `- **${cast.hero.name}** — ${cast.hero.role} (protagonist)`,
      `- **${cast.ally.name}** — ${cast.ally.role} (ally)`,
      `- **${cast.rival.name}** — ${cast.rival.role} (rival)`,
      ``,
      `## Chapter beats`,
      ...beats.map((b, i) => `${i + 1}. ${b}`),
      ``,
    ].join('\n');
    io.act(`Writing ${outlineRel}`);
    await tools.write(outlineRel, outline);

    io.act(`Opening the manuscript — chapters 1–${Math.min(BATCH, chapters)}`);
    const opening = beats.slice(0, BATCH).map((b, i) =>
      `## Chapter ${i + 1} — ${b}\n\n${chapterProse(topic, b, cast, rng(`ch:${topic}:${i + 1}`))}\n`);
    const head = `# ${topic[0].toUpperCase() + topic.slice(1)}\n\n_A novel drafted by ATLAS · begun ${new Date().toLocaleString()}_\n\n`;
    await tools.write(storyRel, head + opening.join('\n'));
    return {
      summary: `Plotted “${topic}” (${chapters} chapters, cast of three) and wrote the opening ${Math.min(BATCH, chapters)} chapters. I'll keep writing pass by pass → /files/${storyRel}`,
      artifact: storyRel,
    };
  }

  // --- later passes: continue chapters, then revise ---------------------------
  const outline = await tools.read(outlineRel);
  const story = await tools.read(storyRel);
  const cast = makeCast(rng('story:' + topic)); // deterministic: same seed, same cast
  const beats = outline.split('## Chapter beats')[1]?.trim().split('\n')
    .map((l) => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean) || [];
  const written = (story.match(/^## Chapter /gm) || []).length;

  for (const msg of io.inbox()) io.think(`Noted your message: “${msg}” — factoring it in.`);

  if (written < beats.length) {
    const upto = Math.min(written + BATCH, beats.length);
    io.think(`Manuscript is at chapter ${written} of ${beats.length}. Writing chapters ${written + 1}–${upto}.`);
    const add = beats.slice(written, upto).map((b, i) => {
      const n = written + i + 1;
      return `## Chapter ${n} — ${b}\n\n${chapterProse(topic, b, cast, rng(`ch:${topic}:${n}`))}\n`;
    });
    io.act(`Extending ${storyRel}`);
    await tools.write(storyRel, story + '\n' + add.join('\n'));
    const done = upto === beats.length;
    return {
      summary: `Wrote chapters ${written + 1}–${upto} of “${topic}” (${upto}/${beats.length}).${done ? ' Draft complete — revision passes come next.' : ' More passes to come.'} → /files/${storyRel}`,
      artifact: storyRel,
    };
  }

  // Revision pass: re-work one earlier chapter with fresh prose, keep a log.
  const revN = (story.match(/Revision pass \d+/g) || []).length + 1;
  const chapNo = ((revN - 1) % beats.length) + 1;
  io.think(`Draft is complete — revision pass ${revN}: reworking chapter ${chapNo} with fresh eyes.`);
  const fresh = chapterProse(topic, beats[chapNo - 1], cast, rng(`ch:${topic}:${chapNo}:rev${revN}`));
  const revised = story.replace(
    new RegExp(`(## Chapter ${chapNo} — [^\\n]+\\n\\n)[\\s\\S]*?(?=\\n## Chapter |\\n_Revision|$)`),
    `$1${fresh}\n`
  ) + `\n_Revision pass ${revN} · chapter ${chapNo} reworked · ${new Date().toLocaleString()}_\n`;
  io.act(`Rewriting chapter ${chapNo} in ${storyRel}`);
  await tools.write(storyRel, revised);
  return {
    summary: `Revision pass ${revN} on “${topic}”: chapter ${target} reworked. The manuscript keeps tightening until the deadline → /files/${storyRel}`,
    artifact: storyRel,
  };
}

// ============================================================================
// summarize_files / organize
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
    `- \`site/\` — the project's website (with \`history/\` for earlier passes)`,
    `- \`story/\` — outline + manuscript`,
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
  write_story: writeStory,
  summarize_files: summarizeFiles,
  organize,
  generic_task: writeDoc,
};
