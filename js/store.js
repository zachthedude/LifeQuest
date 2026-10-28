// Central state with a tiny pub/sub, plus a short-lived request cache so
// navigating between screens doesn't refetch everything.

import { api, setCsrf } from './api.js';
import { setTheme, themePreference } from './theme.js';

const listeners = new Set();
const cache = new Map();
const CACHE_MS = 15000;

export const state = {
  user: null,
  ai: null,
  snapshot: null,
  model: null,
  preferences: { sound: true, reducedMotion: false, notifications: true, highContrast: false },
  quests: [],
  chains: [],
  unreadNotifications: 0,
  ready: false,
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  for (const fn of listeners) fn(state);
}

export function patch(partial) {
  Object.assign(state, partial);
  notify();
}

export function invalidate(prefix) {
  if (!prefix) return cache.clear();
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export async function cached(key, loader, ttl = CACHE_MS) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}

// ------------------------------------------------------------------ boot --
export async function bootstrap() {
  const session = await api.me();
  if (session.csrfToken) setCsrf(session.csrfToken);
  patch({ user: session.user, ai: session.ai, ready: true });
  if (session.user && session.user.onboarded) await refreshPlayer();
  return state;
}

export async function refreshPlayer() {
  const data = await api.player();
  applyPreferences(data.preferences);
  patch({
    snapshot: data.snapshot,
    model: data.model,
    preferences: { ...state.preferences, ...(data.preferences || {}) },
    curve: data.curve,
    ai: data.ai,
  });
  return data;
}

export async function refreshQuests() {
  invalidate('quests');
  const data = await api.quests('open');
  patch({ quests: data.quests, chains: data.chains, snapshot: data.snapshot });
  return data;
}

export async function refreshNotifications() {
  try {
    const data = await api.notifications();
    patch({ unreadNotifications: data.notifications.filter((n) => !n.read).length });
    return data.notifications;
  } catch {
    return [];
  }
}

export function applyPreferences(prefs) {
  const merged = { ...state.preferences, ...(prefs || {}) };
  state.preferences = merged;
  document.documentElement.dataset.motion = merged.reducedMotion ? 'reduced' : 'full';
  document.documentElement.dataset.contrast = merged.highContrast ? 'high' : 'normal';
  // The account's theme follows the player to any browser they sign in from.
  // theme.js has already painted the local choice, so this only repaints when
  // the two actually disagree.
  if (merged.theme && merged.theme !== themePreference()) setTheme(merged.theme);
}

export async function savePreferences(partial) {
  const data = await api.updatePreferences(partial);
  applyPreferences(data.preferences);
  patch({ preferences: data.preferences });
  return data.preferences;
}

export async function logout() {
  await api.logout();
  cache.clear();
  patch({ user: null, snapshot: null, model: null, quests: [], chains: [] });
}
