// INTRO ACTS — the two visual acts of the old cinematic, inlined into the page.
//
// They used to be a film: `views/landing.js` pinned a stage for eight viewports
// and scrubbed four acts across it, reached from a "Watch the two-minute intro"
// button. That format is gone. The acts are sections of the opening page now,
// scrolled through like everything else around them.
//
// Two of the four survive as sections, because only two of the four had content
// the page did not already have:
//
//   * act I was the mark, the motto and "Real life is the game. You are the main
//     character." — which is, word for word, the opening page's own hero. It
//     merged into it, taking the decrypt with it.
//   * act IV was a closing headline and the two doors, which is what
//     `.open__closing` already is. It merged there.
//   * act II (the system) and act III (the constellation) are here. The phone
//     mockup and the constellation exist nowhere else on the page.
//
// The motion is the film's, not a new invention: every `from`/`to` and every
// ease below is lifted from the act it belongs to. What changed is only what
// drives them. The film ran all four acts on one 0→1 track, so each act had to
// clear the stage for the next one; a section that faded out as you scrolled
// past would just be content you cannot read, so each act now owns its own
// progress and arrives without ever leaving.

import { orbitingCircles } from './orbitingCircles.js';
import { motionAllowed } from '../motion.js';
import { scrollScrub, throughViewport, timeline } from '../timeline.js';
import { el, rich, svg, whenSized } from '../ui.js';
import { icon } from './icons.js';

const RING_LENGTH = 402;          // 2πr for the r=64 progress ring below

// Shared with the opening page's own copy, so a keyword reads the same on both
// sides of the seam between them.
const KEYWORDS = [
  ['train the body', 'physical'], ['train the mind', 'academic'],
  ['build something', 'passion'],
  ['real actions', null],
  ['evidence', 'strong'], ['proof', 'strong'], ['actually did', 'strong'],
  ['level 100', 'xp'], ['level 1', 'xp'], ['XP', 'xp'], ['+240 XP', 'xp'],
  ['three domains', null], ['one character', null], ['one progression loop', null],
  ['cannot be grinded', 'strong'], ['harder quests', null], ['first quest', null],
  ['years of real work', null], ['outlives the session', null],
  ['something to show for it', 'strong'], ['stays on this machine', null],
  ['turning around you', null],
];

const MOTTO = 'Build the person you want to be.';

const GOALS = [
  ['bolt', 'Train the body'],
  ['brain', 'Train the mind'],
  ['flame', 'Build something'],
];

const QUEST_ROWS = [
  ['physical', 'bolt', 'Run 5 km without stopping', '+240 XP', 'In progress'],
  ['academic', 'brain', 'Prove chapter 7 without notes', '+180 XP', 'Verified'],
];

/**
 * @param {object} [options]
 * @param {number} [options.metricValue]  the number the mockup counts up to
 * @param {string} [options.metricLabel]
 * @param {string} [options.cardHeading]
 * @param {string} [options.cardDescription]
 * @returns {{node: HTMLElement, destroy: Function}}
 */
export function introActs({
  metricValue = 42,
  metricLabel = 'Level',
  cardHeading = 'Progress you have to earn.',
  cardDescription = 'Quests are real actions — train the body, train the mind, build something '
    + 'that outlives the session. Evidence comes before XP, and the curve is honest: level 100 '
    + 'is years of real work and it cannot be grinded.',
} = {}) {
  const animate = motionAllowed();
  const cleanups = [];

  // ------------------------------------------- act II: the system (mockup) --
  const counter = el('span', { class: 'phone__count', text: '0' });
  const ringFill = svg('circle', {
    class: 'phone__ringfill', cx: '88', cy: '88', r: '64', fill: 'none',
    'stroke-width': '12', 'stroke-linecap': 'round', stroke: 'url(#lq-ring)',
  });
  ringFill.style.strokeDasharray = String(RING_LENGTH);
  ringFill.style.strokeDashoffset = String(RING_LENGTH);

  const phoneWidgets = [];
  const widget = (...children) => {
    const node = el('div', { class: 'phone__widget' }, ...children);
    phoneWidgets.push(node);
    return node;
  };

  const phoneScreen = el('div', { class: 'phone__screen' },
    el('div', { class: 'phone__glare', 'aria-hidden': 'true' }),
    el('div', { class: 'phone__island', 'aria-hidden': 'true' }, el('i')),
    el('div', { class: 'phone__app' },
      widget(
        el('div', { class: 'phone__head' },
          el('div', {},
            el('span', { class: 'phone__eyebrow', text: 'Today' }),
            el('b', { class: 'phone__title', text: 'Quest log' })),
          el('span', { class: 'phone__avatar' }, icon('user', { size: 16 })))),
      widget(
        el('div', { class: 'phone__dial' },
          svg('svg', { viewBox: '0 0 176 176', 'aria-hidden': 'true' },
            svg('defs', {},
              svg('linearGradient', { id: 'lq-ring', x1: '0', y1: '0', x2: '1', y2: '1' },
                svg('stop', { offset: '0', 'stop-color': '#ffcf5c' }),
                svg('stop', { offset: '0.55', 'stop-color': '#b07cff' }),
                svg('stop', { offset: '1', 'stop-color': '#7d8cff' }))),
            svg('circle', { cx: '88', cy: '88', r: '64', fill: 'none',
                            stroke: 'rgba(255,255,255,.06)', 'stroke-width': '12' }),
            ringFill),
          el('div', { class: 'phone__dialtext' },
            counter,
            el('span', { class: 'phone__diallabel', text: metricLabel })))),
      ...QUEST_ROWS.map(([domain, glyph, title, xp, status]) => widget(
        el('div', { class: `phone__quest phone__quest--${domain}` },
          el('span', { class: 'phone__questicon', 'aria-hidden': 'true' },
            icon(glyph, { size: 16 })),
          el('span', { class: 'phone__questbody' },
            el('b', { text: title }),
            el('span', { class: 'phone__queststatus', text: status })),
          el('span', { class: 'phone__questxp', text: xp })))),
      el('div', { class: 'phone__home', 'aria-hidden': 'true' })));

  const phone = el('div', { class: 'phone' },
    ...['a', 'b', 'c', 'd'].map((side) => el('i', { class: `phone__btn phone__btn--${side}`,
                                                    'aria-hidden': 'true' })),
    phoneScreen);

  const badges = [
    ['trophy', '1 year streak', 'Milestone unlocked', 'top'],
    ['check', 'Proof verified', '+240 XP awarded', 'bottom'],
  ].map(([glyph, title, body, place]) => el('div', { class: `landing__badge landing__badge--${place}` },
    el('span', { class: 'landing__badgeicon', 'aria-hidden': 'true' },
      icon(glyph, { size: 18 })),
    el('span', {},
      el('b', { text: title }),
      el('span', { class: 'landing__badgesub', text: body }))));

  // Two wrappers on purpose: the scrub owns the outer transform, the pointer
  // parallax owns the inner one, and neither ever overwrites the other.
  const phoneTilt = el('div', { class: 'landing__phonetilt' }, phone);
  const phoneStage = el('div', { class: 'landing__phonestage' }, phoneTilt, ...badges);

  const wordmark = el('div', { class: 'landing__wordmark' }, el('h2', { text: 'LIFEQUEST' }));

  const copy = el('div', { class: 'landing__copy' },
    el('h3', { text: cardHeading }),
    el('p', {}, ...rich(cardDescription, KEYWORDS)));

  const sceneSystem = el('div', { class: 'landing__scene landing__scene--system' },
    copy, phoneStage, wordmark);

  // --------------------------------------- act III: the constellation ------
  const orbit = orbitingCircles({ animate, variant: 'centred', logo: true });
  cleanups.push(() => orbit.destroy());

  const orbitCopy = el('div', { class: 'landing__orbitcopy' },
    el('span', { class: 'eyebrow', text: 'The whole point' }),
    el('h3', { text: MOTTO }),
    el('p', {}, ...rich('Three domains, one character, and a level that only moves when you '
      + 'have something to show for it — one progression loop, turning around you.', KEYWORDS)),
    el('ul', { class: 'landing__goals' },
      ...GOALS.map(([glyph, label]) => el('li', {},
        el('span', { class: 'landing__goalicon', 'aria-hidden': 'true' },
          icon(glyph, { size: 18 })),
        el('span', { text: label })))));

  const sceneOrbit = el('div', { class: 'landing__scene landing__scene--orbit' },
    orbitCopy, orbit.node);

  // ------------------------------------------------------------- sections --
  // Each act is its own card, where the film stacked both scenes in one and
  // swapped them. `.landing__card` and every class inside it are unchanged, so
  // the surface, the mockup and the rings look exactly as they did.
  const cards = [];
  const act = (scene, label) => {
    const card = el('div', { class: 'landing__card' },
      el('div', { class: 'landing__sheen', 'aria-hidden': 'true' }),
      scene);
    cards.push(card);
    return el('section', {
      class: 'intro__act landing__cardlayer', 'aria-label': label,
    }, card);
  };

  const actSystem = act(sceneSystem, 'How the system works');
  const actOrbit = act(sceneOrbit, 'One character, every system');

  const node = el('div', { class: 'intro' }, actSystem, actOrbit);

  // Without a scrub there is nothing to fill the dial, and a level counter
  // frozen at zero reads as a bug rather than as a still frame.
  const settleDial = () => {
    counter.textContent = String(metricValue);
    ringFill.style.strokeDashoffset = '62';
  };

  if (!animate) {
    settleDial();
    return { node, destroy() { for (const fn of cleanups.splice(0)) fn(); } };
  }

  // ------------------------------------------------------------ the motion --
  // Act II. Every value here is the film's; only the track it is laid on is new,
  // because each act is measured against its own trip through the viewport
  // rather than against one track shared by all four.
  const buildSystem = () => {
    const tl = timeline();
    tl
      .tween(phoneStage, { start: 0, end: 0.62, ease: 'expoOut',
                           from: { y: 260, z: -520, rotateX: 46, rotateY: -28,
                                   scale: 0.62, opacity: 0 },
                           to: { y: 0, z: 0, rotateX: 0, rotateY: 0, scale: 1, opacity: 1 } })
      .tween(copy, { start: 0.24, end: 0.78, ease: 'expoOut',
                     from: { x: -60, opacity: 0 }, to: { x: 0, opacity: 1 } })
      .tween(wordmark, { start: 0.24, end: 0.78, ease: 'expoOut',
                         from: { x: 60, scale: 0.82, opacity: 0 },
                         to: { x: 0, scale: 1, opacity: 1 } });

    phoneWidgets.forEach((item, index) => {
      const at = 0.16 + index * 0.05;
      tl.tween(item, { start: at, end: at + 0.26, ease: 'backOut',
                       from: { y: 34, scale: 0.95, opacity: 0 },
                       to: { y: 0, scale: 1, opacity: 1 } });
    });

    badges.forEach((item, index) => {
      const at = 0.34 + index * 0.08;
      tl.tween(item, { start: at, end: at + 0.3, ease: 'backOut',
                       from: { y: 80, scale: 0.7, rotate: -8, opacity: 0 },
                       to: { y: 0, scale: 1, rotate: 0, opacity: 1 } });
    });

    // The dial fills and the level counts up together, as they always did.
    tl.drive(0.22, 0.9, 'expoOut', (t) => {
      ringFill.style.strokeDashoffset = String(RING_LENGTH - t * (RING_LENGTH - 62));
      counter.textContent = String(Math.round(t * metricValue));
    });

    return tl;
  };

  // Act III. The film's own entrance for this act, unchanged — it rose into the
  // space act II had just cleared, and it still rises.
  const buildOrbit = () => timeline()
    .tween(sceneOrbit, { start: 0, end: 0.7, ease: 'expoOut',
                         from: { y: 140, scale: 0.86, opacity: 0 },
                         to: { y: 0, scale: 1, opacity: 1 } })
    .tween(orbitCopy, { start: 0.2, end: 0.85, ease: 'expoOut',
                        from: { y: 40, opacity: 0 }, to: { y: 0, opacity: 1 } });

  // Only once the sections are in the document and have layout. A scrub built
  // against a detached node measures a rect of zeros, reads that as "fully
  // arrived", and paints the settled pose — then jumps back to the start the
  // moment the first real measurement lands, and eases *backwards* out of the
  // pose it just drew. Waiting for layout is the difference between an entrance
  // and a glitch.
  whenSized(node, () => {
    for (const [section, build] of [[actSystem, buildSystem], [actOrbit, buildOrbit]]) {
      const scrub = scrollScrub(section, { build, smooth: 0.18, measure: throughViewport });
      cleanups.push(() => scrub.destroy());
    }
  });

  // The card lights where the cursor is and the phone leans towards it — both
  // write properties the scrub never touches.
  const onPointerMove = (event) => {
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
      card.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
    }
    const x = (event.clientX / window.innerWidth - 0.5) * 2;
    const y = (event.clientY / window.innerHeight - 0.5) * 2;
    phoneTilt.style.transform = `rotateY(${(x * 11).toFixed(2)}deg) rotateX(${(-y * 11).toFixed(2)}deg)`;
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  cleanups.push(() => window.removeEventListener('pointermove', onPointerMove));

  return {
    node,
    destroy() {
      for (const fn of cleanups.splice(0)) {
        try { fn(); } catch { /* a failing teardown must not block navigation */ }
      }
    },
  };
}
