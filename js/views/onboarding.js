// ONBOARDING — five short steps, then a generated level 1 character.

import { api } from '../api.js';
import { el, field, toast } from '../ui.js';

const SUGGESTED = {
  academicSubjects: ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'History',
                     'Languages', 'Computer science', 'Economics', 'Literature'],
  physicalActivities: ['Walking', 'Running', 'Cycling', 'Swimming', 'Climbing',
                       'Football', 'Basketball', 'Yoga', 'Gym', 'Martial arts'],
  passionInterests: ['Robotics', 'Programming', 'Art', 'Music', 'Photography',
                     'Writing', 'Entrepreneurship', 'Design', 'Filmmaking', 'Cooking'],
  passionCurious: ['Robotics', 'Electronics', 'Public speaking', 'Game design',
                   'Woodworking', 'Astronomy', 'Journalism', '3D printing', 'Investing'],
};

function pillPicker(key, selected) {
  const chosen = new Set(selected);
  const custom = el('input', {
    class: 'input', placeholder: 'Add your own, then press Enter',
    onKeydown: (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const value = event.target.value.trim();
      if (!value) return;
      chosen.add(value);
      group.append(makePill(value, true));
      event.target.value = '';
    },
  });

  const makePill = (label, on) => el('button', {
    class: 'pill', type: 'button', 'aria-pressed': String(on), text: label,
    onClick: (event) => {
      const active = event.currentTarget.getAttribute('aria-pressed') === 'true';
      event.currentTarget.setAttribute('aria-pressed', String(!active));
      if (active) chosen.delete(label); else chosen.add(label);
    },
  });

  const group = el('div', { class: 'pillgroup' },
    ...SUGGESTED[key].map((label) => makePill(label, chosen.has(label))),
    ...selected.filter((s) => !SUGGESTED[key].includes(s)).map((label) => makePill(label, true)));

  return { node: el('div', { class: 'stack', style: { gap: '10px' } }, group, custom),
           values: () => [...chosen] };
}

export function onboardingView({ onComplete }) {
  const answers = {
    displayName: '', ageBand: 'adult', activityLevel: 'moderate', minutesPerDay: 45,
    academicSubjects: [], physicalActivities: [], passionInterests: [], passionCurious: [],
    shortTermGoals: '', longTermGoals: '',
  };

  const displayName = el('input', { class: 'input', placeholder: 'What should I call you?' });
  const ageBand = el('select', { class: 'select' },
    el('option', { value: 'adult', text: '18 or over' }),
    el('option', { value: 'teen', text: '13–17' }),
    el('option', { value: 'youth', text: 'Under 13' }));
  const activity = el('select', { class: 'select' },
    el('option', { value: 'low', text: 'Mostly sedentary right now' }),
    el('option', { value: 'moderate', text: 'Somewhat active', selected: true }),
    el('option', { value: 'high', text: 'Very active' }));
  const minutes = el('input', { class: 'input', type: 'number', min: '10', max: '480', value: '45' });
  const shortGoals = el('textarea', { class: 'textarea', style: { minHeight: '80px' },
                                      placeholder: 'What do you want to be true in three months?' });
  const longGoals = el('textarea', { class: 'textarea', style: { minHeight: '80px' },
                                     placeholder: 'And in a few years?' });

  const subjects = pillPicker('academicSubjects', []);
  const activities = pillPicker('physicalActivities', []);
  const passions = pillPicker('passionInterests', []);
  const curious = pillPicker('passionCurious', []);

  const steps = [
    {
      title: 'Who is the main character?',
      body: el('div', {},
        el('p', { class: 'muted', text: 'LifeQuest builds a character from your real life. Nothing here is public — it exists so the quest generator has something true to work with.' }),
        field('Name', displayName),
        el('div', { class: 'grid grid--2' },
          field('Age band', ageBand, 'Under-18 players get extra safety limits on physical quests.'),
          field('Current activity level', activity))),
    },
    {
      title: 'Train the mind',
      body: el('div', {},
        el('p', { class: 'muted', text: 'Which subjects or fields are you actually studying or want to study? Academic quests will be written around these.' }),
        subjects.node),
    },
    {
      title: 'Train the body',
      body: el('div', {},
        el('p', { class: 'muted', text: 'Movement you enjoy or would try. Physical quests are about capability and wellbeing — never appearance or weight.' }),
        activities.node),
    },
    {
      title: 'Build something',
      body: el('div', {},
        el('p', { class: 'muted', text: 'What do you already care about?' }),
        passions.node,
        el('p', { class: 'muted', style: { marginTop: '18px' },
                  text: 'And what are you curious about but have never really tried? Exploration quests will start here.' }),
        curious.node),
    },
    {
      title: 'Goals and time',
      body: el('div', {},
        field('Time you realistically have each day (minutes)', minutes,
          'Daily quests are sized against this. Be honest — an over-sized quest gets abandoned.'),
        field('Short-term goal', shortGoals),
        field('Long-term goal', longGoals)),
    },
  ];

  let index = 0;
  const progress = el('div', { class: 'onboard__steps', 'aria-hidden': 'true' },
    ...steps.map(() => el('i')));
  const heading = el('h1', {});
  const bodyHost = el('div', { class: 'card' });
  const backButton = el('button', { class: 'btn btn--ghost', type: 'button', text: 'Back' });
  const nextButton = el('button', { class: 'btn btn--primary', type: 'button', text: 'Continue' });

  const paint = () => {
    heading.textContent = steps[index].title;
    bodyHost.replaceChildren(steps[index].body);
    [...progress.children].forEach((mark, i) => mark.classList.toggle('on', i <= index));
    backButton.disabled = index === 0;
    nextButton.textContent = index === steps.length - 1 ? 'Create my character' : 'Continue';
    document.getElementById('main')?.focus?.();
  };

  backButton.addEventListener('click', () => {
    if (index > 0) { index -= 1; paint(); }
  });

  nextButton.addEventListener('click', async () => {
    if (index < steps.length - 1) { index += 1; paint(); return; }

    Object.assign(answers, {
      displayName: displayName.value.trim(),
      ageBand: ageBand.value,
      activityLevel: activity.value,
      minutesPerDay: Number(minutes.value) || 45,
      academicSubjects: subjects.values(),
      physicalActivities: activities.values(),
      passionInterests: passions.values(),
      passionCurious: curious.values(),
      shortTermGoals: shortGoals.value.trim(),
      longTermGoals: longGoals.value.trim(),
    });

    nextButton.disabled = true;
    nextButton.textContent = 'Generating your character…';
    try {
      const result = await api.onboarding(answers);
      toast('Character created',
        `Level 1 with ${result.quests.length} starter quests. Your first mission is deliberately small.`,
        'success', 8000);
      onComplete(result);
    } catch (error) {
      toast('Could not finish', error.message, 'error');
      nextButton.disabled = false;
      nextButton.textContent = 'Create my character';
    }
  });

  paint();

  return el('div', { class: 'onboard' },
    el('div', { class: 'eyebrow', text: 'Character creation' }),
    heading,
    el('p', { class: 'muted', text: 'Five short steps. This takes about a minute.' }),
    progress,
    bodyHost,
    el('div', { class: 'onboard__nav' }, backButton, nextButton));
}
