// DICTATION — speak the reflection instead of typing it.
//
// Reflection is where the XP quality multiplier is won, and it is also the field
// players leave blank most often, because it arrives after the work when nobody
// wants to type. Speaking it removes that friction: the Web Speech API runs the
// recognition and the text lands in the same textarea, which stays the source of
// truth. Nothing here is a separate input — the form has no idea it happened.
//
// Design notes:
//
//   * The textarea is never taken over. Interim results are shown in a live
//     preview line, and only finalised phrases are committed to the field, so
//     the player can still type mid-dictation without the two fighting.
//   * A committed transcript is appended, never assigned, so dictating twice
//     adds a second paragraph instead of erasing the first.
//   * `continuous` keeps the recogniser alive through the pauses people leave
//     when they are thinking, which is most of what a reflection is.
//   * Chrome's implementation sends audio to a Google service. That is worth
//     saying out loud in a product whose selling point is that it is private,
//     so the hint says it rather than burying it.

import { el } from '../ui.js';

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export function isDictationSupported() {
  return typeof Recognition === 'function';
}

/**
 * A microphone button bound to a textarea.
 *
 * @param {HTMLTextAreaElement} target  the field the transcript is written into
 * @param {object}  [options]
 * @param {string}  [options.label='Dictate']
 * @returns {{node: HTMLElement|null, stop: function}}
 */
export function dictation(target, { label = 'Dictate' } = {}) {
  if (!isDictationSupported() || !target) return { node: null, stop() {} };

  let recogniser = null;
  let listening = false;

  const button = el('button', {
    class: 'btn btn--ghost btn--sm dictate__button', type: 'button',
    'aria-pressed': 'false',
  }, el('span', { class: 'dictate__dot', 'aria-hidden': 'true' }),
     el('span', { text: label }));

  const interim = el('p', { class: 'dictate__interim', hidden: true });
  const status = el('span', { class: 'dictate__status sr-only', role: 'status',
                              'aria-live': 'polite' });

  const node = el('div', { class: 'dictate' },
    el('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, button, status),
    interim);

  function setListening(next) {
    listening = next;
    node.classList.toggle('dictate--live', next);
    button.setAttribute('aria-pressed', String(next));
    button.lastChild.textContent = next ? 'Stop dictating' : label;
    status.textContent = next ? 'Listening.' : '';
    interim.hidden = !next;
    if (!next) interim.textContent = '';
  }

  function commit(text) {
    const clean = text.trim();
    if (!clean) return;
    const existing = target.value.trim();
    // Append rather than replace: a second pass at the same reflection should
    // add to it, and anything already typed must survive.
    target.value = existing ? `${existing} ${clean}` : clean;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function start() {
    recogniser = new Recognition();
    recogniser.lang = document.documentElement.lang || 'en-US';
    recogniser.continuous = true;
    recogniser.interimResults = true;

    recogniser.addEventListener('result', (event) => {
      let pending = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) commit(result[0].transcript);
        else pending += result[0].transcript;
      }
      interim.textContent = pending;
    });

    recogniser.addEventListener('error', (event) => {
      const message = event.error === 'not-allowed'
        ? 'Microphone permission was declined — type the reflection instead.'
        : event.error === 'no-speech'
          ? 'I did not catch anything. Try again, or type it.'
          : 'Dictation stopped. You can type the rest.';
      interim.hidden = false;
      interim.textContent = message;
      interim.classList.add('dictate__interim--error');
      setListening(false);
      recogniser = null;
    });

    recogniser.addEventListener('end', () => {
      // Fires on its own after a long silence as well as when we stop it.
      if (listening) setListening(false);
      recogniser = null;
    });

    try {
      recogniser.start();
    } catch {
      recogniser = null;
      return;
    }
    interim.classList.remove('dictate__interim--error');
    setListening(true);
    target.focus();
  }

  function stop() {
    if (recogniser) {
      try { recogniser.stop(); } catch { /* already stopped */ }
      recogniser = null;
    }
    if (listening) setListening(false);
  }

  button.addEventListener('click', () => (listening ? stop() : start()));

  return { node, stop };
}
