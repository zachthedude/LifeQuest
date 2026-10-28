// CONSTELLATION GRID — a spring-mass mesh that the cursor shoves out of its way.
//
// A port of `constellation-grid.tsx`. A lattice of nodes sits on a grid, each one
// anchored to a home point by a spring; the pointer pushes them away with a force
// that scales with how fast it is moving, and the springs pull them back. Nodes
// close enough to each other are joined by a line, so the displacement reads as a
// sheet of fabric being swept rather than as dots moving independently.
//
// It replaces the WebGL orb as the background of the signed-in app. The orb
// leaned towards the cursor; this reacts to it — a fast sweep throws a visible
// shockwave across the whole surface, which is the effect that earned the swap.
//
// Six things differ from the original, and all six are this codebase rather than
// taste:
//
//   * THEME COMES FROM THE APP, NOT THE OS. The original reads
//     `prefers-color-scheme` directly. Here that is the wrong source: a player
//     who has chosen light while their machine is dark would get a near-black
//     canvas under a white interface. It takes the *resolved* theme, the same
//     one `data-theme` carries, and `setTheme()` is wired to `onThemeChange`.
//   * THE CANVAS IS TRANSPARENT, AND ITS COLOURS COME FROM CSS. The original
//     hardcodes `#030407` / `#f8fafc` and fills the surface opaquely, which here
//     would paint over the drifting halo field this app already has behind
//     everything. So it clears instead of filling, and the node and accent
//     colours are read from custom properties on the layer — the mesh cannot
//     drift from the palette, and both themes are tuned in `styles.css` next to
//     every other dial rather than in here.
//   * CONNECTIONS ARE BINNED, NOT COMPARED PAIRWISE. The original tests every
//     node against every other one. That is ~350 nodes and 60k tests on a laptop,
//     but 1,270 nodes and 800k tests on a 1440p display — every frame, behind
//     every screen in the app. Since a link only reaches `linkDistance` (75) and
//     the grid spacing is 55, a node can only ever reach its immediate
//     neighbours, so nodes are hashed into cells and each is tested against four
//     forward neighbours. Same picture, linear cost.
//   * THE OVERLAY TITLE IS GONE. The demo paints "CONSTELLATION" across the
//     viewport in `mix-blend-difference`. This is a background layer under a real
//     interface, so its own headline would sit on top of every screen — the same
//     call the intro acts made when they dropped the film's HUD.
//   * A POINTER TELEPORT IS NOT A VELOCITY. The original parks the mouse at
//     -1000,-1000 on leave and derives speed from the per-frame delta, so the
//     first frame after the cursor re-enters sees it travel 1000px in 16ms and
//     detonates the grid. A jump larger than `TELEPORT_PX` is treated as an
//     arrival with no speed.
//   * POINTER EVENTS, ON THE DOCUMENT. `mouseleave` bound to `window` does not
//     reliably fire, and mouse events ignore pen and touch. This listens for
//     `pointermove`/`pointerleave` like the rest of the app.
//
// Reduced motion is honoured by drawing the lattice once, at rest, and never
// starting the loop — the mesh is legible as a still image, so there is nothing
// to lose but the movement.

import { el } from '../ui.js';

// Springs. `STIFFNESS` is how hard a node is pulled home, `DAMPING` how much of
// its velocity survives each frame. Under-damping here is what gives the sheet
// its overshoot and wobble instead of a dead snap back to the grid.
const STIFFNESS = 18;
const DAMPING = 0.82;

// Physics are integrated against a clamped delta so a dropped frame — or a tab
// coming back from the background with a half-second gap — cannot fling the mesh
// apart in a single step.
const MAX_STEP_SECONDS = 0.05;

// Past this, a pointer move is an arrival rather than a movement.
const TELEPORT_PX = 260;

// Where the pointer is parked while it is off the surface.
const AWAY = -1000;

// A ceiling on the lattice, independent of how large the window is: past this
// the spacing is widened rather than the node count allowed to grow. A 4K display
// would otherwise ask for ~3,500 nodes and spend the frame budget on a texture
// nobody is looking at.
const MAX_NODES = 1600;

function readTriple(styles, name, fallback) {
  const value = styles.getPropertyValue(name).trim();
  return /^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(value) ? value : fallback;
}

/**
 * Mount the mesh into a container.
 *
 * @param {HTMLElement} container
 * @param {object}  [options]
 * @param {number}  [options.spacing=55]        grid pitch in CSS pixels
 * @param {number}  [options.reach=220]         how far the pointer's push carries
 * @param {number}  [options.linkDistance=75]   how far a link between nodes reaches
 * @param {number}  [options.maxDpr=2]          resolution ceiling
 * @param {boolean} [options.labels=true]       hex coordinate readouts near the cursor
 * @param {boolean} [options.animate=true]      false draws one frame at rest
 * @returns {{canvas: HTMLCanvasElement, painted: boolean, setTheme: function,
 *            tick: function, destroy: function} | null}
 */
export function mountConstellation(container, {
  spacing = 55,
  reach = 220,
  linkDistance = 75,
  maxDpr = 2,
  labels = true,
  animate = true,
} = {}) {
  const canvas = el('canvas', { class: 'mesh__canvas', 'aria-hidden': 'true' });
  // Transparent on purpose. An opaque surface would be cheaper to composite, but
  // it would also cover the slow-drifting halo field at `body::before` that every
  // other screen in the app sits on. The mesh is a layer over that, not a
  // replacement for it, so each frame clears rather than fills.
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  container.append(canvas);

  let nodes = [];
  let width = 0;
  let height = 0;
  let pitch = spacing;
  let frame = 0;
  let painted = false;
  let running = animate;

  const palette = { node: '226, 232, 255', accent: '86, 208, 245', link: 0.18 };

  const pointer = { x: AWAY, y: AWAY, prevX: AWAY, prevY: AWAY, speed: 0, fresh: true };

  function readPalette() {
    const styles = getComputedStyle(canvas);
    palette.node = readTriple(styles, '--mesh-node', palette.node);
    palette.accent = readTriple(styles, '--mesh-accent', palette.accent);
    const link = parseFloat(styles.getPropertyValue('--mesh-link'));
    palette.link = Number.isFinite(link) ? link : palette.link;
  }

  function build() {
    // Widen the pitch rather than exceed the node ceiling, so density falls away
    // on a very large display instead of the frame rate doing it.
    pitch = spacing;
    for (let guard = 0; guard < 8; guard += 1) {
      const estimate = (Math.ceil(width / pitch) + 1) * (Math.ceil(height / pitch) + 1);
      if (estimate <= MAX_NODES) break;
      pitch = Math.round(pitch * 1.15);
    }

    const cols = Math.ceil(width / pitch) + 1;
    const rows = Math.ceil(height / pitch) + 1;
    nodes = [];
    for (let col = 0; col < cols; col += 1) {
      for (let row = 0; row < rows; row += 1) {
        const x = col * pitch;
        const y = row * pitch;
        nodes.push({
          x, y, vx: 0, vy: 0, baseX: x, baseY: y,
          radius: Math.random() * 1.2 + 1.2,
          // Kept from the original: a per-node hex readout that appears next to
          // the cursor. It is what makes the mesh read as instrumentation
          // rather than as decoration.
          label: `${(col * 7).toString(16).toUpperCase()}:${(row * 11).toString(16).toUpperCase()}`,
          pulse: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    width = container.clientWidth || window.innerWidth;
    height = container.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    // Assigning width/height resets the transform, so the scale is applied
    // after it rather than accumulating across resizes.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    if (!running) draw(0);
  }

  function step(dt) {
    for (const node of nodes) {
      node.pulse += dt * 3;

      const dx = pointer.x - node.x;
      const dy = pointer.y - node.y;
      const distance = Math.hypot(dx, dy);

      // The shockwave: a push away from the cursor whose strength rises with how
      // fast the cursor is travelling. A slow pass parts the mesh; a flick throws
      // it.
      if (distance < reach && distance > 0) {
        const falloff = 1 - distance / reach;
        const force = falloff * (1500 + pointer.speed * 150);
        node.vx -= (dx / distance) * force * dt;
        node.vy -= (dy / distance) * force * dt;
      }

      node.vx += (node.baseX - node.x) * STIFFNESS * dt;
      node.vy += (node.baseY - node.y) * STIFFNESS * dt;
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      node.x += node.vx * dt * 60;
      node.y += node.vy * dt * 60;
    }
  }

  // A uniform spatial hash, rebuilt each frame. Cell size is the link distance,
  // so a node's partners are always in its own cell or one of the eight around
  // it; testing four of those and taking each pair once covers every link.
  const NEIGHBOURS = [[1, 0], [-1, 1], [0, 1], [1, 1]];

  function drawLinks() {
    const cell = linkDistance;
    const buckets = new Map();
    for (const node of nodes) {
      const key = `${Math.floor(node.x / cell)},${Math.floor(node.y / cell)}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(node);
      else buckets.set(key, [node]);
    }

    const maxSq = linkDistance * linkDistance;
    ctx.lineWidth = 0.7;

    for (const [key, bucket] of buckets) {
      const [cx, cy] = key.split(',').map(Number);

      // Within the cell, every unordered pair once.
      for (let i = 0; i < bucket.length; i += 1) {
        for (let j = i + 1; j < bucket.length; j += 1) link(bucket[i], bucket[j], maxSq);
      }
      // Then four of the eight neighbours, which visits each cell pair once.
      for (const [ox, oy] of NEIGHBOURS) {
        const other = buckets.get(`${cx + ox},${cy + oy}`);
        if (!other) continue;
        for (const a of bucket) for (const b of other) link(a, b, maxSq);
      }
    }
  }

  function link(a, b, maxSq) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const distSq = dx * dx + dy * dy;
    if (distSq >= maxSq) return;
    const alpha = (1 - Math.sqrt(distSq) / linkDistance) * palette.link;
    ctx.strokeStyle = `rgba(${palette.node}, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function drawNodes() {
    for (const node of nodes) {
      const distance = Math.hypot(pointer.x - node.x, pointer.y - node.y);
      const near = distance < reach;
      const alpha = near ? 0.95 : 0.25 + Math.sin(node.pulse) * 0.1;

      ctx.fillStyle = near
        ? `rgba(${palette.accent}, ${alpha})`
        : `rgba(${palette.node}, ${alpha})`;
      const radius = near ? node.radius * 2.2 : node.radius + Math.sin(node.pulse) * 0.3;
      ctx.beginPath();
      ctx.arc(node.x, node.y, Math.max(0.5, radius), 0, Math.PI * 2);
      ctx.fill();

      // Radar rings and the coordinate readout, close in only. Both are what the
      // effect is *for*, and both are expensive enough — a stroke and a text
      // fill per node — that they stay inside a much tighter radius than the
      // push does.
      if (distance < 90) {
        const ring = ((node.pulse * 20) % 30) + 4;
        ctx.strokeStyle = `rgba(${palette.accent}, ${(1 - ring / 34) * 0.4})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(node.x, node.y, ring, 0, Math.PI * 2);
        ctx.stroke();

        if (labels) {
          ctx.font = '8px ui-monospace, SFMono-Regular, Consolas, monospace';
          ctx.fillStyle = `rgba(${palette.accent}, 0.85)`;
          ctx.fillText(node.label, node.x + 10, node.y - 10);
        }
      }
    }
  }

  function draw(dt) {
    ctx.clearRect(0, 0, width, height);
    if (dt > 0) step(dt);
    drawLinks();
    drawNodes();
  }

  let last = performance.now();

  // One step of the simulation, at whatever delta it is handed. Split out of the
  // frame callback so the same code path can be driven by a clock or by a caller
  // — see `tick` on the returned handle.
  function advance(dt) {
    // Velocity in pixels per second, from the distance covered since the last
    // step — unless that distance is a teleport, which is the cursor arriving.
    const moved = Math.hypot(pointer.x - pointer.prevX, pointer.y - pointer.prevY);
    pointer.speed = (pointer.fresh || moved > TELEPORT_PX || dt <= 0) ? 0 : moved / dt / 1000;
    pointer.prevX = pointer.x;
    pointer.prevY = pointer.y;
    pointer.fresh = false;
    draw(dt);
  }

  function render(now) {
    const dt = Math.min((now - last) / 1000, MAX_STEP_SECONDS);
    last = now;
    advance(dt);
    frame = requestAnimationFrame(render);
  }

  const onMove = (event) => {
    if (pointer.x === AWAY) pointer.fresh = true;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  };
  const onLeave = () => {
    pointer.x = AWAY;
    pointer.y = AWAY;
    pointer.prevX = AWAY;
    pointer.prevY = AWAY;
  };

  readPalette();
  resize();

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);

  if (running) {
    draw(0);
    frame = requestAnimationFrame(render);
  }

  // Same check the orb makes, and a real one on a surface that starts empty: the
  // corner holds the node at the grid origin, so anything at all in those pixels
  // means the first frame drew. Sampled once, after that frame is on it.
  try {
    const sample = ctx.getImageData(0, 0, Math.min(10, canvas.width),
                                    Math.min(10, canvas.height)).data;
    painted = sample.some((channel) => channel > 0);
  } catch {
    // A tainted or zero-sized canvas. Treat it as unusable rather than guess.
    painted = false;
  }

  function setTheme() {
    readPalette();
    if (!running) draw(0);
  }

  /**
   * Advance the simulation one fixed step and redraw, outside the frame loop.
   *
   * This exists for the browser suite. An automated Chrome throttles
   * `requestAnimationFrame` to a handful of callbacks per run — three, measured —
   * so a test that swept the pointer and waited for frames would be measuring the
   * harness's clock rather than whether the mesh actually moves. Driving the step
   * directly tests the physics and nothing else. Same reasoning as the
   * `lifequest:rendered` event the router fires for the same suite.
   */
  function tick(seconds = 1 / 60) {
    advance(Math.min(Math.max(seconds, 0), MAX_STEP_SECONDS));
  }

  function destroy() {
    cancelAnimationFrame(frame);
    running = false;
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    canvas.remove();
    nodes = [];
  }

  return { canvas, painted, setTheme, tick, destroy };
}
