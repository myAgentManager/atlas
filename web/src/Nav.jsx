import React, { useState } from 'react';
import { api } from './api.js';
import { Icon, Mark } from './icons.jsx';
import { getTheme, toggleTheme } from './theme.js';

// Shared top bar for signed-in views: brand, tabs, connection LED, account.
export default function Nav({ view, setView, user, connected, onSignOut }) {
  const [theme, setTheme] = useState(getTheme());
  // Workspace tabs first, account tabs after the divider.
  const tabs = [
    ['dashboard', 'Dashboard', 'grid'],
    ['deck', 'Agents', 'user'],
    ['business', 'Business', 'home'],
    ['knowledge', 'Knowledge', 'brain'],
    ['customers', 'Customers', 'user'],
    null, // divider
    ['integrations', 'Integrations', 'plug'],
    ['billing', 'Plans', 'spark'],
    ['settings', 'Settings', 'gear'],
  ];
  return (
    <header className="appnav panel">
      <button className="brand-btn" onClick={() => setView('home')} title="Home">
        <Mark size={24} />
        <span className="wordmark sm"><span className="wordmark-agent">Atlas</span></span>
      </button>
      <nav className="tabs">
        {tabs.map((t, i) => t === null
          ? <span key={`sep${i}`} className="tab-sep" />
          : (
            <button key={t[0]} className={`tab ${view === t[0] ? 'on' : ''}`} onClick={() => setView(t[0])}>
              <Icon name={t[2]} size={15} /> {t[1]}
            </button>
          ))}
      </nav>
      <div className="nav-right">
        <span className={`led ${connected ? 'green pulse' : 'amber'}`} title={connected ? 'live' : 'reconnecting'} />
        <button className="mini-btn ghost theme-btn" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => setTheme(toggleTheme())}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} />
        </button>
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
