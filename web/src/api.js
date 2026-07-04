// Thin client over the myAgent REST API. All requests ride the session cookie.
const json = async (r) => {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
};
const get = (url) => fetch(url).then(json);
const send = (url, method, body) =>
  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then(json);
const post = (url, body) => send(url, 'POST', body);

export const api = {
  // auth
  register: (body) => post('/api/auth/register', body),
  login: (body) => post('/api/auth/login', body),
  verify2sv: (body) => post('/api/auth/verify', body),
  logout: () => post('/api/auth/logout'),
  me: () => get('/api/me'),

  // account
  updateMe: (body) => send('/api/me', 'PATCH', body),
  changePassword: (current, next) => post('/api/me/password', { current, next }),
  setup2sv: () => post('/api/me/2sv/setup'),
  enable2sv: (code) => post('/api/me/2sv/enable', { code }),
  start2svMethod: (method) => post('/api/me/2sv/method/start', { method }),
  confirm2svMethod: (code) => post('/api/me/2sv/method/confirm', { code }),
  disable2sv: (body) => post('/api/me/2sv/disable', body),
  rotateApiKey: () => post('/api/me/apikey/rotate'),
  deleteAccount: (password) => send('/api/me', 'DELETE', { password }),

  // agent + tasks
  agent: () => get('/api/agent'),
  list: () => get('/api/tasks'),
  create: (body) => post('/api/tasks', body),
  update: (id, body) => send(`/api/tasks/${id}`, 'PATCH', body),
  run: (id) => post(`/api/tasks/${id}/run`),
  stop: (id) => post(`/api/tasks/${id}/stop`),
  chat: (id, message) => post(`/api/tasks/${id}/chat`, { message }),
  remove: (id) => send(`/api/tasks/${id}`, 'DELETE'),

  // ATLAS page chat
  atlasHistory: () => get('/api/atlas/chat'),
  atlasChat: (message) => post('/api/atlas/chat', { message }),

  // files + shares
  files: () => get('/api/files'),
  deleteFile: (path) => send('/api/files?path=' + encodeURIComponent(path), 'DELETE'),
  shares: () => get('/api/shares'),
  share: (path) => post('/api/shares', { path }),
  revokeShare: (token) => send(`/api/shares/${token}`, 'DELETE'),

  // projects
  projects: () => get('/api/projects'),
  projectChat: (slug) => get(`/api/projects/${encodeURIComponent(slug)}/chat`),
  projectSend: (slug, message, file) => post(`/api/projects/${encodeURIComponent(slug)}/chat`, { message, file }),

  // Atlas Database
  dbOverview: () => get('/api/db'),
  dbCreateCollection: (project, name) => post(`/api/db/${encodeURIComponent(project)}/collections`, { name }),
  dbDropCollection: (project, collection) => send(`/api/db/${encodeURIComponent(project)}/${encodeURIComponent(collection)}`, 'DELETE'),
  dbList: (project, collection) => get(`/api/db/${encodeURIComponent(project)}/${encodeURIComponent(collection)}`),
  dbInsert: (project, collection, data) => post(`/api/db/${encodeURIComponent(project)}/${encodeURIComponent(collection)}`, data),
  dbRemove: (project, collection, id) => send(`/api/db/${encodeURIComponent(project)}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, 'DELETE'),
};
