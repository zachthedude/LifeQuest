// AI GUIDE — VERA's briefing, recommendations and conversation.

import { api } from '../api.js';
import { sound } from '../effects.js';
import { chip, el, meter, rich, toast } from '../ui.js';

export async function guideView() {
  const data = await api.guide();
  const chat = el('div', { class: 'chat', id: 'guide-chat' });

  const renderHistory = (history) => {
    chat.replaceChildren();
    if (!history.length) {
      chat.append(bubble('guide', data.name, data.summary));
    }
    for (const entry of history) {
      chat.append(bubble('player', 'You', entry.message));
      chat.append(bubble('guide', data.name, entry.reply));
    }
    chat.scrollTop = chat.scrollHeight;
  };
  renderHistory(data.history);

  const input = el('input', {
    class: 'input', name: 'message', autocomplete: 'off',
    placeholder: 'Ask about your progression…', 'aria-label': 'Message to your guide',
  });
  const sendButton = el('button', { class: 'btn btn--primary', type: 'submit', text: 'Send' });

  const send = async (message) => {
    if (!message.trim()) return;
    chat.append(bubble('player', 'You', message));
    const thinking = bubble('guide', data.name, '…');
    chat.append(thinking);
    chat.scrollTop = chat.scrollHeight;
    input.value = '';
    sendButton.disabled = true;
    try {
      const reply = await api.askGuide(message);
      thinking.querySelector('.bubble__body').textContent = reply.reply;
      sound.soft();
    } catch (error) {
      thinking.querySelector('.bubble__body').textContent =
        'I could not answer that just now. Try again in a moment.';
      toast('Guide unavailable', error.message, 'error');
    } finally {
      sendButton.disabled = false;
      chat.scrollTop = chat.scrollHeight;
      input.focus();
    }
  };

  const form = el('form', {
    class: 'chat-form',
    onSubmit: (event) => { event.preventDefault(); send(input.value); },
  }, input, sendButton);

  const suggestions = el('div', { class: 'pillgroup', style: { marginTop: '12px' } },
    ...data.suggestedQuestions.map((question) => el('button', {
      class: 'pill', type: 'button', text: question,
      onClick: () => send(question),
    })));

  const milestone = data.nextMilestone;

  return el('div', { class: 'stack', style: { gap: '22px' } },
    el('div', { class: 'page-head' },
      el('div', {},
        el('h1', { text: `${data.name} — AI Guide` }),
        el('p', {}, ...rich('Reads your whole history. Answers with your actual numbers, not encouragement.',
          [['your whole history', null], ['actual numbers', 'xp'], ['not encouragement', 'strong']]))),
      chip(data.ai.modelBacked ? 'Model-backed' : 'Built-in reasoning',
        data.ai.modelBacked ? 'success' : undefined)),

    el('div', { class: 'grid grid--2' },
      el('section', { class: 'card' },
        el('div', { class: 'card__head' },
          el('h2', { class: 'card__title', text: 'Current read' })),
        el('p', { text: data.summary }),
        data.recommendations.length
          ? el('div', {},
            el('div', { class: 'card__title', style: { marginTop: '14px', marginBottom: '8px' },
                        text: 'Recommended next' }),
            el('ul', { class: 'rec-list' },
              ...data.recommendations.map((r) => el('li', { text: r }))))
          : null),

      el('section', { class: 'card' },
        el('div', { class: 'card__head' },
          el('h2', { class: 'card__title', text: 'Next milestone' })),
        milestone
          ? el('div', { class: 'stack' },
            el('b', { text: `Level ${milestone.level} — ${milestone.name}` }),
            el('p', { class: 'muted', style: { margin: 0 }, text: milestone.description }),
            meter(data.xp.percent, 'xp', `Level ${data.xp.level} progress`,
              `${data.xp.xpIntoLevel}/${data.xp.xpForNextLevel}`))
          : el('p', { class: 'muted', style: { margin: 0 },
                      text: 'Every milestone unlocked. Level 100 reached.' }))),

    el('section', { class: 'card' },
      el('div', { class: 'card__head' },
        el('h2', { class: 'card__title', text: 'Conversation' })),
      chat, form, suggestions),

    data.insights.length
      ? el('section', { class: 'card' },
        el('div', { class: 'card__head' },
          el('h2', { class: 'card__title', text: 'Analysis' })),
        el('div', { class: 'stack' }, ...data.insights.map((insight) =>
          el('div', { class: 'card card--tight' },
            el('b', { text: insight.title }),
            el('p', { class: 'muted', style: { margin: '4px 0 0' }, text: insight.body })))))
      : null);
}

function bubble(who, name, text) {
  return el('div', { class: `bubble bubble--${who}` },
    el('div', { class: 'bubble__who', text: name }),
    el('div', { class: 'bubble__body', text }));
}
