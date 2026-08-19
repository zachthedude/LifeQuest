// Theme: light, dark, or follow the operating system.
//
// Loaded from <head> rather than through main.js so the palette is decided
// before the first screen paints — a light-mode visitor should never see a
// black flash. The CSP forbids an inline script, so this is the earliest a
// decision can be made, and it is deliberately dependency-free and synchronous.
//
// The stylesheet only ever sees a *resolved* theme:
//
//   data-theme       light | dark   — what is actually on screen
//   data-theme-pref  light | dark | auto — what the player chose
//
// which is why styles.css never has to write the same palette twice, once for
// an explicit choice and once inside a prefers-color-scheme query.

const STORAGE_KEY = 'lifequest:theme';
export const THEMES = ['light', 'dark', 'auto'];

const darkQuery = typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

const listeners = new Set();

/** The player's choice, falling back to following the OS. */
export function themePreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (THEMES.includes(stored)) return stored;
  } catch {
    // Private mode / storage disabled: following the OS is a fine default.
  }
  return 'auto';
}

export function resolveTheme(preference = themePreference()) {
  if (preference === 'light' || preference === 'dark') return preference;
  return darkQuery && !darkQuery.matches ? 'light' : 'dark';
}

/** Paint a preference without storing it (used when the server sends one). */
export function applyTheme(preference) {
  const choice = THEMES.includes(preference) ? preference : 'auto';
  const resolved = resolveTheme(choice);
  const root = document.documentElement;
  root.dataset.themePref = choice;
  root.dataset.theme = resolved;

  // Keeps form controls, scrollbars and the browser's own UI in step.
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? 'light dark' : 'dark light');

  for (const fn of listeners) fn(resolved, choice);
  return resolved;
}

export function setTheme(preference) {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Not fatal — the choice simply will not survive a reload.
  }
  return applyTheme(preference);
}

/** Called on every resolved change, including the OS flipping under "auto". */
export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Following the OS has to keep following it: someone on "auto" whose machine
// switches to night mode at sunset should switch with it, mid-session.
if (darkQuery) {
  const react = () => {
    if (document.documentElement.dataset.themePref === 'auto') applyTheme('auto');
  };
  if (darkQuery.addEventListener) darkQuery.addEventListener('change', react);
  else if (darkQuery.addListener) darkQuery.addListener(react);      // older Safari
}

applyTheme(themePreference());
