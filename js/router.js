// Hash router with per-route loading, error and empty handling.

import { el, mount, errorState, skeleton } from './ui.js';
import { revealOnScroll, transition } from './motion.js';

const routes = new Map();
let notFound = null;
let currentRoute = null;
let onChange = null;

export function register(path, view) {
  routes.set(path, view);
}

export function setNotFound(view) {
  notFound = view;
}

export function onNavigate(fn) {
  onChange = fn;
}

export function currentPath() {
  const hash = window.location.hash.replace(/^#/, '');
  return hash || '/';
}

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (window.location.hash === target) {
    render();
    return;
  }
  if (replace) window.location.replace(target);
  else window.location.hash = path;
}

export async function render() {
  const path = currentPath();
  const [base] = path.split('?');
  const view = routes.get(base) || notFound;
  const main = document.getElementById('main');
  if (!view || !main) return;

  currentRoute = base;
  if (onChange) onChange(base);

  // Only show the skeleton if the view is actually slow — a fast cached view
  // should not flash a loading state at you.
  let settled = false;
  setTimeout(() => {
    if (!settled && currentRoute === base) {
      mount(main, el('div', { class: 'stack' },
        el('div', { class: 'skeleton skeleton--line', style: { width: '180px', height: '26px' } }),
        skeleton(4)));
    }
  }, 140);

  try {
    const node = await view({ path, params: new URLSearchParams(path.split('?')[1] || '') });
    settled = true;
    if (currentRoute !== base) return; // a newer navigation won

    transition(() => {
      mount(main, node);
      window.scrollTo(0, 0);
    }, main);
    revealOnScroll(main);
    // Move focus to the new screen so keyboard and screen-reader users land
    // on the content rather than staying in the nav.
    main.focus({ preventScroll: true });
    // Announce completed renders — used by instrumentation and tests.
    window.dispatchEvent(new CustomEvent('lifequest:rendered', { detail: { path: base } }));
  } catch (error) {
    settled = true;
    if (currentRoute !== base) return;
    if (error?.status === 401) {
      // Session expired — hand control back to the shell to show sign-in.
      window.dispatchEvent(new CustomEvent('lifequest:unauthenticated'));
      return;
    }
    console.error('View failed:', error);
    mount(main, errorState(error?.message, () => render()));
  }
}

let started = false;

/**
 * Begin routing. Safe to call from any entry path (fresh load, after sign-in,
 * after onboarding) — the listener is only ever attached once, and calling it
 * again simply re-renders the current route.
 */
export function start() {
  if (!started) {
    started = true;
    window.addEventListener('hashchange', render);
  }
  return render();
}
