// LIMELIGHT NAV — a port of the `limelight-nav.tsx` component.
//
// Same idea as the original: an adaptive-width bar of icon-only items with a
// bright bar — the limelight — that slides to sit over the active one, throwing
// a cone of light across it. The substitutions are the ones this codebase forces
// (see docs/component-integration.md):
//
//   * React state + `useLayoutEffect` → a plain object with `setActive`, and
//     `whenSized` from ui.js for the first measurement. The original measures in
//     a layout effect because the beam has to be placed before paint; the
//     equivalent here is "measure once the node is in the document with real
//     layout", since a view is built detached and every offset would read 0.
//   * `lucide-react` → components/icons.js, drawn in the same idiom.
//   * Tailwind utilities → the token system in styles.css. `bg-primary` is the
//     accent, `bg-card` the glass chrome, `text-foreground` the body ink.
//
// Two things the original does not do, both needed here because this is real
// navigation rather than a demo:
//
//   * `orientation: 'vertical'`, so the same component is the desktop rail and
//     the phone tab bar. The beam runs along the bar's leading edge either way.
//   * the active item is *owned by the caller*, not by the component. The route
//     is the source of truth — a click that fails to navigate must not leave the
//     limelight sitting on a screen you are not looking at.

import { motionAllowed } from '../motion.js';
import { el } from '../ui.js';

/**
 * @typedef {object} LimelightItem
 * @property {string|number}  id
 * @property {SVGElement|HTMLElement} icon
 * @property {string}   [label]     accessible name; also the hover tooltip
 * @property {string}   [href]      renders an anchor when present, a button otherwise
 * @property {Function} [onClick]
 * @property {number}   [badge]     count shown on the icon
 */

/**
 * @param {object} options
 * @param {LimelightItem[]} options.items
 * @param {number}   [options.defaultActiveIndex=0]
 * @param {Function} [options.onTabChange]      called with the clicked index
 * @param {'horizontal'|'vertical'} [options.orientation='horizontal']
 * @param {string}   [options.ariaLabel]
 * @param {string}   [options.className]
 * @param {string}   [options.limelightClassName]
 * @param {string}   [options.iconContainerClassName]
 * @param {string}   [options.iconClassName]
 * @returns {{node: HTMLElement, setActive: Function, setBadge: Function,
 *            activeIndex: Function, destroy: Function} | null}
 */
export function limelightNav({
  items = [],
  defaultActiveIndex = 0,
  onTabChange,
  orientation = 'horizontal',
  ariaLabel,
  className = '',
  limelightClassName = '',
  iconContainerClassName = '',
  iconClassName = '',
} = {}) {
  // The original returns null for an empty item list rather than rendering an
  // empty bar, and a nav with nothing in it is worse than no nav at all.
  if (items.length === 0) return null;

  const vertical = orientation === 'vertical';
  let activeIndex = Math.min(Math.max(defaultActiveIndex, 0), items.length - 1);
  let ready = false;

  const badges = new Map();

  const cells = items.map((item, index) => {
    const badge = el('i', { class: 'limelight__badge', hidden: !item.badge },
      el('span', { text: item.badge ? String(item.badge) : '' }));
    badges.set(item.id, badge);

    const props = {
      class: `navlink limelight__item${iconContainerClassName ? ` ${iconContainerClassName}` : ''}`,
      'aria-label': item.label || undefined,
      // The label is not on screen, so the native tooltip is the only way to
      // read an icon you do not recognise. It is deliberately not a substitute
      // for the aria-label — pointer users get one, assistive tech the other.
      title: item.label || undefined,
      onClick: () => {
        if (onTabChange) onTabChange(index);
        if (item.onClick) item.onClick();
      },
    };
    if (item.href) props.href = item.href;
    else props.type = 'button';

    const glyph = item.icon;
    if (glyph && iconClassName) glyph.classList.add(iconClassName);

    return el(item.href ? 'a' : 'button', props, glyph, badge);
  });

  // The cone is a child of the beam in the original, so it travels with it.
  const beam = el('i', {
    class: `limelight__beam${limelightClassName ? ` ${limelightClassName}` : ''}`,
    'aria-hidden': 'true',
  }, el('i', { class: 'limelight__cone' }));

  const node = el('nav', {
    class: `limelight limelight--${orientation}${className ? ` ${className}` : ''}`,
    'aria-label': ariaLabel || undefined,
  }, ...cells, beam);

  /** Put the beam over the active cell. Cheap enough to run on every resize. */
  function place() {
    const cell = cells[activeIndex];
    if (!cell) return;
    // One of the two bars is always hidden by a media query — the rail on a
    // phone, the tab bar on a desktop — and a hidden bar has no offsets to
    // measure. Placing from those zeroes would park the beam at the top of a bar
    // nobody can see, and it would still be there when the viewport crosses the
    // breakpoint. The observer below re-runs this the moment it has a size.
    if (!node.clientWidth && !node.clientHeight) return;
    if (vertical) {
      const top = cell.offsetTop + (cell.offsetHeight - beam.offsetHeight) / 2;
      beam.style.top = `${Math.round(top)}px`;
    } else {
      const left = cell.offsetLeft + (cell.offsetWidth - beam.offsetWidth) / 2;
      beam.style.left = `${Math.round(left)}px`;
    }

    if (!ready) {
      // Same trick as the original: the beam starts parked off-stage and only
      // earns its transition once it has been placed, so the first paint is not
      // a light sliding in from nowhere.
      ready = true;
      setTimeout(() => node.classList.add('limelight--ready'), 50);
    }
  }

  const paint = () => {
    cells.forEach((cell, index) => {
      const on = index === activeIndex;
      cell.classList.toggle('is-active', on);
      if (cell.tagName === 'A') {
        if (on) cell.setAttribute('aria-current', 'page');
        else cell.removeAttribute('aria-current');
      } else {
        cell.setAttribute('aria-pressed', String(on));
      }
    });
    place();
  };

  paint();

  // Re-place whenever the bar's box changes: on first layout, on a window
  // resize, and — the case that matters — when a media query stops hiding it.
  // Deliberately an observer rather than `whenSized`: that polls on a timer and
  // gives up after 8s, which for the bar that is currently hidden means 8s of
  // ticks that can never succeed.
  let observer = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => place());
    observer.observe(node);
  }
  // Fallback for browsers without ResizeObserver, and a safety net for layout
  // that shifts without the bar itself changing size.
  const onResize = () => place();
  window.addEventListener('resize', onResize, { passive: true });

  return {
    node,
    activeIndex: () => activeIndex,
    /** Move the limelight. The caller owns this; the component never guesses. */
    setActive(index) {
      const next = Math.min(Math.max(Number(index) || 0, 0), items.length - 1);
      if (next === activeIndex && node.classList.contains('limelight--ready')) return;
      activeIndex = next;
      // Under reduced motion the beam should be *there*, not travel there.
      if (!motionAllowed()) node.classList.add('limelight--instant');
      paint();
    },
    /** Update the count on one item, by item id. */
    setBadge(id, count) {
      const badge = badges.get(id);
      if (!badge) return;
      badge.hidden = !count;
      badge.firstElementChild.textContent = count ? String(count) : '';
    },
    destroy() {
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
      node.remove();
    },
  };
}
