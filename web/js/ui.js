// DOM helpers and shared components.
// Everything user-supplied goes through textContent — no innerHTML anywhere.

// Cycle by design: icons.js takes `svg` from here and this takes `icon` from
// there. Both are hoisted function declarations, so neither module can observe
// the other half-initialised, and the alternative was a second copy of `svg`.
import { icon } from './components/icons.js';

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value; // only ever called with literals
    else if (key === 'style' && typeof value === 'object') setStyle(node, value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  appendAll(node, children);
  return node;
}

/**
 * Apply a style object. Custom properties have to go through `setProperty` —
 * assigning `style['--x']` silently does nothing, which is a hard bug to see.
 */
function setStyle(node, values) {
  for (const [prop, value] of Object.entries(values)) {
    if (prop.startsWith('--')) node.style.setProperty(prop, value);
    else node.style[prop] = value;
  }
}

export function svg(tag, props = {}, ...children) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  appendAll(node, children);
  return node;
}

function appendAll(node, children) {
  for (const child of children.flat(4)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

const escapeForRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Split a sentence into text and highlighted key words.
 *
 * The highlight is a change of *face* — a serif italic against the rounded sans
 * — with a tint on top, rather than a tint alone. Two channels means the
 * emphasis still lands for anyone who cannot separate the colours, and it reads
 * as typography rather than as a link.
 *
 * Everything goes through textContent, so a key word is never a markup hole.
 *
 * @param {string} text
 * @param {Array<string|[string, string]>} words  plain, or [word, variant] to tint
 * @returns {Array<Node|string>} ready to spread into `el(...)`
 */
export function rich(text, words = []) {
  const source = String(text ?? '');
  const entries = words
    .map((entry) => (Array.isArray(entry) ? entry : [entry, null]))
    .filter(([word]) => word);
  if (!entries.length) return [source];

  // Longest first, so "train the mind" wins over a bare "mind".
  const ordered = [...entries].sort((a, b) => b[0].length - a[0].length);
  const variantFor = new Map(ordered.map(([word, variant]) => [word.toLowerCase(), variant]));
  const pattern = new RegExp(
    `(?<![\\p{L}\\d])(${ordered.map(([word]) => escapeForRegex(word)).join('|')})(?![\\p{L}\\d])`,
    'giu');

  const nodes = [];
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > cursor) nodes.push(source.slice(cursor, match.index));
    const variant = variantFor.get(match[0].toLowerCase());
    nodes.push(el('b', { class: variant ? `kw kw--${variant}` : 'kw', text: match[0] }));
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) nodes.push(source.slice(cursor));
  return nodes;
}

/**
 * Empty a container, telling its contents they are going first.
 *
 * Anything holding a timer, an interval or a document-level listener needs a
 * moment to let go of it, and removing a node from the DOM does not give it one.
 * `lifequest:detach` was already being listened for — by the theme button, and
 * by the countdown board — but nothing had ever dispatched it, so those
 * teardowns never ran and every navigation leaked what they held.
 *
 * The event is dispatched on the outgoing subtree before detaching it, because a
 * handler that wants to read layout or storage must still be able to.
 */
export function clear(node) {
  for (const child of node.querySelectorAll('*')) {
    // A teardown that throws must not abandon the clear half-done, leaving the
    // outgoing screen's nodes spliced into the incoming one.
    try {
      child.dispatchEvent(new CustomEvent('lifequest:detach'));
    } catch (error) {
      console.error('detach handler failed:', error);
    }
  }
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(node, ...children) {
  clear(node);
  appendAll(node, children);
  return node;
}

/**
 * Run `fn` once `node` is connected and has real layout.
 *
 * Deliberately not rAF-based: frames are throttled in background tabs and in
 * automated browsers, and a view that never mounts its canvas because no frame
 * arrived is a bug the user sees as "the thing is just missing".
 */
export function whenSized(node, fn) {
  let done = false;
  let observer = null;
  let timer = null;

  const attempt = () => {
    if (done) return true;
    if (!node.isConnected || !node.clientWidth || !node.clientHeight) return false;
    done = true;
    observer?.disconnect();
    if (timer !== null) clearInterval(timer);
    fn();
    return true;
  };

  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(attempt);
    observer.observe(node);
  }
  timer = setInterval(attempt, 60);
  setTimeout(() => { if (timer !== null) clearInterval(timer); }, 8000);
  queueMicrotask(attempt);
}

// ---------------------------------------------------------------- pieces --
export function meter(value, variant = 'xp', label, valueText) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const wrap = el('div', { class: `meter meter--${variant}` });
  wrap.style.setProperty('--value', pct);
  if (label) {
    wrap.append(el('div', { class: 'meter__label' },
      el('span', { text: label }),
      el('b', { class: 'num', text: valueText ?? `${Math.round(pct)}%` })));
  }
  wrap.append(el('div', {
    class: 'meter__track', role: 'progressbar',
    'aria-valuenow': Math.round(pct), 'aria-valuemin': 0, 'aria-valuemax': 100,
    'aria-label': label || 'progress',
  }, el('div', { class: 'meter__fill' })));
  return wrap;
}

export function blocks(value, variant = 'xp', count = 16) {
  const clamped = Math.max(0, Math.min(100, value));
  // Any real progress lights at least one block — an all-grey bar reads as broken.
  const filled = clamped > 0 ? Math.max(1, Math.round((clamped / 100) * count)) : 0;
  const wrap = el('div', { class: `blocks meter--${variant}`, 'aria-hidden': 'true' });
  for (let i = 0; i < count; i += 1) {
    wrap.append(el('i', { class: i < filled ? 'on' : '' }));
  }
  return wrap;
}

export function stars(difficulty) {
  const wrap = el('span', {
    class: 'stars', 'aria-label': `Difficulty ${difficulty} of 5`, title: `Difficulty ${difficulty}/5`,
  });
  for (let i = 1; i <= 5; i += 1) {
    wrap.append(el('span', { class: i <= difficulty ? '' : 'off' },
      icon('star', { size: 13 })));
  }
  return wrap;
}

/**
 * @param {string} text
 * @param {string} [variant]   physical | academic | passion | xp | success | ...
 * @param {string} [iconName]  a glyph from components/icons.js, drawn before the text
 */
export function chip(text, variant, iconName) {
  const node = el('span', { class: `chip${variant ? ` chip--${variant}` : ''}` });
  if (iconName) node.append(icon(iconName, { size: 14 }));
  node.append(el('span', { text }));
  return node;
}

/**
 * @param {string} mark  a glyph name from components/icons.js — not a character
 */
export function emptyState(mark, title, body, action) {
  return el('div', { class: 'empty' },
    el('div', { class: 'empty__mark', 'aria-hidden': 'true' }, icon(mark, { size: 40 })),
    el('h3', { text: title }),
    el('p', { text: body }),
    action || null);
}

export function errorState(message, onRetry) {
  return el('div', { class: 'errorstate' },
    el('div', { class: 'empty__mark', 'aria-hidden': 'true' }, icon('alert', { size: 40 })),
    el('h3', { text: 'Something went wrong' }),
    el('p', { class: 'muted', text: message || 'We could not load this screen.' }),
    onRetry ? el('button', { class: 'btn btn--primary', onClick: onRetry, text: 'Try again' }) : null);
}

export function skeleton(count = 3) {
  return el('div', { class: 'grid grid--2' },
    ...Array.from({ length: count }, () => el('div', { class: 'skeleton skeleton--card' })));
}

export function field(label, control, hint) {
  return el('label', { class: 'field' },
    el('span', { class: 'field__label', text: label }),
    control,
    hint ? el('span', { class: 'field__hint', text: hint }) : null);
}

// ---------------------------------------------------------------- toasts --
export function toast(title, body, variant = 'info', timeout = 5200) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const node = el('div', { class: `toast toast--${variant}` },
    el('b', { text: title }),
    body ? el('span', { text: body }) : null);
  host.append(node);
  const remove = () => {
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 220);
  };
  setTimeout(remove, timeout);
  node.addEventListener('click', remove);
}

export function announce(message) {
  const region = document.getElementById('live-region');
  if (region) {
    region.textContent = '';
    setTimeout(() => { region.textContent = message; }, 30);
  }
}

// ----------------------------------------------------------------- modal --
let openModal = null;

export function modal({ title, body, actions, onClose, wide }) {
  closeModal();
  const previouslyFocused = document.activeElement;

  const close = () => {
    document.removeEventListener('keydown', onKeydown, true);
    backdrop.remove();
    openModal = null;
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    if (onClose) onClose();
  };

  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = dialog.querySelectorAll(
      'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };

  const dialog = el('div', {
    class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title,
    style: wide ? { width: 'min(860px, 100%)' } : {},
  },
    el('div', { class: 'modal__head' },
      el('h2', { text: title }),
      el('button', {
        class: 'modal__close', type: 'button', 'aria-label': 'Close', text: '×',
        onClick: close,
      })),
    body,
    actions ? el('div', { class: 'row row--between', style: { marginTop: '18px' } }, actions) : null);

  const backdrop = el('div', {
    class: 'modal-backdrop',
    onClick: (event) => { if (event.target === backdrop) close(); },
  }, dialog);

  document.getElementById('overlay-root').append(backdrop);
  document.addEventListener('keydown', onKeydown, true);
  const focusTarget = dialog.querySelector('input,textarea,button:not(.modal__close)') || dialog;
  if (focusTarget.focus) focusTarget.focus();

  openModal = { close };
  return { close, dialog };
}

export function closeModal() {
  if (openModal) openModal.close();
}

// ------------------------------------------------------------- formatting --
export function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

export function formatMinutes(minutes) {
  const total = Number(minutes) || 0;
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z'));
  const diff = (Date.now() - then.getTime()) / 1000;
  if (Number.isNaN(diff)) return '';
  if (diff < 90) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.round(diff / 86400)}d ago`;
  return then.toLocaleDateString();
}

// Glyph *names* from components/icons.js, drawn by `icon()` — never characters.
export const DOMAIN_ICON = { physical: 'bolt', academic: 'brain', passion: 'flame' };
export const DOMAIN_LABEL = { physical: 'Physical', academic: 'Academic', passion: 'Passion' };
