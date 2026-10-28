// WOVEN LIGHT — a port of the `woven-light-hero.tsx` canvas to raw WebGL.
//
// Same idea as the original: a dense cloud of points sampled over a torus knot,
// each one pushed away from the cursor and pulled back to where it started by a
// spring, with the whole weave turning slowly. three.js and framer-motion are
// replaced by ~300 lines of WebGL because this project has no npm — the same
// constraint that shaped the other three ports (docs/component-integration.md).
//
// Only the *canvas* is ported. The component also ships a headline, a nav and a
// button; the brief here is to use it as the background of the page that already
// has all three, so the text half would have been thrown away on arrival.
//
// Four deliberate differences from the original, each for a reason:
//
//   * **No font injection.** The component appends a <link> to Google Fonts on
//     mount. `style-src 'self'` and `font-src 'self'` both block it, and the
//     project already has a local display face.
//   * **Every particle is distinct.** The original indexes 50,000 particles into
//     a ~6,600-vertex geometry with `i % count`, so ~7 particles share each
//     position — and since the forces depend only on position, they stay welded
//     together forever. Sampling the knot's surface parametrically instead gives
//     the density the effect is going for, for the same particle count.
//   * **The cursor is transformed into model space.** The original tests the
//     pointer against unrotated positions while the mesh is rotating, so the
//     hole it opens drifts away from the actual cursor. Un-rotating the cursor
//     by the same angle puts the parting where the pointer is.
//   * **The palette is the project's, not the spectrum.** `setHSL(Math.random(),
//     …)` is a full rainbow; this weave runs cyan → indigo → violet with gold on
//     a few strands, which is the app's own rule (gold is rare, and means XP).
//     Pass `hues: [[0, 1]]` for the original rainbow.
//
// It degrades honestly: no WebGL, or a first frame that drew nothing, and
// `mount()` returns null so the caller keeps its plain background.

const VERTEX_SHADER = `
precision highp float;

attribute vec3 a_position;
attribute vec3 a_color;

uniform mat4 u_projection;
uniform mat4 u_view;
uniform mat4 u_model;
uniform float u_size;

varying vec3 vColor;

void main() {
  vColor = a_color;
  vec4 viewPos = u_view * u_model * vec4(a_position, 1.0);
  gl_Position = u_projection * viewPos;
  // Size attenuation, matching three's PointsMaterial: points shrink with
  // distance rather than staying a fixed number of pixels.
  gl_PointSize = u_size / max(0.001, -viewPos.z);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;

uniform float u_opacity;
varying vec3 vColor;

void main() {
  // A round, soft point. Square points read as noise at this density.
  vec2 offset = gl_PointCoord - vec2(0.5);
  float radius = dot(offset, offset);
  if (radius > 0.25) discard;
  float alpha = smoothstep(0.25, 0.015, radius) * u_opacity;
  gl_FragColor = vec4(vColor, alpha);
}
`;

/* ------------------------------------------------------------------ maths -- */

const FOV = (75 * Math.PI) / 180;
const CAMERA_Z = 5;

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const rangeInv = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * rangeInv, -1,
    0, 0, near * far * rangeInv * 2, 0,
  ]);
}

function translation(x, y, z) {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

function rotationY(angle, out) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  out[0] = c; out[1] = 0; out[2] = -s; out[3] = 0;
  out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
  out[8] = s; out[9] = 0; out[10] = c; out[11] = 0;
  out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  return out;
}

/** A point on the (p, q) torus knot curve, written into `out`. */
function curvePoint(t, p, q, radius, out) {
  const u = t * p * Math.PI * 2;
  const quOverP = (q / p) * u;
  const cs = Math.cos(quOverP);
  out[0] = radius * (2 + cs) * 0.5 * Math.cos(u);
  out[1] = radius * (2 + cs) * 0.5 * Math.sin(u);
  out[2] = radius * Math.sin(quOverP) * 0.5;
  return out;
}

function hslToRgb(h, s, l, out, offset) {
  const hue = (value) => {
    let t = value;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t);
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  out[offset] = hue(h + 1 / 3);
  out[offset + 1] = hue(h);
  out[offset + 2] = hue(h - 1 / 3);
  return out;
}

/* -------------------------------------------------------------- geometry -- */

/**
 * Sample `count` points over the surface of a torus knot's tube.
 *
 * Parametric rather than indexed into a mesh: the original repeats a few
 * thousand vertices, and repeated particles never separate because the forces
 * acting on them are identical.
 */
function wovenPositions(count, { p = 2, q = 3, radius = 1.5, tube = 0.5 } = {}) {
  const positions = new Float32Array(count * 3);
  const p1 = new Float32Array(3);
  const p2 = new Float32Array(3);
  const T = new Float32Array(3);
  const N = new Float32Array(3);
  const B = new Float32Array(3);
  const step = 0.0005;

  for (let i = 0; i < count; i += 1) {
    const t = Math.random();
    curvePoint(t, p, q, radius, p1);
    curvePoint((t + step) % 1, p, q, radius, p2);

    // The Frenet-ish frame three.js builds for a tube: tangent from the
    // difference of two nearby curve points, and a normal from their sum.
    let tx = p2[0] - p1[0]; let ty = p2[1] - p1[1]; let tz = p2[2] - p1[2];
    let len = Math.hypot(tx, ty, tz) || 1;
    T[0] = tx / len; T[1] = ty / len; T[2] = tz / len;

    let nx = p2[0] + p1[0]; let ny = p2[1] + p1[1]; let nz = p2[2] + p1[2];
    len = Math.hypot(nx, ny, nz) || 1;
    N[0] = nx / len; N[1] = ny / len; N[2] = nz / len;

    // B = T × N, then N = B × T, so the frame is orthonormal.
    B[0] = T[1] * N[2] - T[2] * N[1];
    B[1] = T[2] * N[0] - T[0] * N[2];
    B[2] = T[0] * N[1] - T[1] * N[0];
    len = Math.hypot(B[0], B[1], B[2]) || 1;
    B[0] /= len; B[1] /= len; B[2] /= len;

    N[0] = B[1] * T[2] - B[2] * T[1];
    N[1] = B[2] * T[0] - B[0] * T[2];
    N[2] = B[0] * T[1] - B[1] * T[0];

    const v = Math.random() * Math.PI * 2;
    // A little scatter across the tube so the weave has body rather than
    // reading as a wireframe shell.
    const r = tube * (0.72 + Math.random() * 0.28);
    const cv = Math.cos(v) * r;
    const sv = Math.sin(v) * r;

    positions[i * 3] = p1[0] + cv * N[0] + sv * B[0];
    positions[i * 3 + 1] = p1[1] + cv * N[1] + sv * B[1];
    positions[i * 3 + 2] = p1[2] + cv * N[2] + sv * B[2];
  }
  return positions;
}

/* --------------------------------------------------------------- runtime -- */

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('woven: shader failed to compile', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * @param {HTMLElement} container
 * @param {object}  [options]
 * @param {number}  [options.count]        particles; defaults by viewport width
 * @param {Array<[number, number]>} [options.hues]  hue bands to draw from, 0–1
 * @param {number}  [options.saturation=0.72]
 * @param {number}  [options.lightness]
 * @param {number}  [options.size=0.024]   world-space point size
 * @param {number}  [options.opacity=0.85]
 * @param {boolean} [options.additive]     additive blending (default: dark only)
 * @param {number}  [options.spin=0.05]    radians per second
 * @param {number}  [options.maxDpr=1.5]
 * @param {boolean} [options.animate=true] false draws one still frame
 * @returns {{destroy: Function, canvas: HTMLCanvasElement, painted: boolean,
 *            setTheme: Function} | null}
 */
export function mountWovenLight(container, {
  count,
  hues,
  saturation = 0.72,
  lightness,
  size = 0.024,
  opacity = 0.85,
  additive,
  spin = 0.05,
  maxDpr = 1.5,
  animate = true,
} = {}) {
  const dark = document.documentElement.dataset.theme !== 'light';
  // On a dark ground the points glow, so mid-lightness colours read as light. On
  // white they are *subtractive*: pale points at low opacity average into grey
  // haze, so the light palette is darker and more saturated — coloured dust
  // rather than fog.
  const sat = dark ? saturation : Math.min(1, saturation + 0.16);
  // Two of the app's three cool accents plus a rare gold strand — the palette
  // rule from styles.css, applied to 50,000 points instead of a chip.
  const bands = hues && hues.length ? hues : [[0.50, 0.62], [0.62, 0.76], [0.11, 0.13]];
  const weights = hues && hues.length ? null : [0.46, 0.46, 0.08];

  // 50,000 is the component's number and is fine on a desktop GPU with the
  // physics loop below allocation-free. A phone is doing the same arithmetic on
  // a smaller battery, so it gets a smaller weave.
  const particles = count || (window.innerWidth < 900 ? 14000 : 50000);

  const canvas = document.createElement('canvas');
  canvas.className = 'woven__canvas';
  canvas.setAttribute('aria-hidden', 'true');

  const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false })
    || canvas.getContext('experimental-webgl');
  if (!gl) return null;

  const vertexShader = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('woven: program failed to link', gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  const home = wovenPositions(particles);
  const positions = new Float32Array(home);           // the live, disturbed copy
  const velocities = new Float32Array(particles * 3);
  const colors = new Float32Array(particles * 3);

  for (let i = 0; i < particles; i += 1) {
    let band = bands[i % bands.length];
    if (weights) {
      const roll = Math.random();
      band = roll < weights[0] ? bands[0] : (roll < weights[0] + weights[1] ? bands[1] : bands[2]);
    }
    const hue = band[0] + Math.random() * (band[1] - band[0]);
    hslToRgb(hue, sat, lightness ?? (dark ? 0.56 : 0.36), colors, i * 3);
  }

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
  const colorLocation = gl.getAttribLocation(program, 'a_color');
  gl.enableVertexAttribArray(colorLocation);
  gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);

  const uniforms = {
    projection: gl.getUniformLocation(program, 'u_projection'),
    view: gl.getUniformLocation(program, 'u_view'),
    model: gl.getUniformLocation(program, 'u_model'),
    size: gl.getUniformLocation(program, 'u_size'),
    opacity: gl.getUniformLocation(program, 'u_opacity'),
  };

  gl.uniformMatrix4fv(uniforms.view, false, translation(0, 0, -CAMERA_Z));
  gl.uniform1f(uniforms.opacity, opacity);
  gl.disable(gl.DEPTH_TEST);            // additive points must not occlude
  gl.enable(gl.BLEND);
  const setBlend = (isDark) => {
    if (additive ?? isDark) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  };
  setBlend(dark);
  gl.clearColor(0, 0, 0, 0);

  container.append(canvas);

  const model = new Float32Array(16);
  const pointer = { x: 0, y: 0, active: false };
  let angle = 0;
  let running = false;
  let frame = null;
  let destroyed = false;
  let onScreen = true;
  let last = performance.now();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const width = Math.max(1, Math.round(container.clientWidth * dpr));
    const height = Math.max(1, Math.round(container.clientHeight * dpr));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.uniformMatrix4fv(uniforms.projection, false,
      perspective(FOV, width / height, 0.1, 1000));
    // three scales point size by half the drawing-buffer height.
    gl.uniform1f(uniforms.size, size * (height / 2));
  }

  /**
   * One step of the original's physics, written flat.
   *
   * The React version allocates four THREE.Vector3 per particle per frame —
   * 200,000 objects a frame at the stated count, which is most of its cost. The
   * arithmetic here is identical and allocates nothing.
   */
  function step(delta) {
    // The weave turns, so the cursor has to be turned the other way to be
    // compared against the particles' own space.
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const mx = pointer.x * 3 * cos;
    const mz = -pointer.x * 3 * sin;
    const my = pointer.y * 3;

    const reach = 1.5;
    const reachSq = reach * reach;
    // Scaled to the 60fps the original assumes, so a 144Hz screen does not run
    // the weave four times as fast.
    const scale = Math.min(3, delta * 60);
    const push = 0.01 * scale;
    const pull = 0.001 * scale;
    const damping = Math.pow(0.95, scale);

    for (let i = 0; i < positions.length; i += 3) {
      let px = positions[i];
      let py = positions[i + 1];
      let pz = positions[i + 2];
      let vx = velocities[i];
      let vy = velocities[i + 1];
      let vz = velocities[i + 2];

      if (pointer.active) {
        const dx = px - mx;
        const dy = py - my;
        const dz = pz - mz;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < reachSq) {
          const dist = Math.sqrt(distSq) || 0.0001;
          const force = ((reach - dist) * push) / dist;
          vx += dx * force;
          vy += dy * force;
          vz += dz * force;
        }
      }

      vx = (vx + (home[i] - px) * pull) * damping;
      vy = (vy + (home[i + 1] - py) * pull) * damping;
      vz = (vz + (home[i + 2] - pz) * pull) * damping;

      positions[i] = px + vx;
      positions[i + 1] = py + vy;
      positions[i + 2] = pz + vz;
      velocities[i] = vx;
      velocities[i + 1] = vy;
      velocities[i + 2] = vz;
    }
  }

  function draw(delta) {
    resize();
    angle += spin * delta;
    step(delta);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    gl.uniformMatrix4fv(uniforms.model, false, rotationY(angle, model));
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, particles);
  }

  function loop() {
    if (destroyed) return;
    // The router swaps screens by replacing DOM with no unmount hook, so the
    // weave retires itself once its container leaves the document.
    if (!container.isConnected) {
      teardown();
      return;
    }
    const now = performance.now();
    draw(Math.min(0.05, (now - last) / 1000));
    last = now;
    frame = requestAnimationFrame(loop);
  }

  function start() {
    if (running || destroyed) return;
    last = performance.now();
    resize();
    draw(0);                              // one frame even if nothing animates
    if (!animate) return;
    running = true;
    frame = requestAnimationFrame(loop);
  }

  function pause() {
    running = false;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  function teardown() {
    if (destroyed) return;
    destroyed = true;
    pause();
    observer?.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerleave', onPointerLeave);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.remove();
    const loseContext = gl.getExtension('WEBGL_lose_context');
    loseContext?.loseContext();
  }

  // Read from the window, not the canvas: the weave is behind the page content,
  // so the cursor is always over something else.
  const onPointerMove = (event) => {
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    pointer.active = true;
  };
  const onPointerLeave = () => { pointer.active = false; };
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerleave', onPointerLeave, { passive: true });

  const onResize = () => { resize(); if (!running) draw(0); };
  window.addEventListener('resize', onResize, { passive: true });

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') pause();
    else if (onScreen) start();
  };
  document.addEventListener('visibilitychange', onVisibility);

  // 50,000 particles of physics is not something to keep running for a reader
  // who has scrolled past it.
  let observer = null;
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      if (onScreen && document.visibilityState !== 'hidden') start();
      else pause();
    }, { threshold: 0.02 });
    observer.observe(container);
  }

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    pause();
    container.classList.add('woven--unavailable');
  });

  start();

  // Only claim success if the first frame actually put pixels on screen — the
  // caller decides whether to show the canvas on the strength of it.
  let painted = false;
  try {
    // Rows, not a patch in the middle: a torus knot is a *ring*, and the middle
    // of the canvas is the hole in it. Sampling there reports an empty frame for
    // a weave that drew perfectly well, and the caller would throw it away.
    const row = new Uint8Array(canvas.width * 4);
    for (const fraction of [0.35, 0.5, 0.65]) {
      const y = Math.min(canvas.height - 1, Math.max(0, Math.round(canvas.height * fraction)));
      gl.readPixels(0, y, canvas.width, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
      for (let i = 3; i < row.length; i += 4) {
        if (row[i] > 0) { painted = true; break; }
      }
      if (painted) break;
    }
  } catch {
    painted = false;
  }

  return {
    canvas,
    painted,
    particles,
    /** Re-light the weave for a theme change without rebuilding the context. */
    setTheme(theme) {
      if (destroyed) return;
      const isDark = theme !== 'light';
      const level = lightness ?? (isDark ? 0.56 : 0.36);
      const tone = isDark ? saturation : Math.min(1, saturation + 0.16);
      for (let i = 0; i < particles; i += 1) {
        const band = bands[i % bands.length];
        hslToRgb(band[0] + ((i * 0.618) % 1) * (band[1] - band[0]),
          tone, level, colors, i * 3);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
      gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
      setBlend(isDark);
      if (!running) draw(0);
    },
    destroy: teardown,
  };
}
