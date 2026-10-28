// Orbiting circles — three rings of system icons turning around a particle core.
//
// Ported from the React `orbiting-circles-02` component. Two changes were
// forced by this codebase rather than chosen:
//
//   * The original pulls its icons from `images.shadcnspace.com`. The app's CSP
//     is `img-src 'self' data: blob:`, so remote logos would be blocked — and a
//     landing page that needs the network to look right is worse than one that
//     does not. The seats carry LifeQuest's own system glyphs instead, the same
//     vocabulary the sidebar uses.
//   * The keyframes live in styles.css rather than an injected <style> tag, so
//     the rings are themeable with the rest of the design system.
//
// Rotation is pure CSS: each seat spins around the ring's centre, and the icon
// inside counter-spins at the same speed so it never turns upside down.

import { el, svg } from '../ui.js';
import { mountParticleSphere } from './particleSphere.js';
import { icon } from './icons.js';

/** The systems a character actually levels up, from the inside out. */
export const DEFAULT_RINGS = [
  {
    size: 1, duration: 26, direction: 'cw',
    seats: [
      { glyph: 'bolt', label: 'Physical', tone: 'physical', angle: -60 },
      { glyph: 'brain', label: 'Academic', tone: 'academic', angle: 0 },
      { glyph: 'flame', label: 'Passion', tone: 'passion', angle: 60 },
    ],
  },
  {
    size: 2, duration: 34, direction: 'ccw',
    seats: [
      { glyph: 'sword', label: 'Quests', tone: 'xp', angle: 0 },
      { glyph: 'sprout', label: 'Skill tree', tone: 'success', angle: -90 },
    ],
  },
  {
    size: 3, duration: 44, direction: 'cw',
    seats: [
      { glyph: 'trophy', label: 'Achievements', tone: 'xp', angle: -60 },
      { glyph: 'trending', label: 'Progress', tone: 'academic', angle: 0 },
      { glyph: 'sparkles', label: 'AI Guide', tone: 'passion', angle: 60 },
    ],
  },
];

/**
 * @param {object} [options]
 * @param {Array}  [options.rings]     ring definitions; see DEFAULT_RINGS
 * @param {boolean}[options.animate=true]  false leaves the rings parked (reduced motion)
 * @param {boolean}[options.sphere=true]   mount the particle core
 * @param {boolean}[options.logo=true]     put the emblem at the centre of it all
 * @param {'centred'|'horizon'} [options.variant='centred']
 *        `centred` puts whole rings around the mark in the middle of the stage.
 *        `horizon` is the React original's half-globe rising from the bottom
 *        edge, kept because it is the shape that component actually ships.
 * @param {string} [options.caption]   screen-reader summary of what is orbiting
 * @returns {{node: HTMLElement, destroy: Function}}
 */
export function orbitingCircles({
  rings = DEFAULT_RINGS,
  animate = true,
  sphere = true,
  logo = true,
  variant = 'centred',
  caption = 'The LifeQuest systems that orbit a single character',
} = {}) {
  const core = el('div', { class: 'orbit__core', 'aria-hidden': 'true' });

  // The mark is the thing everything turns around, so it sits above the
  // particle field rather than beside it.
  if (logo) {
    core.append(el('img', {
      class: 'orbit__logo', src: 'img/emblem.svg', alt: '',
      width: '128', height: '128', decoding: 'async',
    }));
  }

  const node = el('div', {
    class: `orbit orbit--${variant}${animate ? '' : ' orbit--still'}`,
  },
    core,
    ...rings.map((ring) => {
      // Each seat is mirrored across the ring so the spacing stays even at any
      // rotation — the same doubling the original does.
      const seats = [
        ...ring.seats,
        ...ring.seats.map((seat) => ({ ...seat, angle: seat.angle + 180, mirror: true })),
      ];

      return el('div', {
        class: `orbit__ring orbit__ring--${ring.size}`,
        'aria-hidden': 'true',
        dataset: { direction: ring.direction },
        style: { '--duration': `${ring.duration}s` },
      },
        ...seats.map((seat) => el('div', {
          class: 'orbit__seat',
          style: { '--start-angle': `${seat.angle}deg` },
        },
          el('span', {
            class: `orbit__icon orbit__icon--${seat.tone}`,
            style: { '--counter-offset': `${-seat.angle}deg` },
          }, icon(seat.glyph, { size: 22 })))));
    }),

    // The rings are decoration; this is the content they stand for.
    el('ul', { class: 'sr-only' },
      el('li', { text: caption }),
      ...rings.flatMap((ring) => ring.seats.map((seat) => el('li', { text: seat.label })))));

  let handle = null;
  if (sphere) {
    handle = mountParticleSphere(core, {
      colors: ['#ffcf5c', '#bd85ff', '#7d8cff'],
      animate,
    });
    // The canvas is appended last, so send it behind the mark it haloes.
    if (handle) handle.canvas.style.zIndex = '0';
  }

  return {
    node,
    destroy() {
      handle?.destroy();
    },
  };
}

/**
 * The ring artwork on its own, sized for a small slot (used as a marker in the
 * landing rail). Kept here so both places draw the same shape.
 */
export function orbitMark(size = 22) {
  return svg('svg', {
    class: 'orbit__mark', viewBox: '0 0 24 24', width: size, height: size,
    'aria-hidden': 'true', fill: 'none',
  },
    svg('circle', { cx: '12', cy: '12', r: '9.2', stroke: 'currentColor', 'stroke-width': '1.2',
                    opacity: '.45' }),
    svg('circle', { cx: '12', cy: '12', r: '5', stroke: 'currentColor', 'stroke-width': '1.2',
                    opacity: '.75' }),
    svg('circle', { cx: '12', cy: '12', r: '2', fill: 'currentColor' }),
    svg('circle', { cx: '21.2', cy: '12', r: '1.6', fill: 'currentColor' }),
    svg('circle', { cx: '12', cy: '7', r: '1.3', fill: 'currentColor', opacity: '.8' }));
}
