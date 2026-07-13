// Light / dark theme runtime. The choice lives on <html data-theme> so CSS
// tokens swap instantly; persisted per browser, defaulting to the OS setting.
const KEY = 'atlas-theme';

export function getTheme() {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return 'dark'; // dark is the house default; the toggle remembers your pick
}

export function applyTheme(t) {
  document.documentElement.dataset.theme = t;
}

export function initTheme() {
  applyTheme(getTheme());
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(KEY, next);
  applyTheme(next);
  return next;
}
