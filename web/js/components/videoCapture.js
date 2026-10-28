// VIDEO CAPTURE — film the evidence where you did it, not from the gallery.
//
// A photo picker asks the player to find a file. For an exercise quest there is
// no file: the evidence is a set of push-ups that happens once. So this records
// it on the spot, through getUserMedia + MediaRecorder, and hands the result to
// the same /api/uploads endpoint every other attachment goes through.
//
// The whole component is progressive. A browser without MediaRecorder, a device
// with no camera, or a player who declines the permission prompt all fall back
// to the plain file input underneath — the quest stays completable, because
// evidence rules must never depend on hardware.
//
// Three things here are not obvious:
//
//   * The stream is stopped on every exit path. A live camera light that stays
//     on after the modal closes is the single worst bug this component can have,
//     so `stop()` is idempotent and the modal calls it on close as well.
//   * Recording is capped in time *and* watched for size. MediaRecorder has no
//     size limit of its own, and the server takes 32 MB; the cap keeps an
//     ordinary clip well inside it rather than failing after the upload.
//   * The preview is muted and playsinline. Unmuted preview feeds back into the
//     microphone, and without playsinline iOS takes the video fullscreen.

import { el } from '../ui.js';

const MAX_SECONDS = 60;
const MAX_BYTES = 32 * 1024 * 1024;

// Ordered by preference: VP9 is the smallest for a given quality, and the MP4
// entries are what Safari will accept. The browser picks the first it supports.
const CANDIDATE_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

export function isCaptureSupported() {
  return Boolean(
    navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function'
    && typeof window.MediaRecorder === 'function',
  );
}

function pickMimeType() {
  for (const type of CANDIDATE_TYPES) {
    if (window.MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return '';
}

/**
 * A record-review-attach panel.
 *
 * @param {object}   options
 * @param {function} options.onCaptured  called with a File once the player keeps a take
 * @param {function} [options.onStatus]  progress/error text for the host to surface
 * @returns {{node: HTMLElement, stop: function}}
 */
export function videoCapture({ onCaptured, onStatus } = {}) {
  const node = el('div', { class: 'capture' });

  if (!isCaptureSupported()) {
    node.append(el('p', { class: 'capture__note muted', text:
      'This browser cannot record video. Attach a file below instead.' }));
    return { node, stop() {} };
  }

  let stream = null;
  let recorder = null;
  let chunks = [];
  let timer = null;
  let elapsed = 0;
  let recordedBlob = null;
  let recordedUrl = null;

  const preview = el('video', {
    class: 'capture__video', muted: true, playsinline: true, autoplay: true,
  });
  preview.muted = true;                 // the attribute alone is not enough here

  const timeLabel = el('span', { class: 'capture__time num', text: '0:00' });
  const hint = el('p', { class: 'capture__note muted', text:
    `Record up to ${MAX_SECONDS} seconds showing the work itself.` });

  const startButton = el('button', { class: 'btn btn--primary btn--sm', type: 'button',
                                     text: 'Open camera' });
  const stopButton = el('button', { class: 'btn btn--ghost btn--sm', type: 'button',
                                    text: 'Stop', hidden: true });
  const retakeButton = el('button', { class: 'btn btn--ghost btn--sm', type: 'button',
                                      text: 'Retake', hidden: true });
  const keepButton = el('button', { class: 'btn btn--primary btn--sm', type: 'button',
                                    text: 'Use this take', hidden: true });

  node.append(
    el('div', { class: 'capture__stage' }, preview,
      el('div', { class: 'capture__hud' }, timeLabel)),
    el('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
      startButton, stopButton, retakeButton, keepButton),
    hint);

  function say(message, isError = false) {
    hint.textContent = message;
    hint.classList.toggle('capture__note--error', isError);
    onStatus?.(message, isError);
  }

  function releaseUrl() {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      recordedUrl = null;
    }
  }

  // Idempotent on purpose — called from the buttons, from the recorder's own
  // stop handler, and again when the modal closes.
  function stopStream() {
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function stopAll() {
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* already stopping */ }
    }
    recorder = null;
    stopStream();
    releaseUrl();
  }

  async function openCamera() {
    startButton.disabled = true;
    say('Waiting for camera permission…');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // `facingMode` is a hint, not a demand: on a laptop there is only one
        // camera and an exact constraint would fail outright.
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
    } catch (error) {
      startButton.disabled = false;
      say(error?.name === 'NotAllowedError'
        ? 'Camera permission was declined. You can still attach a file below.'
        : 'No camera is available. You can still attach a file below.', true);
      return;
    }

    preview.srcObject = stream;
    preview.controls = false;
    node.classList.add('capture--live');
    try { await preview.play(); } catch { /* autoplay policies; the stream is live anyway */ }
    beginRecording();
  }

  function beginRecording() {
    const mimeType = pickMimeType();
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stopStream();
      say('This browser cannot record from the camera. Attach a file below instead.', true);
      startButton.disabled = false;
      return;
    }

    chunks = [];
    let bytes = 0;
    recorder.addEventListener('dataavailable', (event) => {
      if (!event.data || !event.data.size) return;
      bytes += event.data.size;
      chunks.push(event.data);
      if (bytes > MAX_BYTES && recorder.state === 'recording') {
        say('Reached the size limit — stopping the recording here.');
        recorder.stop();
      }
    });
    recorder.addEventListener('stop', finishRecording);
    // A timeslice means `dataavailable` fires as it goes, which is what makes
    // the running size check possible at all.
    recorder.start(1000);

    elapsed = 0;
    timeLabel.textContent = '0:00';
    timer = setInterval(() => {
      elapsed += 1;
      timeLabel.textContent = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
      if (elapsed >= MAX_SECONDS && recorder?.state === 'recording') recorder.stop();
    }, 1000);

    startButton.hidden = true;
    stopButton.hidden = false;
    say('Recording. Show enough that a reviewer can tell what you did.');
  }

  function finishRecording() {
    stopStream();
    node.classList.remove('capture--live');
    const type = recorder?.mimeType || chunks[0]?.type || 'video/webm';
    recordedBlob = new Blob(chunks, { type: type.split(';')[0] });
    chunks = [];
    recorder = null;

    releaseUrl();
    recordedUrl = URL.createObjectURL(recordedBlob);
    preview.srcObject = null;
    preview.src = recordedUrl;
    preview.muted = false;
    preview.controls = true;

    stopButton.hidden = true;
    retakeButton.hidden = false;
    keepButton.hidden = false;
    const mb = (recordedBlob.size / (1024 * 1024)).toFixed(1);
    say(`${elapsed}s recorded (${mb} MB). Play it back, then keep it or record again.`);
  }

  startButton.addEventListener('click', openCamera);

  stopButton.addEventListener('click', () => {
    if (recorder?.state === 'recording') recorder.stop();
  });

  retakeButton.addEventListener('click', () => {
    releaseUrl();
    recordedBlob = null;
    preview.removeAttribute('src');
    preview.controls = false;
    preview.muted = true;
    retakeButton.hidden = true;
    keepButton.hidden = true;
    startButton.hidden = false;
    startButton.disabled = false;
    openCamera();
  });

  keepButton.addEventListener('click', async () => {
    if (!recordedBlob) return;
    keepButton.disabled = true;
    const extension = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const file = new File([recordedBlob], `quest-proof-${stamp}.${extension}`,
                          { type: recordedBlob.type });
    try {
      await onCaptured?.(file);
      say('Video attached to this submission.');
      keepButton.hidden = true;
      retakeButton.textContent = 'Record another';
    } catch (error) {
      say(error?.message || 'That upload failed. Try a shorter clip.', true);
    }
    keepButton.disabled = false;
  });

  return { node, stop: stopAll };
}
