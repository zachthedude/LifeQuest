// APP BACKGROUND — the constellation mesh, behind the whole signed-in app.
//
// One fixed layer under every screen (home included), holding the spring mesh
// from components/constellationGrid.js. It is mounted when a player enters the
// app and torn down whenever the shell goes bare — the opening page, sign-in and
// onboarding all have their own artwork and are none of its business.
//
// This was the WebGL orb from blob.js until the mesh replaced it. The orb leaned
// towards the pointer; the mesh is shoved by it, and a fast sweep throws a
// shockwave the width of the screen. Both are backgrounds rather than
// decorations for the same two reasons:
//
//   * the pointer is read from the window, because a layer behind the content
//     never receives pointer events of its own; and
//   * nothing about the reaction is clamped to a box in the middle of the page,
//     so the effect genuinely reaches the corners.
//
// It degrades to nothing: no 2D context, or a first frame that drew no pixels,
// and the canvas is dropped, leaving the CSS colour field and the cursor
// highlight that were always there and need no GPU at all.

import { mountConstellation } from './constellationGrid.js';
import { motionAllowed } from '../motion.js';
import { onThemeChange } from '../theme.js';
import { el, whenSized } from '../ui.js';

let layer = null;
let mesh = null;
let stopTheme = null;
let onPointerMove = null;

/** Mount the mesh behind the app. Idempotent. */
export function mountAppBackground() {
  if (layer) return;

  const node = el('div', { class: 'appbg', 'aria-hidden': 'true' });
  layer = node;
  document.body.append(node);

  // The cursor position is mirrored onto the layer as custom properties so the
  // CSS can put a soft highlight where the pointer is. The mesh does its own
  // pointer tracking on the canvas; this is what carries the gesture when there
  // is no canvas at all.
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
    // a canvas.
    if (layer !== node) return;
    mesh = mountConstellation(node, {
      // Scenery, not an object: a slightly wider pitch than the demo's 55 keeps
      // the lattice quiet enough to sit under body copy, and the links still
      // reach because the link distance went with it.
      spacing: 62,
      linkDistance: 84,
      reach: 240,
      // The lines are sub-pixel and the readouts are 8px, so unlike the orb —
      // which was blurred and had nothing to gain from a retina framebuffer —
      // this needs the real resolution to look like anything.
      maxDpr: 2,
      // Under reduced motion the lattice is drawn once, at rest. It is perfectly
      // legible as a still image, so nothing is lost but the movement.
      animate: motionAllowed(),
    });

    if (!mesh || !mesh.painted) {
      // No context, or a first frame that put nothing on screen. Drop the canvas
      // rather than leave a blank rectangle over the interface, and keep the
      // layer for the cursor highlight.
      mesh?.destroy();
      mesh = null;
      node.classList.add('appbg--flat');
      return;
    }
    node.classList.add('appbg--live');
    // Published on the layer so the browser suite can step the simulation itself.
    // It has to: an automated Chrome delivers only a few animation frames per
    // run, so asserting on real ones would test that browser's scheduler rather
    // than the mesh. The router already exposes `lifequest:rendered` for the same
    // suite and the same reason.
    node.mesh = mesh;
    // The mesh reads its palette from CSS custom properties, so a theme change
    // only has to tell it to look again.
    stopTheme = onThemeChange(() => mesh?.setTheme());
  });
}

/**
 * Tell the mesh to re-read its colours from CSS.
 *
 * The palette lives in custom properties, so anything that changes those — a
 * theme switch, or mission mode reddening the whole app while a quest runs —
 * only has to say "look again" rather than know anything about the mesh.
 */
export function retintAppBackground() {
  mesh?.setTheme();
}

/** Remove the mesh. Safe to call when it was never mounted. */
export function unmountAppBackground() {
  if (onPointerMove) {
    window.removeEventListener('pointermove', onPointerMove);
    onPointerMove = null;
  }
  stopTheme?.();
  stopTheme = null;
  mesh?.destroy();
  mesh = null;
  if (layer) layer.mesh = null;
  layer?.remove();
  layer = null;
}
