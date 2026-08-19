// SETTINGS — profile, personalisation inputs, accessibility, sound, account.

import { api } from '../api.js';
import { logout, savePreferences, state } from '../store.js';
import { sound } from '../effects.js';
import { themeChoice } from '../components/themeControl.js';
import { chip, el, field, formatNumber, toast } from '../ui.js';

function listInput(value) {
  return el('input', {
    class: 'input', value: (value || []).join(', '),
    placeholder: 'Comma separated',
  });
}

function toggle(label, hint, checked, onChange) {
  const input = el('input', { type: 'checkbox', checked, onChange: (e) => onChange(e.target.checked) });
  return el('label', { class: 'row row--between', style: { cursor: 'pointer', padding: '8px 0' } },
    el('span', {},
      el('b', { text: label }),
      el('div', { class: 'dim', style: { fontSize: '12.5px' }, text: hint })),
    input);
}

export async function settingsView() {
  const data = await api.player();
  const model = data.model;
  const prefs = data.preferences || {};

  const displayName = el('input', { class: 'input', value: model.display_name || '' });
  const minutes = el('input', {
    class: 'input', type: 'number', min: '10', max: '480', value: model.minutes_per_day,
  });
  const ageBand = el('select', { class: 'select' },
    ...[['youth', 'Under 13'], ['teen', '13–17'], ['adult', '18+']].map(([value, text]) =>
      el('option', { value, text, selected: model.age_band === value })));
  const activity = el('select', { class: 'select' },
    ...[['low', 'Mostly sedentary'], ['moderate', 'Somewhat active'], ['high', 'Very active']]
      .map(([value, text]) => el('option', { value, text, selected: model.activity_level === value })));

  const subjects = listInput(model.academic_subjects);
  const interests = listInput(model.passion_interests);
  const curious = listInput(model.passion_curious);
  const activities = listInput(model.physical_activities);
  const shortGoals = el('textarea', { class: 'textarea', style: { minHeight: '70px' },
                                      value: model.short_term_goals || '' });
  const longGoals = el('textarea', { class: 'textarea', style: { minHeight: '70px' },
                                     value: model.long_term_goals || '' });

  const parse = (input) => input.value.split(',').map((s) => s.trim()).filter(Boolean);

  const saveButton = el('button', { class: 'btn btn--primary', text: 'Save profile' });
  saveButton.addEventListener('click', async () => {
    saveButton.disabled = true;
    try {
      await api.updateModel({
        displayName: displayName.value,
        minutesPerDay: Number(minutes.value) || 45,
        ageBand: ageBand.value,
        activityLevel: activity.value,
        academicSubjects: parse(subjects),
        passionInterests: parse(interests),
        passionCurious: parse(curious),
        physicalActivities: parse(activities),
        shortTermGoals: shortGoals.value,
        longTermGoals: longGoals.value,
      });
      toast('Profile saved', 'Future quests will use this.', 'success');
    } catch (error) {
      toast('Could not save', error.message, 'error');
    }
    saveButton.disabled = false;
  });

  return el('div', { class: 'stack', style: { gap: '22px' } },
    el('div', { class: 'page-head' },
      el('div', {},
        el('h1', { text: 'Settings' }),
        el('p', { text: 'What you put here is what the quest generator works from.' })),
      chip(data.ai.modelBacked ? `AI: ${data.ai.model}` : 'AI: built-in engine',
        data.ai.modelBacked ? 'success' : undefined)),

    el('section', { class: 'card' },
      el('div', { class: 'card__head' }, el('h2', { class: 'card__title', text: 'Profile' })),
      el('div', { class: 'grid grid--2' },
        field('Display name', displayName),
        field('Minutes available per day', minutes, 'Daily quests are sized against this.')),
      el('div', { class: 'grid grid--2' },
        field('Age band', ageBand, 'Younger players get extra safety limits on physical quests.'),
        field('Activity level', activity)),
      el('div', { class: 'grid grid--2' },
        field('Academic subjects', subjects),
        field('Physical activities', activities)),
      el('div', { class: 'grid grid--2' },
        field('Passions you already have', interests),
        field('Fields you are curious about', curious)),
      el('div', { class: 'grid grid--2' },
        field('Short-term goals', shortGoals),
        field('Long-term goals', longGoals)),
      el('div', { class: 'row', style: { justifyContent: 'flex-end' } }, saveButton)),

    el('section', { class: 'card' },
      el('div', { class: 'card__head' },
        el('h2', { class: 'card__title', text: 'Experience' })),
      el('div', { class: 'row row--between', style: { padding: '8px 0', gap: '16px' } },
        el('span', {},
          el('b', { text: 'Theme' }),
          el('div', { class: 'dim', style: { fontSize: '12.5px' },
                      text: 'Auto follows your operating system, and switches with it.' })),
        themeChoice()),
      toggle('Sound effects', 'Short tones on quest completion, level up and achievements.',
        prefs.sound !== false, async (value) => {
          await savePreferences({ sound: value });
          if (value) sound.complete();
        }),
      toggle('Reduced motion', 'Disables XP flight, level-up animation and transitions.',
        prefs.reducedMotion === true, (value) => savePreferences({ reducedMotion: value })),
      toggle('High contrast', 'Stronger borders and brighter secondary text.',
        prefs.highContrast === true, (value) => savePreferences({ highContrast: value })),
      toggle('Notifications', 'In-app notices when quests are ready or milestones approach.',
        prefs.notifications !== false, (value) => savePreferences({ notifications: value }))),

    el('section', { class: 'card' },
      el('div', { class: 'card__head' },
        el('h2', { class: 'card__title', text: 'How progression works' })),
      el('p', { class: 'muted', style: { margin: 0 },
                text: `Level ${data.snapshot.level} of 100. Reaching level 100 takes ${formatNumber(data.curve[data.curve.length - 1].cumulative)} lifetime XP — deliberately a multi-year arc. Your daily XP cap is currently ${formatNumber(data.snapshot.dailyCap)}; XP past it is reduced to a fifth so grinding cannot substitute for consistency.` }),
      el('div', { class: 'grid grid--3', style: { marginTop: '14px' } },
        ...data.curve.filter((c) => [1, 10, 25, 50, 75, 100].includes(c.level)).map((entry) =>
          el('div', { class: 'card card--tight' },
            el('div', { class: 'eyebrow', text: `Level ${entry.level}` }),
            el('b', { class: 'num', text: formatNumber(entry.cumulative) }),
            el('span', { class: 'dim', text: ' XP total' }))))),

    el('section', { class: 'card' },
      el('div', { class: 'card__head' },
        el('h2', { class: 'card__title', text: 'Account' })),
      el('div', { class: 'row row--between' },
        el('span', { class: 'muted', text: `Signed in as ${data.username}` }),
        el('button', {
          class: 'btn btn--danger', text: 'Sign out',
          onClick: async () => {
            await logout();
            window.location.hash = '/';
            window.location.reload();
          },
        }))));
}
