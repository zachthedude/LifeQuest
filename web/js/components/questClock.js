// QUEST CLOCK — the whole app goes red while a quest is running.
//
// Starting a quest used to change one button. The quest was underway, the
// deadline was real, and nothing anywhere on screen said so — you could sit on
// the dashboard for an hour with a quest running and never know.
//
// Now the moment a quest goes active the app enters mission mode: a flip-disk
// timer pinned above everything, and the background — the halo field and the
// constellation mesh both — bleeding from its ordinary cool palette into red,
// getting darker as the time runs down. It reverts the moment the quest stops
// being active, whether that is a submission, an abandonment or a page reload
// landing on a quest that has since been verified.
//
// The countdown runs over the quest's own **estimated time**, not its expiry.
// Expiry is 36 hours away and could not make anything feel urgent; the estimate
// is the session the player just committed to, on a scale a person can feel. Past
// the estimate the urgency stays pinned at maximum rather than punishing anyone:
// overrunning a 25-minute quest is not a failure, and the app should not pretend
// it is — it just stops getting worse.
//
// Urgency is published as `--urgency` (0 → 1) on the document element, so the
// entire visual response lives in CSS and this module owns no colours at all.

import { retintAppBackground } from './appBackground.js';
import { deadlineBoard, msUntil } from './flipDisk.js';
import { state, subscribe } from '../store.js';
import { motionAllowed } from '../motion.js';
import { el } from '../ui.js';

// How often the urgency ramp is recomputed. The board keeps its own per-second
// tick for the digits; this only has to move a colour, and a colour that steps
// four times a minute is indistinguishable from one that steps sixty times.
const RAMP_MS = 15000;

let overlay = null;
let board = null;
let rampTimer = null;
let activeId = null;
let stopSubscription = null;

/** Milliseconds a quest was given, from its own estimate. */
function budgetMs(quest) {
  const minutes = Number(quest?.estimatedTime) || 0;
  return Math.max(60_000, minutes * 60_000);
}

/** Milliseconds left of that budget, which may go negative. */
function remainingMs(quest) {
  if (!quest?.startedAt) return null;
  const started = msUntil(quest.startedAt);      // negative: it is in the past
  if (started === null) return null;
  const elapsed = -started;
  return budgetMs(quest) - elapsed;
}

/**
 * 0 at the start of the session, 1 at the end of it and beyond.
 *
 * Deliberately not linear. A quarter of the way through a 25-minute quest
 * nothing is wrong yet, and a background that had already reddened by 25% would
 * be crying wolf; the curve stays calm through the first half and then climbs.
 */
export function urgencyFor(quest) {
  const left = remainingMs(quest);
  if (left === null) return 0;
  const budget = budgetMs(quest);
  const spent = Math.min(1, Math.max(0, 1 - left / budget));
  return Math.round(spent ** 2.2 * 1000) / 1000;
}

function paint(quest) {
  const root = document.documentElement;
  const urgency = urgencyFor(quest);
  root.style.setProperty('--urgency', String(urgency));
  // The mesh reads its colours from CSS custom properties, so reddening it is a
  // matter of telling it to look again.
  retintAppBackground();
}

function clearPaint() {
  const root = document.documentElement;
  root.classList.remove('is-onquest');
  root.style.removeProperty('--urgency');
  retintAppBackground();
}

function findActive() {
  return (state.quests || []).find((quest) => quest.status === 'active') || null;
}

function tearDown() {
  clearTimeout(rampTimer);
  rampTimer = null;
  board?.destroy();
  board = null;
  overlay?.remove();
  overlay = null;
  activeId = null;
  clearPaint();
}

function build(quest) {
  overlay = el('div', { class: 'questclock', 'aria-live': 'polite' },
    el('div', { class: 'questclock__label', text: 'Quest in progress' }),
    el('div', { class: 'questclock__title', text: quest.title }));

  const screen = el('div', { class: 'questclock__screen' });
  overlay.append(screen);

  // The board counts to the end of the session, so it is handed a deadline
  // rather than the quest's own far-off expiry.
  const endsAt = new Date(Date.now() + Math.max(0, remainingMs(quest) ?? 0));
  board = deadlineBoard(screen, {
    expiresAt: endsAt.toISOString().slice(0, 19).replace('T', ' '),
    animate: motionAllowed(),
  });

  overlay.append(el('div', { class: 'questclock__foot',
                             text: `${quest.estimatedTime} min estimated` }));
  document.body.append(overlay);
}

function ramp() {
  const quest = findActive();
  if (!quest) return;
  paint(quest);
  clearTimeout(rampTimer);
  rampTimer = setTimeout(ramp, RAMP_MS);
}

/** Reconcile the overlay against whatever the store currently says. */
export function syncQuestClock() {
  const quest = findActive();

  if (!quest) {
    if (overlay) tearDown();
    return;
  }
  // A different quest started, or the same one restarted: rebuild rather than
  // try to retarget a running board.
  if (activeId !== quest.id) {
    if (overlay) tearDown();
    activeId = quest.id;
    build(quest);
    document.documentElement.classList.add('is-onquest');
  }
  ramp();
}

/** Begin watching the store. Idempotent. */
export function startQuestClock() {
  if (!stopSubscription) stopSubscription = subscribe(syncQuestClock);
  syncQuestClock();
}

/** Stop watching and clean up — used when the shell goes bare. */
export function stopQuestClock() {
  stopSubscription?.();
  stopSubscription = null;
  tearDown();
}
