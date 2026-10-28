// ICONS — the line-icon vocabulary the whole product is drawn in.
//
// It started as the nine glyphs the navigation needed. It is now every mark in
// the app: domains, achievements, rank tiers, empty states, verdicts, the theme
// control and the evidence controls. That is deliberate — a set of drawn icons
// and a scattering of emoji do not read as one product, and emoji are a
// different size, a different colour and a different vertical rhythm on every
// operating system, which no amount of CSS can bring back into line.
//
// The component this set was written for imports `lucide-react`. There is no
// Node on this machine, so the package cannot be installed and the CSP
// (`img-src 'self' data: blob:`) rules out pulling the same glyphs off a CDN —
// the same two constraints that shaped the earlier ports, see
// docs/component-integration.md.
//
// So the icons are drawn here in lucide's own idiom rather than imported from
// it: a 24×24 grid, no fill, 2px round-capped strokes, `currentColor`
// throughout. That last part is what makes them work as navigation: opacity and
// colour are set by the nav's own state, and the icon inherits both.
//
// They are inline SVG rather than <img>, because an <img> cannot inherit
// `currentColor` and would need one file per icon per theme.

import { svg } from '../ui.js';

// Each entry is a list of [tag, attributes] children. Kept as data so an icon is
// declarative and there is exactly one place that knows the shared attributes.
const PATHS = {
  home: [
    ['path', { d: 'm3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }],
    ['path', { d: 'M9 22V12h6v10' }],
  ],
  sword: [
    ['polyline', { points: '14.5 17.5 3 6 3 3 6 3 17.5 14.5' }],
    ['line', { x1: '13', y1: '19', x2: '19', y2: '13' }],
    ['line', { x1: '16', y1: '16', x2: '20', y2: '20' }],
    ['line', { x1: '19', y1: '21', x2: '21', y2: '19' }],
  ],
  user: [
    ['path', { d: 'M20 21a8 8 0 0 0-16 0' }],
    ['circle', { cx: '12', cy: '8', r: '5' }],
  ],
  sprout: [
    ['path', { d: 'M7 20h10' }],
    ['path', { d: 'M10 20c5.5-2.5.8-6.4 3-10' }],
    ['path', { d: 'M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z' }],
    ['path', { d: 'M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z' }],
  ],
  trending: [
    ['polyline', { points: '22 7 13.5 15.5 8.5 10.5 2 17' }],
    ['polyline', { points: '16 7 22 7 22 13' }],
  ],
  sparkles: [
    ['path', { d: 'm12 4-1.6 4.8a2 2 0 0 1-1.27 1.27L4.3 11.7l4.83 1.6a2 2 0 0 1 1.27 1.27L12 19.4l1.6-4.83a2 2 0 0 1 1.27-1.27l4.83-1.6-4.83-1.6a2 2 0 0 1-1.27-1.27z' }],
    ['path', { d: 'M5 4v3' }],
    ['path', { d: 'M3.5 5.5h3' }],
    ['path', { d: 'M19 17v3' }],
    ['path', { d: 'M17.5 18.5h3' }],
  ],
  trophy: [
    ['path', { d: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6' }],
    ['path', { d: 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18' }],
    ['path', { d: 'M4 22h16' }],
    ['path', { d: 'M10 14.6V17c0 .6-.5 1-1 1.2-1.2.5-2 2-2 3.8' }],
    ['path', { d: 'M14 14.6V17c0 .6.5 1 1 1.2 1.2.5 2 2 2 3.8' }],
    ['path', { d: 'M18 2H6v7a6 6 0 0 0 12 0z' }],
  ],
  settings: [
    ['path', { d: 'M20 7h-9' }],
    ['path', { d: 'M14 17H5' }],
    ['circle', { cx: '17', cy: '17', r: '3' }],
    ['circle', { cx: '7', cy: '7', r: '3' }],
  ],
  more: [
    ['circle', { cx: '12', cy: '12', r: '1' }],
    ['circle', { cx: '19', cy: '12', r: '1' }],
    ['circle', { cx: '5', cy: '12', r: '1' }],
  ],

  // ---- the three domains -------------------------------------------------
  // These three carry the most weight in the product, because they are the
  // spine of it: every quest, every attribute and every skill belongs to one.
  bolt: [
    ['path', { d: 'M13 2 3 14h9l-1 8 10-12h-9z' }],
  ],
  brain: [
    ['path', { d: 'M12 5a3 3 0 0 0-5.6-1.5A2.5 2.5 0 0 0 4 6a2.5 2.5 0 0 0-.5 4.5A3 3 0 0 0 4 16a2.5 2.5 0 0 0 3 3 2.5 2.5 0 0 0 5 .5z' }],
    ['path', { d: 'M12 5a3 3 0 0 1 5.6-1.5A2.5 2.5 0 0 1 20 6a2.5 2.5 0 0 1 .5 4.5A3 3 0 0 1 20 16a2.5 2.5 0 0 1-3 3 2.5 2.5 0 0 1-5 .5z' }],
    ['path', { d: 'M12 5v14.5' }],
  ],
  flame: [
    ['path', { d: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z' }],
  ],

  // ---- states, verdicts and marks ---------------------------------------
  check: [
    ['polyline', { points: '20 6 9 17 4 12' }],
  ],
  cross: [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'M6 6l12 12' }],
  ],
  alert: [
    ['path', { d: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z' }],
    ['path', { d: 'M12 9v4' }],
    ['path', { d: 'M12 17h.01' }],
  ],
  lock: [
    ['rect', { x: '3', y: '11', width: '18', height: '11', rx: '2' }],
    ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
  ],
  star: [
    ['path', { d: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3L7 14.2l-5-4.9 6.9-1z' }],
  ],
  spark: [
    ['path', { d: 'M12 3v18' }],
    ['path', { d: 'M3 12h18' }],
    ['path', { d: 'm5.6 5.6 12.8 12.8' }],
    ['path', { d: 'm18.4 5.6-12.8 12.8' }],
  ],
  clock: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['polyline', { points: '12 7 12 12 15.5 14' }],
  ],

  // ---- theme -------------------------------------------------------------
  sun: [
    ['circle', { cx: '12', cy: '12', r: '4' }],
    ['path', { d: 'M12 2v2' }], ['path', { d: 'M12 20v2' }],
    ['path', { d: 'm4.9 4.9 1.4 1.4' }], ['path', { d: 'm17.7 17.7 1.4 1.4' }],
    ['path', { d: 'M2 12h2' }], ['path', { d: 'M20 12h2' }],
    ['path', { d: 'm6.3 17.7-1.4 1.4' }], ['path', { d: 'm19.1 4.9-1.4 1.4' }],
  ],
  moon: [
    ['path', { d: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z' }],
  ],
  // "Auto" is the two of them at once, which is exactly what it means.
  contrast: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'M12 3a9 9 0 0 1 0 18z' }],
  ],

  // ---- evidence ----------------------------------------------------------
  paperclip: [
    ['path', { d: 'M21.4 11.1 12.5 20a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a3.7 3.7 0 0 1 5.2 5.2l-8.9 8.9a1.8 1.8 0 0 1-2.6-2.6l8.2-8.2' }],
  ],
  video: [
    ['path', { d: 'm22 8-6 4 6 4z' }],
    ['rect', { x: '2', y: '6', width: '14', height: '12', rx: '2' }],
  ],
  image: [
    ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }],
    ['circle', { cx: '9', cy: '9', r: '2' }],
    ['path', { d: 'm21 15-4.6-4.6a2 2 0 0 0-2.8 0L3 21' }],
  ],

  // ---- empty states ------------------------------------------------------
  compass: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'm16.2 7.8-2.1 6.4-6.3 2.1 2.1-6.4z' }],
  ],
  map: [
    ['path', { d: 'M14.1 4.1 9.9 2 3.4 4.2a1 1 0 0 0-.4.8v14a1 1 0 0 0 1.3 1L9.9 18l4.2 2.1 5.6-1.9a1 1 0 0 0 .4-.8v-14a1 1 0 0 0-1.3-1z' }],
    ['path', { d: 'M9.9 2v16' }],
    ['path', { d: 'M14.1 4v16' }],
  ],
  medal: [
    ['path', { d: 'M7.2 2h2.3l3 5' }],
    ['path', { d: 'M16.8 2h-2.3l-1.4 2.3' }],
    ['circle', { cx: '12', cy: '15', r: '6' }],
    ['path', { d: 'M12 12.5 13 15h2.4l-2 1.6.8 2.4-2.2-1.5-2.2 1.5.8-2.4-2-1.6H11z' }],
  ],
  note: [
    ['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }],
    ['polyline', { points: '14 2 14 8 20 8' }],
    ['path', { d: 'M8 13h8' }],
    ['path', { d: 'M8 17h5' }],
  ],
  leaf: [
    ['path', { d: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z' }],
    ['path', { d: 'M2 21c0-3 1.9-5.8 4.5-7.5C9 12 12 11 14 10' }],
  ],
  scroll: [
    ['path', { d: 'M19 17V5a2 2 0 0 0-2-2H4' }],
    ['path', { d: 'M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1a2 2 0 0 1-2 2 2 2 0 0 1-2-2V7a1 1 0 0 1 1-1h3' }],
  ],
  chart: [
    ['path', { d: 'M3 3v16a2 2 0 0 0 2 2h16' }],
    ['path', { d: 'M8 17V9' }],
    ['path', { d: 'M13 17v-5' }],
    ['path', { d: 'M18 17V6' }],
  ],
  plug: [
    ['path', { d: 'M12 22v-5' }],
    ['path', { d: 'M9 7V2' }],
    ['path', { d: 'M15 7V2' }],
    ['path', { d: 'M6 7h12v3a6 6 0 0 1-12 0z' }],
  ],

  // ---- values and promises ----------------------------------------------
  dumbbell: [
    ['path', { d: 'M14.4 14.4 9.6 9.6' }],
    ['path', { d: 'M18.7 12.3a2.6 2.6 0 0 0 3.6-3.6l-1.4-1.4a2.6 2.6 0 0 0-3.6-3.6l-1.1 1.1' }],
    ['path', { d: 'M5.3 11.7a2.6 2.6 0 0 0-3.6 3.6l1.4 1.4a2.6 2.6 0 0 0 3.6 3.6l1.1-1.1' }],
    ['path', { d: 'm21.6 21.6-1.4-1.4' }],
    ['path', { d: 'm3.8 3.8-1.4-1.4' }],
  ],
  heart: [
    ['path', { d: 'M19 14c1.5-1.5 3-3.4 3-5.5A5.5 5.5 0 0 0 12 5.7 5.5 5.5 0 0 0 2 8.5c0 2.1 1.5 4 3 5.5l7 7z' }],
  ],
  shield: [
    ['path', { d: 'M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1 1 0 0 1 1.6 0C14.6 3.8 17 5 19 5a1 1 0 0 1 1 1z' }],
  ],
  target: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['circle', { cx: '12', cy: '12', r: '5' }],
    ['circle', { cx: '12', cy: '12', r: '1' }],
  ],
  scale: [
    ['path', { d: 'M12 3v18' }],
    ['path', { d: 'M5 21h14' }],
    ['path', { d: 'm3 9 3-6 3 6a3 3 0 0 1-6 0z' }],
    ['path', { d: 'm15 9 3-6 3 6a3 3 0 0 1-6 0z' }],
  ],
  hammer: [
    ['path', { d: 'm15 12-8.4 8.4a2.1 2.1 0 0 1-3-3L12 9' }],
    ['path', { d: 'M17.6 6.4 22 10.8' }],
    ['path', { d: 'm12.5 4.5 3-3 7 7-3 3z' }],
  ],
  book: [
    ['path', { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' }],
    ['path', { d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' }],
    ['path', { d: 'M9 7h7' }],
  ],
  gem: [
    ['path', { d: 'M6 3h12l4 6-10 12L2 9z' }],
    ['path', { d: 'M2 9h20' }],
    ['path', { d: 'm12 21-4-12 2-6' }],
    ['path', { d: 'm12 21 4-12-2-6' }],
  ],
  crown: [
    ['path', { d: 'M2 7l4.5 4L12 3l5.5 8L22 7l-2 12H4z' }],
    ['path', { d: 'M4 19h16' }],
  ],
  hourglass: [
    ['path', { d: 'M6 2h12' }],
    ['path', { d: 'M6 22h12' }],
    ['path', { d: 'M8 2v4.5a4 4 0 0 0 1.8 3.3L12 12l-2.2 2.2A4 4 0 0 0 8 17.5V22' }],
    ['path', { d: 'M16 2v4.5a4 4 0 0 1-1.8 3.3L12 12l2.2 2.2a4 4 0 0 1 1.8 3.3V22' }],
  ],
  // A disc half-filled: the mark for a long unbroken session, and for "auto".
  halfdisc: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'M12 3v18' }],
    ['path', { d: 'M12 21a9 9 0 0 0 0-18z' }],
  ],
  diamond: [
    ['path', { d: 'M12 2.6 21.4 12 12 21.4 2.6 12z' }],
  ],
  layers: [
    ['path', { d: 'm12 2 9.5 5.2a.6.6 0 0 1 0 1L12 13.4 2.5 8.2a.6.6 0 0 1 0-1z' }],
    ['path', { d: 'm2.5 13.5 9.2 5a.6.6 0 0 0 .6 0l9.2-5' }],
  ],
  key: [
    ['path', { d: 'm15.5 7.5 3 3L22 7l-3-3' }],
    ['path', { d: 'm18 9-9.3 9.3' }],
    ['circle', { cx: '6', cy: '18', r: '4' }],
  ],
  mail: [
    ['rect', { x: '2', y: '4', width: '20', height: '16', rx: '2' }],
    ['path', { d: 'm2 7 8.6 5.7a2 2 0 0 0 2.8 0L22 7' }],
  ],
  chevronDown: [
    ['polyline', { points: '6 9 12 15 18 9' }],
  ],
  terminal: [
    ['polyline', { points: '4 17 10 11 4 5' }],
    ['line', { x1: '12', y1: '19', x2: '20', y2: '19' }],
  ],
};

/**
 * @param {keyof PATHS} name
 * @param {object}  [options]
 * @param {number}  [options.size=24]
 * @param {string}  [options.className]
 * @returns {SVGElement}
 */
export function icon(name, { size = 24, className = '' } = {}) {
  const shape = PATHS[name] || PATHS.more;
  return svg('svg', {
    class: `icon${className ? ` ${className}` : ''}`,
    viewBox: '0 0 24 24', width: String(size), height: String(size),
    fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'aria-hidden': 'true', focusable: 'false',
  }, ...shape.map(([tag, attrs]) => svg(tag, attrs)));
}

export const iconNames = Object.keys(PATHS);
