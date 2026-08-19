// QUESTS — filtering, generation, questlines and custom quest creation.

import { api } from '../api.js';
import { navigate } from '../router.js';
import { refreshQuests, state } from '../store.js';
import {
  chip, el, emptyState, field, formatMinutes, meter, modal, toast,
} from '../ui.js';
import { questCard } from './questCard.js';

const FILTERS = [
  ['open', 'Open'], ['verified', 'Completed'], ['submitted', 'Awaiting detail'],
  ['abandoned', 'Abandoned'], ['expired', 'Expired'], ['all', 'Everything'],
];

export async function questsView({ params }) {
  const status = params.get('status') || 'open';
  const [data, chainData] = await Promise.all([api.quests(status), api.chains()]);
  const snapshot = data.snapshot;
  const container = el('div', { class: 'stack', style: { gap: '22px' } });

  container.append(el('div', { class: 'page-head' },
    el('div', {},
      el('h1', { text: 'Quests' }),
      el('p', { text: 'Quests adapt to your level, your interests and how you have been performing.' })),
    el('div', { class: 'row' },
      el('button', {
        class: 'btn btn--ghost', text: 'New quest',
        onClick: () => openGenerateModal(snapshot),
      }),
      snapshot.capabilities.custom_quests
        ? el('button', { class: 'btn btn--primary', text: 'Create your own',
                         onClick: () => openCustomModal(snapshot) })
        : el('button', {
          class: 'btn btn--primary', text: 'Create your own', disabled: true,
          title: 'Custom quest creation unlocks at level 30',
        }))));

  const filters = el('div', { class: 'pillgroup' },
    ...FILTERS.map(([value, label]) => el('button', {
      class: 'pill', type: 'button', 'aria-pressed': String(value === status), text: label,
      onClick: () => navigate(`/quests?status=${value}`),
    })));
  container.append(filters);

  if (data.quests.length) {
    container.append(el('div', { class: 'grid grid--2' },
      ...data.quests.map((quest) => questCard(quest, {
        onChanged: () => navigate(`/quests?status=${status}`),
      }))));
  } else {
    const empties = {
      open: ['🗺️', 'No open quests', 'Generate a set to get moving again.'],
      verified: ['🏅', 'No completed quests yet', 'Complete and verify your first quest to see it here.'],
      submitted: ['📝', 'Nothing awaiting detail', 'Submissions that need more evidence appear here.'],
      abandoned: ['🍂', 'Nothing abandoned', 'Quests you drop are recorded here — they cost no XP.'],
      expired: ['⏳', 'Nothing expired', 'Daily quests expire after 36 hours if untouched.'],
      all: ['🗺️', 'No quests yet', 'Generate your first set to begin.'],
    };
    const [mark, title, body] = empties[status] || empties.all;
    container.append(emptyState(mark, title, body, el('button', {
      class: 'btn btn--primary', text: 'Generate quests',
      onClick: async () => {
        await api.ensureDaily();
        await refreshQuests();
        navigate('/quests?status=open');
      },
    })));
  }

  // ---- questlines
  const chainSection = el('section', { class: 'stack' },
    el('h2', { class: 'card__title', text: 'Questlines' }),
    el('p', { class: 'muted', style: { marginTop: '-6px' },
              text: 'Multi-step chains that take a single idea from exploration to a finished, presented result.' }));

  const chainCards = el('div', { class: 'grid grid--2' });
  for (const chain of chainData.available) {
    const active = chainData.active.find((c) => c.key === chain.key);
    chainCards.append(el('article', { class: 'card' },
      el('div', { class: 'row row--between' },
        el('h3', { text: chain.name }),
        chip(`${chain.steps} steps`, chain.domain)),
      el('p', { class: 'muted', text: chain.description }),
      active
        ? el('div', {}, meter((active.step / active.totalSteps) * 100, chain.domain,
          'Progress', `${active.step}/${active.totalSteps}`))
        : null,
      chain.locked
        ? chip(`Unlocks at level ${chain.minLevel}`, 'warn')
        : active && active.status === 'complete'
          ? chip('Complete', 'success')
          : active
            ? chip('In progress')
            : el('button', {
              class: 'btn btn--primary btn--sm', text: 'Begin questline',
              onClick: async (event) => {
                event.currentTarget.disabled = true;
                try {
                  await api.startChain(chain.key);
                  toast('Questline started', chain.name, 'success');
                  await refreshQuests();
                  navigate('/quests?status=open');
                } catch (error) {
                  toast('Could not start', error.message, 'error');
                  event.currentTarget.disabled = false;
                }
              },
            })));
  }
  chainSection.append(chainCards);
  container.append(chainSection);

  return container;
}

function openGenerateModal(snapshot) {
  const domainSelect = el('select', { class: 'select', name: 'domain' },
    el('option', { value: 'physical', text: 'Physical — train the body' }),
    el('option', { value: 'academic', text: 'Academic — train the mind' }),
    el('option', { value: 'passion', text: 'Passion — build something' }));
  const kindSelect = el('select', { class: 'select', name: 'kind' },
    el('option', { value: 'daily', text: 'Daily — today' }),
    el('option', { value: 'weekly', text: 'Weekly — this week', disabled: !snapshot.capabilities.weekly_quests }),
    el('option', { value: 'milestone', text: 'Milestone — a real achievement', disabled: !snapshot.capabilities.advanced_quests }),
    el('option', { value: 'epic', text: 'Epic — a long campaign', disabled: !snapshot.capabilities.epic_chains }));

  const button = el('button', { class: 'btn btn--primary', text: 'Generate' });
  const controller = modal({
    title: 'Generate a quest',
    body: el('div', { class: 'stack' },
      el('p', { class: 'muted', style: { margin: 0 },
                text: 'The generator scores every archetype against your level, interests, unlocked skills and recent history, then personalises the winner.' }),
      field('Domain', domainSelect),
      field('Class', kindSelect, 'Higher classes unlock as you level.')),
    actions: button,
  });

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Generating…';
    try {
      const result = await api.generateQuest(domainSelect.value, kindSelect.value);
      controller.close();
      toast('Quest generated', result.quest.title, 'success');
      await refreshQuests();
      navigate('/quests?status=open');
    } catch (error) {
      toast('Could not generate', error.message, 'error', 7000);
      button.disabled = false;
      button.textContent = 'Generate';
    }
  });
}

function openCustomModal(snapshot) {
  const title = el('input', { class: 'input', name: 'title', placeholder: 'Build my first website' });
  const description = el('textarea', {
    class: 'textarea', name: 'description',
    placeholder: 'What is the objective, and what does finished look like?',
  });
  const domain = el('select', { class: 'select' },
    el('option', { value: 'passion', text: 'Passion' }),
    el('option', { value: 'academic', text: 'Academic' }),
    el('option', { value: 'physical', text: 'Physical' }));
  const kind = el('select', { class: 'select' },
    el('option', { value: 'daily', text: 'Daily' }),
    el('option', { value: 'weekly', text: 'Weekly' }),
    el('option', { value: 'milestone', text: 'Milestone' }));
  const difficulty = el('input', { class: 'input', type: 'number', min: '1', max: '5', value: '3' });
  const minutes = el('input', { class: 'input', type: 'number', min: '5', max: '1200', value: '60' });
  const reviewBox = el('div', { class: 'card card--tight', hidden: true });

  const reviewButton = el('button', { class: 'btn btn--ghost', text: 'Ask VERA to review' });
  const createButton = el('button', { class: 'btn btn--primary', text: 'Create quest' });

  const spec = () => ({
    title: title.value.trim(),
    description: description.value.trim(),
    domain: domain.value,
    kind: kind.value,
    difficulty: Number(difficulty.value) || 3,
    estimatedTime: Number(minutes.value) || 60,
  });

  const controller = modal({
    title: 'Create a quest',
    body: el('div', { class: 'stack' },
      field('Title', title),
      field('Objective', description),
      el('div', { class: 'grid grid--3' },
        field('Domain', domain), field('Class', kind)),
      el('div', { class: 'grid grid--3' },
        field('Difficulty (1–5)', difficulty), field('Estimated minutes', minutes)),
      reviewBox),
    actions: el('div', { class: 'row', style: { width: '100%', justifyContent: 'flex-end' } },
      reviewButton, createButton),
  });

  reviewButton.addEventListener('click', async () => {
    reviewButton.disabled = true;
    try {
      const review = await api.reviewCustomQuest(spec());
      reviewBox.hidden = false;
      reviewBox.replaceChildren(
        el('div', { class: 'card__title', text: 'VERA’s review' }),
        el('p', { style: { margin: 0 }, text: review.message }),
        ...(review.phases || []).map((phase) =>
          el('p', { class: 'muted', style: { margin: '6px 0 0' },
                    text: `${phase.name}: ${phase.description}` })));
    } catch (error) {
      toast('Review failed', error.message, 'error');
    }
    reviewButton.disabled = false;
  });

  createButton.addEventListener('click', async () => {
    createButton.disabled = true;
    try {
      const result = await api.createCustomQuest(spec());
      controller.close();
      toast('Quest created',
        result.quests.length > 1
          ? `Split into ${result.quests.length} phases: ${result.review.message}`
          : result.quests[0].title, 'success', 7000);
      await refreshQuests();
      navigate('/quests?status=open');
    } catch (error) {
      toast('Not created', error.message, 'error', 8000);
      createButton.disabled = false;
    }
  });
}
