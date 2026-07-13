import React, { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import Homepage from './pages/Homepage.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Atlas from './pages/Atlas.jsx';
import Settings from './pages/Settings.jsx';
import Welcome from './pages/Welcome.jsx';
import Billing from './pages/Billing.jsx';
import Integrations from './pages/Integrations.jsx';
import Business from './pages/Business.jsx';
import Customers from './pages/Customers.jsx';
import Overview from './pages/Overview.jsx';
import Knowledge from './pages/Knowledge.jsx';
import Nav from './Nav.jsx';
import { Toaster } from './toast.jsx';
import { Reader } from './reader.jsx';
import { Mark } from './icons.jsx';
import { initTheme } from './theme.js';

initTheme(); // set light/dark before first paint

export default function App() {
  const [view, setView] = useState('home'); // home | login | deck | atlas | settings
  const [user, setUser] = useState(null);
  const [booted, setBooted] = useState(false);
  const [agent, setAgent] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [chat, setChat] = useState([]);
  const [connected, setConnected] = useState(false);

  const reload = useCallback(() => {
    if (!user) return;
    api.list().then(setTasks).catch(() => {});
    api.atlasHistory().then(setChat).catch(() => {});
  }, [user]);

  // Boot: who am I? what's the agent?
  useEffect(() => {
    api.agent().then(setAgent).catch(() => {});
    api.me()
      .then(({ user }) => { setUser(user); setView(user.welcomed ? 'dashboard' : 'welcome'); })
      .catch(() => {})
      .finally(() => setBooted(true));
  }, []);

  useEffect(reload, [reload]);

  // Live updates over SSE (only when signed in).
  useEffect(() => {
    if (!user) return;
    const es = new EventSource('/api/stream');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener('task', (e) => {
      const task = JSON.parse(e.data);
      setTasks((prev) => {
        if (task.id === '*') return [];
        if (task.deleted) return prev.filter((t) => t.id !== task.id);
        const i = prev.findIndex((t) => t.id === task.id);
        if (i === -1) return [task, ...prev];
        const next = prev.slice();
        next[i] = { ...next[i], ...task };
        return next;
      });
    });
    es.addEventListener('event', (e) => {
      const { taskId, event } = JSON.parse(e.data);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, events: [...(t.events || []), event].slice(-240) } : t)));
    });
    es.addEventListener('chat', (e) => {
      const msg = JSON.parse(e.data);
      setChat((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg].slice(-200)));
    });

    return () => { es.close(); setConnected(false); };
  }, [user]);

  const signedIn = (u) => { setUser(u); setView(u.welcomed ? 'dashboard' : 'welcome'); };
  const signedOut = () => { setUser(null); setTasks([]); setChat([]); setView('home'); };

  if (!booted) return <div className="boot"><Mark size={34} spin /> waking ATLAS…</div>;

  if (view === 'home') {
    return <Homepage agent={agent} connected={connected} tasks={tasks} user={user}
      onLaunch={() => setView(user ? 'deck' : 'login')} onSignIn={() => setView('login')} />;
  }
  if (view === 'login' || !user) {
    return <Login agent={agent} onDone={signedIn} onHome={() => setView('home')} />;
  }
  if (view === 'welcome') {
    return <Welcome agent={agent} user={user}
      onDone={() => { setUser({ ...user, welcomed: true }); setView('dashboard'); }}
      onGo={(dest) => { setUser({ ...user, welcomed: true }); setView(dest); }} />;
  }

  const page =
    view === 'atlas' ? <Atlas agent={agent} user={user} chat={chat} setChat={setChat} tasks={tasks} /> :
    view === 'settings' ? <Settings user={user} setUser={setUser} agent={agent} onDeleted={signedOut} /> :
    view === 'billing' ? <Billing user={user} setUser={setUser} /> :
    view === 'integrations' ? <Integrations /> :
    view === 'business' ? <Business /> :
    view === 'customers' ? <Customers /> :
    view === 'dashboard' ? <Overview user={user} gotoView={setView} /> :
    view === 'knowledge' ? <Knowledge /> :
    <Dashboard agent={agent} user={user} gotoView={setView} />;

  return (
    <div className="app">
      <Nav view={view} setView={setView} user={user} connected={connected} onSignOut={signedOut} />
      {page}
      <Toaster />
      <Reader />
    </div>
  );
}
