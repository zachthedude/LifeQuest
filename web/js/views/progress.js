// PROGRESS — analytics: XP over time, balance, consistency, performance, time.

import { api } from '../api.js';
import { attributeBars, consistencyHeatmap, timeBars, xpLineChart } from '../charts.js';
import { chip, el, emptyState, formatMinutes, formatNumber, meter, DOMAIN_LABEL } from '../ui.js';

export async function progressView() {
  const report = await api.progress();
  const snapshot = report.snapshot;
  const hasData = report.xpOverTime.some((d) => d.total > 0);

  const container = el('div', { class: 'stack', style: { gap: '22px' } },
    el('div', { class: 'page-head' },
      el('div', {},
        el('h1', { text: 'Progress' }),
        el('p', { text: 'How you are actually improving — not how busy you have been.' })),
      el('div', { class: 'row' },
        chip(`Level ${snapshot.level}`, 'xp'),
        chip(`${formatNumber(snapshot.xp.xpTotal)} XP total`))));

  if (!hasData) {
    container.append(emptyState('📊', 'No data to analyse yet',
      'Complete and verify a few quests and this screen fills in: XP over time, domain balance, consistency, success rates and where your hours actually go.',
      el('a', { class: 'btn btn--primary', href: '#/quests', text: 'Go to quests' })));
    return container;
  }

  container.append(el('section', { class: 'card' },
    el('div', { class: 'card__head' },
      el('h2', { class: 'card__title', text: 'Cumulative XP by domain — last 30 days' })),
    xpLineChart(report.xpOverTime)));

  container.append(el('div', { class: 'grid grid--2' },
    el('section', { class: 'card' },
      el('div', { class: 'card__head' },
        el('h2', { class: 'card__title', text: 'Domain balance' })),
      attributeBars(report.domainBalance.attributes),
      el('p', { class: 'dim', style: { fontSize: '12.5px', marginTop: '10px', marginBottom: 0 },
                text: `Share of XP — physical ${report.domainBalance.share.physical}%, academic ${report.domainBalance.share.academic}%, passion ${report.domainBalance.share.passion}%` })),

    el('section', { class: 'card' },
      el('div', { class: 'card__head' },
        el('h2', { class: 'card__title', text: 'Consistency — last 28 days' }),
        chip(`${Math.round(report.consistency.score)}%`, report.consistency.score >= 60 ? 'success' : 'warn')),
      consistencyHeatmap(report.consistency.calendar),
      el('div', { class: 'stack', style: { marginTop: '14px', gap: '8px' } },
        ...report.consistency.weekly.map((week) =>
          meter(week.rate, 'xp', `Week of ${week.weekStart}`, `${week.activeDays}/7 days`))))));

  container.append(el('div', { class: 'grid grid--2' },
    el('section', { class: 'card' },
      el('div', { class: 'card__head' },
        el('h2', { class: 'card__title', text: 'Quest performance' })),
      el('div', { class: 'stack' },
        ...['physical', 'academic', 'passion'].map((domain) => {
          const stats = report.questPerformance[domain] || { attempts: 0 };
          return el('div', { class: 'card card--tight' },
            el('div', { class: 'row row--between' },
              el('b', { text: DOMAIN_LABEL[domain] }),
              stats.successRate === null || stats.successRate === undefined
                ? chip('Not enough data')
                : chip(`${stats.successRate}% verified`,
                  stats.successRate >= 80 ? 'success' : stats.successRate >= 50 ? undefined : 'warn')),
            el('div', { class: 'quest__meta', style: { marginTop: '6px' } },
              el('span', { text: `${stats.verified || 0} verified` }),
              el('span', { text: `${stats.needs_info || 0} needed detail` }),
              el('span', { text: `${stats.rejected || 0} rejected` }),
              el('span', { text: `${stats.abandoned || 0} dropped` })));
        }))),

    el('section', { class: 'card' },
      el('div', { class: 'card__head' },
        el('h2', { class: 'card__title', text: 'Time invested — last 30 days' }),
        chip(`${report.timeInvestment.hours}h`)),
      report.timeInvestment.totalMinutes
        ? timeBars(report.timeInvestment)
        : el('p', { class: 'dim', style: { margin: 0 },
                    text: 'Log minutes with your proof and this fills in.' }),
      el('p', { class: 'dim', style: { fontSize: '12.5px', marginTop: '12px', marginBottom: 0 },
                text: `Total ${formatMinutes(report.timeInvestment.totalMinutes)} across ${report.timeInvestment.windowDays} days.` }))));

  if (report.skillDevelopment.length || report.levelHistory.length) {
    container.append(el('div', { class: 'grid grid--2' },
      el('section', { class: 'card' },
        el('div', { class: 'card__head' },
          el('h2', { class: 'card__title', text: 'Skill development' })),
        report.skillDevelopment.length
          ? el('div', { class: 'stack', style: { gap: '8px' } },
            ...report.skillDevelopment.map((skill) =>
              el('div', { class: 'row row--between' },
                el('span', {}, chip(DOMAIN_LABEL[skill.domain], skill.domain), ' ',
                  el('span', { text: skill.name })),
                el('span', { class: 'dim num', text: (skill.unlocked_at || '').slice(0, 10) }))))
          : el('p', { class: 'dim', style: { margin: 0 }, text: 'No skills unlocked yet.' })),

      el('section', { class: 'card' },
        el('div', { class: 'card__head' },
          el('h2', { class: 'card__title', text: 'Level history' })),
        report.levelHistory.length
          ? el('div', { class: 'stack', style: { gap: '8px' } },
            ...report.levelHistory.slice(-10).reverse().map((entry) =>
              el('div', { class: 'row row--between' },
                el('b', { text: `Level ${entry.level}` }),
                el('span', { class: 'dim num', text: `${entry.day} · ${formatNumber(entry.xpTotal)} XP` }))))
          : el('p', { class: 'dim', style: { margin: 0 }, text: 'Still on level 1.' }))));
  }

  if (report.insights.length) {
    container.append(el('section', { class: 'card' },
      el('div', { class: 'card__head' },
        el('h2', { class: 'card__title', text: 'What this means' })),
      el('div', { class: 'stack' }, ...report.insights.map((insight) =>
        el('div', { class: 'card card--tight' },
          el('div', { class: 'row' },
            insight.domain ? chip(DOMAIN_LABEL[insight.domain], insight.domain) : chip(insight.type),
            el('b', { text: insight.title })),
          el('p', { class: 'muted', style: { margin: '6px 0 0' }, text: insight.body }))))));
  }

  return container;
}
