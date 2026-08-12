// ICONS — the line-icon vocabulary the navigation is drawn in.
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
