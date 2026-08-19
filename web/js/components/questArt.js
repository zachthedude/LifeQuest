// QUEST ART — a small line drawing of the quest actually being done.
//
// A quest card used to open with a coloured chip and a title, which meant every
// card in the list looked the same until you read it. These are the opposite:
// one glance says "push-ups" or "go for a run" before any word is read, which is
// the whole point — the list is scanned far more often than it is read.
//
// Drawn in the same idiom as js/components/icons.js, and for the same two
// reasons (no npm on this machine, and a CSP that forbids fetching art from a
// CDN): inline SVG on a fixed grid, no fill, 2px round-capped strokes,
// `currentColor` throughout. Inheriting the colour is what lets one drawing sit
// on a teal physical card and a violet passion card without a second file.
//
// The grid is 64×44 — wider than the icons' square, because a figure mid-stride
// needs the horizontal room — with the floor at y=38 for anything performed on
// it, so the whole physical set shares a horizon and reads as one series.

import { svg } from '../ui.js';

const FLOOR = ['line', { x1: '6', y1: '38', x2: '58', y2: '38', opacity: '.45' }];

// Speed streaks. Behind a figure they read as motion; they are deliberately
// short so they never compete with the body's own lines.
const DASH = (y, x1, x2) => ['line', { x1: String(x1), y1: String(y), x2: String(x2), y2: String(y), opacity: '.5' }];

const SCENES = {
  // ------------------------------------------------------------- physical --
  // Mid-stride: torso pitched forward, opposite arm and leg driving, one foot
  // off the floor. The lean is what separates "running" from "standing".
  phys_run: [
    ['circle', { cx: '36', cy: '9', r: '4' }],
    ['path', { d: 'M35 13.5 29 24' }],
    ['path', { d: 'M33.5 16.5 41 18.5 43 13' }],
    ['path', { d: 'M33.5 16.5 26 18 21 13.5' }],
    ['path', { d: 'M29 24 35 29 39 38' }],
    ['path', { d: 'M29 24 22 29 15 27' }],
    DASH(11, 6, 15), DASH(17, 8, 14),
    FLOOR,
  ],
  phys_walk: [
    ['circle', { cx: '33', cy: '9', r: '4' }],
    ['path', { d: 'M33 13.5 32 24' }],
    ['path', { d: 'M32.5 17 38 21 38 25' }],
    ['path', { d: 'M32.5 17 27 21 27 25' }],
    ['path', { d: 'M32 24 38 31 40 38' }],
    ['path', { d: 'M32 24 26 31 24 38' }],
    FLOOR,
  ],
  // Body one straight line from heel to head, arms vertical to the floor, and
  // an arrow for the rep — the two things that make a push-up legible.
  phys_pushups: [
    ['circle', { cx: '45', cy: '18', r: '4' }],
    ['path', { d: 'M41.5 20 16 28' }],
    ['path', { d: 'M41 21 41 38' }],
    ['path', { d: 'M18 27.5 12 36' }],
    ['path', { d: 'M12 36 16 38' }],
    ['path', { d: 'M53 20 53 30', opacity: '.55' }],
    ['path', { d: 'M50 27 53 30.5 56 27', opacity: '.55' }],
    FLOOR,
  ],
  // Forearms flat on the floor, and the same straight body line. The elbow
  // under the shoulder is the difference between a plank and a push-up.
  phys_plank: [
    ['circle', { cx: '46', cy: '20', r: '4' }],
    ['path', { d: 'M42.5 22 17 29' }],
    ['path', { d: 'M42 23 42 37.5' }],
    ['path', { d: 'M42 37.5 33 37.5' }],
    ['path', { d: 'M19 28.5 12 36' }],
    ['path', { d: 'M12 36 16 38' }],
    ['path', { d: 'M22 14 30 14', opacity: '.5' }],
    ['path', { d: 'M27 11 30 14 27 17', opacity: '.5' }],
    FLOOR,
  ],
  // Hips back, thighs to horizontal, shins vertical, arms counterbalancing
  // forward — the bottom of the rep, where the shape is unmistakable.
  // The bottom of the rep, seen from the side: chest up and forward, hips
  // driven back and low, thigh to horizontal, shin vertical over the foot.
  // Drawn at depth because the top of a squat is just standing.
  phys_squats: [
    ['circle', { cx: '32', cy: '11', r: '4' }],
    ['path', { d: 'M31 15.5 28 27' }],
    ['path', { d: 'M30.5 18 43 19' }],
    ['path', { d: 'M28 27 40 28' }],
    ['path', { d: 'M40 28 30 38' }],
    ['path', { d: 'M28 27 36 30.5 27 38', opacity: '.45' }],
    ['path', { d: 'M53 18 53 30', opacity: '.55' }],
    ['path', { d: 'M50 27 53 30.5 56 27', opacity: '.55' }],
    FLOOR,
  ],
  // Hips open, spine long, one arm reaching over the head — a side bend rather
  // than a fold, because the routine is about range, not effort.
  phys_mobility: [
    ['circle', { cx: '25', cy: '11', r: '4' }],
    ['path', { d: 'M26 15.5 30 25' }],
    ['path', { d: 'M27 18 22 14 19 8' }],
    ['path', { d: 'M27.5 19.5 37 21' }],
    ['path', { d: 'M30 25 26 32 25 38' }],
    ['path', { d: 'M30 25 39 30 44 38' }],
    ['path', { d: 'M44 10 A 10 10 0 0 1 48 20', opacity: '.45' }],
    FLOOR,
  ],
  // Sitting cross-legged under a moon: recovery is training, so it gets a
  // figure of its own rather than an empty rest symbol.
  phys_recovery: [
    ['circle', { cx: '30', cy: '14', r: '4' }],
    ['path', { d: 'M30 18.5 30 28' }],
    ['path', { d: 'M30 21 23 27' }],
    ['path', { d: 'M30 21 37 27' }],
    ['path', { d: 'M20 34 30 28 40 34' }],
    ['path', { d: 'M20 34 40 34' }],
    ['path', { d: 'M50 8 A 7 7 0 1 0 50 21 A 5.5 5.5 0 0 1 50 8Z', opacity: '.55' }],
    FLOOR,
  ],
  // A runner against alternating bars: hard, easy, hard, easy.
  phys_intervals: [
    ['circle', { cx: '21', cy: '10', r: '3.5' }],
    ['path', { d: 'M20 13.5 15 22' }],
    ['path', { d: 'M19 16 25 17.5' }],
    ['path', { d: 'M19 16 13 16' }],
    ['path', { d: 'M15 22 20 27 23 33' }],
    ['path', { d: 'M15 22 9 26 6 33' }],
    ['path', { d: 'M34 33 34 20', opacity: '.75' }],
    ['path', { d: 'M41 33 41 27', opacity: '.45' }],
    ['path', { d: 'M48 33 48 20', opacity: '.75' }],
    ['path', { d: 'M55 33 55 27', opacity: '.45' }],
    ['line', { x1: '6', y1: '37', x2: '58', y2: '37', opacity: '.45' }],
  ],
  // Rounds, so the figure sits inside the loop it is repeating.
  phys_circuit: [
    ['path', { d: 'M32 8 A 15 15 0 1 1 17 23', opacity: '.55' }],
    ['path', { d: 'M27 5 32 8 27 11', opacity: '.55' }],
    ['circle', { cx: '32', cy: '19', r: '3.5' }],
    ['path', { d: 'M32 22.5 32 30' }],
    ['path', { d: 'M32 24.5 26 27' }],
    ['path', { d: 'M32 24.5 38 27' }],
    ['path', { d: 'M32 30 28 36' }],
    ['path', { d: 'M32 30 36 36' }],
  ],
  phys_session: [
    ['circle', { cx: '32', cy: '10', r: '4' }],
    ['path', { d: 'M32 14.5 32 25' }],
    ['path', { d: 'M32 17 22 17' }],
    ['path', { d: 'M32 17 42 17' }],
    ['path', { d: 'M19 13 19 21' }],
    ['path', { d: 'M45 13 45 21' }],
    ['path', { d: 'M32 25 27 32 26 38' }],
    ['path', { d: 'M32 25 37 32 38 38' }],
    FLOOR,
  ],
  phys_skill: [
    ['circle', { cx: '32', cy: '9', r: '4' }],
    ['path', { d: 'M32 13.5 32 24' }],
    ['path', { d: 'M32 16 23 12' }],
    ['path', { d: 'M32 16 41 12' }],
    ['path', { d: 'M32 24 32 38' }],
    ['path', { d: 'M32 27 41 24' }],
    FLOOR,
  ],
  phys_progressive: [
    ['path', { d: 'M8 38 8 32 20 32 20 26 32 26 32 20 44 20 44 13 56 13', opacity: '.6' }],
    ['circle', { cx: '48', cy: '7', r: '3.5' }],
    ['path', { d: 'M47 10.5 43 17' }],
    ['path', { d: 'M45 13 51 14' }],
    ['path', { d: 'M43 17 47 20' }],
    ['path', { d: 'M43 17 38 20' }],
  ],
  phys_weekly: [
    ['rect', { x: '10', y: '10', width: '44', height: '30', rx: '3' }],
    ['path', { d: 'M10 19 54 19' }],
    ['path', { d: 'M20 7 20 13' }],
    ['path', { d: 'M44 7 44 13' }],
    ['path', { d: 'M17 26 20 29 25 24' }],
    ['path', { d: 'M30 26 33 29 38 24' }],
  ],
  phys_capability: [
    ['path', { d: 'M6 38 22 16 32 28 42 10 58 38Z' }],
    ['path', { d: 'M42 10 42 4' }],
    ['path', { d: 'M42 4 52 6.5 42 9' }],
  ],
  phys_event: [
    ['circle', { cx: '32', cy: '27', r: '10' }],
    ['path', { d: 'M26 18 22 5' }],
    ['path', { d: 'M38 18 42 5' }],
    ['path', { d: 'M32 22.5 33.4 25.8 37 26 34.2 28.4 35 32 32 30 29 32 29.8 28.4 27 26 30.6 25.8Z' }],
  ],

  // ------------------------------------------------------------- academic --
  // The mind quests share a profile-of-a-head motif, so a drill is legible as
  // a drill and not as another book.
  acad_mental_math: [
    ['path', { d: 'M40 38 40 31 A 15 15 0 1 0 22 17 L 18 24 22 25 22 31 28 31 28 38' }],
    ['path', { d: 'M26 12 32 12', opacity: '.8' }],
    ['path', { d: 'M29 9 29 15', opacity: '.8' }],
    ['path', { d: 'M35 20 41 20', opacity: '.8' }],
    ['path', { d: 'M35 23.5 41 23.5', opacity: '.8' }],
    ['path', { d: 'M25 20 31 26', opacity: '.8' }],
    ['path', { d: 'M31 20 25 26', opacity: '.8' }],
  ],
  acad_memory_drill: [
    ['path', { d: 'M40 38 40 31 A 15 15 0 1 0 22 17 L 18 24 22 25 22 31 28 31 28 38' }],
    ['rect', { x: '25', y: '11', width: '15', height: '14', rx: '2', opacity: '.85' }],
    ['path', { d: 'M28 16 37 16', opacity: '.7' }],
    ['path', { d: 'M28 20 34 20', opacity: '.7' }],
  ],
  // One point of attention, and the rings are what keeps returning to it.
  acad_focus_train: [
    ['circle', { cx: '32', cy: '22', r: '3', fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: '32', cy: '22', r: '9', opacity: '.6' }],
    ['circle', { cx: '32', cy: '22', r: '15', opacity: '.32' }],
    ['path', { d: 'M32 4 32 8', opacity: '.5' }],
    ['path', { d: 'M32 36 32 40', opacity: '.5' }],
    ['path', { d: 'M10 22 14 22', opacity: '.5' }],
    ['path', { d: 'M50 22 54 22', opacity: '.5' }],
  ],
  acad_puzzle: [
    ['path', { d: 'M10 12 H24 a3.5 3.5 0 0 1 7 0 H45 v13 a3.5 3.5 0 0 0 0 7 v0 H31 a3.5 3.5 0 0 0-7 0 H10Z' }],
    ['path', { d: 'M49 20 h6 v14 h-14 v-6', opacity: '.5' }],
  ],
  acad_focus_block: [
    ['rect', { x: '10', y: '30', width: '44', height: '4', rx: '1' }],
    ['path', { d: 'M18 30 22 20 34 20 30 30Z' }],
    ['path', { d: 'M26 20 26 12 40 12' }],
    ['circle', { cx: '44', cy: '12', r: '6' }],
    ['path', { d: 'M44 9 44 12 46 14' }],
  ],
  acad_read: [
    ['path', { d: 'M32 14 C 26 9 16 9 8 12 V34 C 16 31 26 31 32 36Z' }],
    ['path', { d: 'M32 14 C 38 9 48 9 56 12 V34 C 48 31 38 31 32 36Z' }],
    ['path', { d: 'M32 14 32 36' }],
  ],
  acad_recall: [
    ['path', { d: 'M14 8 H46 a3 3 0 0 1 3 3 V36 H17 a3 3 0 0 1-3-3Z' }],
    ['path', { d: 'M14 30 H49', opacity: '.5' }],
    ['path', { d: 'M24 18 40 18', opacity: '.6' }],
    ['path', { d: 'M24 23 34 23', opacity: '.6' }],
  ],
  acad_problems: [
    ['rect', { x: '12', y: '6', width: '32', height: '34', rx: '3' }],
    ['path', { d: 'M18 15 30 15', opacity: '.7' }],
    ['path', { d: 'M18 22 34 22', opacity: '.7' }],
    ['path', { d: 'M18 29 26 29', opacity: '.7' }],
    ['path', { d: 'M42 30 54 18 50 14 38 26 37 32Z' }],
  ],
  acad_explain: [
    ['circle', { cx: '20', cy: '13', r: '5' }],
    ['path', { d: 'M12 34 A 8 8 0 0 1 28 34' }],
    ['path', { d: 'M34 8 H56 a2 2 0 0 1 2 2 V24 a2 2 0 0 1-2 2 H44 l-5 5 v-5 h-5 a2 2 0 0 1-2-2 V10 a2 2 0 0 1 2-2Z' }],
    ['path', { d: 'M38 14 52 14', opacity: '.6' }],
    ['path', { d: 'M38 19 47 19', opacity: '.6' }],
  ],
  acad_research: [
    ['rect', { x: '10', y: '8', width: '28', height: '32', rx: '3', opacity: '.65' }],
    ['path', { d: 'M16 16 32 16', opacity: '.6' }],
    ['path', { d: 'M16 22 28 22', opacity: '.6' }],
    ['circle', { cx: '40', cy: '24', r: '11' }],
    ['path', { d: 'M48 32 57 40' }],
  ],
  acad_teach: [
    ['rect', { x: '26', y: '6', width: '32', height: '22', rx: '2' }],
    ['path', { d: 'M31 13 45 13', opacity: '.6' }],
    ['path', { d: 'M31 19 40 19', opacity: '.6' }],
    ['circle', { cx: '14', cy: '15', r: '5' }],
    ['path', { d: 'M6 36 A 8 8 0 0 1 22 36' }],
  ],
  acad_apply: [
    ['path', { d: 'M32 6 A 10 10 0 0 1 38 24 V29 H26 V24 A 10 10 0 0 1 32 6Z' }],
    ['path', { d: 'M27 33 37 33' }],
    ['path', { d: 'M29 37 35 37' }],
    ['path', { d: 'M32 2 32 5', opacity: '.5' }],
    ['path', { d: 'M14 14 17 15', opacity: '.5' }],
    ['path', { d: 'M50 14 47 15', opacity: '.5' }],
  ],
  acad_weekly: [
    ['rect', { x: '10', y: '10', width: '44', height: '30', rx: '3' }],
    ['path', { d: 'M10 19 54 19' }],
    ['path', { d: 'M20 7 20 13' }],
    ['path', { d: 'M44 7 44 13' }],
    ['path', { d: 'M17 26 20 29 25 24' }],
    ['path', { d: 'M30 26 33 29 38 24' }],
  ],
  acad_revision: [
    ['path', { d: 'M6 38 22 16 32 28 42 10 58 38Z' }],
    ['path', { d: 'M42 10 42 4' }],
    ['path', { d: 'M42 4 52 6.5 42 9' }],
  ],
  acad_epic: [
    ['rect', { x: '10', y: '8', width: '36', height: '26', rx: '3' }],
    ['path', { d: 'M16 16 34 16', opacity: '.6' }],
    ['path', { d: 'M16 22 28 22', opacity: '.6' }],
    ['circle', { cx: '46', cy: '30', r: '7' }],
    ['path', { d: 'M42 35 41 42 46 39 51 42 50 35' }],
  ],

  // -------------------------------------------------------------- passion --
  pass_explore: [
    ['circle', { cx: '32', cy: '22', r: '16' }],
    ['path', { d: 'M39 15 27 20 25 29 37 24Z' }],
    ['path', { d: 'M32 2 32 6', opacity: '.45' }],
    ['path', { d: 'M32 38 32 42', opacity: '.45' }],
  ],
  pass_practice: [
    ['path', { d: 'M12 38 C 18 30 20 24 22 20' }],
    ['path', { d: 'M22 20 30 12 40 22 32 30Z' }],
    ['path', { d: 'M40 22 50 12 46 8 36 18' }],
    ['path', { d: 'M12 38 20 36', opacity: '.5' }],
  ],
  pass_fundamental: [
    ['rect', { x: '20', y: '24', width: '24', height: '14', rx: '2' }],
    ['rect', { x: '26', y: '10', width: '12', height: '14', rx: '2', opacity: '.6' }],
    ['path', { d: 'M32 4 32 8', opacity: '.5' }],
  ],
  pass_rough_draft: [
    ['rect', { x: '10', y: '6', width: '32', height: '34', rx: '3' }],
    ['path', { d: 'M17 16 C 22 11 26 21 33 15', opacity: '.7' }],
    ['path', { d: 'M17 25 30 25', opacity: '.55' }],
    ['path', { d: 'M17 31 25 31', opacity: '.55' }],
    ['path', { d: 'M44 32 56 20 52 16 40 28 39 34Z' }],
  ],
  pass_study: [
    ['path', { d: 'M26 6 A 10 10 0 0 1 32 24 V28 H20 V24 A 10 10 0 0 1 26 6Z' }],
    ['path', { d: 'M21 32 31 32' }],
    ['circle', { cx: '46', cy: '24', r: '8' }],
    ['path', { d: 'M52 30 58 36' }],
  ],
  pass_small_build: [
    ['path', { d: 'M32 6 52 16 52 32 32 42 12 32 12 16Z' }],
    ['path', { d: 'M12 16 32 26 52 16', opacity: '.6' }],
    ['path', { d: 'M32 26 32 42', opacity: '.6' }],
  ],
  pass_critique: [
    ['path', { d: 'M6 22 C 14 10 26 10 34 22 C 26 34 14 34 6 22Z' }],
    ['circle', { cx: '20', cy: '22', r: '5' }],
    ['rect', { x: '38', y: '10', width: '20', height: '24', rx: '2', opacity: '.65' }],
    ['path', { d: 'M42 27 47 20 53 27', opacity: '.65' }],
  ],
  pass_share: [
    ['circle', { cx: '20', cy: '12', r: '5' }],
    ['path', { d: 'M11 30 A 9 9 0 0 1 29 30' }],
    ['path', { d: 'M34 20 52 20', opacity: '.7' }],
    ['path', { d: 'M46 14 52 20 46 26', opacity: '.7' }],
    ['path', { d: 'M8 38 32 38', opacity: '.45' }],
  ],
  pass_teach: [
    ['circle', { cx: '16', cy: '13', r: '5' }],
    ['path', { d: 'M8 32 A 8 8 0 0 1 24 32' }],
    ['circle', { cx: '46', cy: '15', r: '4' }],
    ['path', { d: 'M40 32 A 6 6 0 0 1 52 32' }],
    ['path', { d: 'M27 20 37 20', opacity: '.6' }],
    ['path', { d: 'M33 16 37 20 33 24', opacity: '.6' }],
  ],
  pass_weekly: [
    ['rect', { x: '10', y: '10', width: '44', height: '30', rx: '3' }],
    ['path', { d: 'M10 19 54 19' }],
    ['path', { d: 'M20 7 20 13' }],
    ['path', { d: 'M44 7 44 13' }],
    ['path', { d: 'M17 26 20 29 25 24' }],
    ['path', { d: 'M30 26 33 29 38 24' }],
  ],
  pass_project: [
    ['path', { d: 'M32 6 52 16 52 32 32 42 12 32 12 16Z', opacity: '.7' }],
    ['path', { d: 'M24 24 30 30 42 18' }],
  ],
  pass_epic: [
    ['path', { d: 'M32 4 C 40 12 42 22 40 30 H24 C 22 22 24 12 32 4Z' }],
    ['circle', { cx: '32', cy: '17', r: '4' }],
    ['path', { d: 'M24 26 16 32 22 32', opacity: '.7' }],
    ['path', { d: 'M40 26 48 32 42 32', opacity: '.7' }],
    ['path', { d: 'M28 34 32 42 36 34', opacity: '.7' }],
  ],
  pass_compete: [
    ['rect', { x: '24', y: '12', width: '16', height: '26' }],
    ['rect', { x: '8', y: '22', width: '16', height: '16', opacity: '.65' }],
    ['rect', { x: '40', y: '26', width: '16', height: '12', opacity: '.65' }],
    ['path', { d: 'M32 4 33.6 8.2 38 8.6 34.6 11.6 35.6 16 32 13.6 28.4 16 29.4 11.6 26 8.6 30.4 8.2Z' }],
  ],

  // The teaching quest every player meets first, before any archetype is drawn.
  tutorial_first_mission: [
    ['path', { d: 'M32 5 37 20 52 20 40 29 44 43 32 34 20 43 24 29 12 20 27 20Z' }],
  ],
};

// A quest with no drawing of its own still gets its domain's, so a card is
// never blank: custom quests, questline steps, and anything added to the
// catalogue before its art is.
const DOMAIN_FALLBACK = {
  physical: SCENES.phys_walk,
  academic: SCENES.acad_read,
  passion: SCENES.pass_practice,
};

/**
 * A line drawing of the quest being performed.
 *
 * @param {string} templateKey  the archetype key, e.g. 'phys_pushups'
 * @param {string} domain       physical | academic | passion, for the fallback
 * @param {object} [options]
 * @param {number} [options.width=64]
 * @param {string} [options.className]
 * @returns {SVGElement}
 */
export function questArt(templateKey, domain, { width = 64, className = '' } = {}) {
  const shape = sceneFor(templateKey, domain);
  return svg('svg', {
    class: `questart${className ? ` ${className}` : ''}`,
    viewBox: '0 0 64 44',
    width: String(width), height: String(Math.round((width * 44) / 64)),
    fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'aria-hidden': 'true', focusable: 'false',
  }, ...shape.map(([tag, attrs]) => svg(tag, attrs)));
}

function sceneFor(templateKey, domain) {
  if (templateKey && SCENES[templateKey]) return SCENES[templateKey];
  // Questline steps arrive as `chain:creation:2` and custom quests as `custom`;
  // both are real quests in a domain, so they fall through to its drawing.
  return DOMAIN_FALLBACK[domain] || SCENES.tutorial_first_mission;
}

export function hasQuestArt(templateKey) {
  return Boolean(templateKey && SCENES[templateKey]);
}

export const questArtKeys = Object.keys(SCENES);
