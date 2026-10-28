// PROOF DRAFT — what you have typed survives closing the modal.
//
// Filling in proof is not a thirty-second job any more. A video has to be
// recorded, a tracker link has to be fetched from another app, a photo has to be
// taken on a phone and moved across. Every one of those means leaving the page,
// and before this the moment you left, the write-up went with it — which taught
// players to submit something thin immediately rather than risk losing it.
//
// So the form is written to localStorage as it is typed, restored when the same
// quest is opened again, and cleared the moment the submission is accepted.
//
// Three things this deliberately does NOT do:
//
//   * It does not save to the server. A draft is not evidence and has no
//     business in the quest record; it is a convenience local to this browser,
//     and keeping it local means no half-written submission ever reaches the
//     evaluator or the anti-cheat digest.
//   * It does not restore uploaded files. The upload itself already happened —
//     the file is on the server — but re-attaching it silently on reopen would
//     put evidence into a submission the player did not consciously attach this
//     time. Names of what was uploaded are shown instead, so nothing is lost
//     quietly; the player re-attaches deliberately.
//   * It does not outlive the quest. Drafts older than the expiry are swept on
//     load, because a daily quest that expired two weeks ago should not still be
//     holding a paragraph in storage.

const PREFIX = 'lq.proof.';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;   // a fortnight, well past any daily

function key(questId) {
  return `${PREFIX}${questId}`;
}

/** Storage can be absent (private mode, disabled) — never let that break the form. */
function storage() {
  try {
    const probe = '__lq';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Drop drafts left behind by quests that are long gone. */
export function sweepDrafts() {
  const store = storage();
  if (!store) return;
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const name of Object.keys(store)) {
    if (!name.startsWith(PREFIX)) continue;
    try {
      const saved = JSON.parse(store.getItem(name) || '{}');
      if (!saved.savedAt || saved.savedAt < cutoff) store.removeItem(name);
    } catch {
      store.removeItem(name);   // unreadable is as good as expired
    }
  }
}

/**
 * Bind a draft to one quest's proof form.
 *
 * @param {string|number} questId
 * @param {object} fields   name -> input/textarea element
 * @returns {{restore: function, save: function, clear: function, saved: object|null}}
 */
export function proofDraft(questId, fields) {
  const store = storage();
  const entries = Object.entries(fields).filter(([, node]) => node);

  function read() {
    if (!store) return null;
    try {
      return JSON.parse(store.getItem(key(questId)) || 'null');
    } catch {
      return null;
    }
  }

  function save() {
    if (!store) return;
    const values = {};
    let any = false;
    for (const [name, node] of entries) {
      const value = (node.value || '').trim();
      if (value) { values[name] = node.value; any = true; }
    }
    // An empty form clears rather than storing a row of empty strings — the
    // player deleting everything is them abandoning the draft.
    if (!any) { clear(); return; }
    try {
      store.setItem(key(questId), JSON.stringify({ values, savedAt: Date.now() }));
    } catch {
      // Quota, most likely. A lost draft is a far smaller problem than a throw
      // in the middle of someone typing.
    }
  }

  function restore() {
    const saved = read();
    if (!saved?.values) return null;
    for (const [name, node] of entries) {
      if (saved.values[name] !== undefined) node.value = saved.values[name];
    }
    return saved;
  }

  function clear() {
    if (!store) return;
    try { store.removeItem(key(questId)); } catch { /* nothing to undo */ }
  }

  // Typing is saved on a trailing debounce: often enough that closing the tab
  // costs at most a couple of words, rarely enough that it is not a write per
  // keystroke.
  let timer = null;
  const onInput = () => {
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  };
  for (const [, node] of entries) {
    node.addEventListener('input', onInput);
  }

  // A phone backgrounding the browser fires neither close nor unload reliably;
  // `visibilitychange` is the one that does.
  const onHide = () => { if (document.visibilityState === 'hidden') save(); };
  document.addEventListener('visibilitychange', onHide);

  return {
    restore,
    save() { clearTimeout(timer); save(); },
    clear() {
      clearTimeout(timer);
      clear();
      document.removeEventListener('visibilitychange', onHide);
    },
    saved: read(),
  };
}
