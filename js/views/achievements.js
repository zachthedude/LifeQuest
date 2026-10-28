// ACHIEVEMENTS — the trophy case.

import { api } from '../api.js';
import { chip, el, meter, relativeTime, rich } from '../ui.js';
import { icon } from '../components/icons.js';

const TIER_ORDER = { platinum: 0, gold: 1, silver: 2, bronze: 3 };

export async function achievementsView() {
  const data = await api.achievements();
  const sorted = [...data.achievements].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    return (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9);
  });

  return el('div', { class: 'stack', style: { gap: '22px' } },
    el('div', { class: 'page-head' },
      el('div', {},
        el('h1', { text: 'Achievements' }),
        el('p', {}, ...rich('Milestones that mark real change, not activity.',
          [['real change', 'strong'], ['activity', null]]))),
      chip(`${data.unlocked} of ${data.total}`, 'xp')),

    el('section', { class: 'card' },
      meter((data.unlocked / data.total) * 100, 'xp', 'Collection',
        `${Math.round((data.unlocked / data.total) * 100)}%`)),

    el('div', { class: 'grid grid--2' },
      ...sorted.map((achievement) => el('article', {
        class: `ach ach--${achievement.tier}${achievement.unlocked ? '' : ' ach--locked'}`,
        'aria-label': `${achievement.name}. ${achievement.unlocked ? 'Unlocked' : 'Locked'}.`,
      },
        // Locked tiles show a padlock; unlocked ones show their own mark. The
        // level achievements carry a Roman numeral instead of a picture, because
        // "XXV" says level 25 better than any drawing of a medal could.
        el('div', { class: 'ach__icon', 'aria-hidden': 'true' },
          !achievement.unlocked ? icon('lock', { size: 22 })
            : achievement.numeral
              ? el('span', { class: 'ach__numeral', text: achievement.numeral })
              : icon(achievement.icon, { size: 22 })),
        el('div', {},
          el('div', { class: 'row', style: { gap: '8px' } },
            el('span', { class: 'ach__name', text: achievement.name }),
            chip(achievement.tier)),
          el('p', { class: 'ach__desc', style: { margin: '2px 0 0' }, text: achievement.description }),
          el('p', { class: 'dim', style: { margin: '4px 0 0', fontSize: '12px' },
                    text: achievement.unlocked
                      ? `Unlocked ${relativeTime(achievement.unlockedAt)}`
                      : achievement.requirement }))))));
}
