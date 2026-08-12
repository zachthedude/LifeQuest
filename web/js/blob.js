// Animated noise blob — a port of the react-three-fiber component to raw WebGL.
//
// Same idea as the original: an icosphere whose vertices are pushed along their
// normals by classic Perlin 3D noise, with the displacement also driving the
// colour in the fragment shader, and the whole mesh easing toward the pointer.
// react-three-fiber, three.js and drei are replaced by ~200 lines of WebGL so it
// runs in this project's zero-dependency stack.
//
// The Perlin implementation is Stefan Gustavson / Ashima Arts' classic GLSL
// noise (MIT), which is what the original component used via its shader string.
//
// Degrades honestly: if WebGL is missing or the context is lost, `mount()`
// returns null and the caller keeps its static artwork.

const VERTEX_SHADER = `
precision highp float;

attribute vec3 a_position;

uniform mat4 u_projection;
uniform mat4 u_view;
uniform mat4 u_model;
uniform float u_time;
uniform float u_intensity;

varying float vDisplacement;
varying vec2 vUv;
varying vec3 vNormal;

vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec3 fade(vec3 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

float cnoise(vec3 P) {
  vec3 Pi0 = floor(P);
  vec3 Pi1 = Pi0 + vec3(1.0);
  Pi0 = mod(Pi0, 289.0);
  Pi1 = mod(Pi1, 289.0);
  vec3 Pf0 = fract(P);
  vec3 Pf1 = Pf0 - vec3(1.0);
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = Pi0.zzzz;
  vec4 iz1 = Pi1.zzzz;

  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + iz0);
  vec4 ixy1 = permute(ixy + iz1);

  vec4 gx0 = ixy0 / 7.0;
  vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5);
  gy0 -= sz0 * (step(0.0, gy0) - 0.5);

  vec4 gx1 = ixy1 / 7.0;
  vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5);
  gy1 -= sz1 * (step(0.0, gy1) - 0.5);

  vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
  vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
  vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
  vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
  vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
  vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
  vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
  vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);

  vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
  g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
  g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;

  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
  float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
  float n111 = dot(g111, Pf1);

  vec3 fade_xyz = fade(Pf0);
  vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  return 2.2 * mix(n_yz.x, n_yz.y, fade_xyz.x);
}

void main() {
  // On a unit icosphere the position doubles as the surface normal.
  vec3 normal = normalize(a_position);
  vNormal = normal;
  vUv = vec2(atan(a_position.z, a_position.x) * 0.15915 + 0.5, a_position.y * 0.5 + 0.5);

  vDisplacement = cnoise(a_position + vec3(2.0 * u_time));
  vec3 displaced = a_position + normal * (u_intensity * vDisplacement);

  gl_Position = u_projection * u_view * u_model * vec4(displaced, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform float u_time;
uniform float u_intensity;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
uniform vec3 u_colorC;

varying float vDisplacement;
varying vec2 vUv;
varying vec3 vNormal;

void main() {
  float distort = 2.0 * vDisplacement * u_intensity * sin(vUv.y * 10.0 + u_time);

  // A three-stop gradient up the body: warm at the base, through the mid hue,
  // to the cool tone at the crown — so no single domain colour swamps it.
  vec3 base = mix(u_colorA, u_colorB, smoothstep(0.05, 0.55, vUv.y));
  base = mix(base, u_colorC, smoothstep(0.55, 1.0, vUv.y));
  // Troughs pull back toward the warm end, which reads as depth.
  base = mix(base, u_colorA, clamp(-vDisplacement, 0.0, 1.0) * 0.3);

  float lambert = clamp(dot(vNormal, normalize(vec3(0.35, 0.75, 0.55))), 0.0, 1.0);
  base *= 0.68 + 0.5 * lambert;

  // Crests catch the light, exactly as the original mixed toward white.
  vec3 color = mix(base, vec3(1.0), clamp(distort, 0.0, 1.0) * 0.5);
  gl_FragColor = vec4(color, 1.0);
}
`;

/* ------------------------------------------------------------------ maths -- */

// The camera never moves, so the visible world extent at the blob's own depth is
// a function of these two constants and the aspect ratio alone. `reach:
// 'viewport'` uses that to map the pointer to world space, which is what lets
// the orb travel the entire surface it is drawn on instead of a unit box in the
// middle of it.
const FOV = Math.PI / 4;
const CAMERA_Z = 8;

function perspective(fovRadians, aspect, near, far) {
  const f = 1 / Math.tan(fovRadians / 2);
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

function modelMatrix(x, y, z, scale) {
  return new Float32Array([
    scale, 0, 0, 0,
    0, scale, 0, 0,
    0, 0, scale, 0,
    x, y, z, 1,
  ]);
}

/* -------------------------------------------------------------- geometry -- */

/** Subdivided icosahedron, normalised to a unit sphere. Non-indexed. */
function icosphere(subdivisions = 4) {
  const t = (1 + Math.sqrt(5)) / 2;
  let vertices = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(normalise);

  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  for (let pass = 0; pass < subdivisions; pass += 1) {
    const midpoints = new Map();
    const next = [];
    const midpoint = (a, b) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const cached = midpoints.get(key);
      if (cached !== undefined) return cached;
      const va = vertices[a];
      const vb = vertices[b];
      vertices.push(normalise([
        (va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2,
      ]));
      const index = vertices.length - 1;
      midpoints.set(key, index);
      return index;
    };
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }

  const data = new Float32Array(faces.length * 9);
  let offset = 0;
  for (const face of faces) {
    for (const index of face) {
      const vertex = vertices[index];
      data[offset] = vertex[0];
      data[offset + 1] = vertex[1];
      data[offset + 2] = vertex[2];
      offset += 3;
    }
  }
  return data;
}

function normalise([x, y, z]) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const int = parseInt(full, 16);
  // Kept in sRGB: the shader writes straight to an 8-bit sRGB framebuffer with
  // no encode step, so linearising here would just render everything dark.
  return [
    ((int >> 16) & 255) / 255,
    ((int >> 8) & 255) / 255,
    (int & 255) / 255,
  ];
}

/* --------------------------------------------------------------- runtime -- */

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('blob: shader failed to compile', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Mount the blob into a container element.
 *
 * @param {HTMLElement} container
 * @param {object}  [options]
 * @param {string[]} [options.colors]      three hex colours to blend
 * @param {number}  [options.detail=4]     icosphere subdivisions
 * @param {number}  [options.scale=2.15]
 * @param {number}  [options.intensity=0.5]
 * @param {number}  [options.hoverIntensity=0.72]
 * @param {number}  [options.maxDpr=1.5]
 * @param {Window|HTMLElement} [options.pointerSource]  where to read the pointer
 *   from. Defaults to the container; pass `window` for a background layer that
 *   has to keep following the cursor while the cursor is over the content in
 *   front of it (a fixed layer never receives those events itself).
 * @param {'unit'|'viewport'} [options.reach='unit']  how far the orb travels.
 *   `unit` is ±1 world unit around the centre; `viewport` maps the pointer to
 *   the full visible extent, so the orb's centre lands under the cursor
 *   wherever the cursor is.
 * @returns {{destroy: Function, setColors: Function, canvas: HTMLCanvasElement,
 *            painted: boolean} | null}
 */
export function mountBlob(container, {
  colors = ['#ffcf5c', '#bd85ff', '#56d0f5'],
  detail = 4,
  scale = 2.15,
  intensity = 0.5,
  hoverIntensity = 0.72,
  maxDpr = 1.5,
  pointerSource = null,
  reach = 'unit',
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'blob__canvas';
  canvas.setAttribute('aria-hidden', 'true');

  // No `powerPreference` hint: asking for a specific GPU can make the browser
  // migrate (and drop) the context on hybrid-graphics machines.
  const gl = canvas.getContext('webgl', {
    antialias: true, alpha: true, premultipliedAlpha: false,
  }) || canvas.getContext('experimental-webgl');
  if (!gl) return null;

  const vertexShader = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('blob: program failed to link', gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  const positions = icosphere(detail);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

  const uniforms = {
    projection: gl.getUniformLocation(program, 'u_projection'),
    view: gl.getUniformLocation(program, 'u_view'),
    model: gl.getUniformLocation(program, 'u_model'),
    time: gl.getUniformLocation(program, 'u_time'),
    intensity: gl.getUniformLocation(program, 'u_intensity'),
    colorA: gl.getUniformLocation(program, 'u_colorA'),
    colorB: gl.getUniformLocation(program, 'u_colorB'),
    colorC: gl.getUniformLocation(program, 'u_colorC'),
  };

  gl.uniform3fv(uniforms.colorA, hexToRgb(colors[0]));
  gl.uniform3fv(uniforms.colorB, hexToRgb(colors[1]));
  gl.uniform3fv(uniforms.colorC, hexToRgb(colors[2]));
  gl.uniformMatrix4fv(uniforms.view, false, translation(0, 0, -CAMERA_Z));

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.clearColor(0, 0, 0, 0);

  container.append(canvas);

  const vertexCount = positions.length / 3;
  const pointer = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  // World units per unit of pointer travel, rewritten by `resize`.
  const span = { x: 1, y: 1 };
  let currentIntensity = intensity;
  let hovering = false;
  let running = false;
  let frame = null;
  let onScreen = true;
  let destroyed = false;
  const started = performance.now();

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.dataset.motion === 'reduced';
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const width = Math.max(1, Math.round(container.clientWidth * dpr));
    const height = Math.max(1, Math.round(container.clientHeight * dpr));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.uniformMatrix4fv(uniforms.projection, false,
      perspective(FOV, width / height, 0.1, 100));
    if (reach === 'viewport') {
      // Half the visible height in world units at the blob's depth, and the same
      // across. Pointer input is already normalised to ±1, so multiplying by
      // these puts the orb exactly where the cursor is — including the corners,
      // where most of it hangs off the edge.
      span.y = Math.tan(FOV / 2) * CAMERA_Z;
      span.x = span.y * (width / height);
    }
  }

  function draw(elapsed) {
    resize();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    current.x += (pointer.x - current.x) * 0.08;
    current.y += (pointer.y - current.y) * 0.08;
    currentIntensity += ((hovering ? hoverIntensity : intensity) - currentIntensity) * 0.03;
    gl.uniform1f(uniforms.time, 0.4 * elapsed);
    gl.uniform1f(uniforms.intensity, currentIntensity);
    gl.uniformMatrix4fv(uniforms.model, false,
      modelMatrix(current.x * span.x, current.y * span.y, 0, scale));
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
  }

  function loop() {
    if (destroyed) return;
    // The router replaces screens by swapping DOM, with no unmount hook — so
    // the blob retires itself once its container leaves the document rather
    // than rendering forever into nothing.
    if (!container.isConnected) {
      teardown();
      return;
    }
    draw((performance.now() - started) / 1000);
    frame = requestAnimationFrame(loop);
  }

  function start() {
    if (running || destroyed) return;
    // Paint one frame synchronously so the shape is present even before the
    // first animation frame arrives (throttled tabs, automated browsers).
    resize();
    draw((performance.now() - started) / 1000);
    if (reducedMotion()) return;   // the shape, without the motion
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
    moveHost.removeEventListener('pointermove', onPointerMove);
    hoverHost.removeEventListener('pointerenter', onEnter);
    hoverHost.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onResize);
    canvas.remove();
    // Release the GPU resources rather than waiting for GC.
    const loseContext = gl.getExtension('WEBGL_lose_context');
    loseContext?.loseContext();
  }

  // A fixed background layer sits *behind* the content, so it never sees a
  // pointer event of its own — the cursor is always over something in front of
  // it. Reading the pointer from the window instead is what keeps the orb
  // following the cursor everywhere on the page. The coordinates stay relative
  // to the container either way, so the maths below is unchanged.
  const moveHost = pointerSource || container;
  const hoverHost = moveHost === window ? document.documentElement : container;

  const onPointerMove = (event) => {
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    // With the window as the source there is no `pointerenter` to wake the
    // intensity up — the first movement is the signal.
    if (moveHost === window) hovering = true;
  };
  const onEnter = () => { hovering = true; };
  const onLeave = () => { hovering = false; pointer.x = 0; pointer.y = 0; };

  moveHost.addEventListener('pointermove', onPointerMove, { passive: true });
  hoverHost.addEventListener('pointerenter', onEnter);
  hoverHost.addEventListener('pointerleave', onLeave);

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') pause();
    else if (onScreen) start();
  };
  document.addEventListener('visibilitychange', onVisibility);

  let observer = null;
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      if (onScreen && document.visibilityState !== 'hidden') start();
      else pause();
    }, { threshold: 0.05 });
    observer.observe(container);
  }

  const onResize = () => { resize(); if (!running) draw((performance.now() - started) / 1000); };
  window.addEventListener('resize', onResize, { passive: true });

  // A lost context must not leave a dead black rectangle behind.
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    pause();
    container.classList.add('blob--unavailable');
  });

  start();

  // Only claim success if the first frame actually put pixels on screen. The
  // caller hides its static artwork on the strength of this, and a blank
  // canvas replacing working artwork would be worse than no blob at all.
  let painted = false;
  try {
    const sample = new Uint8Array(8 * 8 * 4);
    const cx = Math.max(0, (canvas.width >> 1) - 4);
    const cy = Math.max(0, (canvas.height >> 1) - 4);
    gl.readPixels(cx, cy, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, sample);
    for (let i = 3; i < sample.length; i += 4) {
      if (sample[i] > 0) { painted = true; break; }
    }
  } catch {
    painted = false;
  }

  /** Repaint in a different palette — used when the app theme changes. */
  const setColors = (next) => {
    if (destroyed || !next || next.length < 3) return;
    gl.useProgram(program);
    gl.uniform3fv(uniforms.colorA, hexToRgb(next[0]));
    gl.uniform3fv(uniforms.colorB, hexToRgb(next[1]));
    gl.uniform3fv(uniforms.colorC, hexToRgb(next[2]));
    // Under reduced motion there is no loop to pick the new palette up on.
    if (!running) draw((performance.now() - started) / 1000);
  };

  return { canvas, painted, setColors, destroy: teardown };
}
