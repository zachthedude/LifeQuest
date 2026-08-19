// APP BACKGROUND — the reactive orb, behind the whole signed-in app.
//
// One fixed layer under every screen (home included), holding the WebGL orb from
// blob.js. It is mounted when a player enters the app and torn down whenever the
// shell goes bare — the opening page, sign-in and onboarding all have their own
// artwork and are none of its business.
//
// Two things make it a *background* rather than the login page's decoration:
//
//   * the pointer is read from the window, because a layer behind the content
//     never receives pointer events of its own; and
//   * `reach: 'viewport'` lets the orb travel the entire surface instead of a
//     unit box in the middle of it, so it genuinely follows the cursor into the
//     corners of the page rather than leaning slightly towards it.
//
// It degrades to nothing: no WebGL, or a first frame that drew no pixels, and the
// layer removes itself, leaving the CSS colour field that was always there.

import { mountBlob } from '../blob.js';
import { onThemeChange, resolveTheme } from '../theme.js';
import { el, whenSized } from '../ui.js';

// The app's own accents, in the order the shader blends them (base → mid →
// crown). The light set is the darkened palette from styles.css: the same three
// ideas at a weight that reads against white instead of against near-black.
const PALETTE = {
  dark: ['#ffcf5c', '#bd85ff', '#56d0f5'],
  light: ['#e2a52f', '#7534c9', '#0b76ad'],
};

let layer = null;
let blob = null;
let stopTheme = null;
let onPointerMove = null;

/** Mount the orb behind the app. Idempotent. */
export function mountAppBackground() {
  if (layer) return;

  const node = el('div', { class: 'appbg', 'aria-hidden': 'true' });
  layer = node;
  document.body.append(node);

  // The cursor position is mirrored onto the layer as custom properties so the
  // CSS can put a soft highlight where the pointer is — the same gesture as the
  // landing card's sheen, and it keeps working even if WebGL is unavailable.
  onPointerMove = (event) => {
    if (!layer) return;
    layer.style.setProperty('--orb-x', `${event.clientX}px`);
    layer.style.setProperty('--orb-y', `${event.clientY}px`);
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  // Fixed and full-bleed, so it has layout as soon as it is in the document —
  // but `whenSized` is still the honest way to wait for it, and it also covers
  // the case of a hidden shell mounting before its first paint.
  whenSized(node, () => {
    // The wait is polled, so the shell can have gone bare — or gone and come
    // back — in the meantime. Only the layer that is still the current one gets
    // a GL context.
    if (layer !== node) return;
    blob = mountBlob(node, {
      colors: PALETTE[resolveTheme()] || PALETTE.dark,
      pointerSource: window,
      reach: 'viewport',
      // Bigger and calmer than the login artwork was: it is scenery now, and a
      // background that churns is a background you end up fighting.
      scale: 2.2,
      intensity: 0.36,
      hoverIntensity: 0.52,
      // The orb is blurred and dimmed in CSS, so it has nothing to gain from a
      // retina framebuffer and a full-viewport canvas has plenty to lose.
      maxDpr: 1,
    });

    if (!blob || !blob.painted) {
      // No context, or a first frame that put nothing on screen. Drop the canvas
      // rather than leave a blank rectangle over the gradient, and keep the layer
      // for the cursor highlight, which needs no GPU at all.
      blob?.destroy();
      blob = null;
      node.classList.add('appbg--flat');
      return;
    }
    node.classList.add('appbg--live');
    stopTheme = onThemeChange((resolved) => blob?.setColors(PALETTE[resolved]));
  });
}

/** Remove the orb. Safe to call when it was never mounted. */
export function unmountAppBackground() {
  if (onPointerMove) {
    window.removeEventListener('pointermove', onPointerMove);
    onPointerMove = null;
  }
  stopTheme?.();
  stopTheme = null;
  blob?.destroy();
  blob = null;
  layer?.remove();
  layer = null;
}
