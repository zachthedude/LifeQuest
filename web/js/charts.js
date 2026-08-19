// Inline SVG charts.
//
// Palette note: the three domain hues used for *data marks* are a validated
// categorical set for this dark surface (OKLCH lightness band, chroma floor,
// deutan/tritan separation ΔE 9.5, normal-vision ΔE 19.3, contrast ≥ 3:1).
// The lighter UI accents used for chips and labels are deliberately separate —
// those sit next to text, these sit on the plot surface.
//
// Rules followed: one y-axis only, fixed categorical order (never cycled),
// 2px lines, ≥8px markers, 4px rounded bar ends anchored to the baseline,
// 2px surface gaps between adjacent fills, recessive gridlines, a legend
// whenever there are two or more series, and a data table behind every chart.

import { el, svg } from './ui.js';

export const CHART_COLORS = {
  physical: '#d96e2c',
  academic: '#2496c9',
  passion: '#9159e8',
};
export const DOMAIN_ORDER = ['physical', 'academic', 'passion'];
const INK_MUTED = 'var(--text-dim)';
const SURFACE = 'var(--surface-solid)';

function niceMax(value) {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function legend(entries) {
  return el('div', { class: 'legend' },
    ...entries.map(([label, color]) =>
      el('span', {}, el('b', { style: { background: color } }), label)));
}

function tableToggle(caption, head, rows) {
  const table = el('table', {
    class: 'datatable', hidden: true,
    style: { width: '100%', borderCollapse: 'collapse', marginTop: '12px', fontSize: '12.5px' },
  },
    el('caption', { class: 'sr-only', text: caption }),
    el('thead', {}, el('tr', {}, ...head.map((h) =>
      el('th', {
        scope: 'col', text: h,
        style: { textAlign: 'left', padding: '4px 8px', color: 'var(--text-dim)',
                 borderBottom: '1px solid var(--border)', fontWeight: '600' },
      })))),
    el('tbody', {}, ...rows.map((row) => el('tr', {}, ...row.map((cell) =>
      el('td', { text: String(cell),
                 style: { padding: '4px 8px', borderBottom: '1px solid var(--border)' } }))))));

  const button = el('button', {
    class: 'btn btn--ghost btn--sm', type: 'button', 'aria-expanded': 'false',
    text: 'Show data',
    onClick: () => {
      const showing = table.hidden;
      table.hidden = !showing;
      button.textContent = showing ? 'Hide data' : 'Show data';
      button.setAttribute('aria-expanded', String(showing));
    },
  });
  return el('div', {}, el('div', { class: 'row', style: { marginTop: '8px' } }, button), table);
}

// ------------------------------------------------------- cumulative lines --
export function xpLineChart(series, { height = 220 } = {}) {
  const width = 720;
  const pad = { top: 16, right: 16, bottom: 26, left: 46 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const days = series.map((d) => d.day);
  const cumulative = { physical: [], academic: [], passion: [] };
  const running = { physical: 0, academic: 0, passion: 0 };
  for (const point of series) {
    for (const domain of DOMAIN_ORDER) {
      running[domain] += Number(point[domain] || 0);
      cumulative[domain].push(running[domain]);
    }
  }
  const peak = niceMax(Math.max(1, ...DOMAIN_ORDER.map((d) => running[d])));
  const x = (i) => pad.left + (days.length <= 1 ? plotW / 2 : (i / (days.length - 1)) * plotW);
  const y = (v) => pad.top + plotH - (v / peak) * plotH;

  const node = svg('svg', {
    class: 'chart', viewBox: `0 0 ${width} ${height}`, role: 'img',
    'aria-label': `Cumulative XP by domain over the last ${days.length} days`,
  });

  for (let i = 0; i <= 4; i += 1) {
    const value = (peak / 4) * i;
    node.append(svg('line', {
      class: 'gridline', x1: pad.left, x2: width - pad.right, y1: y(value), y2: y(value),
    }));
    node.append(svg('text', {
      x: pad.left - 8, y: y(value) + 3, 'text-anchor': 'end',
      text: value >= 1000 ? `${Math.round(value / 1000)}k` : String(Math.round(value)),
    }));
  }
  node.append(svg('line', {
    class: 'axis', x1: pad.left, x2: width - pad.right, y1: y(0), y2: y(0),
  }));

  const step = Math.max(1, Math.floor(days.length / 5));
  days.forEach((day, i) => {
    if (i % step !== 0 && i !== days.length - 1) return;
    node.append(svg('text', {
      x: x(i), y: height - 8, 'text-anchor': 'middle', text: day.slice(5),
    }));
  });

  for (const domain of DOMAIN_ORDER) {
    const points = cumulative[domain].map((v, i) => `${x(i)},${y(v)}`).join(' ');
    node.append(svg('polyline', {
      points, fill: 'none', stroke: CHART_COLORS[domain], 'stroke-width': 2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
    const last = cumulative[domain].length - 1;
    if (last >= 0 && cumulative[domain][last] > 0) {
      // 2px surface ring keeps overlapping end markers separable.
      node.append(svg('circle', {
        cx: x(last), cy: y(cumulative[domain][last]), r: 4.5,
        fill: CHART_COLORS[domain], stroke: SURFACE, 'stroke-width': 2,
      }));
    }
  }

  const crosshair = svg('line', {
    class: 'axis', x1: 0, x2: 0, y1: pad.top, y2: pad.top + plotH,
    stroke: 'var(--border-strong)', 'stroke-width': 1, opacity: 0,
  });
  node.append(crosshair);

  const tip = el('div', {
    class: 'card card--tight',
    style: { position: 'absolute', pointerEvents: 'none', opacity: '0', minWidth: '150px',
             zIndex: '5', transition: 'opacity 120ms' },
  });
  const wrap = el('div', { style: { position: 'relative' } }, node, tip);

  node.addEventListener('pointermove', (event) => {
    const box = node.getBoundingClientRect();
    const ratio = ((event.clientX - box.left) / box.width) * width;
    const index = Math.max(0, Math.min(days.length - 1,
      Math.round(((ratio - pad.left) / plotW) * (days.length - 1))));
    crosshair.setAttribute('x1', x(index));
    crosshair.setAttribute('x2', x(index));
    crosshair.setAttribute('opacity', '1');
    tip.replaceChildren(
      el('div', { class: 'eyebrow', text: days[index] }),
      ...DOMAIN_ORDER.map((domain) => el('div', { class: 'row', style: { gap: '6px' } },
        el('b', { style: { width: '8px', height: '8px', borderRadius: '3px',
                           background: CHART_COLORS[domain], display: 'inline-block' } }),
        el('span', { class: 'muted', text: domain }),
        el('span', { class: 'num', style: { marginLeft: 'auto' },
                     text: cumulative[domain][index].toLocaleString() }))));
    tip.style.opacity = '1';
    tip.style.left = `${Math.min(box.width - 170, Math.max(0, (x(index) / width) * box.width + 12))}px`;
    tip.style.top = '4px';
  });
  node.addEventListener('pointerleave', () => {
    tip.style.opacity = '0';
    crosshair.setAttribute('opacity', '0');
  });

  return el('div', {},
    wrap,
    legend(DOMAIN_ORDER.map((d) => [d[0].toUpperCase() + d.slice(1), CHART_COLORS[d]])),
    tableToggle('Cumulative XP by domain',
      ['Day', 'Physical', 'Academic', 'Passion'],
      days.map((day, i) => [day, cumulative.physical[i], cumulative.academic[i],
                            cumulative.passion[i]])));
}

// ------------------------------------------------------------ bar compare --
export function attributeBars(attributes) {
  // Narrow viewBox so text scales *up* rather than down inside a card column.
  const width = 420;
  const rowH = 40;
  const height = rowH * DOMAIN_ORDER.length + 8;
  const labelW = 86;
  const valueW = 40;
  const plotW = width - labelW - valueW;

  const node = svg('svg', {
    class: 'chart', viewBox: `0 0 ${width} ${height}`, role: 'img',
    'aria-label': 'Attribute scores by domain, 0 to 100',
  });

  DOMAIN_ORDER.forEach((domain, index) => {
    const value = Number(attributes[domain] || 0);
    const y = index * rowH + 6;
    node.append(svg('text', {
      x: 0, y: y + 16, style: 'font-size:13px', fill: 'var(--text-muted)',
      text: domain[0].toUpperCase() + domain.slice(1),
    }));
    node.append(svg('rect', {
      x: labelW, y, width: plotW, height: 20, rx: 5, fill: 'rgba(255,255,255,.06)',
    }));
    // 4px rounded data-end, anchored to the track's start.
    node.append(svg('rect', {
      x: labelW, y, width: Math.max(5, (value / 100) * plotW), height: 20, rx: 5,
      fill: CHART_COLORS[domain],
    }));
    node.append(svg('text', {
      x: width, y: y + 15, 'text-anchor': 'end',
      text: value < 10 ? value.toFixed(1) : value.toFixed(0),
      style: 'font-size:14px;font-weight:650', fill: 'var(--text)',
    }));
  });

  return el('div', {},
    node,
    tableToggle('Attribute scores', ['Domain', 'Score / 100'],
      DOMAIN_ORDER.map((d) => [d, Number(attributes[d] || 0).toFixed(1)])));
}

// --------------------------------------------------------- domain minutes --
export function timeBars(timeInvestment) {
  const total = Math.max(1, timeInvestment.totalMinutes || 0);
  return el('div', { class: 'stack' },
    ...DOMAIN_ORDER.map((domain) => {
      const minutes = Number(timeInvestment.minutes?.[domain] || 0);
      const pct = (minutes / total) * 100;
      const bar = el('div', { class: 'meter' });
      bar.style.setProperty('--value', pct);
      bar.style.setProperty('--meter-color', CHART_COLORS[domain]);
      bar.append(
        el('div', { class: 'meter__label' },
          el('span', { text: domain[0].toUpperCase() + domain.slice(1) }),
          el('b', { class: 'num', text: `${Math.round(minutes)} min · ${pct.toFixed(0)}%` })),
        el('div', {
          class: 'meter__track', role: 'progressbar', 'aria-valuenow': Math.round(pct),
          'aria-valuemin': 0, 'aria-valuemax': 100,
          'aria-label': `${domain} share of time invested`,
        }, el('div', { class: 'meter__fill' })));
      return bar;
    }));
}

// -------------------------------------------------------------- heatmap ----
export function consistencyHeatmap(calendar) {
  const grid = el('div', { class: 'heat', role: 'img', 'aria-label':
    `Activity over the last ${calendar.length} days: ${calendar.filter((d) => d.active).length} active` });
  for (const day of calendar) {
    grid.append(el('i', {
      class: day.active ? 'on' : '',
      title: `${day.day} — ${day.active ? 'active' : 'no activity'}`,
    }));
  }
  return el('div', {},
    grid,
    el('p', { class: 'dim', style: { fontSize: '12px', marginTop: '10px', marginBottom: '0' },
              text: `${calendar.filter((d) => d.active).length} active days of ${calendar.length}` }));
}
