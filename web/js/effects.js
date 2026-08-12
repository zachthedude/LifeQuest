// Feedback layer: XP flight, level-up overlay, achievement toasts and sound.
// Every effect is optional and honours prefers-reduced-motion and the mute setting.

import { decryptText } from './decrypt.js';
import { el, toast, announce } from './ui.js';
import { state } from './store.js';

function motionAllowed() {
  if (state.preferences?.reducedMotion) return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ------------------------------------------------------------------ sound --
let audioContext = null;

function ctx() {
  if (!state.preferences?.sound) return null;
  if (audioContext === null) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try { audioContext = new Ctor(); } catch { audioContext = false; }
  }
  return audioContext || null;
}

function tone(frequency, { duration = 0.16, type = 'sine', gain = 0.05, delay = 0 } = {}) {
  const audio = ctx();
  if (!audio) return;
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export const sound = {
  complete() { tone(660, { gain: 0.05 }); tone(880, { delay: 0.09, gain: 0.045 }); },
  levelUp() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(f, { delay: i * 0.11, duration: 0.32, gain: 0.055, type: 'triangle' }));
  },
  achievement() {
    [784, 988, 1319].forEach((f, i) => tone(f, { delay: i * 0.08, duration: 0.26, gain: 0.05 }));
  },
  soft() { tone(420, { gain: 0.025, duration: 0.09 }); },
  error() { tone(220, { gain: 0.04, duration: 0.2, type: 'sawtooth' }); },
};

// -------------------------------------------------------------- xp flight --
export function flyXp(amount, origin) {
  announce(`${amount} XP awarded`);
  if (!motionAllowed()) return;
  const node = el('div', { class: 'xp-fly', text: `+${amount} XP` });
  const rect = origin?.getBoundingClientRect?.();
  node.style.left = `${rect ? rect.left + rect.width / 2 : window.innerWidth / 2}px`;
  node.style.top = `${rect ? rect.top : window.innerHeight / 2}px`;
  document.body.append(node);
  setTimeout(() => node.remove(), 950);
}

export function pulseXpBar() {
  const bar = document.querySelector('#topbar .meter__fill');
  if (!bar || !motionAllowed()) return;
  bar.animate(
    [{ filter: 'brightness(1)' }, { filter: 'brightness(1.9)' }, { filter: 'brightness(1)' }],
    { duration: 700, easing: 'ease-out' });
}

// ------------------------------------------------------------- level up ----
export function levelUpOverlay(from, to, unlock) {
  sound.levelUp();
  announce(`Level up. Level ${from} to level ${to}.`);
  // The label decodes itself — the moment earns a bit of theatre.
  const label = el('div', { class: 'levelup__label' });
  decryptText(label, {
    text: 'LEVEL UP',
    trigger: 'mount',
    stagger: 70,
    startDelay: 120,
    jitter: 60,
    speed: 34,
    retriggerOnHover: false,
    seed: 21,
  });

  const overlay = el('div', { class: 'levelup', role: 'alertdialog', 'aria-label': 'Level up' },
    el('div', { class: 'levelup__inner' },
      label,
      el('div', { class: 'levelup__nums' },
        el('span', { text: `${from}` }), ' → ', `${to}`),
      unlock ? el('p', { class: 'levelup__unlock', text: unlock }) : null,
      el('button', { class: 'btn btn--primary', text: 'Continue', style: { marginTop: '18px' } })));

  document.getElementById('overlay-root').append(overlay);
  const button = overlay.querySelector('button');
  button.focus();
  const dismiss = () => overlay.remove();
  button.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Enter') {
      dismiss();
      document.removeEventListener('keydown', onKey);
    }
  });
  setTimeout(() => { if (overlay.isConnected) dismiss(); }, 6500);
}

// ------------------------------------------------------- result celebration --
export function celebrate(result, origin) {
  if (result.xp?.awarded) {
    sound.complete();
    flyXp(result.xp.awarded, origin);
    pulseXpBar();
  }
  for (const achievement of result.achievements || []) {
    sound.achievement();
    toast(`Achievement — ${achievement.name}`, achievement.description, 'xp', 7000);
  }
  for (const skill of result.skills || []) {
    toast(`Skill unlocked — ${skill.name}`, skill.description, 'success', 7000);
  }
  if (result.xp?.leveledUp) {
    const milestone = result.snapshot?.milestones?.unlocked?.find(
      (m) => m.level === result.xp.levelAfter);
    setTimeout(() => levelUpOverlay(
      result.xp.levelBefore, result.xp.levelAfter,
      milestone ? `Unlocked: ${milestone.name} — ${milestone.description}` : ''), 620);
  }
}
