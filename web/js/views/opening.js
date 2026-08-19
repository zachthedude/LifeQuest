// OPENING — the front door. The first thing a signed-out visitor sees, and the
// only screen that has to explain what LifeQuest is for before anyone commits a
// minute to character creation.
//
// It is deliberately *not* the home screen — that is the dashboard, behind
// sign-in. It used to be deliberately not the cinematic intro either: the intro
// was a separate screen, eight viewports of pinned scroll-driven film reached
// from a "Watch the two-minute intro" button at the bottom of this page.
//
// That format is gone and its acts live here now (`components/introActs.js`),
// as sections you scroll through like any other. The page still opens on one
// still hero — wordmark, tagline, one line of what it does, two doors — and the
// argument is still laid out calmly underneath; the mockup and the constellation
// are now part of that argument rather than a film you had to opt into.
//
// Rules this file keeps:
//   * Every door out is reachable in the first viewport, before any scrolling.
//   * Nothing that can fail loudly. The acts animate from scroll position and
//     are fully laid out in CSS before any of it runs, so a stalled script or a
//     reduced-motion preference leaves the same readable page.
//   * The copy is the product's own vocabulary — three domains, evidence before
//     XP, an honest curve — pointed at the audience it is built for: students.

import { introActs } from '../components/introActs.js';
import { themeButton } from '../components/themeControl.js';
import { mountWovenLight } from '../components/wovenLight.js';
import { decryptText } from '../decrypt.js';
import { motionAllowed } from '../motion.js';
import { onThemeChange, resolveTheme } from '../theme.js';
import { el, rich, whenSized } from '../ui.js';

// The words worth slowing a reader down on, in the same emphasis system the rest
// of the app uses (a change of face, not just a tint — see ui.js `rich`).
const KEYWORDS = [
  ['train the body', 'physical'], ['train the mind', 'academic'],
  ['build something', 'passion'],
  ['evidence', 'strong'], ['proof', 'strong'], ['actually did', 'strong'],
  ['level 1', 'xp'], ['level 100', 'xp'], ['XP', 'xp'],
  ['three domains', null], ['one character', null], ['real work', null],
  ['cannot be grinded', 'strong'], ['capability', null], ['never appearance', 'strong'],
  ['stays on your own machine', null], ['understanding', null],
];

const MOTTO = 'Build the person you want to be.';

// What a student actually trains. One card per domain, in the domain's own
// colour, each with a real quest from the catalogue rather than a slogan.
const DOMAINS = [
  ['physical', '⚡', 'Train the body',
    'Movement, sleep and strength, sized to where you are today. Physical quests are about '
    + 'capability and health — never appearance, and never a number on a scale.',
    'Run 5 km without stopping'],
  ['academic', '🧠', 'Train the mind',
    'Study quests written around your actual subjects, and shaped so the only way to finish '
    + 'one is real understanding rather than time at a desk.',
    'Prove chapter 7 without notes'],
  ['passion', '🔥', 'Build something',
    'A project that outlives the session — code, writing, music, a small business. Shipped '
    + 'in pieces small enough to fit a school week.',
    'Ship v0.1 to one real user'],
];

// The loop, in four beats. This is the part that makes the levels mean anything,
// so it gets named steps rather than a paragraph.
const LOOP = [
  ['Get your quests',
    'Three live quests, one per domain, generated from your subjects, your schedule and your '
    + 'current level.'],
  ['Do the real thing',
    'Away from the screen. Nothing in here awards XP for opening the app or ticking a box.'],
  ['Submit the proof',
    'Notes, numbers, a photo, a link. An AI reviewer reads it against the quest and either '
    + 'verifies it or says exactly what is missing.'],
  ['Then the level moves',
    'XP lands only after proof clears, and level 100 is years of real work — the curve cannot '
    + 'be grinded.'],
];

// Why this shape is the right one for a fifteen-year-old, specifically.
const VALUES = [
  ['📈', 'An honest curve',
    'Levels are slow on purpose. Difficulty rises as you do, so week twenty asks more of you '
    + 'than week one and the number on your character stays worth something.'],
  ['🫀', 'Growth, not grades',
    'No leaderboard, no class ranking, nobody to lose to. You are measured against last month '
    + 'of your own work and nothing else.'],
  ['✨', 'A guide, not a grader',
    'When a proof is rejected the AI guide explains what it needed and re-sizes the next quest. '
    + 'It coaches through a bad week instead of punishing one.'],
  ['🔒', 'Private by default',
    'No email, no tracking, nothing public. Your character, your quests and your evidence stay '
    + 'on your own machine.'],
];

// Three facts that set expectations before anyone signs up.
const FACTS = [
  ['3', 'domains, always live'],
  ['100', 'levels, earned slowly'],
  ['0', 'XP for showing up'],
];

/**
 * @param {object}    options
 * @param {Function}  options.onEnter        called with 'signup' | 'login'
 * @param {string}    [options.brandName]
 * @param {string}    [options.tagline]      the display headline, one string
 * @param {string}    [options.lede]
 * @returns {HTMLElement}
 */
export function openingView({
  onEnter,
  brandName = 'LIFEQUEST',
  tagline = 'Real life is the game. You are the main character.',
  lede = 'A progression system for students: train the body, train the mind, build something '
    + 'real. Level 1 → 100, over months and years, with evidence required before XP is awarded.',
} = {}) {
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

  // ------------------------------------------------------------------- bar --
  const signIn = el('button', {
    class: 'open__barlink', type: 'button', text: 'Sign in',
    onClick: () => enter('login'),
  });

  const bar = el('header', { class: 'open__bar' },
    el('div', { class: 'open__barbrand' },
      el('img', { src: '/img/emblem.svg', alt: '', width: '24', height: '24' }),
      el('b', { text: 'LifeQuest' })),
    el('div', { class: 'open__baractions' }, themeButton(), signIn));

  // ------------------------------------------------------------------ hero --
  // Two doors, in the words the visitor is thinking in: one for a new character,
  // one for the run they already have going.
  const door = (mode, tone, label) => el('button', {
    class: `open__door open__door--${tone}`, type: 'button', text: label,
    onClick: () => enter(mode),
  });

  const doors = el('div', { class: 'open__doors' },
    door('signup', 'solid', 'Create your character'),
    door('login', 'quiet', 'Continue a run'));

  // The headline arrives decoded rather than typed. `mount` rather than
  // `inview`: this is the first thing on the page, above the fold, and waiting
  // for an intersection that has already happened costs it its own entrance.
  const headline = el('h1', { class: 'open__headline' });
  const headlineDecrypt = decryptText(headline, {
    text: tagline,
    trigger: 'mount',
    variant: 'display',
    stagger: 34,
    startDelay: 280,
    retriggerOnHover: true,
    seed: 11,
  });
  cleanups.push(() => headlineDecrypt?.destroy?.());

  const hero = el('div', { class: 'open__hero' },
    el('p', { class: 'open__eyebrow' },
      el('span', { text: brandName }),
      el('i', { class: 'open__eyebrowdot', 'aria-hidden': 'true' }),
      el('span', { class: 'open__eyebrowfor', text: 'For students' })),
    // One element, one vertical gradient: the line fades from full ink at the
    // top to about half by the last word, which is the whole look of the
    // reference frame. Splitting it per line would step the gradient.
    //
    // It also decrypts, which is the animation act I used to carry. One element
    // is what makes the sequence work: the glyphs lock left to right across both
    // sentences, so "You are the main character." resolves after "Real life is
    // the game." on its own, with no second timer to keep in step.
    headline,
    // Deliberately *not* run through `rich`: the emphasis system tints three
    // domain names and every countable, and directly under a headline this size
    // that reads as a paint chart. The first paragraph stays one calm colour and
    // the typographic emphasis starts below the fold.
    el('p', { class: 'open__lede', text: lede }),
    doors,
    el('p', { class: 'open__fineprint',
              text: 'No email. No tracking. About a minute to start.' }),
    el('ul', { class: 'open__facts' },
      ...FACTS.map(([value, label]) => el('li', {},
        el('b', { class: 'num', text: value }),
        el('span', { text: label })))),
    // A button rather than an anchor on purpose: the app is hash-routed, and a
    // `#fragment` in the address bar is a route this router does not know.
    el('button', {
      class: 'open__cue', type: 'button',
      onClick: () => domains.scrollIntoView({
        behavior: motionAllowed() ? 'smooth' : 'auto', block: 'start',
      }),
    },
      el('span', { text: 'What it does for students' }),
      el('span', { class: 'open__cuearrow', 'aria-hidden': 'true', text: '▼' })));

  // ------------------------------------------------------------- the domains --
  const domains = el('section', { class: 'open__section', id: 'what-it-does' },
    el('div', { class: 'open__sectionhead' },
      el('p', { class: 'open__kicker', text: 'What you train' }),
      el('h2', { text: 'Three domains, one character.' }),
      el('p', { class: 'open__sectionlede' },
        ...rich('School only measures one of these. A student who is growing is moving on all '
          + 'three, so all three are levelled here — and the quests are written for the life a '
          + 'student actually has.', KEYWORDS))),
    el('div', { class: 'open__cards' },
      ...DOMAINS.map(([domain, glyph, title, body, example]) => el('article', {
        class: 'open__card', dataset: { domain },
      },
        el('span', { class: 'open__cardicon', 'aria-hidden': 'true', text: glyph }),
        el('h3', { text: title }),
        el('p', {}, ...rich(body, KEYWORDS)),
        el('p', { class: 'open__example' },
          el('span', { class: 'open__examplelabel', text: 'Example quest' }),
          el('b', { text: example }))))));

  // ---------------------------------------------------------------- the loop --
  const loop = el('section', { class: 'open__section' },
    el('div', { class: 'open__sectionhead' },
      el('p', { class: 'open__kicker', text: 'How growth is proved' }),
      el('h2', { text: 'Evidence first. Then XP.' }),
      el('p', { class: 'open__sectionlede' },
        ...rich('The reason a level means anything here is that no level is given away. Every '
          + 'one of them is signed off by something you actually did.', KEYWORDS))),
    el('ol', { class: 'open__steps' },
      ...LOOP.map(([title, body], index) => el('li', { class: 'open__step' },
        el('span', { class: 'open__stepnum num', 'aria-hidden': 'true',
                     text: String(index + 1).padStart(2, '0') }),
        el('div', {},
          el('h3', { text: title }),
          el('p', {}, ...rich(body, KEYWORDS)))))));

  // -------------------------------------------------------------- the values --
  const values = el('section', { class: 'open__section' },
    el('div', { class: 'open__sectionhead' },
      el('p', { class: 'open__kicker', text: 'Why it works for students' }),
      el('h2', { text: 'Built to grow a person, not a score.' })),
    el('div', { class: 'open__values' },
      ...VALUES.map(([glyph, title, body]) => el('article', { class: 'open__value' },
        el('span', { class: 'open__valueicon', 'aria-hidden': 'true', text: glyph }),
        el('div', {},
          el('h3', { text: title }),
          el('p', {}, ...rich(body, KEYWORDS)))))));

  // ----------------------------------------------------------------- closing --
  // This is where act IV landed. The film ended on a closing headline and the
  // two doors, which is exactly what this section already was, so it took the
  // headline's decrypt rather than a second copy of the section. `inview` here,
  // not `mount`: it is at the bottom of a long page and has to still be
  // unresolved when it is finally reached.
  const closingHead = el('h2', { class: 'open__closinghead' });
  const closingDecrypt = decryptText(closingHead, {
    text: 'Start at level 1.',
    trigger: 'inview',
    variant: 'display',
    stagger: 40,
    startDelay: 120,
    retriggerOnHover: true,
    seed: 31,
  });
  cleanups.push(() => closingDecrypt?.destroy?.());

  const closing = el('section', { class: 'open__closing' },
    el('img', { class: 'open__mark', src: '/img/emblem.svg', alt: '',
                width: '64', height: '64', decoding: 'async' }),
    closingHead,
    el('p', { class: 'open__lede' },
      ...rich('Character creation is five questions — your subjects, how you move, what you '
        + 'want to build. Then your first three quests are waiting, and the climb is yours.',
      KEYWORDS)),
    el('div', { class: 'open__doors' },
      door('signup', 'solid', 'Create your character'),
      door('login', 'quiet', 'Continue a run')));

  const footer = el('footer', { class: 'open__footer' },
    el('span', { text: `LifeQuest — ${MOTTO}` }),
    el('span', { class: 'open__footerdim', text: 'Level 1 → 100 · Evidence before XP' }));

  // ------------------------------------------------------------- the acts --
  // What used to be the cinematic. It owns a canvas and two scroll scrubs, so
  // it is torn down with everything else when the page leaves.
  const acts = introActs();
  cleanups.push(() => acts.destroy());

  // The woven light sits behind the hero — the first screen, and the only part
  // of the page that is mostly empty space to fill. It is decoration with a
  // pulse, so it is out of the accessibility tree entirely.
  const woven = el('div', { class: 'open__woven', 'aria-hidden': 'true' });

  const node = el('section', {
    class: 'opening', dataset: { opening: 'still' },
  },
    woven,
    el('div', { class: 'open__grid', 'aria-hidden': 'true' }),
    bar,
    // The acts sit after the loop has been explained and before the case for
    // students: by then a reader knows what a quest and a proof are, which is
    // what the mockup is showing them.
    el('div', { class: 'open__body' },
      hero, domains, loop, acts.node, values, closing, footer));

  // -------------------------------------------------------- woven light --
  // Mounted after layout: a canvas built into a detached, zero-width container
  // is a 1×1 canvas that never shows anything.
  whenSized(woven, () => {
    const weave = mountWovenLight(woven, {
      animate: motionAllowed(),        // reduced motion gets the still weave
    });
    if (!weave || !weave.painted) {
      // No WebGL, or a first frame that drew nothing: the page was designed to
      // work without this and keeps its grid and wash.
      weave?.destroy();
      return;
    }
    node.classList.add('opening--woven');
    cleanups.push(() => weave.destroy());
    const stopTheme = onThemeChange((resolved) => weave.setTheme(resolved));
    cleanups.push(stopTheme);
    weave.setTheme(resolveTheme());
  });

  // ------------------------------------------------------------- entrance --
  // The hero animates itself in CSS. Everything below the fold lifts as it is
  // reached, with a safety net so a missing observer can never leave content
  // hidden — same contract as motion.js `revealOnScroll`, kept local because
  // this view is mounted directly rather than through the router.
  const blocks = [domains, loop, values, closing];
  if (!motionAllowed() || typeof IntersectionObserver === 'undefined') {
    blocks.forEach((block) => block.classList.add('is-in'));
  } else {
    blocks.forEach((block) => block.classList.add('open__reveal'));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    cleanups.push(() => observer.disconnect());

    whenSized(node, () => {
      const fold = window.innerHeight * 0.96;
      blocks.forEach((block) => {
        if (block.getBoundingClientRect().top < fold) block.classList.add('is-in');
        else observer.observe(block);
      });
    });
    const net = setTimeout(() => blocks.forEach((block) => block.classList.add('is-in')), 2600);
    cleanups.push(() => clearTimeout(net));
  }

  return node;
}
