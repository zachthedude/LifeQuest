// DOT MATRIX — a port of the `modern-login-signup.tsx` background to raw WebGL.
//
// The original is a three.js `ShaderMaterial` on a full-screen plane, with
// three.js itself pulled in at runtime from cdnjs. Neither half of that survives
// here, for the reason every other port in docs/component-integration.md ran
// into: `script-src 'self'` (server/app.py) blocks the CDN tag outright, and
// there is no npm on this machine to install the package instead.
//
// So the shader is kept and its host is replaced. three.js contributes exactly
// four things to this effect — a canvas, an orthographic camera that is the
// identity for a clip-space quad, a 2-triangle plane, and a uniform bag — and
// all four are a few lines of WebGL2 each. The fragment shader below is the
// original's, unaltered apart from the notes in `FRAGMENT_SHADER`.
//
// WebGL2 rather than WebGL1, because the effect indexes two uniform arrays with
// a value computed at runtime (`u_opacities[int(rand * 10.0)]`). GLSL ES 1.00
// only guarantees constant-index-expressions there, so on WebGL1 that is a
// compile failure on conformant drivers rather than a slow path. Callers that
// get `null` back keep the CSS dot field underneath, which is why the layer is
// styled to look right with no canvas in it at all.

const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;

uniform vec2 u_resolution;

out vec2 v_coord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  // The original derives fragCoord from the plane's own vertices rather than
  // reading gl_FragCoord, which is what makes the grid independent of the
  // framebuffer's pixel ratio: the cell size is measured in u_resolution units,
  // so a retina display gets sharper dots, not smaller ones.
  v_coord = (a_position + 1.0) * 0.5 * u_resolution;
  v_coord.y = u_resolution.y - v_coord.y;
}
`;

// Verbatim from the component, with three deliberate edits:
//
//   * `u_reverse` is dropped. The original declares it and never reads it, so
//     it only ever cost a uniform lookup.
//   * `PHI` is `const` — a global initialised from a literal, which is what it
//     always was.
//   * `u_colors` is indexed modulo its length. `show_offset` is a hash and the
//     original trusts it to stay under 1.0; `fract` normally guarantees that,
//     but it returns exactly 1.0 for tiny negative inputs on some drivers, and
//     an out-of-range index is undefined behaviour rather than a clamped read.
const FRAGMENT_SHADER = `#version 300 es
// highp in both stages, not the original's mediump. Two reasons: u_resolution is
// declared in both shaders, and a precision mismatch on a shared uniform is a
// link error rather than a slow path -- and mediump floats only hold integers
// exactly to 2048, which a 2560-wide field in x2 resolution units is well past,
// so the grid would start tearing on wide displays. GLSL ES 3.00 guarantees
// highp in fragment shaders, so there is nothing to fall back to here.
precision highp float;

in vec2 v_coord;

uniform float u_time;
uniform float u_opacities[10];
uniform vec3 u_colors[6];
uniform float u_total_size;
uniform float u_dot_size;
uniform vec2 u_resolution;
uniform float u_speed;

out vec4 fragColor;

const float PHI = 1.61803398874989484820459;

float random(vec2 xy) {
    return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x);
}

void main() {
    vec2 st = v_coord.xy;
    st.x -= abs(floor((mod(u_resolution.x, u_total_size) - u_dot_size) * 0.5));
    st.y -= abs(floor((mod(u_resolution.y, u_total_size) - u_dot_size) * 0.5));

    float opacity = step(0.0, st.x) * step(0.0, st.y);

    vec2 st2 = vec2(int(st.x / u_total_size), int(st.y / u_total_size));

    float frequency = 5.0;
    float show_offset = random(st2);
    float rand = random(st2 * floor((u_time / frequency) + show_offset + frequency));
    opacity *= u_opacities[int(rand * 10.0)];
    opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.x / u_total_size));
    opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.y / u_total_size));

    vec3 color = u_colors[int(show_offset * 6.0) % 6];

    vec2 center_grid = u_resolution / 2.0 / u_total_size;
    float dist_from_center = distance(center_grid, st2);

    float timing_offset_intro = dist_from_center * 0.01 + (random(st2) * 0.15);

    float current_timing_offset = timing_offset_intro;
    opacity *= step(current_timing_offset, u_time * u_speed);
    opacity *= clamp((1.0 - step(current_timing_offset + 0.1, u_time * u_speed)) * 1.25, 1.0, 1.25);

    fragColor = vec4(color, opacity);
    fragColor.rgb *= fragColor.a;
}
`;

// Long enough that the intro sweep has passed every dot on any screen size, so
// a still frame is the finished field rather than a half-drawn one.
const SETTLED_TIME = 12;

/** '#rrggbb' → [r, g, b] in 0..1. Mirrors the helper in blob.js. */
function hexToRgb(hex) {
  const value = String(hex).trim().replace('#', '');
  const full = value.length === 3
    ? value.split('').map((character) => character + character).join('')
    : value;
  const int = Number.parseInt(full, 16);
  if (!Number.isFinite(int)) return [1, 1, 1];
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

/** Six colours, whatever the caller passed: the shader indexes 0..5 blindly. */
function packColors(colors) {
  const list = (colors && colors.length ? colors : ['#ffffff']).map(hexToRgb);
  const packed = new Float32Array(18);
  for (let i = 0; i < 6; i += 1) {
    const [r, g, b] = list[i % list.length];
    packed[i * 3] = r;
    packed[i * 3 + 1] = g;
    packed[i * 3 + 2] = b;
  }
  return packed;
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Mount the animated dot field into `container`.
 *
 * @param {HTMLElement} container
 * @param {object}   [options]
 * @param {string[]} [options.colors]     up to 6 hex colours, picked per dot
 * @param {number[]} [options.opacities]  10 brightness steps, picked per dot
 * @param {number}   [options.totalSize]  grid cell, in resolution units
 * @param {number}   [options.dotSize]    dot, in the same units
 * @param {number}   [options.speed]      intro sweep rate
 * @param {number}   [options.scale]      resolution units per CSS pixel
 * @param {'add'|'over'} [options.blend]  'add' glows (dark grounds), 'over' inks
 * @param {boolean}  [options.animate]    false paints one settled frame
 * @param {number}   [options.maxDpr]
 * @returns {{canvas: HTMLCanvasElement, painted: boolean, setPalette: Function,
 *            destroy: Function} | null}
 */
export function mountDotMatrix(container, {
  colors = ['#ffffff'],
  opacities = [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1.0],
  totalSize = 20,
  dotSize = 6,
  speed = 3,
  scale = 2,
  blend = 'add',
  animate = true,
  maxDpr = 1.5,
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'dotfield__canvas';
  canvas.setAttribute('aria-hidden', 'true');

  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    // The field is painted once per frame and never read back after the first
    // check, so the driver is free to discard it between frames.
    preserveDrawingBuffer: false,
    powerPreference: 'low-power',
  });
  if (!gl) return null;

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  container.append(canvas);
  gl.useProgram(program);

  // Two triangles in clip space. This is the whole of what PlaneGeometry(2, 2)
  // and the orthographic camera were doing.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);

  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    time: gl.getUniformLocation(program, 'u_time'),
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    opacities: gl.getUniformLocation(program, 'u_opacities[0]'),
    colors: gl.getUniformLocation(program, 'u_colors[0]'),
    totalSize: gl.getUniformLocation(program, 'u_total_size'),
    dotSize: gl.getUniformLocation(program, 'u_dot_size'),
    speed: gl.getUniformLocation(program, 'u_speed'),
  };

  const opacityTable = new Float32Array(10);
  for (let i = 0; i < 10; i += 1) opacityTable[i] = opacities[i % opacities.length] ?? 1;
  gl.uniform1fv(uniforms.opacities, opacityTable);
  gl.uniform3fv(uniforms.colors, packColors(colors));
  gl.uniform1f(uniforms.totalSize, totalSize);
  gl.uniform1f(uniforms.dotSize, dotSize);
  gl.uniform1f(uniforms.speed, speed);

  // The original's CustomBlending is `SrcAlpha, One` — additive, which is what
  // makes the dots glow rather than punch a hole in what is behind them. That
  // only works on a dark ground: adding light to a light background is
  // invisible, so light mode blends the same premultiplied output normally and
  // paints dark dots instead. Hence `blend`, which is the one behaviour of the
  // original this port had to make configurable rather than copy.
  gl.enable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);

  function applyBlend(mode) {
    if (mode === 'over') gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  }
  applyBlend(blend);

  let width = 0;
  let height = 0;
  let destroyed = false;
  let frame = null;
  const started = performance.now();

  function draw(seconds) {
    if (destroyed) return;
    gl.uniform1f(uniforms.time, seconds);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function resize() {
    if (destroyed) return;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const rect = container.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    // Resolution is the CSS box times `scale`, not the framebuffer: the
    // original hard-codes ×2, and that ratio is what sets the dot density.
    gl.uniform2f(uniforms.resolution, width * scale, height * scale);
    // A resize while paused would otherwise leave a stretched last frame.
    if (!frame) draw(animate ? (performance.now() - started) / 1000 : SETTLED_TIME);
  }

  function tick() {
    if (destroyed) return;
    // Views here are torn down by clearing their container (ui.js `mount`), so a
    // caller that forgets to call destroy() would otherwise leave this loop
    // running against a detached canvas for the rest of the session.
    if (!canvas.isConnected) { stop(); return; }
    frame = requestAnimationFrame(tick);
    draw((performance.now() - started) / 1000);
  }

  function start() {
    if (destroyed || frame || !animate) return;
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
  }

  resize();

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(container);
  window.addEventListener('resize', resize, { passive: true });

  // A login screen left open in a background tab has no business holding a
  // 60 Hz shader loop open.
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') stop();
    else start();
  };
  document.addEventListener('visibilitychange', onVisibility);

  // Only claim success if the shader actually puts dots on screen — the caller
  // keeps the CSS field underneath otherwise, and a blank canvas over a working
  // fallback would be worse than never having tried.
  //
  // The probe deliberately draws a *settled* frame rather than the current one.
  // The effect opens on an empty grid and sweeps outwards from the centre, so at
  // t≈0 a correct shader has drawn almost nothing, and probing the first frame
  // would report failure every single time. The window is 64px because the grid
  // is mostly gap: a dot is a few pixels in a cell of `totalSize / scale`, and
  // an 8px window lands between dots more often than not.
  let painted = false;
  try {
    const span = 64;
    const sample = new Uint8Array(span * span * 4);
    const x = Math.max(0, Math.round((canvas.width - span) / 2));
    const y = Math.max(0, Math.round((canvas.height - span) / 2));
    draw(SETTLED_TIME);
    gl.readPixels(x, y, span, span, gl.RGBA, gl.UNSIGNED_BYTE, sample);
    for (let i = 3; i < sample.length; i += 4) {
      if (sample[i] > 8) { painted = true; break; }
    }
  } catch {
    painted = false;
  }

  // The probe left a settled frame in the buffer; the loop restarts the sweep
  // from the top, and a still field keeps the frame it already has.
  if (animate) start();

  return {
    canvas,
    painted,
    /**
     * Repaint in a different palette — used when the app theme changes.
     * @param {{colors?: string[], blend?: 'add'|'over'}} next
     */
    setPalette(next = {}) {
      if (destroyed) return;
      gl.useProgram(program);
      if (next.colors && next.colors.length) {
        gl.uniform3fv(uniforms.colors, packColors(next.colors));
      }
      if (next.blend) applyBlend(next.blend);
      if (!frame) draw(animate ? (performance.now() - started) / 1000 : SETTLED_TIME);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
}
