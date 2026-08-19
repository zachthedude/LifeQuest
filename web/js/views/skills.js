// SKILLS — the skill tree, drawn as a tree.
//
// The data was always a tree: every skill names its parents in `requires`, and
// every skill has a level it becomes reachable at. The old screen threw both
// away and printed four rows of cards per domain, so the shape of the thing —
// what grows out of what, and how far off it is — had to be reconstructed by
// reading requirement text.
//
// So it is drawn literally. Height is level: the roots sit at level 1 below the
// ground line, the trunk carries the level milestones as growth rings, three
// limbs (one per domain) leave the trunk and fork exactly where the real
// prerequisites fork, and the crown above the last ring is what is left after
// level 100. Everything at or below the player's current level is grown and in
// its domain's colour; everything above it is bare wood.
//
// The drawing is an enhancement, not the content: every node is also a real,
// focusable control with its full text underneath, and the per-domain lists are
// still there below the tree. A screen reader gets the list; a mouse gets both.

import { api } from '../api.js';
import { chip, el, svg, DOMAIN_LABEL, DOMAIN_ICON } from '../ui.js';

const TIER_NAME = { 1: 'Foundation', 2: 'Development', 3: 'Specialisation', 4: 'Mastery' };
const DOMAINS = ['physical', 'academic', 'passion'];

// The canvas the tree is drawn in. Everything below is in these coordinates and
// scales with the viewport through the viewBox.
const W = 960;
const H = 1120;
const GROUND = 940;          // the soil line
const CROWN = 190;           // where level 100 sits; the canopy is above it
const TRUNK_X = W / 2;

// Where each domain's limb lives, as a fraction of the width. Academic runs up
// the middle — in a real tree that is the leader, and it is also the domain with
// the most nodes, so it gets the straightest run.
const BAND = { physical: 0.20, academic: 0.5, passion: 0.80 };

/**
 * Height for a level. Deliberately not linear: two thirds of the tree's nodes
 * sit between levels 1 and 22, and a linear scale piles them all into the
 * bottom fifth of the drawing.
 */
function yFor(level) {
  const t = Math.min(1, Math.max(0, (Number(level) || 1) / 100)) ** 0.55;
  return GROUND - (GROUND - CROWN) * t;
}

/** A cubic bezier that leaves its start vertically — how a branch actually goes. */
function branchPath(x1, y1, x2, y2) {
  const lift = Math.max(40, Math.abs(y1 - y2) * 0.55);
  return `M ${x1} ${y1} C ${x1} ${y1 - lift}, ${x2} ${y2 + lift}, ${x2} ${y2}`;
}

/**
 * Position every node: y from the level it needs, x fanned out inside its
 * domain's band so siblings at the same level do not stack.
 */
function layout(nodes) {
  const placed = new Map();
  for (const domain of DOMAINS) {
    const mine = nodes.filter((node) => node.domain === domain);
    // Cluster by proximity in *height*, not by level and not by a fixed grid:
    // levels 20 and 22 land a few pixels apart, and any bucketing scheme will
    // sooner or later put two of those on opposite sides of a boundary and then
    // draw them on top of each other. Walking the sorted list is exact.
    const sorted = [...mine].sort((a, b) => a.levelRequired - b.levelRequired);
    const clusters = [];
    for (const node of sorted) {
      const y = yFor(node.levelRequired);
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(y - last[0].y) < 46) last.push({ node, y });
      else clusters.push([{ node, y }]);
    }

    let alternate = 0;
    for (const cluster of clusters) {
      cluster.forEach((entry, index) => {
        const spread = 78 + (entry.node.tier - 1) * 24;
        let x;
        if (domain === 'academic') {
          // The leader. Its buds alternate left and right of the trunk rather
          // than fanning symmetrically through it — a fan puts the middle node
          // straight on the trunk, on top of the growth rings and their labels.
          alternate += 1;
          const side = alternate % 2 === 0 ? 1 : -1;
          x = TRUNK_X + side * (112 + (entry.node.tier - 1) * 26 + index * 96);
        } else {
          const centre = W * BAND[domain];
          const offset = cluster.length === 1
            ? 0
            : (index - (cluster.length - 1) / 2) * spread * 2;
          x = centre + offset;
        }
        placed.set(entry.node.key, {
          node: entry.node,
          x: Math.max(76, Math.min(W - 76, x)),
          y: entry.y,
          // Neighbours alternate their label above and below the bud, so a pair
          // that is still close horizontally cannot write over each other.
          labelY: index % 2 === 0 ? 36 : -26,
        });
      });
    }
  }

  // One global pass: the three limbs are laid out independently, so nothing so
  // far stops a physical bud and an academic one at the same height from landing
  // on top of each other. Walk each band of equal height and push neighbours
  // apart until they clear.
  const all = [...placed.values()].sort((a, b) => a.y - b.y);
  const GAP = 124;
  for (let i = 0; i < all.length;) {
    let j = i;
    while (j + 1 < all.length && Math.abs(all[j + 1].y - all[i].y) < 46) j += 1;
    const band = all.slice(i, j + 1).sort((a, b) => a.x - b.x);
    // A crowded band cannot have the full gap and still fit, so the gap shrinks
    // to what the width allows rather than pushing buds off the drawing.
    const gap = Math.min(GAP, (W - 152) / Math.max(1, band.length - 1));
    for (let k = 1; k < band.length; k += 1) {
      if (band[k].x - band[k - 1].x < gap) band[k].x = band[k - 1].x + gap;
    }
    // Then slide the whole band back inside the frame — right edge first, then
    // left, because a band that has been pushed right can end up past both.
    const overflow = band[band.length - 1].x - (W - 76);
    if (overflow > 0) for (const spot of band) spot.x -= overflow;
    const underflow = 76 - band[0].x;
    if (underflow > 0) for (const spot of band) spot.x += underflow;
    i = j + 1;
  }
  return placed;
}

function nodeDetail(node) {
  const effect = node.effect || {};
  let effectText = null;
  if (effect.type === 'xp_bonus') effectText = `+${Math.round(effect.value * 100)}% ${effect.domain} XP`;
  else if (effect.type === 'unlock_tag') effectText = `Unlocks ${effect.tag} quests`;
  else if (effect.type === 'quest_slot') effectText = `+${effect.value} daily quest slot`;
  else if (effect.type === 'quality_floor') effectText = 'Raises minimum quality credit';

  return el('div', { class: 'grow__detail', dataset: { domain: node.domain } },
    el('div', { class: 'row row--between' },
      el('b', { class: 'grow__detailname', text: node.name }),
      chip(node.unlocked ? 'Grown' : `Level ${node.levelRequired}`,
        node.unlocked ? 'success' : node.domain)),
    el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13.5px' },
              text: node.description }),
    effectText ? el('p', { class: 'grow__effect', text: effectText }) : null,
    node.unlocked
      ? null
      : el('ul', { class: 'grow__blockers' },
        ...node.blockers.map((blocker) => el('li', { text: blocker }))));
}

/** The old card, kept for the per-domain lists under the drawing. */
function skillNode(node) {
  const wrap = el('article', {
    class: `node ${node.unlocked ? 'node--unlocked' : 'node--locked'}`,
    dataset: { domain: node.domain, skill: node.key },
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

/**
 * The drawing itself.
 *
 * @param {object[]} nodes       skill nodes from the API
 * @param {object[]} milestones  level milestones, for the growth rings
 * @param {number}   level       the player's level — the height growth reaches
 * @param {string[]} unlockedMilestones
 * @param {Function} onSelect
 */
function growTree(nodes, milestones, level, unlockedMilestones, onSelect) {
  const placed = layout(nodes);
  const reached = yFor(level);
  const grown = (y) => y >= reached - 0.5;      // lower on screen == lower level

  const roots = svg('g', { class: 'grow__roots', 'aria-hidden': 'true' });
  // Five roots, fanning down and out from the base of the trunk. They are the
  // level-1 end of the scale: the tree starts below the line, not at it.
  for (let i = 0; i < 5; i += 1) {
    const spread = (i - 2) / 2;
    const endX = TRUNK_X + spread * 210;
    const endY = GROUND + 92 + Math.abs(spread) * -26;
    roots.append(svg('path', {
      class: 'grow__root',
      d: `M ${TRUNK_X} ${GROUND - 10} C ${TRUNK_X + spread * 60} ${GROUND + 40}, `
        + `${endX - spread * 40} ${endY - 20}, ${endX} ${endY}`,
    }));
  }

  const trunk = svg('path', {
    class: 'grow__trunk',
    d: `M ${TRUNK_X - 15} ${GROUND} C ${TRUNK_X - 12} ${GROUND - 260}, `
      + `${TRUNK_X - 7} ${CROWN + 260}, ${TRUNK_X - 5} ${CROWN}`
      + ` L ${TRUNK_X + 5} ${CROWN} C ${TRUNK_X + 7} ${CROWN + 260}, `
      + `${TRUNK_X + 12} ${GROUND - 260}, ${TRUNK_X + 15} ${GROUND} Z`,
  });

  // The trunk fills up to the level reached, like sap rising.
  const trunkGrown = svg('rect', {
    class: 'grow__trunkfill', x: TRUNK_X - 15, y: reached,
    width: 30, height: Math.max(0, GROUND - reached),
  });

  const rings = svg('g', { class: 'grow__rings' });
  for (const milestone of milestones) {
    const y = yFor(milestone.level);
    const on = unlockedMilestones.includes(milestone.key);
    const ring = svg('g', {
      class: `grow__ring${on ? ' is-on' : ''}`,
      // The name is on the ring itself for anyone reading the drawing with a
      // screen reader rather than looking at it.
      role: 'listitem',
      'aria-label': `Level ${milestone.level}: ${milestone.name}. `
        + `${on ? 'Unlocked' : 'Locked'}.`,
    },
      svg('title', { text: `Level ${milestone.level} — ${milestone.name}` }),
      svg('ellipse', { class: 'grow__ringline', cx: TRUNK_X, cy: y, rx: 26, ry: 7 }),
      // The level only. The milestone's name lives on the ring's tooltip and in
      // the list below — printed here it runs straight through the academic
      // limb, which shares the middle of the drawing with the trunk.
      svg('text', { class: 'grow__ringlabel', x: TRUNK_X - 44, y: y + 4,
                    'text-anchor': 'end', text: `LV ${milestone.level}` }));
    rings.append(ring);
  }

  // Branches: parent → child where a prerequisite exists, trunk → node where the
  // skill is a foundation. This is the dependency graph, drawn.
  const branches = svg('g', { class: 'grow__branches', 'aria-hidden': 'true' });
  for (const [, spot] of placed) {
    const parents = spot.node.requires.length
      ? spot.node.requires.map((key) => placed.get(key)).filter(Boolean)
      : [null];
    for (const parent of parents) {
      const from = parent
        ? { x: parent.x, y: parent.y }
        : { x: TRUNK_X, y: yFor(1) };
      branches.append(svg('path', {
        class: `grow__branch${grown(spot.y) ? ' is-grown' : ''}`,
        'data-domain': spot.node.domain,
        d: branchPath(from.x, from.y, spot.x, spot.y),
      }));
    }
  }

  const buds = svg('g', { class: 'grow__buds', role: 'list' });
  for (const [key, spot] of placed) {
    const { node } = spot;
    const state = node.unlocked ? 'is-open' : (grown(spot.y) ? 'is-ready' : 'is-bare');
    const bud = svg('g', {
      class: `grow__bud ${state}`, 'data-domain': node.domain, 'data-skill': key,
      tabindex: '0', role: 'listitem',
      'aria-label': `${node.name}, ${DOMAIN_LABEL[node.domain]}, tier ${node.tier}. `
        + `${node.unlocked ? 'Grown.' : `Locked. ${node.blockers.join('. ')}.`}`,
      transform: `translate(${spot.x} ${spot.y})`,
    },
      svg('title', { text: `${node.name} — ${node.description}` }),
      svg('circle', { class: 'grow__budglow', r: 26 }),
      svg('circle', { class: 'grow__budring', r: 15 }),
      svg('circle', { class: 'grow__budcore', r: 7 }),
      svg('text', { class: 'grow__budlabel', y: spot.labelY, 'text-anchor': 'middle',
                    text: node.name }));

    const choose = () => {
      for (const other of buds.querySelectorAll('.grow__bud')) other.classList.remove('is-picked');
      bud.classList.add('is-picked');
      onSelect(node);
    };
    bud.addEventListener('click', choose);
    bud.addEventListener('focus', choose);
    bud.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        choose();
      }
    });
    buds.append(bud);
  }

  // The crown: what is left after the last ring. Bare until level 100, which is
  // the honest reading of a curve whose top is years away.
  const crown = svg('g', { class: `grow__crown${level >= 100 ? ' is-open' : ''}` },
    svg('title', { text: level >= 100 ? 'Master of Life' : 'Beyond level 100' }));
  for (let i = 0; i < 7; i += 1) {
    const angle = -Math.PI / 2 + (i - 3) * 0.32;
    const length = 120 + (3 - Math.abs(i - 3)) * 46;
    crown.append(svg('path', {
      class: 'grow__crownbranch',
      d: branchPath(TRUNK_X, CROWN, TRUNK_X + Math.cos(angle) * length,
        CROWN + Math.sin(angle) * length),
    }));
  }
  crown.append(svg('text', {
    class: 'grow__crownlabel', x: TRUNK_X, y: CROWN - 150, 'text-anchor': 'middle',
    text: level >= 100 ? 'Master of Life' : 'Level 100 and after',
  }));

  const ground = svg('g', { class: 'grow__ground', 'aria-hidden': 'true' },
    svg('line', { x1: 40, y1: GROUND, x2: W - 40, y2: GROUND }),
    svg('text', { class: 'grow__groundlabel', x: 46, y: GROUND + 26, text: 'LEVEL 1 — THE ROOTS' }));

  return svg('svg', {
    class: 'grow', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet',
    role: 'group', 'aria-label': 'Skill tree, drawn from roots at level 1 to the crown at level 100',
  }, roots, ground, trunk, trunkGrown, crown, branches, rings, buds);
}

export async function skillsView() {
  const data = await api.skills();
  const byDomain = { physical: [], academic: [], passion: [] };
  for (const node of data.tree) byDomain[node.domain].push(node);

  const detail = el('div', { class: 'grow__panel' },
    el('p', { class: 'dim', style: { margin: 0, fontSize: '13.5px' },
              text: 'Pick any bud on the tree to read what it does and what it needs.' }));

  const showDetail = (node) => {
    detail.replaceChildren(nodeDetail(node));
  };

  const container = el('div', { class: 'stack', style: { gap: '24px' } },
    el('div', { class: 'page-head' },
      el('div', {},
        el('h1', { text: 'Skill tree' }),
        el('p', { text: 'One tree, grown by level. The roots are level 1, each growth ring on '
          + 'the trunk is a milestone, the three limbs are your domains, and the crown is what '
          + 'is left after level 100. Skills open where their prerequisites fork.' })),
      chip(`Level ${data.level}`, 'xp')));

  container.append(el('section', { class: 'card grow__card' },
    el('div', { class: 'card__head' },
      el('h2', { class: 'card__title', text: 'Your tree' }),
      el('div', { class: 'row grow__legend' },
        ...DOMAINS.map((domain) => el('span', { class: 'grow__key', dataset: { domain } },
          el('i'), el('span', { text: DOMAIN_LABEL[domain] }))),
        chip(`${data.tree.filter((n) => n.unlocked).length}/${data.tree.length} grown`, 'success'))),
    el('div', { class: 'grow__stage' },
      growTree(data.tree, data.milestones, data.level, data.unlockedMilestones, showDetail),
      detail)));

  for (const domain of DOMAINS) {
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
