// Parametric SVG avatar.
//
// Everything is drawn from primitives at render time — no sprite sheets, no
// external images, which keeps it working under the app's `default-src 'self'`
// CSP and offline. The option ids here must match `server/game/avatar.py`;
// `tests/test_avatar.py` fails the build if they drift apart.

import { svg } from './ui.js';

export const SKIN = {
  skin1: { base: '#ffdcc0', shade: '#f0c1a0', line: '#c99878' },
  skin2: { base: '#f6c9a0', shade: '#e3ac81', line: '#bc855f' },
  skin3: { base: '#e8ac7c', shade: '#d29360', line: '#a86f45' },
  skin4: { base: '#d2915c', shade: '#b97747', line: '#8f5a33' },
  skin5: { base: '#b8763f', shade: '#9e5f30', line: '#7a4623' },
  skin6: { base: '#94572b', shade: '#7c4521', line: '#5d3218' },
  skin7: { base: '#6f3f20', shade: '#5b3119', line: '#432312' },
  skin8: { base: '#4c2a15', shade: '#3d2110', line: '#2b170b' },
};

export const HAIR_COLOR = {
  noir: { base: '#221f22', light: '#3a3540' },
  espresso: { base: '#3d2a1e', light: '#573c2b' },
  chestnut: { base: '#6b4423', light: '#8a5c33' },
  auburn: { base: '#a2542a', light: '#bd6c3c' },
  ginger: { base: '#c96a2b', light: '#e2853f' },
  honey: { base: '#dcb46a', light: '#eccf94' },
  platinum: { base: '#e8e2d6', light: '#f7f3ea' },
  silver: { base: '#b3bac7', light: '#d2d8e2' },
  azure: { base: '#4a90d9', light: '#6fb0f0' },
  bloom: { base: '#e26aa5', light: '#f28cbe' },
  moss: { base: '#4caf78', light: '#6fcb96' },
  violet: { base: '#9b6cf0', light: '#b78dff' },
};

export const OUTFIT_COLOR = {
  ember: '#e8543f', amber: '#f2a03d', gold: '#ffcf5c', moss: '#5cb87a',
  teal: '#38b2ac', sky: '#4a90d9', indigo: '#7c6cf5', orchid: '#b57bff',
  rose: '#ec6ea5', slate: '#39435c', bone: '#e6e8f0', ink: '#1f2637',
};

export const BACKGROUND = {
  slate: ['#39415e', '#232838'],
  dusk: ['#5b4784', '#2e2447'],
  ember: ['#a75a33', '#4d2718'],
  deep: ['#276b87', '#12313f'],
  moss: ['#3a7458', '#1b3a2b'],
  plum: ['#743a67', '#3a1c33'],
  gold: ['#b08a3a', '#4f3d18'],
  aurora: ['#3a6fa8', '#7c4bb0'],
};

function shade(hex, amount) {
  const value = hex.replace('#', '');
  const int = parseInt(value.length === 3 ? value.split('').map((c) => c + c).join('') : value, 16);
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => {
    const next = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(next)));
  });
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/* ------------------------------------------------------------------ hair -- */
// Each style returns { back, front } layers so long hair can sit behind the head.
const HAIR = {
  bald: () => ({ back: [], front: [] }),

  buzz: (c) => ({
    back: [],
    front: [svg('path', { d: 'M50 62c0-27 22-44 50-44s50 17 50 44c0 6-2 10-4 10-8-16-24-25-46-25s-38 9-46 25c-2 0-4-4-4-10z', fill: c.base })],
  }),

  short: (c) => ({
    back: [],
    front: [
      svg('path', { d: 'M46 70c-2-32 22-54 54-54s56 22 54 54c-1 8-4 12-7 12-3-20-10-28-19-30-12 12-46 14-64 4-8 6-13 14-15 26-2 0-3-4-3-12z', fill: c.base }),
      svg('path', { d: 'M62 34c14-12 46-14 62 2-16-8-44-8-62-2z', fill: c.light, opacity: '.55' }),
    ],
  }),

  wavy: (c) => ({
    back: [svg('path', { d: 'M40 74c0-34 26-58 60-58s60 24 60 58c0 22-6 40-12 46-4-10-2-24-6-30-16 10-68 12-84-2-6 6-4 22-8 32-6-6-10-24-10-46z', fill: c.base })],
    front: [
      svg('path', { d: 'M44 72c2-30 26-50 56-50s54 20 56 50c-2-4-6-10-10-12-14 12-70 14-88 0-6 2-11 8-14 12z', fill: c.light, opacity: '.5' }),
    ],
  }),

  curls: (c) => {
    const puffs = [];
    const points = [[58, 42], [76, 28], [100, 22], [124, 28], [142, 42], [148, 62], [52, 62], [64, 30], [136, 30]];
    for (const [x, y] of points) {
      puffs.push(svg('circle', { cx: x, cy: y, r: 19, fill: c.base }));
    }
    puffs.push(svg('circle', { cx: 82, cy: 34, r: 10, fill: c.light, opacity: '.45' }));
    return { back: [], front: puffs };
  },

  afro: (c) => ({
    back: [svg('ellipse', { cx: 100, cy: 52, rx: 68, ry: 54, fill: c.base })],
    front: [
      svg('ellipse', { cx: 100, cy: 52, rx: 68, ry: 54, fill: 'none', stroke: c.light, 'stroke-width': '3', opacity: '.4' }),
      svg('ellipse', { cx: 76, cy: 34, rx: 20, ry: 14, fill: c.light, opacity: '.35' }),
    ],
  }),

  long: (c) => ({
    back: [
      svg('path', { d: 'M38 78c0-38 28-62 62-62s62 24 62 62v72c0 6-4 10-10 10s-10-4-10-10V96c-18 12-66 12-84 0v54c0 6-4 10-10 10s-10-4-10-10z', fill: c.base }),
    ],
    front: [
      svg('path', { d: 'M44 74c2-32 26-52 56-52s54 20 56 52c-4-8-10-16-16-18-14 12-66 14-82 0-6 2-11 10-14 18z', fill: c.base }),
      svg('path', { d: 'M60 36c12-12 44-16 62 0-16-6-46-6-62 0z', fill: c.light, opacity: '.5' }),
    ],
  }),

  ponytail: (c) => ({
    back: [
      svg('path', { d: 'M150 66c14 2 24 16 24 34 0 22-8 40-18 48-6 4-12 0-9-7 8-18 10-42 3-58z', fill: c.base }),
      svg('circle', { cx: 152, cy: 66, r: 12, fill: c.light }),
    ],
    front: [
      svg('path', { d: 'M46 72c-2-32 22-54 54-54s56 22 54 54c-3-10-8-18-14-22-16 12-62 14-80 2-7 4-12 10-14 20z', fill: c.base }),
    ],
  }),

  bun: (c) => ({
    back: [svg('circle', { cx: 100, cy: 14, r: 22, fill: c.base })],
    front: [
      svg('circle', { cx: 100, cy: 14, r: 22, fill: 'none', stroke: c.light, 'stroke-width': '3', opacity: '.5' }),
      svg('path', { d: 'M48 70c0-30 24-50 52-50s52 20 52 50c-4-12-12-22-20-26-14 10-52 10-66 0-8 4-14 14-18 26z', fill: c.base }),
    ],
  }),

  braids: (c) => {
    const nodes = [
      svg('path', { d: 'M46 72c0-32 24-54 54-54s54 22 54 54c-3-10-8-18-14-22-16 12-64 14-80 2-6 4-11 10-14 20z', fill: c.base }),
    ];
    for (const x of [50, 150]) {
      for (let i = 0; i < 5; i += 1) {
        nodes.push(svg('circle', { cx: x, cy: 78 + i * 17, r: 9, fill: c.base }));
      }
    }
    return { back: [], front: nodes };
  },

  locs: (c) => {
    const strands = [];
    for (let i = 0; i < 9; i += 1) {
      const x = 46 + i * 13.5;
      strands.push(svg('rect', {
        x: x - 5, y: 18 + (i % 2) * 6, width: 11, height: 74 + (i % 3) * 14,
        rx: 6, fill: i % 2 ? c.base : c.light,
      }));
    }
    return {
      back: strands,
      front: [svg('path', { d: 'M48 66c0-28 24-48 52-48s52 20 52 48c-14-14-90-14-104 0z', fill: c.base })],
    };
  },

  hijab: (c) => ({
    back: [
      svg('path', { d: 'M36 84c0-40 28-68 64-68s64 28 64 68c0 30-10 52-20 62H56c-10-10-20-32-20-62z', fill: c.base }),
    ],
    front: [
      svg('path', { d: 'M62 62c0-20 16-34 38-34s38 14 38 34c-10-10-66-10-76 0z', fill: c.light, opacity: '.45' }),
      svg('path', { d: 'M56 146c8 8 18 12 44 12s36-4 44-12l6 22H50z', fill: c.base }),
    ],
  }),

  spiky: (c) => {
    const spikes = [];
    for (let i = 0; i < 7; i += 1) {
      const x = 54 + i * 15;
      spikes.push(svg('path', {
        d: `M${x - 11} 52 L${x + (i % 2 ? 4 : -4)} ${8 + (i % 3) * 7} L${x + 11} 52 Z`,
        fill: i % 2 ? c.base : c.light,
      }));
    }
    spikes.push(svg('path', { d: 'M48 64c0-26 24-44 52-44s52 18 52 44c-14-14-90-14-104 0z', fill: c.base }));
    return { back: [], front: spikes };
  },

  mohawk: (c) => ({
    back: [],
    front: [
      svg('path', { d: 'M50 68c0-8 2-16 6-22 4 12 6 20 6 24-6 0-10 0-12-2zM138 68c0-8-2-16-6-22-4 12-6 20-6 24 6 0 10 0 12-2z', fill: c.base }),
      svg('path', { d: 'M84 60c0-30 6-48 16-56 10 8 16 26 16 56-10-6-22-6-32 0z', fill: c.light }),
      svg('path', { d: 'M88 58c0-24 5-40 12-48 7 8 12 24 12 48-8-4-16-4-24 0z', fill: c.base }),
    ],
  }),
};

/* ------------------------------------------------------------------ eyes -- */
const EYES = {
  open: () => [
    svg('ellipse', { cx: 80, cy: 96, rx: 8, ry: 9.5, fill: '#20222e' }),
    svg('ellipse', { cx: 120, cy: 96, rx: 8, ry: 9.5, fill: '#20222e' }),
    svg('circle', { cx: 83, cy: 93, r: 2.6, fill: '#fff' }),
    svg('circle', { cx: 123, cy: 93, r: 2.6, fill: '#fff' }),
  ],
  happy: () => [
    svg('path', { d: 'M71 99c4-9 14-9 18 0', fill: 'none', stroke: '#20222e', 'stroke-width': '5', 'stroke-linecap': 'round' }),
    svg('path', { d: 'M111 99c4-9 14-9 18 0', fill: 'none', stroke: '#20222e', 'stroke-width': '5', 'stroke-linecap': 'round' }),
  ],
  focused: () => [
    svg('rect', { x: 71, y: 92, width: 18, height: 8, rx: 4, fill: '#20222e' }),
    svg('rect', { x: 111, y: 92, width: 18, height: 8, rx: 4, fill: '#20222e' }),
    svg('path', { d: 'M69 84l22 4M131 84l-22 4', stroke: '#20222e', 'stroke-width': '4', 'stroke-linecap': 'round' }),
  ],
  sleepy: () => [
    svg('path', { d: 'M71 96c5 6 13 6 18 0', fill: 'none', stroke: '#20222e', 'stroke-width': '5', 'stroke-linecap': 'round' }),
    svg('path', { d: 'M111 96c5 6 13 6 18 0', fill: 'none', stroke: '#20222e', 'stroke-width': '5', 'stroke-linecap': 'round' }),
  ],
  wink: () => [
    svg('ellipse', { cx: 80, cy: 96, rx: 8, ry: 9.5, fill: '#20222e' }),
    svg('circle', { cx: 83, cy: 93, r: 2.6, fill: '#fff' }),
    svg('path', { d: 'M111 98c4-8 14-8 18 0', fill: 'none', stroke: '#20222e', 'stroke-width': '5', 'stroke-linecap': 'round' }),
  ],
  bright: () => [
    svg('circle', { cx: 80, cy: 96, r: 10, fill: '#fff' }),
    svg('circle', { cx: 120, cy: 96, r: 10, fill: '#fff' }),
    svg('circle', { cx: 80, cy: 96, r: 6, fill: '#20222e' }),
    svg('circle', { cx: 120, cy: 96, r: 6, fill: '#20222e' }),
    svg('circle', { cx: 82.5, cy: 93, r: 2.4, fill: '#fff' }),
    svg('circle', { cx: 122.5, cy: 93, r: 2.4, fill: '#fff' }),
  ],
};

/* ----------------------------------------------------------------- mouth -- */
const MOUTH = {
  smile: (skin) => [svg('path', {
    d: 'M88 118c5 6 19 6 24 0', fill: 'none', stroke: skin.line,
    'stroke-width': '4.5', 'stroke-linecap': 'round',
  })],
  grin: (skin) => [
    svg('path', { d: 'M84 114c8 14 24 14 32 0z', fill: '#3a2028' }),
    svg('path', { d: 'M87 115h26c-2 3-5 4-13 4s-11-1-13-4z', fill: '#fff' }),
  ],
  neutral: (skin) => [svg('path', {
    d: 'M89 119h22', fill: 'none', stroke: skin.line, 'stroke-width': '4.5', 'stroke-linecap': 'round',
  })],
  smirk: (skin) => [svg('path', {
    d: 'M88 119c8 5 16 2 22-5', fill: 'none', stroke: skin.line,
    'stroke-width': '4.5', 'stroke-linecap': 'round',
  })],
  oh: () => [svg('ellipse', { cx: 100, cy: 118, rx: 8, ry: 10, fill: '#3a2028' })],
};

/* ---------------------------------------------------------------- outfit -- */
const OUTFIT = {
  tee: (color) => [
    svg('path', { d: 'M56 200v-28c0-18 14-30 30-34l14 10 14-10c16 4 30 16 30 34v28z', fill: color }),
    svg('path', { d: 'M86 138l14 12 14-12-6-4-8 6-8-6z', fill: shade(color, -0.25) }),
  ],
  hoodie: (color) => [
    svg('path', { d: 'M52 200v-30c0-18 14-32 32-36l16 12 16-12c18 4 32 18 32 36v30z', fill: color }),
    svg('path', { d: 'M78 134c6 14 14 22 22 22s16-8 22-22c-6-4-14-6-22-6s-16 2-22 6z', fill: shade(color, -0.3) }),
    svg('path', { d: 'M96 150h8v34h-8z', fill: shade(color, -0.35) }),
    svg('circle', { cx: 92, cy: 186, r: 3.5, fill: shade(color, 0.35) }),
    svg('circle', { cx: 108, cy: 186, r: 3.5, fill: shade(color, 0.35) }),
  ],
  jacket: (color) => [
    svg('path', { d: 'M54 200v-28c0-18 14-32 30-36l16 12 16-12c16 4 30 18 30 36v28z', fill: color }),
    svg('path', { d: 'M84 136l16 12v52H84z', fill: shade(color, -0.3) }),
    svg('path', { d: 'M116 136l-16 12v52h16z', fill: shade(color, -0.18) }),
    svg('rect', { x: 97, y: 150, width: 6, height: 50, fill: shade(color, 0.4) }),
  ],
  athlete: (color) => [
    svg('path', { d: 'M58 200v-26c0-18 12-30 28-34l14 10 14-10c16 4 28 16 28 34v26z', fill: color }),
    svg('path', { d: 'M74 150h52v10H74z', fill: shade(color, 0.45) }),
    svg('path', { d: 'M86 138l14 12 14-12-6-4-8 6-8-6z', fill: shade(color, -0.3) }),
    svg('circle', { cx: 100, cy: 176, r: 11, fill: 'none', stroke: shade(color, 0.5), 'stroke-width': '3' }),
    svg('path', { d: 'M100 168l3 7h7l-6 5 3 8-7-5-7 5 3-8-6-5h7z', fill: shade(color, 0.55) }),
  ],
  labcoat: (color) => [
    svg('path', { d: 'M56 200v-28c0-18 14-30 30-34l14 10 14-10c16 4 30 16 30 34v28z', fill: '#eef1f7' }),
    svg('path', { d: 'M86 138l14 12v50H82v-42z', fill: '#dfe4ee' }),
    svg('path', { d: 'M114 138l-14 12v50h18v-42z', fill: '#f7f9fc' }),
    svg('rect', { x: 118, y: 162, width: 16, height: 20, rx: 3, fill: '#dfe4ee' }),
    svg('rect', { x: 124, y: 158, width: 4, height: 14, rx: 2, fill: color }),
    svg('path', { d: 'M92 140l8 10 8-10-4-4-4 4-4-4z', fill: color }),
  ],
  artist: (color) => [
    svg('path', { d: 'M56 200v-28c0-18 14-30 30-34l14 10 14-10c16 4 30 16 30 34v28z', fill: '#6c5b4b' }),
    svg('path', { d: 'M76 152h48v48H76z', fill: color }),
    svg('path', { d: 'M88 138l12 10 12-10', fill: 'none', stroke: shade(color, 0.4), 'stroke-width': '4' }),
    svg('circle', { cx: 90, cy: 172, r: 5, fill: shade(color, -0.35) }),
    svg('circle', { cx: 110, cy: 182, r: 4, fill: shade(color, 0.4) }),
  ],
  formal: (color) => [
    svg('path', { d: 'M56 200v-28c0-18 14-30 30-34l14 10 14-10c16 4 30 16 30 34v28z', fill: '#2a3044' }),
    svg('path', { d: 'M86 138l14 12v50H80v-40z', fill: '#20263a' }),
    svg('path', { d: 'M114 138l-14 12v50h20v-40z', fill: '#333a52' }),
    svg('path', { d: 'M92 140h16l-8 12z', fill: '#f2f4fa' }),
    svg('path', { d: 'M100 152l6 8-6 26-6-26z', fill: color }),
  ],
  armor: (color) => [
    svg('path', { d: 'M54 200v-26c0-20 14-34 32-38l14 12 14-12c18 4 32 18 32 38v26z', fill: '#5a6683' }),
    svg('path', { d: 'M100 148l30 10v20c0 16-14 26-30 30-16-4-30-14-30-30v-20z', fill: color }),
    svg('path', { d: 'M100 156l20 7v14c0 11-9 18-20 21-11-3-20-10-20-21v-14z', fill: shade(color, 0.35) }),
    svg('circle', { cx: 68, cy: 164, r: 12, fill: '#6b789a' }),
    svg('circle', { cx: 132, cy: 164, r: 12, fill: '#6b789a' }),
    svg('path', { d: 'M100 160l3 7h8l-6 5 2 8-7-4-7 4 2-8-6-5h8z', fill: '#fff', opacity: '.85' }),
  ],
};

/* ------------------------------------------------------------- accessory -- */
const ACCESSORY = {
  none: () => [],
  glasses: () => [
    svg('rect', { x: 66, y: 85, width: 30, height: 22, rx: 8, fill: 'none', stroke: '#2b3044', 'stroke-width': '3.5' }),
    svg('rect', { x: 104, y: 85, width: 30, height: 22, rx: 8, fill: 'none', stroke: '#2b3044', 'stroke-width': '3.5' }),
    svg('path', { d: 'M96 94h8', stroke: '#2b3044', 'stroke-width': '3.5' }),
  ],
  shades: () => [
    svg('path', { d: 'M64 84h72l-4 10c-2 12-10 18-20 18s-15-6-16-14h-4c-1 8-6 14-16 14s-18-6-20-18z', fill: '#1b1f2e' }),
    svg('path', { d: 'M70 90h20l-2 8c-1 5-5 8-9 8s-7-3-8-8z', fill: '#39445f', opacity: '.7' }),
  ],
  earring: (skin) => [
    svg('circle', { cx: 47, cy: 108, r: 5, fill: '#ffcf5c' }),
    svg('circle', { cx: 153, cy: 108, r: 5, fill: '#ffcf5c' }),
  ],
  headband: () => [
    svg('path', { d: 'M48 66c14-12 90-12 104 0l-2 12c-14-10-86-10-100 0z', fill: '#e8543f' }),
    svg('circle', { cx: 100, cy: 62, r: 6, fill: '#ffcf5c' }),
  ],
  cap: () => [
    svg('path', { d: 'M46 66c0-28 24-46 54-46s54 18 54 46c-16-12-92-12-108 0z', fill: '#2f6fd0' }),
    svg('path', { d: 'M150 62h30c2 0 3 3 0 5-12 6-24 7-32 5z', fill: '#2559ab' }),
    svg('circle', { cx: 100, cy: 24, r: 6, fill: '#ffcf5c' }),
  ],
  headphones: () => [
    svg('path', { d: 'M44 96V78c0-30 25-52 56-52s56 22 56 52v18', fill: 'none', stroke: '#2b3044', 'stroke-width': '9', 'stroke-linecap': 'round' }),
    svg('rect', { x: 32, y: 88, width: 24, height: 34, rx: 11, fill: '#39445f' }),
    svg('rect', { x: 144, y: 88, width: 24, height: 34, rx: 11, fill: '#39445f' }),
    svg('rect', { x: 38, y: 96, width: 12, height: 18, rx: 6, fill: '#56d0f5' }),
    svg('rect', { x: 150, y: 96, width: 12, height: 18, rx: 6, fill: '#56d0f5' }),
  ],
  visor: () => [
    svg('path', { d: 'M50 80h100c4 0 6 3 6 7v10c0 8-6 13-14 13H58c-8 0-14-5-14-13V87c0-4 2-7 6-7z', fill: '#141a2c' }),
    svg('path', { d: 'M56 86h88v9c0 5-4 8-9 8H65c-5 0-9-3-9-8z', fill: '#56d0f5', opacity: '.75' }),
    svg('path', { d: 'M62 90h30', stroke: '#bff0ff', 'stroke-width': '3', 'stroke-linecap': 'round', opacity: '.9' }),
  ],
};

/* ---------------------------------------------------------------- render -- */

/**
 * Build an avatar as an inline SVG element.
 *
 * @param {object} config  slot ids from the server catalog
 * @param {object} [opts]
 * @param {number} [opts.size=160]
 * @param {boolean} [opts.ring=false]  draw a tier-coloured ring
 * @param {string} [opts.ringColor]
 * @param {string} [opts.title]        accessible name; omit for decorative use
 */
export function renderAvatar(config = {}, {
  size = 160, ring = false, ringColor = '#ffcf5c', title,
} = {}) {
  const skin = SKIN[config.skinTone] || SKIN.skin3;
  const hairColor = HAIR_COLOR[config.hairColor] || HAIR_COLOR.espresso;
  const outfitColor = OUTFIT_COLOR[config.outfitColor] || OUTFIT_COLOR.sky;
  const background = BACKGROUND[config.background] || BACKGROUND.slate;
  const hair = (HAIR[config.hair] || HAIR.short)(hairColor);
  const eyes = (EYES[config.eyes] || EYES.open)();
  const mouth = (MOUTH[config.mouth] || MOUTH.smile)(skin);
  const outfit = (OUTFIT[config.outfit] || OUTFIT.tee)(outfitColor);
  const accessory = (ACCESSORY[config.accessory] || ACCESSORY.none)(skin);

  const uid = `av${Math.random().toString(36).slice(2, 8)}`;
  const root = svg('svg', {
    viewBox: '0 0 200 200', width: size, height: size, class: 'avatar',
    role: title ? 'img' : 'presentation',
    'aria-hidden': title ? null : 'true',
  });
  if (title) root.append(svg('title', { text: title }));

  root.append(
    svg('defs', {},
      svg('linearGradient', { id: `${uid}bg`, x1: '0', y1: '0', x2: '0', y2: '1' },
        svg('stop', { offset: '0', 'stop-color': background[0] }),
        svg('stop', { offset: '1', 'stop-color': background[1] })),
      svg('clipPath', { id: `${uid}clip` },
        svg('circle', { cx: 100, cy: 100, r: 96 }))),
  );

  const scene = svg('g', { 'clip-path': `url(#${uid}clip)` });
  scene.append(svg('circle', { cx: 100, cy: 100, r: 96, fill: `url(#${uid}bg)` }));
  scene.append(svg('circle', { cx: 100, cy: 150, r: 74, fill: '#ffffff', opacity: '.06' }));

  for (const node of hair.back) scene.append(node);

  // Shoulders and neck sit under the head.
  for (const node of outfit) scene.append(node);
  scene.append(svg('path', { d: 'M88 122h24v22c0 6-24 6-24 0z', fill: skin.shade }));

  // Head.
  scene.append(svg('ellipse', { cx: 47, cy: 104, rx: 7, ry: 10, fill: skin.shade }));
  scene.append(svg('ellipse', { cx: 153, cy: 104, rx: 7, ry: 10, fill: skin.shade }));
  scene.append(svg('path', {
    d: 'M52 92c0-28 21-48 48-48s48 20 48 48v14c0 28-21 48-48 48s-48-20-48-48z',
    fill: skin.base,
  }));
  scene.append(svg('path', {
    d: 'M52 100c0-6 0-10 1-14 6 20 88 20 94 0 1 4 1 8 1 14 0 4 0 8-1 12-8-16-86-16-94 0-1-4-1-8-1-12z',
    fill: skin.shade, opacity: '.28',
  }));

  for (const node of eyes) scene.append(node);
  for (const node of mouth) scene.append(node);
  for (const node of hair.front) scene.append(node);
  for (const node of accessory) scene.append(node);

  root.append(scene);
  root.append(svg('circle', {
    cx: 100, cy: 100, r: 95, fill: 'none',
    stroke: ring ? ringColor : 'rgba(255,255,255,.16)',
    'stroke-width': ring ? 5 : 2,
  }));
  return root;
}

/** The option ids this renderer can draw — the drift test compares these. */
export const RENDERABLE = {
  skinTone: Object.keys(SKIN),
  hair: Object.keys(HAIR),
  hairColor: Object.keys(HAIR_COLOR),
  eyes: Object.keys(EYES),
  mouth: Object.keys(MOUTH),
  outfit: Object.keys(OUTFIT),
  outfitColor: Object.keys(OUTFIT_COLOR),
  accessory: Object.keys(ACCESSORY),
  background: Object.keys(BACKGROUND),
};
