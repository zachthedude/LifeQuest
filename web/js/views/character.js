// CHARACTER — the full profile sheet.

import { api } from '../api.js';
import {
  chip, el, emptyState, formatNumber, meter, relativeTime, DOMAIN_LABEL,
} from '../ui.js';
import { characterHero } from './dashboard.js';
import { attributeBars } from '../charts.js';

export async function characterView() {
  const [player, achievements, skills, paths, history] = await Promise.all([
    api.player(), api.achievements(), api.skills(), api.paths(), api.quests('verified'),
  ]);
  const snapshot = player.snapshot;
  const unlockedSkills = skills.tree.filter((n) => n.unlocked);
  const unlockedAchievements = achievements.achievements.filter((a) => a.unlocked);

  return el('div', { class: 'stack', style: { gap: '22px' } },
    el('div', { class: 'page-head' },
      el('div', {},
        el('h1', { text: player.model.display_name || player.username }),
        el('p', { text: `${snapshot.title} · member since ${(player.memberSince || '').slice(0, 10)}` })),
      el('div', { class: 'row' },
        chip(`Level ${snapshot.level}`, 'xp'),
        chip(`${formatNumber(snapshot.xp.xpTotal)} XP`))),

    characterHero(snapshot),

    el('div', { class: 'grid grid--2' },
      el('section', { class: 'card' },
        el('div', { class: 'card__head' }, el('h2', { class: 'card__title', text: 'Attributes' })),
        attributeBars(snapshot.attributes),
        el('div', { class: 'grid grid--3', style: { marginTop: '14px' } },
          ...['physical', 'academic', 'passion'].map((domain) =>
            el('div', {},
              el('div', { class: 'eyebrow', text: DOMAIN_LABEL[domain] }),
              el('b', { class: 'num', text: formatNumber(snapshot.domainXp[domain]) }),
              el('span', { class: 'dim', text: ' XP' }))))),

      el('section', { class: 'card' },
        el('div', { class: 'card__head' }, el('h2', { class: 'card__title', text: 'Progression' })),
        el('div', { class: 'stack' },
          meter(snapshot.xp.percent, 'xp', `Level ${snapshot.level} → ${snapshot.level + 1}`,
            `${formatNumber(snapshot.xp.xpIntoLevel)}/${formatNumber(snapshot.xp.xpForNextLevel)}`),
          el('div', { class: 'row row--between' },
            el('span', { class: 'muted', text: 'Daily XP cap' }),
            el('b', { class: 'num', text: formatNumber(snapshot.dailyCap) })),
          el('div', { class: 'row row--between' },
            el('span', { class: 'muted', text: 'Best streak' }),
            el('b', { class: 'num',
                      text: `${snapshot.streak.best} day${snapshot.streak.best === 1 ? '' : 's'}` })),
          el('div', { class: 'row row--between' },
            el('span', { class: 'muted', text: 'Skills unlocked' }),
            el('b', { class: 'num', text: `${unlockedSkills.length}/${skills.tree.length}` })),
          snapshot.milestones.next
            ? el('div', { class: 'card card--tight' },
              el('div', { class: 'card__title', text: 'Next milestone' }),
              el('b', { text: `Level ${snapshot.milestones.next.level} — ${snapshot.milestones.next.name}` }),
              el('p', { class: 'muted', style: { margin: '4px 0 0' },
                        text: snapshot.milestones.next.description }))
            : chip('Maximum level reached', 'success'))))
    ,

    el('section', { class: 'card' },
      el('div', { class: 'card__head' },
        el('h2', { class: 'card__title', text: 'Titles & milestones' })),
      el('div', { class: 'row' },
        ...snapshot.milestones.unlocked.map((m) => chip(m.name, 'success')),
        ...(snapshot.milestones.unlocked.length ? [] : [el('span', { class: 'dim',
          text: 'No milestones unlocked yet — the first arrives at level 5.' })]))),

    el('section', { class: 'card' },
      el('div', { class: 'card__head' },
        el('h2', { class: 'card__title', text: 'Passion paths' }),
        el('a', { href: '#/quests', class: 'dim', style: { fontSize: '13px', textDecoration: 'none' },
                  text: 'Explore more →' })),
      paths.paths.length
        ? el('div', { class: 'grid grid--3' }, ...paths.paths.map((path) =>
          el('div', { class: 'card card--tight' },
            el('div', { class: 'row row--between' },
              el('b', { text: path.name }),
              chip(path.status, path.status === 'pursuing' ? 'success' : undefined)),
            meter(path.interest * 100, 'passion', 'Interest', `${Math.round(path.interest * 5)}/5`),
            el('p', { class: 'dim', style: { margin: '8px 0 0', fontSize: '12.5px' },
                      text: `${path.sessions} session${path.sessions === 1 ? '' : 's'}` }))))
        : emptyState('compass', 'No passion paths yet',
          'Complete an exploration quest and name the field you tried — paths you keep returning to graduate to "pursuing".')),

    el('section', { class: 'card' },
      el('div', { class: 'card__head' },
        el('h2', { class: 'card__title', text: 'Recent completions' })),
      history.quests.length
        ? el('div', { class: 'stack', style: { gap: '10px' } },
          ...history.quests.slice(0, 8).map((quest) =>
            el('div', { class: 'row row--between' },
              el('span', {},
                chip(DOMAIN_LABEL[quest.domain], quest.domain), ' ',
                el('span', { text: quest.title })),
              el('span', { class: 'dim num', text: relativeTime(quest.completedAt) }))))
        : emptyState('scroll', 'Nothing completed yet',
          'Your verified quests will build a history here.')),

    el('section', { class: 'card' },
      el('div', { class: 'card__head' },
        el('h2', { class: 'card__title', text: 'Achievements' }),
        el('a', { href: '#/achievements', class: 'dim',
                  style: { fontSize: '13px', textDecoration: 'none' }, text: 'View all →' })),
      unlockedAchievements.length
        ? el('div', { class: 'row' }, ...unlockedAchievements.map((a) => chip(`${a.icon} ${a.name}`, 'xp')))
        : el('p', { class: 'dim', style: { margin: 0 },
                    text: 'No achievements yet. "First Step" arrives with your first verified quest.' })));
}
