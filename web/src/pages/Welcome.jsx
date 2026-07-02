import React from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import Globe from '../Globe.jsx';

// First-run onboarding, shown once after an account is created.
export default function Welcome({ agent, user, onDone, onGo }) {
  const name = agent?.name || 'ATLAS';
  const first = user?.name?.split(' ')[0] || 'there';

  const finish = (dest) => {
    api.updateMe({ welcomed: true }).catch(() => {});
    (dest ? onGo(dest) : onDone());
  };

  return (
    <div className="welcome">
      <div className="home-grain" />
      <div className="welcome-stage">
        <Globe size={130} />
        <h1 className="welcome-h1">Welcome, {first}.</h1>
        <p className="welcome-sub">
          This is your agent now. {name} plans, browses, and builds for you — while you're
          asleep, at work, or just done for the day. Here's how to get the most out of it.
        </p>

        <div className="welcome-cards">
          <button className="wcard panel" onClick={() => finish('deck')}>
            <span className="wcard-n">1</span>
            <Icon name="spark" size={22} />
            <b>Assign your first task</b>
            <p>Try “Build me a one-page website for …” and watch the live feed.</p>
          </button>
          <button className="wcard panel" onClick={() => finish('settings')}>
            <span className="wcard-n">2</span>
            <Icon name="shield" size={22} />
            <b>Lock your account</b>
            <p>Turn on two-step verification in Settings — it takes a minute.</p>
          </button>
          <button className="wcard panel" onClick={() => finish('settings')}>
            <span className="wcard-n">3</span>
            <Icon name="plug" size={22} />
            <b>Connect your platforms</b>
            <p>Slack, Discord, webhooks, SMS — get pinged wherever you live.</p>
          </button>
          <button className="wcard panel" onClick={() => finish('atlas')}>
            <span className="wcard-n">4</span>
            <Icon name="brain" size={22} />
            <b>Meet {name}</b>
            <p>See the engine's internals and say hello on its own page.</p>
          </button>
        </div>

        <button className="gel-btn gel-primary big" onClick={() => finish()}>
          Take me to the Command Deck <Icon name="arrow" size={16} />
        </button>
      </div>
    </div>
  );
}
