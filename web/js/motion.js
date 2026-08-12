// Motion layer: page transitions and scroll-driven reveals.
//
// Everything here degrades to "just show the content" when the user has asked
// for reduced motion, or when the browser lacks the API. Motion is never
// load-bearing — it only ever makes an already-correct render feel continuous.

import { state } from './store.js';

export function motionAllowed() {
  if (state.preferences?.reducedMotion) return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Swap screen content with a cross-fade.
 *
 * The DOM update happens immediately and the animation plays afterwards —
 * deliberately NOT via `document.startViewTransition`, whose callback is
 * deferred until the browser produces a rendering frame. When frames are
 * throttled (background tab, low-power mode, an automated browser) that defers
 * the content itself, so a correct render can arrive seconds late. Content
 * first, polish second.
 */
export function transition(update, container) {
  const result = update();
  if (!motionAllowed() || !container) return result;

  container.classList.remove('is-entering');
  void container.offsetWidth;          // restart the animation
  container.classList.add('is-entering');

  // The entering animation starts at `opacity: 0`, so the screen is invisible
  // until it plays — and it only plays when frames are produced. In a throttled
  // tab, a low-power window or an automated browser, `animationend` can be a
  // long time coming or never come at all, and the render would sit there fully
  // built and unseen. The timer is the floor: whichever arrives first wins, and
  // the content is always visible on the other side of it.
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    container.classList.remove('is-entering');
    container.removeEventListener('animationend', finish);
  };
  const timer = setTimeout(finish, 600);   // 340ms animation, plus slack
  container.addEventListener('animationend', finish);
  return result;
}

let observer = null;

function ensureObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') return observer;
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
  return observer;
}

/**
 * Fade-and-lift each major block as it scrolls into view. Blocks already on
 * screen animate immediately in a short stagger so the first paint has life
 * without holding anything back.
 */
export function revealOnScroll(root) {
  const blocks = root.querySelectorAll('.card, .empty, .errorstate, .quest, .ach, .grid > *');
  if (!motionAllowed()) {
    blocks.forEach((node) => node.classList.add('is-visible'));
    return;
  }

  const scope = ensureObserver();
  const viewportHeight = window.innerHeight;
  let staggered = 0;

  blocks.forEach((node) => {
    if (node.closest('.modal, .toasts')) return;
    node.classList.add('reveal');
    const top = node.getBoundingClientRect().top;
    if (top < viewportHeight * 0.96) {
      // Above the fold: reveal on a short stagger rather than on scroll.
      const delay = Math.min(staggered * 45, 320);
      staggered += 1;
      setTimeout(() => node.classList.add('is-visible'), delay);
    } else if (scope) {
      scope.observe(node);
    } else {
      node.classList.add('is-visible');
    }
  });

  // Safety net: content must never stay hidden because an observer did not
  // fire. Anything still waiting after a moment is revealed regardless.
  //
  // The net strips `reveal` rather than only adding `is-visible`, because
  // `is-visible` un-hides through a *transition* — and a transition, like an
  // animation, only advances when frames are produced. Dropping the class that
  // sets `opacity: 0` is the one move that does not depend on a frame ever
  // arriving. By this point every entrance has either played or is moot.
  setTimeout(() => {
    blocks.forEach((node) => {
      node.classList.add('is-visible');
      node.classList.remove('reveal');
      if (scope) scope.unobserve(node);
    });
  }, 2500);
}

/** Smoothly scroll to the top of a screen without fighting reduced-motion. */
export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: motionAllowed() ? 'smooth' : 'auto' });
}
