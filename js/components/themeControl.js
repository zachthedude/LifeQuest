// Theme controls — one compact cycler for the chrome, one segmented control for
// settings. Both write the same two places: localStorage (so the choice
// survives a reload and applies before sign-in) and, when there is a session,
// the account preferences (so it follows the player to another browser).

import { savePreferences, state } from '../store.js';
import { applyTheme, onThemeChange, setTheme, themePreference } from '../theme.js';
import { el } from '../ui.js';
import { icon } from './icons.js';

// Glyph names from icons.js. "Auto" is a disc half-filled — the sun and the
// moon at once, which is what following the OS actually means.
const OPTIONS = [
  ['light', 'sun', 'Light'],
  ['dark', 'moon', 'Dark'],
  ['auto', 'halfdisc', 'Auto'],
];

const LABEL = Object.fromEntries(OPTIONS.map(([value, , label]) => [value, label]));
const GLYPH = Object.fromEntries(OPTIONS.map(([value, glyph]) => [value, glyph]));

/**
 * Persist a choice. The palette is applied immediately either way — a failed
 * network call must not leave the player looking at a theme they did not pick.
 */
export async function chooseTheme(preference) {
  setTheme(preference);
  if (!state.user) return;
  try {
    await savePreferences({ theme: preference });
  } catch {
    // Saved locally regardless; the account copy can catch up next time.
  }
}

/** Compact button that cycles light → dark → auto. */
export function themeButton() {
  const button = el('button', {
    class: 'themebtn', type: 'button',
  });

  const paint = () => {
    const preference = themePreference();
    button.replaceChildren(icon(GLYPH[preference], { size: 17 }));
    const next = OPTIONS[(OPTIONS.findIndex(([v]) => v === preference) + 1) % OPTIONS.length][0];
    button.title = `Theme: ${LABEL[preference]} — switch to ${LABEL[next]}`;
    button.setAttribute('aria-label', button.title);
    button.dataset.theme = preference;
  };

  button.addEventListener('click', () => {
    const index = OPTIONS.findIndex(([value]) => value === themePreference());
    chooseTheme(OPTIONS[(index + 1) % OPTIONS.length][0]);
  });

  paint();
  // Keeps the glyph honest when the choice is changed from settings, or when
  // the OS flips underneath "auto".
  const stop = onThemeChange(paint);
  button.addEventListener('lifequest:detach', stop);
  return button;
}

/** Three-way segmented control, for a settings row. */
export function themeChoice() {
  const group = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Theme' });

  const paint = () => {
    const preference = themePreference();
    for (const child of group.children) {
      child.setAttribute('aria-checked', String(child.dataset.value === preference));
    }
  };

  for (const [value, glyph, label] of OPTIONS) {
    group.append(el('button', {
      class: 'segmented__option', type: 'button', role: 'radio',
      dataset: { value }, 'aria-checked': String(value === themePreference()),
      onClick: () => { chooseTheme(value); paint(); },
    },
      el('span', { class: 'segmented__glyph', 'aria-hidden': 'true' },
        icon(glyph, { size: 16 })),
      el('span', { text: label })));
  }

  onThemeChange(paint);
  return group;
}

/** Re-resolve after a sign-out, when account preferences no longer apply. */
export function resetThemeToLocal() {
  applyTheme(themePreference());
}
