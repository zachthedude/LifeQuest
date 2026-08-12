// AUTH — sign in / create character, on a split art panel.

import { api } from '../api.js';
import { decryptText } from '../decrypt.js';
import { el, field, toast } from '../ui.js';

const MOTTO = 'Build the person you want to be';

const PROMISES = [
  ['💪', 'Train the body', 'Capability and wellbeing — never appearance.'],
  ['🧠', 'Train the mind', 'Understanding you can prove without notes.'],
  ['🔥', 'Build something', 'Finish things that exist after you stop.'],
];

export function authView({ onAuthenticated, mode: initialMode = 'signup' }) {
  // The landing page sends people here already knowing which door they want:
  // "Start my quest" opens on sign-up, "Continue my quest" on sign-in.
  let mode = initialMode === 'login' ? 'login' : 'signup';

  const username = el('input', {
    class: 'input', name: 'username', autocomplete: 'username', required: true,
    minlength: '3', maxlength: '24', placeholder: 'pick a name',
  });
  const password = el('input', {
    class: 'input', name: 'password', type: 'password', required: true,
    minlength: '8', placeholder: '••••••••',
    autocomplete: mode === 'signup' ? 'new-password' : 'current-password',
  });
  const errorLine = el('p', { class: 'field__error', role: 'alert', hidden: true });
  const submit = el('button', {
    class: 'btn btn--primary btn--block btn--lg', type: 'submit',
    text: mode === 'signup' ? 'Start my quest' : 'Continue my quest',
  });

  const tabs = el('div', { class: 'auth-tabs', role: 'tablist' },
    ...[['signup', 'New character'], ['login', 'Sign in']].map(([value, label]) =>
      el('button', {
        type: 'button', role: 'tab', 'aria-selected': String(value === mode), text: label,
        onClick: (event) => {
          mode = value;
          for (const tab of tabs.children) tab.setAttribute('aria-selected', 'false');
          event.currentTarget.setAttribute('aria-selected', 'true');
          submit.textContent = mode === 'signup' ? 'Start my quest' : 'Continue my quest';
          password.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
          errorLine.hidden = true;
          username.focus();
        },
      })));

  const form = el('form', {
    class: 'stack',
    onSubmit: async (event) => {
      event.preventDefault();
      errorLine.hidden = true;
      submit.disabled = true;
      submit.textContent = mode === 'signup' ? 'Creating…' : 'Signing in…';
      try {
        const result = mode === 'signup'
          ? await api.signup(username.value.trim(), password.value)
          : await api.login(username.value.trim(), password.value);
        onAuthenticated(result.user);
      } catch (error) {
        errorLine.textContent = error.message;
        errorLine.hidden = false;
        toast('Could not continue', error.message, 'error');
        submit.disabled = false;
        submit.textContent = mode === 'signup' ? 'Start my quest' : 'Continue my quest';
      }
    },
  },
    field('Username', username, '3–24 characters: letters, numbers, . _ -'),
    field('Password', password, 'At least 8 characters.'),
    errorLine,
    submit);

  // The headline decrypts itself on mount; the real string is always present
  // for assistive tech and for anyone who prefers reduced motion.
  const headline = el('h1', { class: 'auth__headline' });
  decryptText(headline, {
    text: 'Real life is the game.',
    trigger: 'mount',
    variant: 'display',
    stagger: 42,
    startDelay: 260,
    retriggerOnHover: true,
    seed: 7,
  });

  // Static artwork on purpose. The reactive orb this used to host now runs as the
  // background of the signed-in app (js/components/appBackground.js), where it
  // has the whole page to move across; a second copy of it on the way in would
  // spend the first WebGL context of the session on a screen you leave in twenty
  // seconds.
  const stage = el('div', { class: 'auth__stage' },
    el('img', {
      class: 'auth__image', src: '/img/hero.svg', alt: '',
      width: '620', height: '760', loading: 'eager', decoding: 'async',
    }));

  return el('div', { class: 'auth' },
    el('section', { class: 'auth__art' },
      el('div', { class: 'auth__artcopy' },
        el('span', { class: 'eyebrow', text: 'Level 1 → 100' }),
        headline,
        el('p', { class: 'auth__lede', text:
          'Quests are things you actually do. Evidence comes before XP. The curve is honest — '
          + 'level 100 is years of real work, and it cannot be grinded.' })),
      stage,
      el('ul', { class: 'auth__promises' },
        ...PROMISES.map(([icon, title, body]) =>
          el('li', {},
            el('span', { class: 'auth__promiseicon', 'aria-hidden': 'true', text: icon }),
            el('span', {},
              el('b', { text: title }),
              el('span', { class: 'dim', text: ` — ${body}` })))))),

    el('section', { class: 'auth__panel' },
      el('div', { class: 'card auth-card' },
        el('div', { class: 'brand brand--auth' },
          el('img', { class: 'brand__mark', src: '/img/emblem.svg', alt: '',
                      width: '40', height: '40' }),
          el('div', {},
            el('div', { class: 'brand__name', text: 'LifeQuest' }),
            el('span', { class: 'brand__sub', text: MOTTO }))),
        tabs,
        form,
        el('p', { class: 'auth__foot dim',
                  text: 'Your data stays on this machine. No email, no tracking.' }))));
}
