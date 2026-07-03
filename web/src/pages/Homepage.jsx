import React from 'react';
import { Icon, Mark } from '../icons.jsx';
import Globe from '../Globe.jsx';

export default function Homepage({ agent, connected, tasks, user, onLaunch, onSignIn }) {
  const name = agent?.name || 'ATLAS';
  const engine = agent?.engine || {};
  const runs = tasks.reduce((n, t) => n + (t.runCount || 0), 0);

  return (
    <div className="home">
      <div className="home-grain" />

      {/* nav */}
      <nav className="home-nav">
        <div className="brandline"><Mark size={28} /><span className="wordmark"><span className="wordmark-my">my</span><span className="wordmark-agent">Agent</span></span></div>
        <div className="home-nav-right">
          <span className={`net-badge ${connected || agent ? 'on' : 'off'}`}>
            <span className="led" /> {agent ? 'atlas network · online' : 'connecting…'}
          </span>
          {user ? (
            <button className="gel-btn gel-primary" onClick={onLaunch}>Open Deck <Icon name="arrow" size={16} /></button>
          ) : (
            <button className="gel-btn gel-primary" onClick={onSignIn}>Sign in <Icon name="arrow" size={16} /></button>
          )}
        </div>
      </nav>

      {/* hero */}
      <header className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><Icon name="shield" size={14} /> Cloud platform · AI built from scratch</div>
          <h1 className="hero-h1">
            Your own agent,<br />working while<br /><span className="accent">you're away.</span>
          </h1>
          <p className="hero-sub">
            myAgent gives you a personal AI agent in the cloud. Hand it a task in plain
            English — websites, research, writing, busywork — and it plans it out loud,
            does the work, and reviews it before handing it back. Private to your account,
            organized by project.
          </p>
          <div className="hero-cta">
            <button className="gel-btn gel-primary big" onClick={onLaunch}>{user ? 'Enter the Command Deck' : 'Create your account'}</button>
            <a className="text-link" href="#how">See how it works <Icon name="arrow" size={15} /></a>
          </div>
        </div>

        <div className="hero-visual">
          <Globe size={210} busy={tasks.some((t) => t.status === 'running')} />
          <div className="orb-plate">{name}</div>
          <div className="hero-stats">
            <Stat value={engine.skills ?? 5} label="Skills" />
            <Stat value={engine.intents ?? 8} label="Intents" />
            <Stat value={user ? runs : engine.vocab ?? 0} label={user ? 'Runs' : 'Vocabulary'} live={tasks.some((t) => t.status === 'running')} />
          </div>
        </div>
      </header>

      {/* how it works */}
      <section className="band" id="how">
        <div className="band-head">
          <h2 className="band-title">Three steps. Then walk away.</h2>
          <p className="band-sub">No prompting tricks. Tell it what you want like you'd tell a person.</p>
        </div>
        <div className="steps">
          <Step n="1" title="Assign a task" icon="spark">
            Describe the outcome you want. “Build a landing page,” “research suppliers,” “summarize this folder.”
          </Step>
          <Step n="2" title="Set when" icon="calendar">
            Run it now, every 30 minutes, daily, or overnight with a deadline like “done by 8 AM.”
          </Step>
          <Step n="3" title="It works & reports" icon="check">
            Watch {name} think and act in a live feed. Chat to steer it. Get a text when it's done.
          </Step>
        </div>
      </section>

      {/* capabilities */}
      <section className="band">
        <div className="band-head"><h2 className="band-title">Built to actually do things</h2></div>
        <div className="cap-grid">
          <Cap icon="brain" title="An AI that's truly yours"
            body={`${name} runs on ATLAS Core — an original engine written for this project. No Anthropic, no Ollama, no cloud. It thinks on your hardware.`} />
          <Cap icon="globe" title="Real web browsing"
            body="Searches the live web and reads pages, then writes cited research reports." />
          <Cap icon="calendar" title="Detailed scheduling"
            body="One-off, recurring, overnight, or deadline-driven runs. Build me a site by morning — done." />
          <Cap icon="chat" title="Two-way chat"
            body={`Message ${name} while it works, or hold an open conversation on its own page.`} />
          <Cap icon="plug" title="Platform integrations"
            body="Webhooks to Slack, Discord, or your own services — plus a developer API with keys, and SMS alerts." />
          <Cap icon="lock" title="Accounts & 2SV"
            body="Every person gets their own account, workspace, and settings — protected by two-step verification." />
        </div>
      </section>

      {/* the Atlas Network */}
      <section className="band atlas-band" id="atlas-network">
        <div className="band-head">
          <div className="eyebrow center"><Icon name="globe" size={14} /> The Atlas Network</div>
          <h2 className="band-title">One agent. A whole network behind it.</h2>
          <p className="band-sub">
            {name} isn't a wrapper around someone else's model — it's an original engine,
            and every part of it runs inside your account's private slice of the network.
          </p>
        </div>
        <div className="atlas-grid-home">
          <div className="anode panel">
            <div className="anode-top"><Icon name="brain" size={18} /><span>Understanding</span></div>
            <p>A from-scratch language layer reads your brief — intent, topic, tone, deadline — and asks before it assumes.</p>
          </div>
          <div className="anode panel">
            <div className="anode-top"><Icon name="code" size={18} /><span>Planning</span></div>
            <p>Every task starts with a numbered plan posted to your feed, so you always know what {name} is about to do.</p>
          </div>
          <div className="anode panel">
            <div className="anode-top"><Icon name="globe" size={18} /><span>Live web reach</span></div>
            <p>Searches and reads the open web for current information — research reports come back with citations.</p>
          </div>
          <div className="anode panel">
            <div className="anode-top"><Icon name="refresh" size={18} /><span>Refinement</span></div>
            <p>Give it a deadline and it doesn't rush — it drafts, then returns pass after pass, improving until the hour you set.</p>
          </div>
          <div className="anode panel">
            <div className="anode-top"><Icon name="eye" size={18} /><span>Self-review</span></div>
            <p>Before sign-off, {name} re-opens its own work and runs a quality checklist. You see every check in the feed.</p>
          </div>
          <div className="anode panel">
            <div className="anode-top"><Icon name="lock" size={18} /><span>Private by design</span></div>
            <p>Your tasks, chats, and files live in your account only. Nothing is shared unless you mint a link — revocable anytime.</p>
          </div>
        </div>
        <div className="atlas-ticker">
          <span className="ticker-item"><b>{engine.skills ?? 6}</b> skills</span>
          <span className="ticker-item"><b>{engine.intents ?? 9}</b> intents</span>
          <span className="ticker-item"><b>{engine.vocab ?? '—'}</b> word vocabulary</span>
          <span className="ticker-item"><b>0</b> external AI calls</span>
        </div>
      </section>

      {/* meet ATLAS */}
      <section className="band meet">
        <div className="meet-left">
          <div className="eyebrow"><Icon name="bolt" size={14} /> The agent</div>
          <h2 className="band-title">Meet {name}</h2>
          <p className="meet-body">
            {name} doesn't just answer — it works. It parses your brief, plans the steps, uses
            its tools, and hands you a real artifact: a site, a report, a draft. Every step is
            narrated live, and everything it learns lands in its memory for next time.
          </p>
          <button className="gel-btn gel-primary" onClick={onLaunch}>Put {name} to work <Icon name="arrow" size={16} /></button>
        </div>
        <div className="meet-right panel feed-mock">
          <div className="mock-line system"><Icon name="bolt" size={14} /> {name} picked up the task.</div>
          <div className="mock-line thought"><Icon name="spark" size={14} /> Understood — intent: build a website (topic: “The Night Shift”).</div>
          <div className="mock-line tool"><Icon name="globe" size={14} /> Composing copy: headline, 3 sections, dates, signup</div>
          <div className="mock-line tool"><Icon name="bolt" size={14} /> Writing sites/the-night-shift/index.html</div>
          <div className="mock-line result"><Icon name="check" size={14} /> Built a responsive one-page site — midnight palette.</div>
        </div>
      </section>

      <section className="cta-band">
        <h2 className="band-title">Ready when you are.</h2>
        <button className="gel-btn gel-primary big" onClick={onLaunch}>{user ? 'Enter the Command Deck' : 'Create your account'}</button>
      </section>

      <footer className="home-foot">
        myAgent · self-hosted personal AI agent · ATLAS Core engine · {new Date().getFullYear()}
      </footer>
    </div>
  );
}

function Stat({ value, label, live }) {
  return (
    <div className="hstat">
      <div className={`hstat-num ${live ? 'live' : ''}`}>{String(value).padStart(2, '0')}</div>
      <div className="hstat-label">{label}</div>
    </div>
  );
}
function Step({ n, title, icon, children }) {
  return (
    <div className="step panel">
      <div className="step-top"><span className="step-n">{n}</span><Icon name={icon} size={20} /></div>
      <h3 className="step-title">{title}</h3>
      <p className="step-body">{children}</p>
    </div>
  );
}
function Cap({ icon, title, body }) {
  return (
    <div className="cap panel">
      <div className="cap-icon"><Icon name={icon} size={22} /></div>
      <h3 className="cap-title">{title}</h3>
      <p className="cap-body">{body}</p>
    </div>
  );
}
