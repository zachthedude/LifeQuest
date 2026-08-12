// LANDING — the cinematic opening. The first thing anyone sees.
//
// Ported from the React `cinematic-landing-hero` component. The choreography is
// the same four acts on a pinned stage; the substitutions are the ones this
// codebase forces (see docs/component-integration.md):
//
//   * gsap + ScrollTrigger → ../timeline.js. No npm here, and the CSP forbids a
//     CDN copy.
//   * Tailwind utility classes → the LifeQuest token system in styles.css.
//   * App Store / Play buttons → the two real doors into the app, since the
//     product is the thing you are already looking at.
//
// It is written so the *page* never depends on the animation. Every layer is
// laid out and visible in CSS; the timeline only writes the opening pose and
// scrubs from there. If JS dies, or the visitor asked for reduced motion, the
// same content is a plain long scrolling page — and the HUD's "Skip intro"
// button reaches sign-in from the very first frame either way.

import { orbitingCircles } from '../components/orbitingCircles.js';
import { themeButton } from '../components/themeControl.js';
import { decryptText } from '../decrypt.js';
import { sound } from '../effects.js';
import { motionAllowed } from '../motion.js';
import { scrollScrub, timeline } from '../timeline.js';
import { announce, el, rich, svg } from '../ui.js';

const RING_LENGTH = 402;          // 2πr for the r=64 progress ring below

const ACTS = [
  ['I', 'The call'],
  ['II', 'The system'],
  ['III', 'The constellation'],
  ['IV', 'Character creation'],
];

// Where each act takes over the stage, in timeline progress.
const ACT_AT = [0, 0.30, 0.58, 0.86];

// The words worth slowing a reader down on. Kept in one place so the emphasis
// is consistent across the acts rather than decided sentence by sentence.
// Variant picks the face: `strong` for a hard emphasis, `xp` for anything
// countable, a domain name for the domain's own colour, and the default serif
// italic for an idea being named.
const KEYWORDS = [
  ['train the body', 'physical'], ['train the mind', 'academic'],
  ['build something', 'passion'],
  // Deliberately the plain serif: it sits immediately before the three domain
  // names, and in the same face they all merged into one coloured run.
  ['real actions', null],
  ['evidence', 'strong'], ['proof', 'strong'], ['actually did', 'strong'],
  ['level 100', 'xp'], ['level 1', 'xp'], ['XP', 'xp'], ['+240 XP', 'xp'],
  ['three domains', null], ['one character', null], ['one progression loop', null],
  ['cannot be grinded', 'strong'], ['harder quests', null], ['first quest', null],
  ['years of real work', null], ['outlives the session', null],
  ['something to show for it', 'strong'], ['stays on this machine', null],
  ['turning around you', null],
];

// Module-local, matching the pattern in auth.js — main.js owns the canonical
// copy for the app chrome; this is the same line set as display type.
const MOTTO = 'Build the person you want to be.';

// The three things LifeQuest actually asks of a player, in its own words.
const GOALS = [
  ['⚡', 'Train the body'],
  ['🧠', 'Train the mind'],
  ['🔥', 'Build something'],
];

const QUEST_ROWS = [
  ['physical', '⚡', 'Run 5 km without stopping', '+240 XP', 'In progress'],
  ['academic', '🧠', 'Prove chapter 7 without notes', '+180 XP', 'Verified'],
];

/**
 * @param {object}   options
 * @param {Function} options.onEnter        called with 'signup' | 'login'
 * @param {string}   [options.brandName]
 * @param {string}   [options.tagline1]
 * @param {string}   [options.tagline2]
 * @param {string}   [options.cardHeading]
 * @param {string}   [options.cardDescription]
 * @param {number}   [options.metricValue]  the number the phone counts up to
 * @param {string}   [options.metricLabel]
 * @param {string}   [options.ctaHeading]
 * @param {string}   [options.ctaDescription]
 * @returns {HTMLElement}
 */
export function landingView({
  onEnter,
  brandName = 'LIFEQUEST',
  tagline1 = 'Real life is the game.',
  tagline2 = 'You are the main character.',
  cardHeading = 'Progress you have to earn.',
  cardDescription = 'Quests are real actions — train the body, train the mind, build something '
    + 'that outlives the session. Evidence comes before XP, and the curve is honest: level 100 '
    + 'is years of real work and it cannot be grinded.',
  metricValue = 42,
  metricLabel = 'Level',
  ctaHeading = 'Begin your run.',
  ctaDescription = 'Create a character, take the first quest, and start the climb from level 1. '
    + 'Everything stays on this machine — no email, no tracking.',
} = {}) {
  const cinematic = motionAllowed();
  const cleanups = [];
  const teardown = () => {
    for (const fn of cleanups.splice(0)) {
      try { fn(); } catch { /* a failing teardown must not block navigation */ }
    }
  };

  const enter = (mode) => {
    teardown();
    if (onEnter) onEnter(mode);
  };

  // ------------------------------------------------------------------ HUD --
  const skip = el('button', {
    class: 'landing__skip', type: 'button',
    onClick: () => enter('signup'),
  },
    el('span', { text: 'Skip intro' }),
    el('span', { class: 'landing__skipkey', 'aria-hidden': 'true', text: 'ESC' }));

  const hud = el('header', { class: 'landing__hud' },
    el('div', { class: 'landing__hudbrand' },
      el('img', { src: '/img/emblem.svg', alt: '', width: '26', height: '26' }),
      el('b', { text: 'LifeQuest' }),
      el('span', { class: 'landing__hudlv', text: 'LV 1 → 100' })),
    el('div', { class: 'landing__hudactions' }, themeButton(), skip));

  // ------------------------------------------------------- act I: the call --
  const headline = el('h1', { class: 'landing__tagline' });
  const decrypt = decryptText(headline, {
    text: tagline1,
    trigger: 'mount',
    variant: 'display',
    stagger: 38,
    startDelay: 320,
    retriggerOnHover: true,
    seed: 11,
  });
  cleanups.push(() => decrypt?.destroy?.());

  const heroLine2 = el('h1', { class: 'landing__tagline landing__tagline--silver', text: tagline2 });

  const scrollCue = el('div', { class: 'landing__cue' },
    el('span', { text: 'Scroll to play' }),
    el('span', { class: 'landing__cuearrow', 'aria-hidden': 'true', text: '▼' }));

  // The mark opens the film and returns in act III as the thing the whole
  // system orbits, so the intro is bracketed by the same object.
  const heroMark = el('img', {
    class: 'landing__mark', src: '/img/emblem.svg', alt: '',
    width: '76', height: '76', decoding: 'async',
  });

  const hero = el('div', { class: 'landing__hero' },
    heroMark,
    el('span', { class: 'eyebrow', text: MOTTO }),
    headline,
    heroLine2,
    el('p', { class: 'landing__lede' },
      ...rich('Train the body, train the mind, build something that outlives the session. '
        + 'Three domains, one character, and every level signed off by something you actually '
        + 'did.', KEYWORDS)),
    scrollCue);

  // ------------------------------------------- act II: the phone / the system --
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
          el('span', { class: 'phone__avatar', text: '◆' }))),
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
          el('span', { class: 'phone__questicon', 'aria-hidden': 'true', text: glyph }),
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
    ['🏆', '1 year streak', 'Milestone unlocked', 'top'],
    ['⚡', 'Proof verified', '+240 XP awarded', 'bottom'],
  ].map(([glyph, title, body, place]) => el('div', { class: `landing__badge landing__badge--${place}` },
    el('span', { class: 'landing__badgeicon', 'aria-hidden': 'true', text: glyph }),
    el('span', {},
      el('b', { text: title }),
      el('span', { class: 'landing__badgesub', text: body }))));

  // Two wrappers on purpose: the timeline owns the outer transform, the pointer
  // parallax owns the inner one, and neither ever overwrites the other.
  const phoneStage = el('div', { class: 'landing__phonestage' },
    el('div', { class: 'landing__phonetilt' }, phone),
    ...badges);

  const wordmark = el('div', { class: 'landing__wordmark' }, el('h2', { text: brandName }));

  const copy = el('div', { class: 'landing__copy' },
    el('h3', { text: cardHeading }),
    el('p', {}, ...rich(cardDescription, KEYWORDS)));

  const sceneSystem = el('div', { class: 'landing__scene landing__scene--system' },
    copy, phoneStage, wordmark);

  // ------------------------------------- act III: the constellation (orbits) --
  // Without the scrub there is nothing to fill the dial, and a level counter
  // frozen at zero reads as a bug rather than as a still frame.
  if (!cinematic) {
    counter.textContent = String(metricValue);
    ringFill.style.strokeDashoffset = '62';
  }

  const orbit = orbitingCircles({ animate: cinematic, variant: 'centred', logo: true });
  cleanups.push(() => orbit.destroy());

  // Act III is the thesis: the mark in the middle is the character, and every
  // system in the product turns around it. So the motto is the heading, and the
  // three goals are named rather than implied.
  const orbitCopy = el('div', { class: 'landing__orbitcopy' },
    el('span', { class: 'eyebrow', text: 'The whole point' }),
    el('h3', { text: MOTTO }),
    el('p', {}, ...rich('Three domains, one character, and a level that only moves when you '
      + 'have something to show for it — one progression loop, turning around you.', KEYWORDS)),
    el('ul', { class: 'landing__goals' },
      ...GOALS.map(([glyph, label]) => el('li', {},
        el('span', { class: 'landing__goalicon', 'aria-hidden': 'true', text: glyph }),
        el('span', { text: label })))));

  const sceneOrbit = el('div', { class: 'landing__scene landing__scene--orbit' },
    orbitCopy, orbit.node);

  const card = el('div', { class: 'landing__card' },
    el('div', { class: 'landing__sheen', 'aria-hidden': 'true' }),
    sceneSystem,
    sceneOrbit);

  const cardLayer = el('div', { class: 'landing__cardlayer' }, card);

  // ------------------------------------------------------- act IV: the call --
  const ctaButton = (mode, tone, glyph, caption, label) => el('button', {
    class: `landing__cta-btn landing__cta-btn--${tone}`, type: 'button',
    onClick: () => enter(mode),
  },
    el('span', { class: 'landing__cta-glyph', 'aria-hidden': 'true', text: glyph }),
    el('span', { class: 'landing__cta-stack' },
      el('span', { class: 'landing__cta-caption', text: caption }),
      el('span', { class: 'landing__cta-label', text: label })));

  const cta = el('div', { class: 'landing__cta' },
    el('h2', { class: 'landing__ctahead', text: ctaHeading }),
    el('p', { class: 'landing__lede' }, ...rich(ctaDescription, KEYWORDS)),
    el('div', { class: 'landing__ctabtns' },
      ctaButton('signup', 'light', '◆', 'New character', 'Start my quest'),
      ctaButton('login', 'dark', '↩', 'I already have one', 'Continue my quest')));

  // ------------------------------------------------------------- act rail --
  const railFill = el('i', { class: 'landing__railfill' });
  const railTicks = ACTS.map(([numeral], index) => el('i', {
    class: 'landing__railtick', title: `Act ${numeral}`,
    style: { left: `${ACT_AT[index] * 100}%` },
  }));
  const railAct = el('b', { class: 'landing__railact', text: `Act ${ACTS[0][0]} · ${ACTS[0][1]}` });
  const railPct = el('span', { class: 'landing__railpct num', text: '0%' });

  const rail = el('footer', { class: 'landing__rail' },
    railAct,
    el('div', { class: 'landing__railtrack' }, railFill, ...railTicks),
    railPct);

  const stage = el('div', { class: 'landing__stage' },
    el('div', { class: 'landing__grid', 'aria-hidden': 'true' }),
    el('div', { class: 'landing__grain', 'aria-hidden': 'true' }),
    el('div', { class: 'landing__frame', 'aria-hidden': 'true' }),
    hud, hero, cta, cardLayer, rail);

  const node = el('section', {
    class: `landing landing--${cinematic ? 'cinematic' : 'still'}`,
    dataset: { landing: cinematic ? 'cinematic' : 'still' },
  }, stage);

  // ----------------------------------------------------------- interaction --
  // Audio only after a real gesture: browsers block it before one, and a page
  // that beeps at you unprompted deserves the block.
  let gestured = false;
  const onGesture = () => { gestured = true; };
  window.addEventListener('pointerdown', onGesture, { passive: true });
  window.addEventListener('keydown', onGesture, { passive: true });
  cleanups.push(() => {
    window.removeEventListener('pointerdown', onGesture);
    window.removeEventListener('keydown', onGesture);
  });

  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      enter('signup');
    }
  };
  window.addEventListener('keydown', onKey);
  cleanups.push(() => window.removeEventListener('keydown', onKey));

  let act = 0;
  const paintRail = (progress) => {
    railFill.style.transform = `scaleX(${Math.max(0.004, progress)})`;
    railPct.textContent = `${Math.round(progress * 100)}%`;
    railTicks.forEach((tick, index) => {
      tick.classList.toggle('is-on', progress >= ACT_AT[index] - 0.002);
    });

    let next = 0;
    for (let index = 0; index < ACT_AT.length; index += 1) {
      if (progress >= ACT_AT[index] - 0.002) next = index;
    }
    if (next === act) return;

    const forward = next > act;
    act = next;
    railAct.textContent = `Act ${ACTS[act][0]} · ${ACTS[act][1]}`;
    railAct.classList.remove('is-hit');
    void railAct.offsetWidth;              // restart the flash
    railAct.classList.add('is-hit');
    if (forward) {
      announce(`Act ${ACTS[act][0]}. ${ACTS[act][1]}.`);
      if (gestured) {
        if (act === ACTS.length - 1) sound.achievement();
        else sound.soft();
      }
    }
  };

  if (!cinematic) {
    // Reduced motion: no pin, no scrub. The CSS layout is already the whole
    // page, so the rail simply reports where the reader is.
    const onScroll = () => {
      const max = Math.max(1, node.scrollHeight - window.innerHeight);
      paintRail(Math.min(1, Math.max(0, window.scrollY / max)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    cleanups.push(() => window.removeEventListener('scroll', onScroll));
    onScroll();
    return node;
  }

  // ------------------------------------------------------------- timeline --
  // Every distance below is in viewport pixels, so the whole thing is rebuilt
  // on resize rather than trying to interpolate mixed CSS units.
  const build = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const narrow = vw < 900;
    const tl = timeline();

    const cardW = vw * (narrow ? 0.92 : 0.86);
    const cardH = vh * (narrow ? 0.86 : 0.85);
    const radius = narrow ? 32 : 40;

    // How far you scroll to play the whole thing, in viewport heights. The act
    // boundaries are proportions of this, so a longer track slows every act
    // evenly rather than stretching one of them. Phones get a shorter one —
    // the same number of viewports is a lot more thumb work on a small screen.
    node.style.height = `${Math.round(vh * (narrow ? 7 : 8.5))}px`;

    tl
      // Act I recedes: the opening text pulls back and blurs out behind the card.
      .tween(hero, { start: 0, end: 0.16, ease: 'inOut',
                     from: { scale: 1, blur: 0, opacity: 1 },
                     to: { scale: 1.16, blur: 22, opacity: 0 } })
      .tween(scrollCue, { start: 0, end: 0.04, ease: 'out',
                          from: { opacity: 1 }, to: { opacity: 0 } })

      // The card rises from below, then takes the whole screen.
      .tween(card, { start: 0, end: 0.17, ease: 'inOut',
                     from: { y: vh * 1.1, width: cardW, height: cardH, radius },
                     to: { y: 0, width: cardW, height: cardH, radius } })
      .tween(card, { start: 0.17, end: 0.27, ease: 'inOut',
                     from: { width: cardW, height: cardH, radius },
                     to: { width: vw, height: vh, radius: 0 } })

      // Act II: the app itself flies in.
      .tween(phoneStage, { start: 0.20, end: 0.36, ease: 'expoOut',
                           from: { y: 260, z: -520, rotateX: 46, rotateY: -28,
                                   scale: 0.62, opacity: 0 },
                           to: { y: 0, z: 0, rotateX: 0, rotateY: 0, scale: 1, opacity: 1 } })
      .tween(copy, { start: 0.28, end: 0.40, ease: 'expoOut',
                     from: { x: -60, opacity: 0 }, to: { x: 0, opacity: 1 } })
      .tween(wordmark, { start: 0.28, end: 0.40, ease: 'expoOut',
                         from: { x: 60, scale: 0.82, opacity: 0 },
                         to: { x: 0, scale: 1, opacity: 1 } });

    phoneWidgets.forEach((item, index) => {
      const at = 0.25 + index * 0.018;
      tl.tween(item, { start: at, end: at + 0.09, ease: 'backOut',
                       from: { y: 34, scale: 0.95, opacity: 0 },
                       to: { y: 0, scale: 1, opacity: 1 } });
    });

    badges.forEach((item, index) => {
      const at = 0.30 + index * 0.03;
      tl.tween(item, { start: at, end: at + 0.10, ease: 'backOut',
                       from: { y: 80, scale: 0.7, rotate: -8, opacity: 0 },
                       to: { y: 0, scale: 1, rotate: 0, opacity: 1 } });
    });

    tl
      // The dial fills and the level counts up together.
      .drive(0.27, 0.44, 'expoOut', (t) => {
        ringFill.style.strokeDashoffset = String(RING_LENGTH - t * (RING_LENGTH - 62));
        counter.textContent = String(Math.round(t * metricValue));
      })

      // Act II clears the stage.
      .tween(sceneSystem, { start: 0.50, end: 0.57, ease: 'in',
                            from: { y: 0, z: 0, scale: 1, opacity: 1 },
                            to: { y: -50, z: -220, scale: 0.92, opacity: 0 } })

      // Act III: the orbits rise into the space it left.
      .tween(sceneOrbit, { start: 0.56, end: 0.70, ease: 'expoOut',
                           from: { y: 140, scale: 0.86, opacity: 0 },
                           to: { y: 0, scale: 1, opacity: 1 } })
      .tween(orbitCopy, { start: 0.60, end: 0.72, ease: 'expoOut',
                          from: { y: 40, opacity: 0 }, to: { y: 0, opacity: 1 } })
      .tween(sceneOrbit, { start: 0.80, end: 0.87, ease: 'in',
                           from: { y: 0, scale: 1, opacity: 1 },
                           to: { y: -70, scale: 0.94, opacity: 0 } })

      // Act IV: the card pulls back to reveal the way in, then leaves.
      .tween(card, { start: 0.86, end: 0.94, ease: 'expoInOut',
                     from: { width: vw, height: vh, radius: 0 },
                     to: { width: cardW, height: cardH, radius } })
      .tween(cta, { start: 0.87, end: 0.95, ease: 'expoInOut',
                    from: { scale: 0.82, blur: 26, opacity: 0 },
                    to: { scale: 1, blur: 0, opacity: 1 } })
      .tween(card, { start: 0.94, end: 1, ease: 'in',
                     from: { y: 0 }, to: { y: -(vh + 320) } })

      .drive(0, 1, 'linear', (t) => paintRail(t));

    return tl;
  };

  const scrub = scrollScrub(node, { build, smooth: 0.16 });
  cleanups.push(() => {
    scrub.destroy();
    node.style.height = '';
  });

  // Pointer parallax: the card lights where the cursor is and the phone leans
  // towards it. Both write properties the timeline never touches.
  const tilt = phoneStage.firstElementChild;
  const onPointerMove = (event) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
    card.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
    const x = (event.clientX / window.innerWidth - 0.5) * 2;
    const y = (event.clientY / window.innerHeight - 0.5) * 2;
    tilt.style.transform = `rotateY(${(x * 11).toFixed(2)}deg) rotateX(${(-y * 11).toFixed(2)}deg)`;
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  cleanups.push(() => window.removeEventListener('pointermove', onPointerMove));

  return node;
}
