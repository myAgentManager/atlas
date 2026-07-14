import React, { useState } from 'react';
import { Icon, Mark } from '../icons.jsx';
import Globe from '../Globe.jsx';
import { getTheme, toggleTheme } from '../theme.js';

export default function Homepage({ agent, connected, tasks, user, onLaunch, onSignIn }) {
  const name = agent?.name || 'ATLAS';
  const [theme, setTheme] = useState(getTheme());

  return (
    <div className="home">
      <div className="home-grain" />

      {/* nav */}
      <nav className="home-nav">
        <div className="brandline"><Mark size={28} /><span className="wordmark"><span className="wordmark-agent">Atlas</span></span></div>
        <div className="home-nav-right">
          <span className={`net-badge ${connected || agent ? 'on' : 'off'}`}>
            <span className="led" /> {agent ? 'atlas network · online' : 'connecting…'}
          </span>
          <button className="mini-btn ghost theme-btn" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setTheme(toggleTheme())}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
          </button>
          {user ? (
            <button className="gel-btn gel-primary" onClick={onLaunch}>Open Dashboard <Icon name="arrow" size={16} /></button>
          ) : (
            <button className="gel-btn gel-primary" onClick={onSignIn}>Sign in <Icon name="arrow" size={16} /></button>
          )}
        </div>
      </nav>

      {/* hero */}
      <header className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><Icon name="shield" size={14} /> For business owners · by Atlas Networks</div>
          <h1 className="hero-h1">
            An AI agent<br />at the front desk<br /><span className="accent">of your business.</span>
          </h1>
          <p className="hero-sub">
            Atlas answers your email, live chat, and messages, books appointments, takes
            orders, handles FAQs, and follows up with customers — in every language, around
            the clock. You set it up once; it runs the busywork while you run the business.
          </p>
          <div className="hero-cta">
            <button className="gel-btn gel-primary big" onClick={onLaunch}>{user ? 'Open your dashboard' : 'Start free'}</button>
            <a className="text-link" href="#how">See how it works <Icon name="arrow" size={15} /></a>
          </div>
        </div>

        <div className="hero-visual">
          <Globe size={210} busy={tasks.some((t) => t.status === 'running')} />
          <div className="orb-plate">{name}</div>
          <div className="hero-stats">
            <Stat value="24/7" label="On duty" />
            <Stat value={13} label="Integrations" />
            <Stat value={0} label="External AI calls" />
          </div>
        </div>
      </header>

      {/* how it works */}
      <section className="band" id="how">
        <div className="band-head">
          <h2 className="band-title">Three steps. Then it runs your front desk.</h2>
          <p className="band-sub">No prompting tricks. Tell it about your business like you'd brief a new hire.</p>
        </div>
        <div className="steps">
          <Step n="1" title="Teach it your business" icon="home">
            Your name, hours, and FAQ — or just point it at your website and it studies
            everything itself. It even works out what kind of business you run.
          </Step>
          <Step n="2" title="Build your agents" icon="user">
            Name an agent and pick its skills: email, live chat, bookings, orders,
            phone calls. Connect the tools you already use.
          </Step>
          <Step n="3" title="Did I say 3?" icon="check">
            There is no step three. Your agents are already answering, booking, and
            following up — and they hand off to a real person the moment something needs one.
          </Step>
        </div>
      </section>

      {/* capabilities */}
      <section className="band">
        <div className="band-head"><h2 className="band-title">Built to actually run a front desk</h2></div>
        <div className="cap-grid">
          <Cap icon="brain" title="An AI that's truly yours"
            body={`${name} runs on ATLAS Core — an original engine built by Atlas Networks. No Anthropic, no OpenAI, no wrapper. The thinking is all ours.`} />
          <Cap icon="chat" title="Every channel"
            body="Email, live website chat, SMS, WhatsApp — and phone calls through your own PBX extension. One agent, every door." />
          <Cap icon="calendar" title="Bookings & orders"
            body="Takes reservations, books appointments, captures orders and quotes — and knows a walk-in café from a salon." />
          <Cap icon="globe" title="Knowledge that grows"
            body="It studies your website, absorbs your FAQ, and files every question it couldn't answer for you to teach it." />
          <Cap icon="user" title="A CRM that fills itself"
            body="Every customer conversation is logged, every lead captured, every trend surfaced on your dashboard." />
          <Cap icon="lock" title="Verified & secure"
            body="Every account verifies its email and sets up two-step verification. Your business data stays in your account only." />
        </div>
      </section>

      {/* integrations */}
      <section className="band" id="integrations">
        <div className="band-head">
          <h2 className="band-title">Plugs into what you already use</h2>
          <p className="band-sub">Connect a tool once — every agent you build can draw on it.</p>
        </div>
        <div className="integ-strip">
          {[['file', 'Email (IMAP)'], ['send', 'Email (SMTP)'], ['chat', 'Twilio SMS & Voice'], ['plug', 'PBX / VoIP extension'],
            ['calendar', 'Calendar'], ['chat', 'WhatsApp'], ['chat', 'Instagram DMs'], ['chat', 'Slack'], ['globe', 'Website knowledge'],
            ['file', 'Google Sheets'], ['bolt', 'Square POS'], ['spark', 'Stripe payments']].map(([icon, label], i) => (
            <span key={i} className="integ-chip"><Icon name={icon} size={15} /> {label}</span>
          ))}
        </div>
      </section>

      {/* the Atlas Network */}
      <section className="band atlas-band" id="atlas-network">
        <div className="band-head">
          <div className="eyebrow center"><Icon name="globe" size={14} /> The Atlas Network</div>
          <h2 className="band-title">One agent. A whole network behind it.</h2>
          <p className="band-sub">
            {name} isn't a wrapper around someone else's model — it's an original engine,
            and every part of it works for your business inside your private account.
          </p>
        </div>
        <div className="atlas-grid-home">
          <div className="anode panel">
            <div className="anode-top"><Icon name="brain" size={18} /><span>Understanding</span></div>
            <p>A from-scratch language layer reads what each customer actually wants — a booking, an order, a question, a complaint.</p>
          </div>
          <div className="anode panel">
            <div className="anode-top"><Icon name="home" size={18} /><span>Knows your business</span></div>
            <p>“Can I come in Friday?” means a table at a restaurant, an appointment at a salon, and just come on by at a café. {name} knows the difference.</p>
          </div>
          <div className="anode panel">
            <div className="anode-top"><Icon name="globe" size={18} /><span>A knowledge base that grows</span></div>
            <p>It studies your website and FAQ, files every fact, and logs what it couldn't answer so you can teach it in one click.</p>
          </div>
          <div className="anode panel">
            <div className="anode-top"><Icon name="chat" size={18} /><span>In its own words</span></div>
            <p>Answers first, in natural language that never reads canned — and it greets customers once, not every message.</p>
          </div>
          <div className="anode panel">
            <div className="anode-top"><Icon name="user" size={18} /><span>Knows when to hand off</span></div>
            <p>Refunds, complaints, your escalation keywords — the moment it matters, a real person on your team gets it.</p>
          </div>
          <div className="anode panel">
            <div className="anode-top"><Icon name="lock" size={18} /><span>Private by design</span></div>
            <p>Your customers, conversations, and knowledge live in your account only. Nothing trains anyone else's AI.</p>
          </div>
        </div>
        <div className="atlas-ticker">
          <span className="ticker-item"><b>13</b> integrations</span>
          <span className="ticker-item"><b>14</b> agent capabilities</span>
          <span className="ticker-item"><b>every</b> language</span>
          <span className="ticker-item"><b>0</b> external AI calls</span>
        </div>
      </section>

      {/* meet ATLAS */}
      <section className="band meet">
        <div className="meet-left">
          <div className="eyebrow"><Icon name="bolt" size={14} /> The agent</div>
          <h2 className="band-title">Meet {name}</h2>
          <p className="meet-body">
            {name} doesn't just chat — it works your counter. It reads each customer message,
            answers from what it knows about your business, books the appointment or takes the
            order, and logs the whole conversation to your dashboard. Every question it can't
            answer becomes something you can teach it in one click.
          </p>
          <button className="gel-btn gel-primary" onClick={onLaunch}>Put {name} to work <Icon name="arrow" size={16} /></button>
        </div>
        <div className="meet-right panel feed-mock">
          <div className="mock-line system"><Icon name="chat" size={14} /> Web chat — new customer.</div>
          <div className="mock-line thought"><Icon name="spark" size={14} /> “Can I come in Friday?” — walk-in café, nothing to book.</div>
          <div className="mock-line tool"><Icon name="chat" size={14} /> “Friday works — just come on by! We're open 7am–6pm.”</div>
          <div className="mock-line tool"><Icon name="user" size={14} /> Logged the customer + conversation to your CRM</div>
          <div className="mock-line result"><Icon name="check" size={14} /> Handled — no human needed.</div>
        </div>
      </section>

      <section className="cta-band">
        <h2 className="band-title">Ready when you are.</h2>
        <button className="gel-btn gel-primary big" onClick={onLaunch}>{user ? 'Open your dashboard' : 'Create your account'}</button>
      </section>

      <footer className="home-foot">
        Atlas — a product of <b className="foot-brand">Atlas Networks</b> · powered by ATLAS Core · {new Date().getFullYear()}
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
