import React from 'react';
import { api } from './api.js';
import { Icon, Mark } from './icons.jsx';

// Shared top bar for signed-in views: brand, tabs, connection LED, account.
export default function Nav({ view, setView, user, connected, onSignOut }) {
  // Business-owner nav: agents, the tools they plug in, plans, settings.
  const tabs = [
    ['deck', 'Command Deck', 'brain'],
    ['integrations', 'Integrations', 'plug'],
    ['billing', 'Plans', 'spark'],
    ['settings', 'Settings', 'gear'],
  ];
  return (
    <header className="appnav panel">
      <button className="brand-btn" onClick={() => setView('home')} title="Home">
        <Mark size={24} />
        <span className="wordmark sm"><span className="wordmark-my">my</span><span className="wordmark-agent">Agent</span></span>
      </button>
      <nav className="tabs">
        {tabs.map(([id, label, icon]) => (
          <button key={id} className={`tab ${view === id ? 'on' : ''}`} onClick={() => setView(id)}>
            <Icon name={icon} size={15} /> {label}
          </button>
        ))}
      </nav>
      <div className="nav-right">
        <span className={`led ${connected ? 'green pulse' : 'amber'}`} title={connected ? 'live' : 'reconnecting'} />
        <span className="nav-user"><Icon name="user" size={14} /> {user?.name?.split(' ')[0]}</span>
        <button
          className="mini-btn ghost" title="Sign out"
          onClick={() => api.logout().then(onSignOut).catch(onSignOut)}
        >
          <Icon name="logout" size={14} />
        </button>
      </div>
    </header>
  );
}
