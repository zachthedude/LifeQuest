// FLIP-DISK MATRIX — an electromechanical countdown to a quest's deadline.
//
// A port of `flip-disk-matrix.tsx`. Every cell is a physical disk, black on one
// face and lit on the other, that rotates 180° about its horizontal axis to
// change state — the mechanism of a railway departure board or a stadium
// scoreboard. Characters are drawn on a 5×7 bitmap grid, the way they are on the
// real thing, because that is the resolution the hardware has.
//
// It counts down to `expiresAt` on a quest. The server has always sent that
// field and nothing in the interface ever read it, so quests expired silently;
// a departure board is exactly the right object for "this leaves whether or not
// you are on it".
//
// What changed in the port, and why each one is this codebase rather than taste:
//
//   * THE MODE SWITCHER IS GONE. The original ships with time/text/wave/noise
//     buttons and a text box — a showcase for the effect. Here the board has one
//     job and the reading has to be trusted at a glance, so there is nothing to
//     switch. `text` is still accepted as a prop; the demo's chrome is not.
//   * THE BOARD IS SIZED TO ITS CONTENT. The original is a fixed 31×11 = 341
//     disks. Each disk is four elements, so a fixed board is ~1,400 nodes
//     whatever it displays. This measures the string and builds the smallest
//     grid that fits it.
//   * IT DIFFS INSTEAD OF RE-RENDERING. React rebuilt the whole matrix each
//     tick and let reconciliation sort it out. There is no reconciler here, so
//     the board keeps its disks and flips only the ones whose bit changed —
//     which is also what the real hardware does, and why a departure board
//     clatters in patches rather than all at once.
//   * ACID YELLOW BECAME THE PALETTE, AND THE PALETTE MEANS SOMETHING. The
//     original lights up `#E5FD52` in dark mode. Here the lit face takes XP gold
//     while there is time, amber under an hour, and red under ten minutes — on
//     a countdown the colour is information, not decoration.
//   * IT STOPS WHEN NOTHING CAN CHANGE. The original runs a `requestAnimation-
//     Frame` loop for ever. This ticks on a timer aligned to the next second
//     boundary, stops itself on a hidden tab, and under `prefers-reduced-motion`
//     renders the same board with the flip transition disabled — the reading is
//     the point, the clatter is the flourish.

import { el } from '../ui.js';

// The 5×7 font, exactly as the original defines it: one integer per row, five
// bits wide, MSB leftmost. Only the glyphs a countdown can produce are kept —
// the original's full A–Z is dead weight for a board that shows digits, a
// colon, and the two words below.
const GLYPHS = {
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ':': [0b00000, 0b00100, 0b00000, 0b00000, 0b00000, 0b00100, 0b00000],
  ' ': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
};

const GLYPH_W = 5;
const GLYPH_H = 7;
const GAP = 1;              // one blank column between characters

/** Columns a string needs at this font size. */
export function widthFor(text) {
  const n = String(text).length;
  return n ? n * (GLYPH_W + GAP) - GAP : 0;
}

/**
 * Render a string onto a `rows × cols` bitmap, centred.
 * Straight from the original's `glyphBitmap`, minus its per-call grid rebuild.
 */
export function glyphBitmap(text, cols, rows) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(false));
  const chars = String(text).toUpperCase().split('');
  // Measured from the character count, not from `chars` — passing the array to
  // widthFor() stringifies it with commas ("0,9,:,0,6"), which measured five
  // characters as nine and left-aligned every string shorter than the board.
  const used = chars.length ? chars.length * (GLYPH_W + GAP) - GAP : 0;
  let ox = Math.max(0, Math.floor((cols - used) / 2));
  const oy = Math.max(0, Math.floor((rows - GLYPH_H) / 2));

  for (const ch of chars) {
    const bits = GLYPHS[ch] || GLYPHS[' '];
    for (let y = 0; y < GLYPH_H; y += 1) {
      for (let x = 0; x < GLYPH_W; x += 1) {
        if (oy + y < rows && ox + x < cols) {
          grid[oy + y][ox + x] = Boolean(bits[y] & (1 << (GLYPH_W - 1 - x)));
        }
      }
    }
    ox += GLYPH_W + GAP;
  }
  return grid;
}

/**
 * Mount a flip-disk board.
 *
 * @param {HTMLElement} container
 * @param {object}  [options]
 * @param {string}  [options.text='']      what to show now
 * @param {number}  [options.cols]         defaults to whatever the text needs
 * @param {number}  [options.rows=7]
 * @param {string}  [options.tone='xp']    xp | warn | danger — the lit face
 * @param {boolean} [options.animate=true] false renders without the flip
 * @returns {{node: HTMLElement, set: function, setTone: function, destroy: function}}
 */
export function flipDisk(container, {
  text = '',
  cols = 0,
  rows = GLYPH_H,
  tone = 'xp',
  animate = true,
} = {}) {
  const width = Math.max(cols || 0, widthFor(text), 1);

  const board = el('div', { class: 'flipdisk', 'aria-hidden': 'true' });
  board.dataset.tone = tone;
  if (!animate) board.dataset.still = 'true';
  board.style.setProperty('--flip-cols', String(width));

  // Every disk is built once and kept. The original rebuilt the matrix on each
  // tick; here the DOM is the board's state, and a tick only flips the cells
  // whose bit actually changed — which is what makes the update cheap and what
  // makes it *look* like hardware, since the flips land in patches.
  const disks = [];
  const grid = el('div', { class: 'flipdisk__grid' });
  for (let y = 0; y < rows; y += 1) {
    const row = [];
    for (let x = 0; x < width; x += 1) {
      const face = el('div', { class: 'flipdisk__flip' },
        el('i', { class: 'flipdisk__face flipdisk__face--off' }),
        el('i', { class: 'flipdisk__face flipdisk__face--on' }));
      const cell = el('div', { class: 'flipdisk__disk' }, face);
      grid.append(cell);
      row.push({ face, on: false });
    }
    disks.push(row);
  }
  board.append(grid);
  container.append(board);

  let current = '';

  function set(next) {
    const value = String(next ?? '');
    if (value === current) return;
    current = value;
    const bitmap = glyphBitmap(value, width, rows);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const disk = disks[y][x];
        const on = bitmap[y][x];
        if (disk.on === on) continue;      // untouched disks are not written to
        disk.on = on;
        disk.face.classList.toggle('is-on', on);
      }
    }
  }

  function setTone(next) {
    if (next && next !== board.dataset.tone) board.dataset.tone = next;
  }

  set(text);

  return {
    node: board,
    set,
    setTone,
    destroy() {
      board.remove();
      disks.length = 0;
    },
  };
}

// ---------------------------------------------------------------- countdown --

/** Milliseconds until an ISO-ish UTC timestamp, or null if there isn't one. */
export function msUntil(expiresAt) {
  if (!expiresAt) return null;
  // The server writes "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker, which
  // every browser would otherwise read as local time — an hour or more of error
  // in exactly the situation where the number matters most.
  const iso = String(expiresAt).trim().replace(' ', 'T');
  const stamped = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const ms = Date.parse(stamped);
  return Number.isFinite(ms) ? ms - Date.now() : null;
}

/**
 * A countdown as the board should show it.
 *
 * Over an hour it reads HH:MM, because that is the scale the decision is made
 * on. Under an hour it switches to MM:SS — at that point the seconds are the
 * story, and a board that still said "00" for fifty-nine minutes would be
 * telling you nothing while the thing expired.
 */
export function countdownText(ms) {
  if (ms === null) return null;
  // Zero, not the word: "EXPIRED" is seven characters and needs 41 columns on a
  // board built for five, so it arrived clipped to a fragment. The red face and
  // the card's own chip carry the word; the board carries the number.
  if (ms <= 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  if (hours >= 1) {
    const minutes = Math.floor((total % 3600) / 60);
    return `${String(Math.min(hours, 99)).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Urgency, and therefore the colour of the lit face. */
export function toneFor(ms) {
  if (ms === null) return 'xp';
  if (ms <= 0) return 'danger';
  if (ms < 10 * 60 * 1000) return 'danger';
  if (ms < 60 * 60 * 1000) return 'warn';
  return 'xp';
}

/**
 * A board wired to a deadline. Ticks itself, and stops when it cannot matter.
 *
 * @param {HTMLElement} container
 * @param {object} options
 * @param {string} options.expiresAt      the quest's UTC timestamp
 * @param {boolean} [options.animate=true]
 * @param {function} [options.onExpire]   called once, when it reaches zero
 */
export function deadlineBoard(container, { expiresAt, animate = true, onExpire } = {}) {
  const board = flipDisk(container, { text: '  :  ', animate, cols: widthFor('00:00') });
  let timer = null;
  let fired = false;

  function tick() {
    const ms = msUntil(expiresAt);
    board.set(countdownText(ms) ?? '  :  ');
    board.setTone(toneFor(ms));
    if (ms !== null && ms <= 0 && !fired) {
      fired = true;
      onExpire?.();
    }
    schedule(ms);
  }

  function schedule(ms) {
    clearTimeout(timer);
    if (ms !== null && ms <= 0) return;          // nothing left to count
    if (document.visibilityState === 'hidden') return;
    // Aligned to the next second boundary rather than a flat 1000ms, so the
    // board flips when the clock does instead of drifting a little further out
    // of step on every tick.
    timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 15);
  }

  // A hidden tab throttles timers to once a minute anyway, so the board would
  // come back wrong and slowly correct itself. Stopping and re-reading on
  // return is both cheaper and right immediately.
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') clearTimeout(timer);
    else tick();
  };
  document.addEventListener('visibilitychange', onVisibility);

  tick();

  return {
    node: board.node,
    destroy() {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      board.destroy();
    },
  };
}
