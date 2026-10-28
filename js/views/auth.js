// AUTH — sign in / create character, on the animated dot field.
//
// The layout is the one from `modern-login-signup.tsx`: a full-bleed WebGL dot
// matrix, a vignette pulling the eye inward, and a single dark card centred on
// top of it. What the card *contains* is this project's, for reasons in
// docs/component-integration.md — the short version is that LifeQuest has one
// credential (username + password, stored on this machine) and no OAuth of any
// kind, so the component's Google / GitHub / Apple buttons would have been three
// controls that cannot work. The three promises took their place: same visual
// rhythm under the same divider, and they say something true.
//
// The headline above the card still decrypts, which is the one piece of this
// screen the landing page now borrows rather than the other way round.

import { api } from '../api.js';
import { mountDotMatrix } from '../components/dotMatrix.js';
import { decryptText } from '../decrypt.js';
import { motionAllowed } from '../motion.js';
import { onThemeChange, resolveTheme } from '../theme.js';
import { el, field, toast, whenSized } from '../ui.js';
import { icon } from '../components/icons.js';

const MOTTO = 'Build the person you want to be';

// Shorter than the versions on the art panel these replaced: each one has to
// hold a single line inside a 430px card, and a promise that wraps turns the
// stack under the divider into a paragraph.
const PROMISES = [
  ['dumbbell', 'Train the body', 'capability, not appearance'],
  ['brain', 'Train the mind', 'prove it without notes'],
  ['flame', 'Build something', 'that outlives the session'],
];

// The original field is white dots on black. This one is the app's palette: a
// cool neutral for most of the grid, one seat each for the two domain accents,
// and exactly one for XP gold — the same "gold is rare" rule the rest of the
// product follows, so the field reads as LifeQuest rather than as a demo.
//
// Light mode is not a recolour but a different blend: the shader's additive
// pass is invisible on a pale ground, so those dots are inked on instead.
const FIELD = {
  dark: {
    colors: ['#59639b', '#59639b', '#59639b', '#7d8cff', '#56d0f5', '#ffcf5c'],
    blend: 'add',
  },
  light: {
    colors: ['#aab3d4', '#aab3d4', '#aab3d4', '#6b7ae0', '#2f9ec9', '#e2a52f'],
    blend: 'over',
  },
};

export function authView({ onAuthenticated, mode: initialMode = 'signup' }) {
  // The landing page sends people here already knowing which door they want:
  // "Start my quest" opens on sign-up, "Continue my quest" on sign-in.
  let mode = initialMode === 'login' ? 'login' : 'signup';

  const cleanups = [];
  const teardown = () => {
    for (const fn of cleanups.splice(0)) {
      try { fn(); } catch { /* a failing teardown must not block sign-in */ }
    }
  };

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

  // ------------------------------------------------------- recovery ------
  // Two fields that only exist in recovery mode: the code the server printed,
  // and the password to replace the forgotten one. They live in the same form
  // as everything else, so one submit handler owns all three modes and there is
  // no second form to keep in step.
  const code = el('input', {
    class: 'input', name: 'code', autocomplete: 'one-time-code',
    placeholder: 'LQ-XXXX-XXXX-XXXX', spellcheck: 'false',
    // Typed off a terminal, so it is normalised on the way in rather than
    // rejected for a lowercase letter or a stray space.
    onInput: (event) => {
      const node = event.currentTarget;
      node.value = node.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    },
  });
  const codeField = field('Recovery code', code,
    'Printed in the terminal running the LifeQuest server.');
  const recoverStep = el('div', { class: 'stack', hidden: true }, codeField);

  const forgot = el('button', {
    class: 'auth__forgot', type: 'button', text: 'Forgot your password?',
    hidden: mode !== 'login',
    onClick: () => setMode('recover'),
  });
  const backToSignIn = el('button', {
    class: 'auth__forgot', type: 'button', text: 'Back to sign in',
    hidden: true,
    onClick: () => setMode('login'),
  });

  const notice = el('p', { class: 'auth__notice', role: 'status', hidden: true });

  const ACTION = {
    signup: 'Start my quest',
    login: 'Continue my quest',
    recover: 'Set a new password',
  };
  const BUSY = {
    signup: 'Creating…',
    login: 'Signing in…',
    recover: 'Changing…',
  };

  function setMode(next) {
    mode = next;
    const recovering = mode === 'recover';
    submit.textContent = ACTION[mode];
    password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    password.placeholder = recovering ? 'your new password' : '••••••••';
    recoverStep.hidden = !recovering;
    code.required = recovering;
    forgot.hidden = mode !== 'login';
    backToSignIn.hidden = !recovering;
    errorLine.hidden = true;
    notice.hidden = !recovering;
    for (const tab of tabs.children) {
      tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
    }
    // The tabs are for the two doors; recovery is a detour off sign-in rather
    // than a third one, so it borrows sign-in's tab rather than adding to them.
    if (recovering) tabs.children[1].setAttribute('aria-selected', 'true');
    (recovering ? username : username).focus();
  }

  const tabs = el('div', { class: 'auth-tabs', role: 'tablist' },
    ...[['signup', 'New character'], ['login', 'Sign in']].map(([value, label]) =>
      el('button', {
        type: 'button', role: 'tab', dataset: { mode: value },
        'aria-selected': String(value === mode), text: label,
        onClick: () => setMode(value),
      })));

  // Asking for a code is a separate request from spending one, so the button
  // that starts it lives in the recovery step rather than on the submit path.
  const sendCode = el('button', {
    class: 'btn btn--ghost btn--sm', type: 'button', text: 'Send me a code',
    onClick: async () => {
      const name = username.value.trim();
      if (!name) {
        errorLine.textContent = 'Enter your username first.';
        errorLine.hidden = false;
        username.focus();
        return;
      }
      sendCode.disabled = true;
      sendCode.textContent = 'Asking…';
      try {
        const result = await api.recover(name);
        notice.textContent = `${result.message} It is good for `
          + `${result.expiresInMinutes} minutes.`;
        notice.hidden = false;
        errorLine.hidden = true;
        code.focus();
      } catch (error) {
        errorLine.textContent = error.message;
        errorLine.hidden = false;
      } finally {
        sendCode.disabled = false;
        sendCode.textContent = 'Send me a code';
      }
    },
  });
  recoverStep.prepend(el('div', { class: 'auth__sendcode' },
    el('p', { class: 'dim', style: { margin: 0, fontSize: '12.5px' } },
      el('span', { text: 'LifeQuest has no mail server and never asked for your email, ' })),
    el('p', { class: 'dim', style: { margin: 0, fontSize: '12.5px' } },
      el('span', { text: 'so the code is printed in the terminal running the server.' })),
    sendCode));

  const form = el('form', {
    class: 'stack',
    onSubmit: async (event) => {
      event.preventDefault();
      errorLine.hidden = true;
      submit.disabled = true;
      submit.textContent = BUSY[mode];
      try {
        if (mode === 'recover') {
          // A reset does not sign anyone in — deliberately. The new password has
          // to be typed once more against the login form, which is the cheapest
          // possible proof that it was actually remembered.
          await api.resetPassword(username.value.trim(), code.value.trim(), password.value);
          toast('Password changed', 'Sign in with your new password.', 'success');
          code.value = '';
          password.value = '';
          setMode('login');
          password.focus();
          return;
        }
        const result = mode === 'signup'
          ? await api.signup(username.value.trim(), password.value)
          : await api.login(username.value.trim(), password.value);
        // The GL context goes before the next screen mounts: `mount()` clears
        // this container without telling the view, so this is the only moment
        // the field can be stopped deliberately rather than by its own
        // disconnected-canvas guard.
        teardown();
        onAuthenticated(result.user);
      } catch (error) {
        errorLine.textContent = error.message;
        errorLine.hidden = false;
        toast('Could not continue', error.message, 'error');
      } finally {
        submit.disabled = false;
        submit.textContent = ACTION[mode];
      }
    },
  },
    field('Username', username, '3–24 characters: letters, numbers, . _ -'),
    recoverStep,
    field('Password', password, 'At least 8 characters.'),
    notice,
    errorLine,
    submit,
    el('div', { class: 'auth__links' }, forgot, backToSignIn));

  // The headline decrypts itself on mount; the real string is always present
  // for assistive tech and for anyone who prefers reduced motion.
  const headline = el('h1', { class: 'auth__headline' });
  const decrypt = decryptText(headline, {
    text: 'Real life is the game.',
    trigger: 'mount',
    variant: 'display',
    stagger: 42,
    startDelay: 260,
    retriggerOnHover: true,
    seed: 7,
  });
  cleanups.push(() => decrypt?.destroy?.());

  // ------------------------------------------------------------ the field --
  // Full-bleed and behind everything. It is decoration with no meaning, so it
  // is aria-hidden and inert; the CSS underneath draws a static dot grid, which
  // is what a machine with no WebGL2 (or a first frame that painted nothing)
  // is left looking at.
  const fieldLayer = el('div', { class: 'auth__field', 'aria-hidden': 'true' });

  whenSized(fieldLayer, () => {
    const palette = FIELD[resolveTheme()] || FIELD.dark;
    const dots = mountDotMatrix(fieldLayer, {
      ...palette,
      animate: motionAllowed(),
      // Slightly finer than the original's 20/6: this field sits behind a card
      // of body copy rather than behind a marketing modal, and the smaller dot
      // reads as texture instead of as a pattern competing with the text.
      totalSize: 22,
      dotSize: 5,
      maxDpr: 1.25,
    });

    if (!dots || !dots.painted) {
      dots?.destroy();
      return;                       // the CSS grid stays; nothing else to do
    }

    fieldLayer.classList.add('auth__field--live');
    cleanups.push(() => dots.destroy());
    const stopTheme = onThemeChange((resolved) => dots.setPalette(FIELD[resolved] || FIELD.dark));
    cleanups.push(stopTheme);
  });

  const card = el('div', { class: 'card auth-card' },
    el('div', { class: 'brand brand--auth' },
      el('img', { class: 'brand__mark', src: 'img/emblem.svg', alt: '',
                  width: '40', height: '40' }),
      el('div', {},
        el('div', { class: 'brand__name', text: 'LifeQuest' }),
        el('span', { class: 'brand__sub', text: MOTTO }))),
    tabs,
    form,
    el('div', { class: 'auth__divider', 'aria-hidden': 'true' }),
    el('ul', { class: 'auth__promises' },
      ...PROMISES.map(([icon, title, body]) =>
        el('li', {},
          el('span', { class: 'auth__promiseicon', 'aria-hidden': 'true', text: icon }),
          el('span', {},
            el('b', { text: title }),
            el('span', { class: 'dim', text: ` — ${body}` }))))),
    el('p', { class: 'auth__foot dim',
              text: 'Your data stays on this machine. No email, no tracking.' }));

  return el('div', { class: 'auth' },
    fieldLayer,
    el('div', { class: 'auth__vignette', 'aria-hidden': 'true' }),
    el('div', { class: 'auth__modal' },
      // The mark is the same object the intro opens and closes on, so the way
      // in is bracketed by it too.
      el('div', { class: 'auth__stage' },
        el('img', {
          class: 'auth__image', src: 'img/emblem.svg', alt: '',
          width: '64', height: '64', loading: 'eager', decoding: 'async',
        })),
      el('span', { class: 'eyebrow', text: 'Level 1 → 100' }),
      headline,
      el('p', { class: 'auth__lede', text:
        'Quests are things you actually do. Evidence comes before XP, and the '
        + 'curve is honest — level 100 cannot be grinded.' }),
      card));
}
