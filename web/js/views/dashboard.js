// HOME — character header, today's quests, guide nudge.

import { api } from '../api.js';
import { refreshQuests, state } from '../store.js';
import { navigate } from '../router.js';
import { DOMAIN_LABEL, blocks, chip, el, emptyState, formatNumber, meter, rich, toast } from '../ui.js';
import { questCard } from './questCard.js';

function attributeRow(label, value, variant) {
  return el('div', {},
    el('div', { class: 'meter__label' },
      el('span', { text: label }),
      el('b', { class: 'num', text: value < 10 ? value.toFixed(1) : value.toFixed(0) })),
    blocks(value, variant));
}

export function characterHero(snapshot) {
  const xp = snapshot.xp;
  const attrs = snapshot.attributes;
  return el('section', { class: 'card hero' },
    el('div', { class: 'hero__grid' },
      el('div', {},
        el('div', { class: 'eyebrow', text: snapshot.title }),
        el('div', { class: 'hero__level' },
          el('b', { class: 'num', text: String(snapshot.level) }),
          el('span', { class: 'hero__title', text: 'LEVEL' })),
        el('div', { class: 'hero__xp num',
                    text: xp.isMaxLevel
                      ? `${formatNumber(xp.xpTotal)} XP — maximum level`
                      : `${formatNumber(xp.xpIntoLevel)} / ${formatNumber(xp.xpForNextLevel)} XP to level ${snapshot.level + 1}` }),
        el('div', { style: { marginTop: '10px' } }, meter(xp.percent, 'xp')),
        el('div', { class: 'hero__stats' },
          el('div', { class: 'stat' },
            el('b', { class: 'num', text: `🔥 ${snapshot.streak.current}` }),
            el('span', { text: 'Day streak' })),
          el('div', { class: 'stat' },
            el('b', { class: 'num', text: `${Math.round(snapshot.streak.consistency)}%` }),
            el('span', { text: 'Consistency' })),
          el('div', { class: 'stat' },
            el('b', { class: 'num', text: String(snapshot.questCounts.verified) }),
            el('span', { text: 'Quests done' })),
          el('div', { class: 'stat' },
            el('b', { class: 'num', text: `${snapshot.achievementsUnlocked}/${snapshot.achievementsTotal}` }),
            el('span', { text: 'Achievements' })))),
      el('div', { class: 'stack', style: { gap: '12px' } },
        attributeRow('Physical', attrs.physical, 'physical'),
        attributeRow('Academic', attrs.academic, 'academic'),
        attributeRow('Passion', attrs.passion, 'passion'),
        attributeRow('Overall', attrs.overall, 'overall'))));
}

export async function dashboardView() {
  const [questData, guide] = await Promise.all([api.quests('open'), api.guide()]);
  const snapshot = questData.snapshot;
  const quests = questData.quests;
  const today = quests.filter((q) => q.kind === 'daily');
  const longer = quests.filter((q) => q.kind !== 'daily');

  const container = el('div', { class: 'stack', style: { gap: '22px' } });

  container.append(
    el('div', { class: 'page-head' },
      el('div', {},
        el('h1', { text: `Welcome back, ${state.user?.username || 'player'}` }),
        el('p', {}, ...rich('Real life is the game. Every quest below is an action you take in it.',
          [['Real life', 'passion'], ['an action you take', 'strong']]))),
      el('button', {
        class: 'btn btn--ghost', text: 'Generate today\'s quests',
        onClick: async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          button.textContent = 'Generating…';
          try {
            const result = await api.ensureDaily();
            await refreshQuests();
            toast(result.created.length ? 'Quests ready' : 'Already up to date',
              result.created.length
                ? `${result.created.length} new quest${result.created.length > 1 ? 's' : ''} generated.`
                : 'You already have today\'s set.', 'info');
            navigate('/');
          } catch (error) {
            toast('Could not generate', error.message, 'error');
            button.disabled = false;
            button.textContent = 'Generate today\'s quests';
          }
        },
      })),
    characterHero(snapshot));

  const todaySection = el('section', { class: 'stack' },
    el('div', { class: 'card__head' },
      el('h2', { class: 'card__title', text: "Today's quests" }),
      el('a', { class: 'dim', href: '#/quests', text: 'All quests →',
                style: { fontSize: '13px', textDecoration: 'none' } })));

  if (today.length) {
    todaySection.append(el('div', { class: 'grid grid--2' },
      ...today.map((quest) => questCard(quest, { onChanged: () => navigate('/') }))));
  } else {
    todaySection.append(emptyState('🗺️', 'No quests open today',
      'Generate a set and the engine will pick archetypes matched to your level, interests and recent history.',
      el('button', {
        class: 'btn btn--primary', text: 'Generate quests',
        onClick: async () => {
          await api.ensureDaily();
          await refreshQuests();
          navigate('/');
        },
      })));
  }
  container.append(todaySection);

  if (longer.length) {
    container.append(el('section', { class: 'stack' },
      el('h2', { class: 'card__title', text: 'Longer objectives' }),
      el('div', { class: 'grid grid--2' },
        ...longer.map((quest) => questCard(quest, { onChanged: () => navigate('/') })))));
  }

  const guideCard = el('section', { class: 'card' },
    el('div', { class: 'card__head' },
      el('h2', { class: 'card__title', text: `${guide.name} — your guide` }),
      el('a', { href: '#/guide', class: 'dim', style: { fontSize: '13px', textDecoration: 'none' },
                text: 'Open guide →' })),
    el('p', { text: guide.summary }),
    guide.recommendations.length
      ? el('ul', { class: 'rec-list' }, ...guide.recommendations.map((r) => el('li', { text: r })))
      : null);
  container.append(guideCard);

  if (questData.chains?.length) {
    container.append(el('section', { class: 'stack' },
      el('h2', { class: 'card__title', text: 'Active questlines' }),
      el('div', { class: 'grid grid--2' }, ...questData.chains.map((chain) =>
        el('article', { class: 'card' },
          el('div', { class: 'row row--between' },
            el('h3', { text: chain.name }),
            chip(`${chain.step}/${chain.totalSteps}`, chain.status === 'complete' ? 'success' : undefined)),
          el('p', { class: 'muted', text: chain.description }),
          meter((chain.step / chain.totalSteps) * 100, chain.domain),
          el('ol', { class: 'rec-list', style: { marginTop: '10px' } },
            ...chain.steps.map((step) => el('li', {
              class: step.done ? 'dim' : '',
              text: `${step.done ? '✓ ' : ''}${step.title}`,
            }))))))));
  }

  return container;
}
