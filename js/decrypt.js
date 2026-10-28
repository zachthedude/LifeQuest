// DecryptText — copy that arrives decoded rather than typed.
//
// A faithful port of the Motiq React component (MIT) to this project's vanilla
// ES-module stack. The behaviour is unchanged: every glyph is boiling at t=0,
// and character `i` locks at `startDelay + i·stagger ± jitter`, so the line
// resolves in a ragged left-to-right sweep instead of a metronome. Lock-in
// snaps the real glyph in behind an accent flash.
//
// Accessibility carries over intact: the real string is always present in a
// visually-hidden node, the animated glyph layer is aria-hidden, and reduced
// motion renders the resolved text with no animation at all.

const POOL_DISPLAY = '#%&@$?!*+=/{}[]<>~^';
const POOL_TERMINAL = 'abcdef0123456789$#%&*+=/|_~';
const HOVER_COOLDOWN = 1500;
const CYCLE_SPREAD = 35;

/** mulberry32 — deterministic, so a given seed always resolves identically. */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || document.documentElement.dataset.motion === 'reduced';
}

/**
 * Turn an element into a decrypting line of text.
 *
 * @param {HTMLElement} host        element to render into (contents replaced)
 * @param {object}      options
 * @param {string}      options.text              the real string
 * @param {string}     [options.glyphs]           scramble pool
 * @param {number}     [options.speed=45]         glyph cycle floor, ms
 * @param {number}     [options.stagger=55]       per-character lock stagger, ms
 * @param {number}     [options.startDelay=350]   delay before the first lock, ms
 * @param {number}     [options.jitter=120]       ± spread on each lock time, ms
 * @param {'mount'|'inview'|'hover'} [options.trigger='inview']
 * @param {'display'|'terminal'}     [options.variant='display']
 * @param {number|false} [options.loop=false]     re-run this many ms after settling
 * @param {boolean}    [options.retriggerOnHover=true]
 * @param {number}     [options.seed=1]
 * @param {boolean}    [options.reducedMotion]    force the static variant
 * @param {Function}   [options.onDecrypted]      fires each time it settles
 * @returns {{play: Function, stop: Function, destroy: Function, element: HTMLElement}}
 */
export function decryptText(host, {
  text,
  glyphs,
  speed = 45,
  stagger = 55,
  startDelay = 350,
  jitter = 120,
  trigger = 'inview',
  variant = 'display',
  loop = false,
  retriggerOnHover = true,
  seed = 1,
  reducedMotion,
  onDecrypted,
} = {}) {
  const pool = glyphs && glyphs.length
    ? glyphs
    : (variant === 'terminal' ? POOL_TERMINAL : POOL_DISPLAY);

  host.replaceChildren();
  host.classList.add('decrypt');
  host.dataset.variant = variant;

  // The readable string, for assistive technology and for no-JS/reduced motion.
  const readable = document.createElement('span');
  readable.className = 'sr-only';
  readable.textContent = text;

  const layer = document.createElement('span');
  layer.className = 'decrypt__layer';
  layer.setAttribute('aria-hidden', 'true');

  // Words stay whole so the line still wraps on word boundaries.
  const cells = [];
  const words = text.split(' ');
  words.forEach((word, index) => {
    const wordNode = document.createElement('span');
    wordNode.className = 'decrypt__word';
    for (const character of Array.from(word)) {
      const cell = document.createElement('span');
      cell.dataset.char = character;
      cell.dataset.state = 'plain';
      cell.textContent = character;
      wordNode.append(cell);
      cells.push(cell);
    }
    layer.append(wordNode);
    if (index < words.length - 1) layer.append(document.createTextNode(' '));
  });

  host.append(readable, layer);
  if (variant === 'terminal') {
    const prompt = document.createElement('span');
    prompt.className = 'decrypt__prompt';
    prompt.setAttribute('aria-hidden', 'true');
    prompt.textContent = '$';
    host.prepend(prompt);
    const caret = document.createElement('span');
    caret.className = 'decrypt__caret';
    caret.setAttribute('aria-hidden', 'true');
    host.append(caret);
  }

  let frameHandle = null;
  let loopTimer = null;
  let runCount = 0;
  let lastStart = -Infinity;
  let played = false;
  let destroyed = false;

  const isStatic = () => (reducedMotion === undefined ? prefersReducedMotion() : reducedMotion);

  function stop() {
    if (frameHandle !== null) cancelAnimationFrame(frameHandle);
    frameHandle = null;
    if (loopTimer !== null) clearTimeout(loopTimer);
    loopTimer = null;
  }

  function resolveAll() {
    for (const cell of cells) {
      cell.textContent = cell.dataset.char;
      cell.dataset.state = 'plain';
    }
  }

  function play() {
    if (destroyed || !cells.length) return;
    stop();
    const rng = makeRng(seed + runCount * 7919);
    runCount += 1;
    lastStart = performance.now();
    played = true;

    const lockAt = new Float64Array(cells.length);
    const nextAt = new Float64Array(cells.length);
    const locked = new Uint8Array(cells.length);

    cells.forEach((cell, index) => {
      lockAt[index] = startDelay + index * stagger + (rng() * 2 - 1) * jitter;
      nextAt[index] = 0;
      cell.dataset.state = 'scramble';
      cell.textContent = pool.charAt((rng() * pool.length) | 0);
    });

    let remaining = cells.length;
    const started = performance.now();

    const frame = () => {
      const now = performance.now() - started;
      for (let index = 0; index < cells.length; index += 1) {
        if (locked[index]) continue;
        const cell = cells[index];
        if (now >= lockAt[index]) {
          cell.textContent = cell.dataset.char;
          cell.dataset.state = 'lock';
          locked[index] = 1;
          remaining -= 1;
        } else if (now >= nextAt[index]) {
          cell.textContent = pool.charAt((rng() * pool.length) | 0);
          nextAt[index] = now + speed + rng() * CYCLE_SPREAD;
        }
      }
      if (remaining <= 0) {
        frameHandle = null;
        onDecrypted?.();
        if (loop !== false && loop > 0) {
          loopTimer = setTimeout(() => { loopTimer = null; play(); }, loop);
        }
        return;
      }
      frameHandle = requestAnimationFrame(frame);
    };
    frameHandle = requestAnimationFrame(frame);
  }

  // ---- orchestration ------------------------------------------------------
  let observer = null;

  function begin() {
    if (isStatic()) {
      stop();
      resolveAll();
      host.dataset.motion = 'static';
      return;
    }
    host.dataset.motion = 'animated';
    if (trigger === 'hover') {
      resolveAll();
      return;
    }
    if (trigger === 'mount') {
      play();
      return;
    }
    // 'inview': wait until it is actually on screen before spending frames.
    if (typeof IntersectionObserver === 'undefined') {
      play();
      return;
    }
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        if (!played) play();
        observer.disconnect();
        observer = null;
      }
    }, { threshold: 0.12 });
    observer.observe(host);
  }

  function onPointerEnter() {
    if (isStatic() || !retriggerOnHover) return;
    if (frameHandle !== null) return;
    if (performance.now() - lastStart < HOVER_COOLDOWN) return;
    play();
  }
  host.addEventListener('pointerenter', onPointerEnter);

  // Never keep a scramble running in a background tab.
  function onVisibility() {
    if (document.visibilityState === 'hidden') stop();
  }
  document.addEventListener('visibilitychange', onVisibility);

  begin();

  return {
    element: host,
    play,
    stop,
    destroy() {
      destroyed = true;
      stop();
      observer?.disconnect();
      host.removeEventListener('pointerenter', onPointerEnter);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

/** Convenience: build a decrypting element from scratch. */
export function decryptElement(tag, className, options) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  decryptText(node, options);
  return node;
}
