// The quest card and the proof-submission flow — shared by several screens.

import { api } from '../api.js';
import { questArt } from '../components/questArt.js';
import { dictation } from '../components/dictation.js';
import { videoCapture } from '../components/videoCapture.js';
import { celebrate, sound } from '../effects.js';
import { refreshNotifications, refreshPlayer, refreshQuests } from '../store.js';
import {
  chip, el, field, formatMinutes, modal, stars, toast, DOMAIN_LABEL, DOMAIN_ICON,
} from '../ui.js';

const PROOF_LABEL = {
  text: 'Description', photo: 'Photo', video: 'Video', document: 'Document',
  link: 'Link', reflection: 'Reflection', structured: 'Session data',
};

export function questCard(quest, { onChanged } = {}) {
  const done = ['verified', 'expired', 'abandoned'].includes(quest.status);
  const card = el('article', {
    class: `card quest${done ? ' quest--done' : ''}`,
    dataset: { domain: quest.domain, questId: String(quest.id) },
  });

  card.append(
    el('div', { class: 'quest__top' },
      chip(`${DOMAIN_ICON[quest.domain]} ${DOMAIN_LABEL[quest.domain]}`, quest.domain),
      quest.kind !== 'daily' ? chip(quest.kind) : null,
      quest.source === 'ai' ? chip('AI-tuned') : null,
      quest.source === 'user' ? chip('Yours') : null,
      quest.chainKey ? chip(`Step ${quest.chainStep}`) : null,
      el('span', { style: { marginLeft: 'auto' } }, stars(quest.difficulty))),
    // The drawing carries the same information as the title, faster: a list of
    // cards is scanned long before any of it is read. It is decorative in the
    // accessibility sense — the title says the same thing in words — so it is
    // hidden from assistive tech rather than given a duplicate label.
    el('div', { class: 'quest__lead' },
      el('div', { class: 'quest__art' },
        questArt(quest.templateKey, quest.domain, { width: 60 })),
      el('div', { class: 'quest__lead-text' },
        el('h3', { class: 'quest__title', text: quest.title }),
        el('p', { class: 'quest__desc', text: quest.description }))),
    el('div', { class: 'quest__meta' },
      el('span', { text: `⏱ ${formatMinutes(quest.estimatedTime)}` }),
      el('span', { class: 'num', text: `✦ ${quest.xpReward} XP` }),
      el('span', { text: `${quest.difficultyLabel}` }),
      quest.status === 'submitted' ? el('span', { class: 'chip chip--warn', text: 'Awaiting more detail' }) : null),
  );

  if (quest.proofType?.length) {
    card.append(el('div', { class: 'proof-types' },
      ...quest.proofType.map((type) =>
        el('span', { class: 'proof-type', text: PROOF_LABEL[type] || type }))));
  }

  if (!done) {
    const actions = el('div', { class: 'quest__actions' });
    if (quest.status === 'available') {
      actions.append(el('button', {
        class: 'btn btn--primary', type: 'button', text: 'Start',
        onClick: async (event) => {
          event.currentTarget.disabled = true;
          try {
            await api.startQuest(quest.id);
            sound.soft();
            toast('Quest started', quest.title, 'info');
            await refreshQuests();
            onChanged?.();
          } catch (error) {
            toast('Could not start', error.message, 'error');
            event.currentTarget.disabled = false;
          }
        },
      }));
    } else {
      actions.append(el('button', {
        class: 'btn btn--primary', type: 'button', text: 'Submit proof',
        onClick: (event) => openProofModal(quest, { onChanged, origin: event.currentTarget }),
      }));
    }
    actions.append(el('button', {
      class: 'btn btn--ghost btn--sm', type: 'button', text: 'Details',
      onClick: () => openDetailModal(quest, { onChanged }),
    }));
    actions.append(el('button', {
      class: 'btn btn--ghost btn--sm', type: 'button', text: 'Abandon',
      onClick: async () => {
        if (!window.confirm('Abandon this quest? It costs no XP, but it counts as a drop.')) return;
        try {
          await api.abandonQuest(quest.id);
          toast('Quest abandoned', 'It will not count against your XP.', 'info');
          await refreshQuests();
          onChanged?.();
        } catch (error) {
          toast('Could not abandon', error.message, 'error');
        }
      },
    }));
    card.append(actions);
  }

  return card;
}

export function openDetailModal(quest, { onChanged } = {}) {
  const body = el('div', { class: 'stack' },
    el('div', { class: 'row' },
      chip(`${DOMAIN_ICON[quest.domain]} ${DOMAIN_LABEL[quest.domain]}`, quest.domain),
      chip(quest.kind), stars(quest.difficulty),
      chip(`${quest.xpReward} XP`, 'xp')),
    el('p', { class: 'muted', text: quest.description }),
    el('div', { class: 'card card--tight' },
      el('div', { class: 'card__title', text: 'Completion criteria' }),
      el('p', { style: { margin: 0 }, text: quest.completionCriteria || '—' })),
    quest.aiEvaluationCriteria?.length
      ? el('div', { class: 'card card--tight' },
        el('div', { class: 'card__title', text: 'What the reviewer checks' }),
        el('ul', { class: 'rec-list' },
          ...quest.aiEvaluationCriteria.map((c) => el('li', { text: c }))))
      : null,
    el('p', { class: 'dim', style: { margin: 0, fontSize: '12.5px' },
              text: `Estimated ${formatMinutes(quest.estimatedTime)} · ${quest.difficultyLabel}` }));

  modal({
    title: quest.title,
    body,
    actions: el('button', {
      class: 'btn btn--primary', text: 'Submit proof',
      onClick: () => openProofModal(quest, { onChanged }),
    }),
  });
}

export function openProofModal(quest, { onChanged, origin } = {}) {
  const types = quest.proofType?.length ? quest.proofType : ['text'];
  const uploaded = [];

  const textArea = el('textarea', {
    class: 'textarea', name: 'text', required: true,
    placeholder: 'What did you actually do? Be specific — what you covered, how long, what the result was.',
  });
  const reflectionArea = el('textarea', {
    class: 'textarea', name: 'reflection',
    placeholder: 'What did you learn? What was harder or easier than expected?',
  });
  const linkInput = el('input', { class: 'input', type: 'url', name: 'link', placeholder: 'https://…' });
  const minutesInput = el('input', {
    class: 'input', type: 'number', name: 'minutes', min: '1', max: '600',
    placeholder: String(quest.estimatedTime), inputmode: 'numeric',
  });
  const countInput = el('input', {
    class: 'input', type: 'number', name: 'count', min: '0', max: '9999',
    placeholder: 'e.g. problems solved, pages read', inputmode: 'numeric',
  });
  const fieldInput = el('input', { class: 'input', name: 'field', placeholder: 'e.g. Photography' });
  const interestInput = el('input', {
    class: 'input', type: 'number', name: 'interest', min: '1', max: '5',
    placeholder: '1 (not for me) – 5 (loved it)', inputmode: 'numeric',
  });

  const fileList = el('div', { class: 'row', style: { gap: '6px' } });

  async function attach(file, mark = '📎') {
    const result = await api.upload(file);
    for (const meta of result.files) {
      uploaded.push(meta);
      fileList.append(chip(`${mark} ${meta.name}`, 'success'));
    }
    return result.files;
  }

  const wantsVideo = types.includes('video');
  const fileInput = el('input', {
    class: 'input',
    type: 'file',
    // Video quests accept a clip from the gallery too — the recorder is the
    // fast path, not the only one, so a player whose camera fails is not stuck.
    accept: wantsVideo
      ? 'video/webm,video/mp4,video/quicktime,image/png,image/jpeg,image/webp'
      : 'image/png,image/jpeg,image/webp,image/gif,application/pdf,.txt,.md',
    // `capture` asks a phone to open the camera straight from the picker; a
    // desktop browser ignores it and shows the normal file dialog.
    capture: wantsVideo ? 'environment' : null,
    onChange: async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await attach(file, file.type.startsWith('video/') ? '🎬' : '📎');
        toast('File attached', file.name, 'success');
      } catch (error) {
        toast('Upload failed', error.message, 'error');
      }
      event.target.value = '';
    },
  });

  // Filmed on the spot. Held so the modal can switch the camera off on close.
  const capture = wantsVideo
    ? videoCapture({
      onCaptured: async (file) => {
        await attach(file, '🎬');
        toast('Video attached', 'Recorded just now.', 'success');
      },
    })
    : null;

  // Dictation sits on both write-ups, because the reason to speak rather than
  // type — you have just finished exercising — applies to each of them.
  const textDictation = dictation(textArea, { label: 'Speak it' });
  const reflectionDictation = dictation(reflectionArea, { label: 'Speak it' });

  const isExploration = quest.templateKey?.includes('explore');
  const body = el('form', { class: 'stack', id: 'proof-form' },
    el('p', { class: 'muted', style: { margin: 0 },
              text: quest.completionCriteria || 'Describe what you completed.' }),
    field('What did you accomplish?',
      el('div', { class: 'stack', style: { gap: '8px' } }, textArea, textDictation.node),
      'The reviewer checks that this matches the quest — specifics matter more than length.'),
    types.includes('reflection') || types.includes('text')
      ? field('Reflection (optional but worth more XP)',
        el('div', { class: 'stack', style: { gap: '8px' } },
          reflectionArea, reflectionDictation.node),
        reflectionDictation.node
          ? 'Type it, or press Speak it and say it out loud.'
          : undefined)
      : null,
    types.includes('link') ? field('Link', linkInput, 'Project, repository, upload or article.') : null,
    capture
      ? field('Film it', capture.node,
        'Recorded here and now — the strongest evidence the app can take.')
      : null,
    (types.includes('photo') || types.includes('document') || wantsVideo)
      ? field(wantsVideo ? 'Or attach a file' : 'Attachment',
        el('div', { class: 'stack', style: { gap: '8px' } }, fileInput, fileList),
        wantsVideo
          ? 'WebM or MP4 up to 32 MB, or a photo.'
          : 'PNG, JPEG, WebP, GIF, PDF, TXT or MD up to 8 MB.') : null,
    types.includes('structured')
      ? el('div', { class: 'grid grid--3' },
        field('Minutes spent', minutesInput),
        field('Count (optional)', countInput)) : null,
    // Naming the field feeds your passion paths, so it is offered on every
    // passion quest — not just the exploration ones.
    quest.domain === 'passion'
      ? el('div', { class: 'grid grid--3' },
        field(isExploration ? 'Field explored' : 'Which passion path was this?', fieldInput,
          'Optional — tracked on your character sheet.'),
        isExploration ? field('Interest 1–5', interestInput,
          '1 = not for me, 5 = loved it.') : null)
      : null);

  const submitButton = el('button', { class: 'btn btn--primary', type: 'submit', form: 'proof-form',
                                      text: 'Submit for evaluation' });
  const controller = modal({
    title: `Submit proof — ${quest.title}`,
    body,
    actions: el('div', { class: 'row row--between', style: { width: '100%' } },
      el('span', { class: 'dim', style: { fontSize: '12.5px' },
                   text: 'Evidence is evaluated before XP is awarded.' }),
      submitButton),
    // Every exit from this modal — the ×, the backdrop, Escape, or a successful
    // submit — has to put the camera light out and stop the recogniser. Doing it
    // here rather than at each call site is what makes that true by construction.
    onClose: () => {
      capture?.stop();
      textDictation.stop();
      reflectionDictation.stop();
    },
  });

  body.addEventListener('submit', async (event) => {
    event.preventDefault();
    const structured = {};
    if (minutesInput.value) structured.minutes = minutesInput.value;
    if (countInput.value) structured.count = countInput.value;
    if (fieldInput.value) structured.field = fieldInput.value;
    if (interestInput.value) structured.interest = interestInput.value;

    const payload = {
      text: textArea.value.trim(),
      reflection: reflectionArea.value.trim(),
      link: linkInput.value.trim(),
      structured,
      files: uploaded,
    };
    if (!payload.text && !payload.reflection && !payload.link && !uploaded.length) {
      toast('Nothing to evaluate', 'Add at least a short description.', 'error');
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Evaluating…';
    try {
      const result = await api.submitQuest(quest.id, payload);
      controller.close();
      // Level-ups and unlocks create notifications server-side — pull the
      // badge count so the topbar reflects them immediately.
      await Promise.all([refreshQuests(), refreshPlayer(), refreshNotifications()]);
      showResult(result, quest, origin);
      onChanged?.();
    } catch (error) {
      sound.error();
      toast('Not accepted', error.message, 'error', 8000);
      submitButton.disabled = false;
      submitButton.textContent = 'Submit for evaluation';
    }
  });
}

function axisTile(label, value, band) {
  return el('div', { class: 'assessment__axis' },
    el('span', { text: label }),
    el('b', { class: `band-${band}`, text: band }),
    el('span', { class: 'num dim', text: `${Math.round(value)}/100` }));
}

export function showResult(result, quest, origin) {
  const assessment = result.assessment || {};
  const bands = assessment.bands || {};
  const verified = result.verdict === 'verified';

  const body = el('div', { class: 'assessment' },
    el('div', { class: `verdict verdict--${result.verdict}` },
      el('span', { text: verified ? '✓' : result.verdict === 'rejected' ? '✕' : '⚠' }),
      el('span', {
        text: verified ? 'QUEST VERIFIED'
          : result.verdict === 'rejected' ? 'EVIDENCE DOES NOT MATCH' : 'MORE INFORMATION REQUIRED',
      })),
    el('div', { class: 'assessment__grid' },
      axisTile('Relevance', assessment.relevance, bands.relevance),
      axisTile('Completion', assessment.completion, bands.completion),
      axisTile('Quality', assessment.quality, bands.quality),
      axisTile('Reflection', assessment.reflection, bands.reflection)),
    el('p', { class: 'muted', style: { margin: 0 },
              text: `Confidence ${Math.round(assessment.confidence || 0)}% · evaluated by ${
                assessment.evaluator === 'model' ? 'language model + rules' : 'the built-in rules engine'}` }),
    assessment.feedback ? el('p', { style: { margin: 0 }, text: assessment.feedback }) : null,
    !verified && assessment.followUp
      ? el('div', { class: 'card card--tight' },
        el('div', { class: 'card__title', text: 'To verify this' }),
        el('p', { style: { margin: 0 }, text: assessment.followUp }))
      : null,
    (assessment.notes || []).length
      ? el('ul', { class: 'rec-list' }, ...assessment.notes.map((n) => el('li', { text: n })))
      : null);

  if (verified && result.xp) {
    body.append(el('div', { class: 'card card--tight' },
      el('div', { class: 'card__title', text: 'Reward' }),
      el('div', { class: 'row row--between' },
        el('b', { class: 'num', style: { fontSize: '1.5rem', color: 'var(--xp)' },
                  text: `+${result.xp.awarded} XP` }),
        el('span', { class: 'dim num',
                     text: `base ${result.xp.base} × quality ${result.xp.quality}${
                       result.xp.repetition < 1 ? ` × repeat ${result.xp.repetition}` : ''}${
                       result.xp.skillBonus > 0 ? ` × skills +${Math.round(result.xp.skillBonus * 100)}%` : ''}` })),
      result.xp.capped
        ? el('p', { class: 'dim', style: { margin: '8px 0 0', fontSize: '12.5px' },
                    text: `Daily XP cap reached (${result.xp.dailyCap}). Further XP today is heavily reduced — this protects the curve from grinding.` })
        : null));
    if (result.chain && !result.chain.complete && result.chain.nextQuest) {
      body.append(el('div', { class: 'card card--tight' },
        el('div', { class: 'card__title', text: 'Questline advanced' }),
        el('p', { style: { margin: 0 },
                  text: `Next: ${result.chain.nextQuest.title} (step ${result.chain.step + 1} of ${result.chain.totalSteps})` })));
    }
    if (result.chain?.complete) {
      body.append(el('div', { class: 'card card--tight' },
        el('div', { class: 'card__title', text: 'Questline complete' }),
        el('p', { style: { margin: 0 }, text: 'Every step finished. That is a real, documented body of work.' })));
    }
  }

  modal({ title: verified ? 'Quest complete' : 'Assessment', body });
  if (verified) celebrate(result, origin);
  else sound.error();
}
