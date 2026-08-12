// SKILLS — the skill tree and the level-milestone ladder.

import { api } from '../api.js';
import { chip, el, DOMAIN_LABEL, DOMAIN_ICON } from '../ui.js';

const TIER_NAME = { 1: 'Foundation', 2: 'Development', 3: 'Specialisation', 4: 'Mastery' };

function skillNode(node) {
  const wrap = el('article', {
    class: `node ${node.unlocked ? 'node--unlocked' : 'node--locked'}`,
    dataset: { domain: node.domain },
    tabindex: '0',
    'aria-label': `${node.name}. ${node.unlocked ? 'Unlocked' : 'Locked'}. ${node.description}`,
  },
    el('div', { class: 'node__name', text: node.name }),
    el('p', { class: 'node__desc', style: { margin: 0 }, text: node.description }));

  const effect = node.effect || {};
  if (effect.type === 'xp_bonus') {
    wrap.append(chip(`+${Math.round(effect.value * 100)}% ${effect.domain} XP`, node.domain));
  } else if (effect.type === 'unlock_tag') {
    wrap.append(chip(`Unlocks ${effect.tag} quests`, node.domain));
  } else if (effect.type === 'quest_slot') {
    wrap.append(chip(`+${effect.value} daily quest slot`, node.domain));
  } else if (effect.type === 'quality_floor') {
    wrap.append(chip('Raises minimum quality credit', node.domain));
  }

  if (!node.unlocked) {
    wrap.append(el('div', { class: 'node__req' },
      ...node.blockers.map((b, i) => el('div', { text: `${i ? '· ' : ''}${b}` }))));
  }
  return wrap;
}

export async function skillsView() {
  const data = await api.skills();
  const byDomain = { physical: [], academic: [], passion: [] };
  for (const node of data.tree) byDomain[node.domain].push(node);

  const container = el('div', { class: 'stack', style: { gap: '24px' } },
    el('div', { class: 'page-head' },
      el('div', {},
        el('h1', { text: 'Skill tree' }),
        el('p', { text: 'Skills unlock from levels and from quests actually completed in that domain. Every node does something — XP bonuses, new quest archetypes, extra daily slots.' })),
      chip(`Level ${data.level}`, 'xp')));

  for (const domain of ['physical', 'academic', 'passion']) {
    const nodes = byDomain[domain];
    const unlocked = nodes.filter((n) => n.unlocked).length;
    const section = el('section', { class: 'card tree__domain' },
      el('div', { class: 'card__head' },
        el('h2', { class: 'card__title', text: `${DOMAIN_ICON[domain]} ${DOMAIN_LABEL[domain]}` }),
        chip(`${unlocked}/${nodes.length} unlocked`, domain)));

    for (const tier of [1, 2, 3, 4]) {
      const tierNodes = nodes.filter((n) => n.tier === tier);
      if (!tierNodes.length) continue;
      section.append(
        el('div', { class: 'tier-label', text: `Tier ${tier} — ${TIER_NAME[tier]}` }),
        el('div', { class: 'tree__tiers' }, ...tierNodes.map(skillNode)));
    }
    container.append(section);
  }

  container.append(el('section', { class: 'card' },
    el('div', { class: 'card__head' },
      el('h2', { class: 'card__title', text: 'Level milestones' })),
    el('div', { class: 'grid grid--3' },
      ...data.milestones.map((milestone) => {
        const unlocked = data.unlockedMilestones.includes(milestone.key);
        return el('div', { class: `card card--tight${unlocked ? '' : ' node--locked'}` },
          el('div', { class: 'row row--between' },
            el('b', { text: milestone.name }),
            chip(`Lv ${milestone.level}`, unlocked ? 'success' : undefined)),
          el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' },
                    text: milestone.description }));
      }))));

  return container;
}
