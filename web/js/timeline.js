// Scroll-scrubbed timeline — the piece GSAP + ScrollTrigger would have provided.
//
// The cinematic landing was authored against `gsap`, which cannot be used here:
// there is no npm on this machine to install it and the app's own CSP
// (`script-src 'self'`) refuses a CDN copy. What that component actually needs
// is small enough to own outright — a normalised 0→1 scroll progress, tweens
// that read that progress instead of a clock, and eased interpolation.
//
// Two deliberate differences from ScrollTrigger:
//
//   * Pinning is CSS (`position: sticky`), not JS. A sticky stage cannot drift
//     out of place while a frame is being computed, and it survives a stalled
//     script entirely.
//   * The tick races requestAnimationFrame against a timer. Frames are
//     throttled in background tabs and in automated browsers, and a landing
//     page frozen halfway through its own animation is a bug people see.

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);
const round = (value, places = 2) => Number(value.toFixed(places));

export const EASE = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  expoOut: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  expoInOut: (t) => (
    t === 0 ? 0
      : t >= 1 ? 1
        : t < 0.5 ? 2 ** (20 * t - 10) / 2
          : (2 - 2 ** (-20 * t + 10)) / 2),
  backOut: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.5 * (t - 1) ** 2,
};

/**
 * Write a merged property bag onto a node.
 *
 * Transform is rebuilt from scratch every time, which is why `apply()` merges
 * every track for a node before calling this: two tracks driving the same
 * element (one moving it, a later one scaling it) must not erase each other.
 */
function write(node, v) {
  const parts = [];
  if (v.x || v.y || v.z) {
    parts.push(`translate3d(${round(v.x || 0)}px, ${round(v.y || 0)}px, ${round(v.z || 0)}px)`);
  }
  if (v.rotateX) parts.push(`rotateX(${round(v.rotateX)}deg)`);
  if (v.rotateY) parts.push(`rotateY(${round(v.rotateY)}deg)`);
  if (v.rotate) parts.push(`rotate(${round(v.rotate)}deg)`);
  if (v.scale !== undefined) parts.push(`scale(${round(v.scale, 4)})`);
  node.style.transform = parts.length ? parts.join(' ') : '';

  if (v.opacity !== undefined) {
    node.style.opacity = String(round(clamp01(v.opacity), 3));
    // GSAP's autoAlpha, and for the same reason: a faded-out layer must not
    // keep swallowing clicks or holding a tab stop.
    node.style.visibility = v.opacity <= 0.005 ? 'hidden' : 'visible';
  }
  if (v.blur !== undefined) node.style.filter = v.blur > 0.05 ? `blur(${round(v.blur)}px)` : '';
  if (v.width !== undefined) node.style.width = `${round(v.width)}px`;
  if (v.height !== undefined) node.style.height = `${round(v.height)}px`;
  if (v.radius !== undefined) node.style.borderRadius = `${round(v.radius)}px`;
  // A left-to-right wipe, used for the headline reveal.
  if (v.clip !== undefined) node.style.clipPath = `inset(0 ${round(clamp01(v.clip) * 100)}% 0 0)`;
}

/**
 * A list of tweens laid out on a shared 0→1 track.
 *
 * Tracks are evaluated in insertion order and their values merge per node, so a
 * later track overrides an earlier one on the keys they share — the same
 * sequencing rule a GSAP timeline follows.
 */
export function timeline() {
  const tracks = [];

  const api = {
    /** Interpolate `from` → `to` between `start` and `end` on the track. */
    tween(node, { start = 0, end = 1, ease = 'inOut', from = {}, to = {} }) {
      if (!node) return api;
      const keys = [...new Set([...Object.keys(from), ...Object.keys(to)])];
      tracks.push({ node, start, end, ease: EASE[ease] || EASE.inOut, from, to, keys });
      return api;
    },

    /** Hold a fixed state for the whole track — the initial pose of a layer. */
    set(node, values) {
      return api.tween(node, { start: 0, end: 1, ease: 'linear', from: values, to: values });
    },

    /** Anything that is not a style: counters, stroke offsets, act bookkeeping. */
    drive(start, end, ease, fn) {
      tracks.push({ start, end, ease: EASE[ease] || EASE.linear, fn });
      return api;
    },

    apply(progress) {
      const pending = new Map();
      for (const track of tracks) {
        const span = track.end - track.start;
        const raw = span <= 0 ? (progress >= track.end ? 1 : 0)
          : clamp01((progress - track.start) / span);
        const eased = track.ease(raw);

        if (track.fn) {
          track.fn(eased, raw);
          continue;
        }
        const values = pending.get(track.node) || {};
        const notStarted = progress < track.start;
        for (const key of track.keys) {
          // A tween that has not started yet leaves the key alone if an earlier
          // one is still driving it — the same rule a GSAP timeline follows, and
          // what lets one element rise in act I and leave again in act IV
          // without the later tween pinning it flat for the whole first half.
          if (notStarted && key in values) continue;
          const from = track.from[key] ?? track.to[key];
          const to = track.to[key] ?? track.from[key];
          values[key] = from + (to - from) * eased;
        }
        pending.set(track.node, values);
      }
      for (const [node, values] of pending) write(node, values);
    },
  };

  return api;
}

/**
 * Drive a timeline from how far a tall track element has scrolled past the top.
 *
 * @param {HTMLElement} trackEl        the tall scroll track (its sticky child is the stage)
 * @param {object}      options
 * @param {Function}    options.build  returns a fresh timeline; re-run on resize
 *                                     because every distance is in viewport pixels
 * @param {number}      [options.smooth=0.16]  1 = follow the scrollbar exactly
 * @param {Function}    [options.onProgress]
 * @returns {{seek: Function, refresh: Function, destroy: Function}}
 */
export function scrollScrub(trackEl, { build, smooth = 0.16, onProgress } = {}) {
  let tl = build();
  let target = 0;
  let current = 0;
  let frame = 0;
  let timer = 0;
  let alive = true;

  const measure = () => {
    const distance = trackEl.offsetHeight - window.innerHeight;
    if (distance <= 0) return 0;
    return clamp01(-trackEl.getBoundingClientRect().top / distance);
  };

  const paint = (value) => {
    tl.apply(value);
    if (onProgress) onProgress(value);
  };

  const tick = () => {
    if (frame) cancelAnimationFrame(frame);
    if (timer) clearTimeout(timer);
    frame = 0;
    timer = 0;
    if (!alive) return;

    const delta = target - current;
    current = Math.abs(delta) < 0.0005 ? target : current + delta * smooth;
    paint(current);
    if (current !== target) schedule();
  };

  // Whichever of the two arrives first wins and cancels the other, so the
  // animation still advances where rAF is being throttled.
  const schedule = () => {
    if (!alive || frame || timer) return;
    frame = requestAnimationFrame(tick);
    timer = setTimeout(tick, 90);
  };

  const onScroll = () => {
    target = measure();
    if (smooth >= 1) {
      current = target;
      paint(current);
      return;
    }
    schedule();
  };

  const refresh = () => {
    tl = build();
    target = measure();
    current = target;
    paint(current);
  };

  // Scroll events are delivered on the frame lifecycle, so they stop arriving
  // wherever frames are throttled — background tabs, low-power mode, automated
  // browsers. Verified: in headless Chrome the page really does scroll and the
  // sticky stage really does move, but no scroll event is ever dispatched, and
  // an intro pinned at act I is indistinguishable from a broken one. Polling
  // the position on a slow timer costs one rect measurement every 200ms and
  // makes the animation depend on where the page is rather than on being told.
  const watchdog = setInterval(() => {
    const next = measure();
    if (Math.abs(next - target) < 0.0005) return;
    target = next;
    if (smooth >= 1) {
      current = target;
      paint(current);
    } else {
      schedule();
    }
  }, 200);

  // First paint is synchronous and unconditional: the opening pose must be on
  // screen before any frame or scroll event has had a chance to arrive.
  target = measure();
  current = target;
  paint(current);

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', refresh, { passive: true });
  window.addEventListener('orientationchange', refresh, { passive: true });

  return {
    seek(value) {
      target = clamp01(value);
      current = target;
      paint(current);
    },
    refresh,
    destroy() {
      alive = false;
      clearInterval(watchdog);
      if (frame) cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', refresh);
      window.removeEventListener('orientationchange', refresh);
    },
  };
}
