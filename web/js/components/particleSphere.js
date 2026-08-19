// Particle sphere — the core the orbiting rings turn around.
//
// The React original imported a `ParticleSphereAnimation` from a utils folder
// that ships with the component. This is that piece rebuilt on a 2D canvas:
// points on a Fibonacci lattice, spun around the Y axis and projected with a
// cheap perspective divide. No WebGL, because this only has to look like a
// star-field globe and 2D never fails to get a context.
//
// Points are painted in buckets (colour × depth band) rather than one path per
// point, so a 900-point sphere is ~18 fills a frame instead of 900.

const DEPTH_BANDS = 6;

/**
 * @param {HTMLElement} container
 * @param {object} [options]
 * @param {number} [options.count]     particles; scaled down on small screens
 * @param {string[]} [options.colors]  hex colours, cycled across the lattice
 * @param {number} [options.speed]     revolutions per second
 * @param {number} [options.tilt]      axis tilt in radians
 * @param {boolean} [options.animate]  false paints one static frame
 * @param {number} [options.maxDpr]
 * @returns {{canvas: HTMLCanvasElement, destroy: Function} | null}
 */
export function mountParticleSphere(container, {
  count = 820,
  colors = ['#ffcf5c', '#bd85ff', '#56d0f5'],
  speed = 0.055,
  tilt = 0.42,
  animate = true,
  maxDpr = 1.6,
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'sphere__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  container.append(canvas);

  // Fewer points on a phone: the sphere is physically smaller there, so the
  // density reads the same while the per-frame cost roughly halves.
  const total = window.innerWidth < 760 ? Math.round(count * 0.55) : count;

  // Fibonacci lattice — even coverage without the pole clustering you get from
  // sampling latitude and longitude independently.
  const points = new Float32Array(total * 3);
  const tints = new Uint8Array(total);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < total; i += 1) {
    const y = 1 - (i / Math.max(1, total - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    points[i * 3] = Math.cos(theta) * radius;
    points[i * 3 + 1] = y;
    points[i * 3 + 2] = Math.sin(theta) * radius;
    // Banded rather than random, so the colours read as regions of a globe
    // instead of noise.
    tints[i] = Math.min(colors.length - 1, Math.floor(((y + 1) / 2) * colors.length));
  }

  let width = 0;
  let height = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const rect = container.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(time) {
    const cx = width / 2;
    const cy = height / 2;
    const size = Math.min(width, height) * 0.46;
    const angle = time * speed * Math.PI * 2;
    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);
    const sinT = Math.sin(tilt);
    const cosT = Math.cos(tilt);

    ctx.clearRect(0, 0, width, height);

    // A soft core so the globe has a centre of mass and the silhouette does not
    // read as a flat ring of dots.
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 1.5);
    glow.addColorStop(0, 'rgba(120, 140, 255, 0.20)');
    glow.addColorStop(0.45, 'rgba(90, 110, 220, 0.07)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    // Additive blending: overlapping particles brighten instead of flattening.
    ctx.globalCompositeOperation = 'lighter';

    for (let tint = 0; tint < colors.length; tint += 1) {
      for (let band = 0; band < DEPTH_BANDS; band += 1) {
        // band 0 = furthest away, DEPTH_BANDS - 1 = nearest the viewer.
        const near = (band + 0.5) / DEPTH_BANDS;
        ctx.globalAlpha = 0.14 + near * 0.72;
        ctx.fillStyle = colors[tint];
        ctx.beginPath();
        let drew = false;

        for (let i = 0; i < total; i += 1) {
          if (tints[i] !== tint) continue;
          const px = points[i * 3];
          const py = points[i * 3 + 1];
          const pz = points[i * 3 + 2];

          // Spin about Y, then tilt the axis towards the viewer.
          const rx = px * cosA + pz * sinA;
          const rz = pz * cosA - px * sinA;
          const ry = py * cosT - rz * sinT;
          const dz = py * sinT + rz * cosT;

          const depth = (dz + 1) / 2;                     // 0 far → 1 near
          if (Math.floor(depth * DEPTH_BANDS) !== band) continue;

          const perspective = 1.8 / (2.6 - dz);
          const dot = 0.5 + depth * 1.5;
          ctx.moveTo(cx + rx * size * perspective + dot, cy - ry * size * perspective);
          ctx.arc(cx + rx * size * perspective, cy - ry * size * perspective, dot, 0, 6.2832);
          drew = true;
        }
        if (drew) ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  let running = false;
  let frame = 0;
  let onScreen = true;
  const started = performance.now();

  const loop = () => {
    frame = requestAnimationFrame(loop);
    draw((performance.now() - started) / 1000);
  };

  const start = () => {
    if (running || !animate) return;
    running = true;
    frame = requestAnimationFrame(loop);
  };
  const pause = () => {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };

  resize();
  draw(0);                       // a correct still frame before any rAF arrives
  start();

  const onResize = () => {
    resize();
    if (!running) draw((performance.now() - started) / 1000);
  };
  window.addEventListener('resize', onResize, { passive: true });

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
    }, { threshold: 0.02 });
    observer.observe(container);
  }

  return {
    canvas,
    destroy() {
      pause();
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.remove();
    },
  };
}
