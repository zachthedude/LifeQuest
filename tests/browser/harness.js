// Click-driven end-to-end run against the real UI.
//
// This runs inside the actual app page (the runner injects it into a copy of
// index.html) rather than an iframe, because the app's own CSP correctly
// refuses to be framed.
//
// It exists because the navigation bug only appeared on the *same-session*
// path — sign up, onboard, then click the nav. Loading a URL directly with a
// cookie already set never reproduced it.

const lines = [];
const errors = [];
const log = document.createElement('pre');
log.id = 'e2e-log';
log.style.cssText = 'position:fixed;left:-99999px;top:0;white-space:pre-wrap';
document.body.append(log);

function record(status, name, detail = '') {
  lines.push(`${status} ${name}${detail ? ' :: ' + detail : ''}`);
  log.textContent = lines.join('\n');
}
const pass = (name, detail) => record('PASS', name, detail);
const fail = (name, detail) => record('FAIL', name, detail);

window.addEventListener('error', (event) => errors.push(event.message));
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (reason && reason.status === 401) return;   // expected before sign-up
  errors.push(String(reason && reason.message ? reason.message : reason));
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(label, predicate, ticks = 300) {
  // Counted in event-loop turns rather than milliseconds: under Chrome's
  // headless virtual clock, Date.now() leaps forward and a wall-clock timeout
  // expires before a real network response has had a chance to arrive.
  for (let tick = 0; tick < ticks; tick += 1) {
    let value;
    try {
      value = predicate();
    } catch {
      value = null;
    }
    if (value) return value;
    await sleep(25);
  }
  throw new Error(`timed out waiting for ${label}`);
}

const text = (selector) => document.querySelector(selector)?.textContent?.trim() || '';

function findByText(selector, needle) {
  return [...document.querySelectorAll(selector)]
    .find((node) => (node.textContent || '').toLowerCase().includes(needle.toLowerCase()));
}

async function click(node) {
  node.click();
  await sleep(140);
}

// The router announces each completed render. Awaiting that event is exact,
// where polling a clock is not: headless virtual time makes timers unreliable.
let lastRendered = null;
let renderWaiters = [];
window.addEventListener('lifequest:rendered', (event) => {
  lastRendered = event.detail.path;
  const waiters = renderWaiters;
  renderWaiters = [];
  waiters.forEach((resolve) => resolve(lastRendered));
});

/**
 * Await a promise, bounded by event-loop turns rather than elapsed time.
 * A `Promise.race` against a timer is useless here: headless virtual time
 * resolves that timer almost instantly, so the timeout always wins.
 */
async function settle(promise, ticks = 500) {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  for (let tick = 0; tick < ticks && !done; tick += 1) await sleep(20);
  return done;
}

function nextRender(route) {
  if (lastRendered === route) return Promise.resolve(route);
  return new Promise((resolve) => {
    const check = (path) => {
      if (path === route) resolve(path);
      else renderWaiters.push(check);
    };
    renderWaiters.push(check);
  });
}

async function run() {
  const user = 'e2e' + Math.floor(Math.random() * 1e6);

  // ---- 0a. The opening page -----------------------------------------------
  // A signed-out visitor gets the front door before anything else: a still page
  // that says what LifeQuest is for and offers both ways in. The run proves it
  // loads first, states the case for students, and hands over cleanly.
  const opening = await waitFor('opening', () => document.querySelector('[data-opening]'), 600);
  pass('opening page renders first', opening.dataset.opening);

  if (/real life is the game/i.test(text('.open__headline'))) {
    pass('opening leads with the tagline');
  } else {
    fail('opening leads with the tagline', text('.open__headline') || '(empty)');
  }
  if (/students/i.test(text('.open__eyebrow')) && /students/i.test(text('.open__lede'))) {
    pass('opening is addressed to students');
  } else {
    fail('opening is addressed to students', text('.open__eyebrow'));
  }

  const openDoors = [...document.querySelectorAll('.open__hero .open__door')]
    .map((node) => node.textContent.trim());
  if (openDoors.some((label) => /create your character/i.test(label))
      && openDoors.some((label) => /continue a run/i.test(label))) {
    pass('both doors are in the first screen', openDoors.join(' | '));
  } else {
    fail('both doors are in the first screen', openDoors.join(' | ') || '(none)');
  }

  const openDomains = [...document.querySelectorAll('.open__card')]
    .map((node) => node.dataset.domain).sort().join(',');
  if (openDomains === 'academic,passion,physical') pass('the three domains are named', openDomains);
  else fail('the three domains are named', openDomains || '(none)');

  // The woven light is the opening page's background. It is an enhancement, so
  // either it painted or the page dropped it — never an empty canvas.
  const wovenLayer = document.querySelector('.open__woven');
  const wovenCanvas = document.querySelector('.open__woven .woven__canvas');
  if (wovenLayer && wovenCanvas && document.querySelector('.opening--woven')) {
    pass('woven light runs behind the opening hero');
  } else if (wovenLayer && !wovenCanvas) {
    pass('woven light degrades to the plain background');
  } else {
    fail('woven light runs behind the opening hero',
      `layer=${!!wovenLayer} canvas=${!!wovenCanvas}`);
  }

  const openSteps = document.querySelectorAll('.open__step').length;
  if (openSteps === 4) pass('the evidence-before-XP loop is spelled out', `${openSteps} steps`);
  else fail('the evidence-before-XP loop is spelled out', `${openSteps} steps`);

  const openValues = document.querySelectorAll('.open__value').length;
  if (openValues >= 4) pass('the student values are listed', `${openValues} values`);
  else fail('the student values are listed', `${openValues} values`);

  // ---- 0b. The intro acts, inline ---------------------------------------
  // They used to be a separate screen: a button here opened a pinned, eight-
  // viewport film with its own act rail. Both are gone, so their absence is
  // part of the contract now — the acts are sections of this page.
  if (!document.querySelector('.open__introlink') && !document.querySelector('[data-landing]')) {
    pass('no separate intro screen to launch');
  } else {
    fail('no separate intro screen to launch');
  }
  const actCount = document.querySelectorAll('.opening .intro__act').length;
  if (actCount === 2) pass('the intro acts are part of the page', `${actCount} acts`);
  else fail('the intro acts are part of the page', `${actCount} acts`);

  if (document.querySelector('.intro__act .landing__card .phone__screen')) {
    pass('the app mockup mounted inline');
  } else {
    fail('the app mockup mounted inline');
  }

  const orbitIcons = document.querySelectorAll('.orbit__icon').length;
  if (orbitIcons >= 12) pass('orbiting circles built', `${orbitIcons} icons`);
  else fail('orbiting circles built', `${orbitIcons} icons`);

  if (document.querySelector('.orbit__core canvas')) pass('particle sphere canvas mounted');
  else fail('particle sphere canvas mounted');

  // The constellation has to turn around the brand mark, not an abstract core.
  if (document.querySelector('.orbit--centred .orbit__core .orbit__logo')) {
    pass('constellation revolves around the logo');
  } else {
    fail('constellation revolves around the logo');
  }
  const goals = document.querySelectorAll('.landing__goals li').length;
  if (goals === 3) pass('the three goals are named', `${goals}`);
  else fail('the three goals are named', `${goals}`);

  // The headline carries the decrypt that act I used to. One element holds both
  // sentences, and the readable string must be there for assistive tech the
  // whole time the glyphs are boiling.
  const headline = document.querySelector('.open__headline');
  const cells = headline ? headline.querySelectorAll('[data-char]').length : 0;
  if (cells >= 30) pass('the opening headline decrypts', `${cells} cells`);
  else fail('the opening headline decrypts', `${cells} cells`);

  const spoken = headline?.querySelector('.sr-only')?.textContent?.trim() || '';
  if (/real life is the game/i.test(spoken) && /main character/i.test(spoken)) {
    pass('headline exposes readable text', spoken);
  } else {
    fail('headline exposes readable text', spoken || '(empty)');
  }

  // Its gradient is clipped to the text of the element itself, so every settled
  // glyph cell has to give up its own fill and let that gradient through. A cell
  // painting its own colour would repaint the headline flat.
  //
  // The states are driven by requestAnimationFrame, and frame delivery is not
  // dependable under the headless virtual clock (the same reason timeline.js
  // carries a watchdog). So the settled state is *set* here rather than waited
  // for: what is under test is the stylesheet, and this asks it directly
  // instead of racing the animation to ask it.
  const cell = headline?.querySelector('[data-char]');
  if (cell) {
    const before = cell.dataset.state;
    cell.dataset.state = 'plain';
    const fill = getComputedStyle(cell).webkitTextFillColor;
    cell.dataset.state = before;
    if (fill === 'rgba(0, 0, 0, 0)') pass('headline keeps its gradient through the decrypt', fill);
    else fail('headline keeps its gradient through the decrypt', `repainted ${fill}`);
  } else {
    fail('headline keeps its gradient through the decrypt', '(no glyph cells)');
  }

  // The acts animate from scroll position, so scrolling is the only honest way
  // to prove they run rather than that the markup exists. The dial starts at 0
  // and is driven by the mockup act's own progress. (Under reduced motion the
  // act settles the dial outright, which is also a pass — the detail says which.)
  window.scrollTo(0, document.querySelector('.intro__act').offsetTop);
  try {
    await waitFor('dial', () => text('.phone__count') !== '0', 400);
    pass('scrolling to the act drives its animation', `level ${text('.phone__count')}`);
  } catch {
    fail('scrolling to the act drives its animation', text('.phone__count') || '(no dial)');
  }

  // Back to the top, where both doors have been since the first frame.
  window.scrollTo(0, 0);
  const startDoor = document.querySelector('.open__door--solid');
  if (startDoor) pass('the opening page offers a way into sign-up');
  else fail('the opening page offers a way into sign-up');
  await click(startDoor);

  // ---- 1. Sign-up screen -------------------------------------------------
  await waitFor('auth form', () => document.querySelector('form input[name="username"]'), 600);
  pass('auth screen renders');

  if (document.querySelector('.auth__stage .auth__image')) pass('login artwork present');
  else fail('login artwork present');

  // ---- 2b. Forgot your password ------------------------------------------
  // The link only belongs on sign-in: there is nothing to recover on the way to
  // making a new character.
  const signInTab = [...document.querySelectorAll('.auth-tabs button')]
    .find((tab) => tab.dataset.mode === 'login');
  const forgotLink = document.querySelector('.auth__forgot');
  if (forgotLink && forgotLink.hidden) pass('no recovery link on the sign-up door');
  else fail('no recovery link on the sign-up door');

  if (signInTab) {
    await click(signInTab);
    if (forgotLink && !forgotLink.hidden) pass('sign-in offers password recovery');
    else fail('sign-in offers password recovery');

    await click(forgotLink);
    const codeInput = document.querySelector('input[name="code"]');
    if (codeInput && !codeInput.closest('.stack').hidden) {
      pass('recovery asks for a code');
    } else {
      fail('recovery asks for a code');
    }

    // The code is typed off a terminal, so the field has to forgive lowercase
    // and stray punctuation rather than reject it.
    codeInput.value = '';
    codeInput.focus();
    codeInput.value = 'lq-ab cd-!ef12-3456';
    codeInput.dispatchEvent(new Event('input', { bubbles: true }));
    if (/^[A-Z0-9-]+$/.test(codeInput.value)) {
      pass('the code field normalises what is typed', codeInput.value);
    } else {
      fail('the code field normalises what is typed', codeInput.value);
    }

    // Asking for a code must not need an account to exist, and must never say
    // whether one does.
    const nameInput = document.querySelector('input[name="username"]');
    nameInput.value = 'nobody-here-at-all';
    const sendCode = findByText('.auth__sendcode button', 'Send me a code');
    await click(sendCode);
    await sleep(320);
    const notice = document.querySelector('.auth__notice');
    if (notice && !notice.hidden && /if that account exists/i.test(notice.textContent)) {
      pass('recovery does not reveal whether an account exists');
    } else {
      fail('recovery does not reveal whether an account exists',
        notice ? notice.textContent : '(no notice)');
    }

    // A wrong code is refused, and says so without blaming the username.
    document.querySelector('input[name="password"]').value = 'a-good-enough-pass-9';
    codeInput.value = 'LQ-AAAA-BBBB-CCCC';
    const setNew = findByText('#main button', 'Set a new password')
      || document.querySelector('.auth-card button[type="submit"]');
    await click(setNew);
    await sleep(360);
    const authError = document.querySelector('.field__error');
    if (authError && !authError.hidden && /not valid|expired/i.test(authError.textContent)) {
      pass('a wrong recovery code is refused', authError.textContent.slice(0, 40));
    } else {
      fail('a wrong recovery code is refused',
        authError ? authError.textContent : '(no error shown)');
    }

    // ...and there is a way back to the ordinary sign-in form.
    const back = findByText('.auth__links button', 'Back to sign in');
    await click(back);
    if (document.querySelector('input[name="code"]').closest('.stack').hidden) {
      pass('recovery hands you back to sign in');
    } else {
      fail('recovery hands you back to sign in');
    }
    await click(document.querySelector('.auth-tabs button'));
  } else {
    fail('sign-in offers password recovery', 'no sign-in tab');
  }

  // The app background moved off this screen and behind the signed-in app, so
  // its absence here is part of the contract, not an accident. The dot field that
  // arrived with the modern-login port is a different layer in a different
  // container, so this still means what it always meant.
  if (!document.querySelector('.appbg') && !document.querySelector('.auth__stage canvas')) {
    pass('no app background on the sign-in screen');
  } else {
    fail('no app background on the sign-in screen');
  }

  // The dot field. The layer is the assertion, not the canvas: the CSS grid
  // inside it is the real fallback, and this run is headless with --disable-gpu,
  // where WebGL2 may or may not exist. Which of the two is live is reported
  // rather than asserted.
  const dotField = document.querySelector('.auth .auth__field');
  if (dotField) {
    const live = dotField.classList.contains('auth__field--live');
    pass('dot field layer present', live ? 'WebGL2 shader' : 'CSS fallback grid');
  } else {
    fail('dot field layer present');
  }

  // The card sits over the field rather than beside it — the centred-modal
  // layout the component brought with it.
  if (document.querySelector('.auth__modal .auth-card')) pass('login card is centred on the field');
  else fail('login card is centred on the field');

  // The decrypting headline must expose the real string to assistive tech even
  // while the glyph layer is still scrambling.
  const headlineReadable = document.querySelector('.auth__headline .sr-only');
  if (headlineReadable && headlineReadable.textContent === 'Real life is the game.') {
    pass('decrypt headline exposes readable text');
  } else {
    fail('decrypt headline exposes readable text', headlineReadable?.textContent || '(missing)');
  }
  const glyphCells = document.querySelectorAll('.auth__headline [data-char]').length;
  if (glyphCells >= 18) pass('decrypt glyph layer built', `${glyphCells} cells`);
  else fail('decrypt glyph layer built', `${glyphCells} cells`);

  const motto = text('.brand__sub');
  if (/build the person/i.test(motto)) pass('motto updated', motto);
  else fail('motto updated', motto || '(empty)');

  document.querySelector('input[name="username"]').value = user;
  document.querySelector('input[name="password"]').value = 'quest-runner-9';
  await click(findByText('button', 'Start my quest'));

  // ---- 2. Onboarding -----------------------------------------------------
  await waitFor('onboarding', () => findByText('h1', 'main character'), 400);
  pass('onboarding starts');

  for (let step = 0; step < 4; step += 1) {
    const next = await waitFor('continue button', () => findByText('button', 'Continue'));
    await click(next);
  }
  const create = await waitFor('create button', () => findByText('button', 'Create my character'));
  const dashboardRendered = nextRender('/');
  await click(create);
  await settle(dashboardRendered);

  // ---- 3. Dashboard ------------------------------------------------------
  if (findByText('#main h1', 'welcome back')) pass('character created and dashboard renders');
  else fail('character created and dashboard renders', text('#main h1'));

  const questCards = document.querySelectorAll('.quest').length;
  if (questCards >= 3) pass('starter quests visible', `${questCards} cards`);
  else fail('starter quests visible', `${questCards} cards`);

  // ---- 3a. The quest drawings -------------------------------------------
  // Every card carries a line drawing of the thing being done. The fallback in
  // questArt.js means an archetype with no scene of its own degrades to its
  // domain's drawing rather than throwing, which is right for a player and
  // useless for a test — a card that silently lost its art still renders. So
  // this counts the shapes inside the svg rather than trusting the element.
  // One shape is the floor: the teaching quest's star is a single path.
  const cards = [...document.querySelectorAll('.quest')];
  const drawnCards = cards.filter((card) => {
    const art = card.querySelector('svg.questart');
    return art && art.querySelectorAll('path, circle, rect, line').length >= 1;
  });
  if (drawnCards.length === cards.length) {
    pass('every quest card is drawn', `${drawnCards.length} scenes`);
  } else {
    fail('every quest card is drawn', `${drawnCards.length} of ${cards.length}`);
  }

  // Inheriting `currentColor` is the whole reason one drawing can sit on a
  // physical card and a passion card without a second file, so it is worth an
  // assertion rather than an assumption.
  const firstArt = cards[0]?.querySelector('svg.questart');
  if (firstArt && getComputedStyle(firstArt).stroke === getComputedStyle(firstArt).color) {
    pass('quest art inherits the card colour');
  } else {
    fail('quest art inherits the card colour',
         firstArt ? getComputedStyle(firstArt).stroke : 'no art');
  }

  // Decorative in the accessibility sense: the title already says it in words,
  // so a screen reader must not read the picture as a second thing.
  const labelled = cards.filter((card) => {
    const art = card.querySelector('svg.questart');
    return art && art.getAttribute('aria-hidden') !== 'true';
  });
  if (!labelled.length) pass('quest art is hidden from assistive tech');
  else fail('quest art is hidden from assistive tech', `${labelled.length} exposed`);

  // ---- 3a1. The countdown maths ------------------------------------------
  // Pure functions, so they are checked directly rather than inferred from
  // pixels. The timezone case is the one that matters most: the server writes
  // "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker, and a browser left to its
  // own devices reads that as local time — an hour or more of silent error in
  // exactly the situation where the number is load-bearing.
  const fd = await import('./js/components/flipDisk.js');

  const inTwoHours = new Date(Date.now() + 2 * 3600_000)
    .toISOString().slice(0, 19).replace('T', ' ');
  const drift = Math.abs(fd.msUntil(inTwoHours) - 2 * 3600_000);
  if (drift < 5000) pass('a bare UTC timestamp is read as UTC', `${drift}ms drift`);
  else fail('a bare UTC timestamp is read as UTC', `${Math.round(drift / 60000)} minutes out`);

  const shapes = [
    [9 * 3600_000 + 7 * 60_000, '09:07', 'xp'],
    [41 * 60_000, '41:00', 'warn'],
    [4 * 60_000 + 2_000, '04:02', 'danger'],
    [-5000, '00:00', 'danger'],
  ];
  const wrong = shapes.filter(([ms, want]) => fd.countdownText(ms) !== want);
  if (!wrong.length) pass('the countdown reads the way a board should');
  else fail('the countdown reads the way a board should',
    wrong.map(([ms, want]) => `${want}!=${fd.countdownText(ms)}`).join(' '));

  const tones = shapes.filter(([ms, , want]) => fd.toneFor(ms) !== want);
  if (!tones.length) pass('urgency drives the colour of the lit face');
  else fail('urgency drives the colour of the lit face', tones.length + ' wrong');

  // Every string the board can show has to fit the board it is shown on.
  const cols = fd.widthFor('00:00');
  const overflow = ['00:00', '99:59', '00:01'].filter((t) => fd.widthFor(t) > cols);
  if (!overflow.length) pass('nothing the board displays overflows it', `${cols} columns`);
  else fail('nothing the board displays overflows it', overflow.join(' '));

  // A short string centres rather than hugging the left edge.
  const short = fd.glyphBitmap('12', cols, 7);
  const litCols = [];
  for (let x = 0; x < cols; x += 1) {
    if (short.some((row) => row[x])) litCols.push(x);
  }
  const leftGap = litCols[0];
  const rightGap = cols - 1 - litCols[litCols.length - 1];
  if (Math.abs(leftGap - rightGap) <= 1) {
    pass('short strings sit centred on the board', `${leftGap} / ${rightGap}`);
  } else {
    fail('short strings sit centred on the board', `${leftGap} left, ${rightGap} right`);
  }

  // ---- 3a2. The flip-disk deadline board ---------------------------------
  // `expiresAt` shipped on every quest from the first build and nothing ever
  // displayed it, so a daily quest vanished at 36 hours with no warning. The
  // board is the warning.
  const flipboard = document.querySelector('.flipboard');
  if (flipboard) {
    pass('the deadline board is on the dashboard');

    const disks = flipboard.querySelectorAll('.flipdisk__disk');
    const lit = flipboard.querySelectorAll('.flipdisk__flip.is-on');
    if (disks.length >= 100 && lit.length > 0) {
      pass('the board is showing a time', `${lit.length} of ${disks.length} disks lit`);
    } else {
      fail('the board is showing a time', `${lit.length} of ${disks.length} disks lit`);
    }

    // Gold with time in hand, amber under an hour, red under ten minutes. A
    // fresh daily quest has 36 hours, so it must read gold.
    const tone = flipboard.querySelector('.flipdisk')?.dataset.tone;
    if (tone === 'xp') pass('a distant deadline reads calm', tone);
    else fail('a distant deadline reads calm', String(tone));

    // The lit face must actually be turned over — the flip is the component.
    const flipped = flipboard.querySelector('.flipdisk__flip.is-on');
    const matrix = flipped && getComputedStyle(flipped).transform;
    if (matrix && matrix !== 'none') pass('lit disks are physically rotated', matrix.slice(0, 24));
    else fail('lit disks are physically rotated', String(matrix));
  } else {
    fail('the deadline board is on the dashboard', 'no .flipboard');
  }

  // Every card carries its own remaining time, cheaply — a board per card would
  // be thousands of elements behind a live canvas.
  const clocks = [...document.querySelectorAll('.quest .chip')]
    .filter((c) => /\d+[dhm] left|expired/i.test(c.textContent));
  if (clocks.length) pass('each quest card shows its time left', clocks[0].textContent.trim());
  else fail('each quest card shows its time left', 'none found');

  // ---- 3b. The constellation mesh behind the app -------------------------
  const bg = await waitFor('app background', () => document.querySelector('.appbg'), 400);
  pass('constellation layer runs behind the app');

  const meshCanvas = bg.querySelector('.mesh__canvas');
  if (meshCanvas) {
    const viewport = {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    };
    const spans = meshCanvas.offsetWidth >= viewport.width - 2
      && meshCanvas.offsetHeight >= viewport.height - 2;
    const detail = `${meshCanvas.offsetWidth}x${meshCanvas.offsetHeight} of `
      + `${viewport.width}x${viewport.height}`;
    if (spans) pass('mesh spans the whole viewport', detail);
    else fail('mesh spans the whole viewport', detail);
    if (bg.classList.contains('appbg--live')) pass('mesh painted a first frame');
    else fail('mesh painted a first frame', bg.className);

    // The canvas has to stay transparent: an opaque one would cover the drifting
    // halo field the rest of the app is laid out on.
    const cornerPixels = meshCanvas.getContext('2d').getImageData(0, 0, 4, 4).data;
    let clear = true;
    for (let i = 3; i < cornerPixels.length; i += 4) {
      if (cornerPixels[i] === 255) clear = false;
    }
    if (clear) pass('mesh canvas is transparent, not an opaque fill');
    else fail('mesh canvas is transparent, not an opaque fill');
  } else {
    // No usable 2D context: the layer must degrade to the cursor highlight
    // rather than leave an empty canvas over the app.
    if (bg.classList.contains('appbg--flat')) pass('mesh degrades without a 2D context');
    else fail('mesh degrades without a 2D context', bg.className);
  }

  // Cursor tracking is window-level and unclamped: a pointer in the far corner
  // has to reach the far corner, not the edge of a small box.
  const corner = { x: window.innerWidth - 4, y: window.innerHeight - 4 };
  window.dispatchEvent(new PointerEvent('pointermove', {
    clientX: corner.x, clientY: corner.y, bubbles: true,
  }));
  await sleep(80);
  const tracked = {
    x: parseFloat(bg.style.getPropertyValue('--orb-x')),
    y: parseFloat(bg.style.getPropertyValue('--orb-y')),
  };
  if (Math.abs(tracked.x - corner.x) <= 1 && Math.abs(tracked.y - corner.y) <= 1) {
    pass('background follows the cursor to the far corner', `${tracked.x},${tracked.y}`);
  } else {
    fail('background follows the cursor to the far corner',
      `${tracked.x},${tracked.y} vs ${corner.x},${corner.y}`);
  }

  // The whole reason for the swap: the mesh is *shoved* by the cursor rather than
  // leaning towards it. Sweeping the pointer across the middle has to change the
  // pixels there — every assertion above would pass on a static lattice.
  //
  // The steps are driven rather than awaited. This browser delivers about three
  // animation frames for a whole run, so waiting for real ones would test its
  // scheduler; `mesh.tick()` runs exactly the code the frame loop runs.
  const mesh = bg.mesh;
  if (meshCanvas && mesh) {
    const meshCtx = meshCanvas.getContext('2d');
    const mid = {
      x: Math.round(window.innerWidth / 2),
      y: Math.round(window.innerHeight / 2),
    };
    const box = [mid.x - 70, mid.y - 70, 140, 140];
    const before = meshCtx.getImageData(...box).data;

    // A sweep, not a jump: the push scales with pointer speed, and a single
    // teleport across the screen is deliberately read as an arrival instead.
    for (let i = 0; i < 8; i += 1) {
      window.dispatchEvent(new PointerEvent('pointermove', {
        clientX: mid.x - 160 + i * 40, clientY: mid.y, bubbles: true,
      }));
      mesh.tick(1 / 60);
    }
    const after = meshCtx.getImageData(...box).data;
    let changed = 0;
    for (let i = 3; i < before.length; i += 4) {
      if (before[i] !== after[i]) changed += 1;
    }
    if (changed > 40) pass('a cursor sweep displaces the mesh', `${changed} px changed`);
    else fail('a cursor sweep displaces the mesh', `${changed} px changed`);

    // And the springs have to pull it home again, or a single sweep would leave a
    // permanent dent in the lattice.
    window.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
    document.documentElement.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
    for (let i = 0; i < 240; i += 1) mesh.tick(1 / 60);
    const settled = meshCtx.getImageData(...box).data;
    let residual = 0;
    for (let i = 3; i < before.length; i += 4) {
      if (Math.abs(before[i] - settled[i]) > 24) residual += 1;
    }
    if (residual < Math.max(20, changed / 4)) {
      pass('the mesh springs back to rest', `${residual} px off`);
    } else {
      fail('the mesh springs back to rest', `${residual} px off vs ${changed} displaced`);
    }
  }


  // ---- 3c. The limelight nav ---------------------------------------------
  const railItems = [...document.querySelectorAll('.sidenav .limelight--vertical .limelight__item')];
  if (railItems.length === 8) pass('icon rail renders every screen', `${railItems.length} items`);
  else fail('icon rail renders every screen', `${railItems.length} items`);

  const drawn = railItems.filter((item) => item.querySelector('svg.icon')).length;
  if (drawn === railItems.length) pass('every nav item is a drawn icon', `${drawn}`);
  else fail('every nav item is a drawn icon', `${drawn} of ${railItems.length}`);

  // No labels and no emoji in the bar: the only text allowed is a badge count.
  const strayText = railItems
    .map((item) => item.textContent.trim())
    .filter((value) => value && !/^\d+$/.test(value));
  if (strayText.length === 0) pass('nav bar carries no text or emoji');
  else fail('nav bar carries no text or emoji', strayText.join(' | '));

  // Labels are gone from the screen, so they have to be somewhere assistive
  // tech and a hovering pointer can still reach them.
  const named = railItems.filter((item) => item.getAttribute('aria-label')
    && item.getAttribute('title')).length;
  if (named === railItems.length) pass('hidden labels survive as name + tooltip', `${named}`);
  else fail('hidden labels survive as name + tooltip', `${named} of ${railItems.length}`);

  const beam = document.querySelector('.sidenav .limelight__beam');
  const beamAtHome = beam ? beam.style.top : '';
  const settingsRail = document.querySelector('.sidenav .navlink[href="#/settings"]');
  const railRendered = nextRender('/settings');
  await click(settingsRail);
  await settle(railRendered);
  await sleep(120);
  const beamAtSettings = beam ? beam.style.top : '';
  if (beamAtHome && beamAtSettings && beamAtHome !== beamAtSettings) {
    pass('the limelight travels to the active screen', `${beamAtHome} → ${beamAtSettings}`);
  } else {
    fail('the limelight travels to the active screen', `${beamAtHome} → ${beamAtSettings}`);
  }

  // And it lands centred on the item, not merely somewhere new.
  if (beam && settingsRail) {
    const centred = Math.abs(
      (settingsRail.offsetTop + settingsRail.offsetHeight / 2)
      - (parseFloat(beamAtSettings) + beam.offsetHeight / 2)) <= 1.5;
    if (centred) pass('the limelight centres on the active item');
    else fail('the limelight centres on the active item',
      `beam ${beamAtSettings} item ${settingsRail.offsetTop}`);
  }

  // ---- 4. THE REGRESSION: navigation inside the same session -------------
  const screens = [
    ['/character', 'Attributes'],
    ['/skills', 'Skill tree'],
    ['/progress', 'Progress'],
    ['/guide', 'AI Guide'],
    ['/achievements', 'Achievements'],
    ['/quests', 'Questlines'],
    ['/settings', 'Experience'],
    ['/', 'Welcome back'],
  ];

  for (const [route, expected] of screens) {
    const link = document.querySelector(`.sidenav .navlink[href="#${route}"]`);
    if (!link) {
      fail(`nav link exists ${route}`);
      continue;
    }
    const rendered = nextRender(route);
    await click(link);
    await settle(rendered);
    const main = document.getElementById('main');
    if (window.location.hash.split('?')[0] === `#${route}` && main.textContent.includes(expected)) {
      pass(`navigate ${route}`, text('#main h1'));
    } else {
      fail(`navigate ${route}`, `hash=${window.location.hash} h1="${text('#main h1')}"`);
    }
  }

  // ---- 5. Browser back button --------------------------------------------
  const backRendered = nextRender('/settings');
  window.history.back();
  await settle(backRendered);
  if (document.getElementById('main').textContent.includes('Experience')) {
    pass('browser back button works');
  } else {
    fail('browser back button works', text('#main h1'));
  }

  // ---- 5a2. Screens let go of what they were holding ---------------------
  // `lifequest:detach` was listened for in two places and dispatched from none,
  // so the theme button's listener and the deadline board's timer both survived
  // every navigation. Anything holding a timer needs the event to fire, and the
  // only way to know it does is to watch for it.
  let detached = false;
  const probe = document.querySelector('#main .card, #main section');
  if (probe) {
    probe.addEventListener('lifequest:detach', () => { detached = true; });
    const goneRendered = nextRender('/progress');
    await click(document.querySelector('.sidenav .navlink[href="#/progress"]'));
    await settle(goneRendered);
    if (detached) pass('leaving a screen tells it to let go');
    else fail('leaving a screen tells it to let go', 'lifequest:detach never fired');

    // ...and the board that was holding a timer is gone with it.
    if (!document.querySelector('.flipboard')) pass('the deadline board is torn down');
    else fail('the deadline board is torn down', 'board still in the document');
  } else {
    fail('leaving a screen tells it to let go', 'nothing to probe');
  }

  // ---- 5b. The logo goes to the front page -------------------------------
  // Not to the dashboard: the dashboard is what the home nav item is for, and a
  // wordmark is the product's own page. A signed-in player has to be offered a
  // way back rather than an invitation to create a second character.
  const brand = document.querySelector('.topbar__brand, .rail__brand');
  if (brand) {
    const welcomeRendered = nextRender('/welcome');
    await click(brand);
    await settle(welcomeRendered);

    if (document.querySelector('[data-opening]')) pass('the logo opens the front page');
    else fail('the logo opens the front page', text('#main h1'));

    // Bare: the front page brings its own artwork and owns the whole viewport.
    if (document.getElementById('app').classList.contains('app--bare')) {
      pass('the front page drops the app chrome');
    } else {
      fail('the front page drops the app chrome');
    }

    const doorLabels = [...document.querySelectorAll('.open__door')]
      .map((node) => node.textContent.trim());
    if (doorLabels.length && doorLabels.every((label) => /back to your character/i.test(label))) {
      pass('a signed-in player is offered their character back', doorLabels[0]);
    } else {
      fail('a signed-in player is offered their character back', doorLabels.join(' | '));
    }

    // ...and the way back has to actually work, chrome and all.
    const homeRendered = nextRender('/');
    await click(document.querySelector('.open__door'));
    await settle(homeRendered);
    if (!document.getElementById('app').classList.contains('app--bare')
        && findByText('#main h1', 'welcome back')) {
      pass('the front page hands the player back to the app');
    } else {
      fail('the front page hands the player back to the app', text('#main h1'));
    }
  } else {
    fail('the logo opens the front page', 'no brand link');
  }

  // ---- 4b. The skill tree, drawn as a tree --------------------------------
  const treeRendered = nextRender('/skills');
  await click(document.querySelector('.sidenav .navlink[href="#/skills"]'));
  await settle(treeRendered);

  const buds = [...document.querySelectorAll('.grow__bud')];
  // Counted against the tree the API actually sent, not a number typed in here:
  // the point is that no skill is missing from the drawing, and hardcoding 21
  // made this fail the moment the tree grew rather than when it broke.
  const treeSize = (await (await fetch('/api/player/skills')).json()).tree.length;
  if (buds.length === treeSize) {
    pass('every skill is a bud on the tree', `${buds.length} of ${treeSize}`);
  } else {
    fail('every skill is a bud on the tree', `${buds.length} of ${treeSize}`);
  }

  const rings = document.querySelectorAll('.grow__ring').length;
  if (rings === 9) pass('every milestone is a growth ring', `${rings}`);
  else fail('every milestone is a growth ring', `${rings}`);

  if (document.querySelector('.grow__roots .grow__root')
      && document.querySelector('.grow__crown .grow__crownbranch')) {
    pass('the tree runs from roots to crown');
  } else {
    fail('the tree runs from roots to crown');
  }

  // Height is level: the level-1 foundations must sit below every later skill.
  const budY = (key) => {
    const node = document.querySelector(`.grow__bud[data-skill="${key}"]`);
    const match = node && /translate\([\d.]+ ([\d.]+)\)/.exec(node.getAttribute('transform'));
    return match ? parseFloat(match[1]) : NaN;
  };
  const foundation = budY('phys_foundation');
  const athlete = budY('phys_athlete');
  if (foundation > athlete) pass('level 1 sits at the roots, mastery at the top',
    `${Math.round(foundation)} > ${Math.round(athlete)}`);
  else fail('level 1 sits at the roots, mastery at the top', `${foundation} vs ${athlete}`);

  // No two buds may overlap, or the drawing is unreadable whatever it means.
  const spots = buds.map((bud) => {
    const match = /translate\(([\d.]+) ([\d.]+)\)/.exec(bud.getAttribute('transform'));
    return match ? { x: parseFloat(match[1]), y: parseFloat(match[2]) } : null;
  }).filter(Boolean);
  let collisions = 0;
  for (let a = 0; a < spots.length; a += 1) {
    for (let b = a + 1; b < spots.length; b += 1) {
      if (Math.abs(spots[a].y - spots[b].y) < 40 && Math.abs(spots[a].x - spots[b].x) < 60) {
        collisions += 1;
      }
    }
  }
  if (collisions === 0) pass('no two buds overlap');
  else fail('no two buds overlap', `${collisions} pairs`);

  // Picking a bud has to explain it — that is the whole interaction. Dispatched
  // rather than `.click()`: SVG elements do not inherit HTMLElement's click().
  buds[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(140);
  if (document.querySelector('.grow__panel .grow__detail')) pass('picking a bud explains it');
  else fail('picking a bud explains it');

  // ---- 6. The core loop, driven by clicks --------------------------------
  const questsRendered = nextRender('/quests');
  await click(document.querySelector('.sidenav .navlink[href="#/quests"]'));
  await settle(questsRendered);

  // Pick the academic quest specifically, so the evidence below genuinely
  // matches it and the *verified* path gets exercised.
  const academicCard = await waitFor('academic quest', () =>
    [...document.querySelectorAll('.quest')].find((c) => c.dataset.domain === 'academic'));
  const startButton = [...academicCard.querySelectorAll('button')]
    .find((b) => b.textContent.trim() === 'Start');
  await click(startButton);
  const submitButton = await waitFor('submit button', () =>
    [...document.querySelectorAll('.quest[data-domain="academic"] button')]
      .find((b) => b.textContent.trim() === 'Submit proof'), 400);
  pass('quest can be started from the UI');

  await click(submitButton);
  await waitFor('proof modal', () => document.querySelector('#proof-form textarea'));
  pass('proof modal opens');

  // There is exactly one write-up now — the reflection box is gone, because
  // reflection was the easiest part of a submission to write without doing the
  // work, and it is evidence that decides a verdict.
  const areas = document.querySelectorAll('#proof-form textarea');
  if (areas.length === 1) pass('the proof form asks for one write-up, not two');
  else fail('the proof form asks for one write-up, not two', `${areas.length} textareas`);

  areas[0].value = 'Read the chapter on rotational dynamics, then studied for thirty focused '
    + 'minutes and worked eight practice problems, marking the two I got wrong and reviewing '
    + 'the concept behind each error.';
  areas[0].dispatchEvent(new Event('input', { bubbles: true }));
  const minutes = document.querySelector('#proof-form input[name="minutes"]');
  if (minutes) minutes.value = '30';

  // A write-up alone must not be submittable: the button stays disabled and the
  // banner says what is missing. This is the rule the whole redesign rests on.
  const submitBtn = findByText('button', 'Submit for evaluation');
  const need = document.querySelector('.proof__need');
  if (need && submitBtn.disabled) {
    pass('a write-up alone cannot be submitted', need.textContent.slice(0, 46));
  } else {
    fail('a write-up alone cannot be submitted',
      need ? `banner but enabled button` : 'no requirement banner');
  }

  // ---- 6b. The draft survives leaving the form ---------------------------
  // Filling in proof now means leaving the page — to film something, to fetch a
  // tracker link, to move a photo off a phone. If the write-up died every time,
  // players would learn to submit something thin immediately rather than risk
  // losing it, which is the opposite of what the evidence rule is for.
  const typed = areas[0].value;
  await sleep(520);                       // past the save debounce
  // Closed the way a player closes it, so the modal's own teardown runs.
  await click(document.querySelector('.modal__close'));
  await sleep(140);
  if (!document.querySelector('#proof-form')) pass('the proof form can be closed');
  else fail('the proof form can be closed');

  await click([...document.querySelectorAll('.quest[data-domain="academic"] button')]
    .find((b) => b.textContent.trim() === 'Submit proof'));
  await waitFor('proof modal again', () => document.querySelector('#proof-form textarea'));
  const reopened = document.querySelectorAll('#proof-form textarea')[0];
  if (reopened.value === typed) {
    pass('the write-up survives closing the form', `${reopened.value.length} chars restored`);
  } else {
    fail('the write-up survives closing the form',
      `${reopened.value.length} of ${typed.length} chars`);
  }

  // The restored draft must not smuggle evidence back in with it: the upload
  // happened, but re-attaching it silently would put proof into a submission the
  // player did not consciously attach this time.
  const reSubmit = findByText('button', 'Submit for evaluation');
  if (reSubmit.disabled) pass('a restored draft still needs its evidence attaching');
  else fail('a restored draft still needs its evidence attaching');

  // Attach a real file through the real input, so the upload endpoint is
  // exercised rather than mocked. A one-pixel PNG is enough to be a valid image.
  const PNG_1X1 = Uint8Array.from(atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk'
    + 'YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
  const fileInput = document.querySelector('#proof-form input[type="file"]');
  if (fileInput) {
    const dt = new DataTransfer();
    dt.items.add(new File([PNG_1X1], 'worked-pages.png', { type: 'image/png' }));
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor('upload to land', () => !reSubmit.disabled, 300);
    if (!reSubmit.disabled) pass('attaching evidence unlocks submission');
    else fail('attaching evidence unlocks submission');
  } else {
    fail('a file can be attached', 'no file input on the proof form');
  }

  await click(findByText('button', 'Submit for evaluation'));

  try {
    await waitFor('assessment', () => document.querySelector('.verdict'), 600);
    const verdict = text('.verdict');
    if (/VERIFIED/i.test(verdict)) pass('proof verified and XP awarded', verdict);
    else fail('proof verified and XP awarded', verdict);
    if (document.body.textContent.includes('XP')) pass('reward breakdown shown');
    else fail('reward breakdown shown');
  } catch {
    fail('proof evaluated', 'no verdict shown');
  }

  // ---- 7. Theme and typographic emphasis ---------------------------------
  const settingsRendered = nextRender('/settings');
  await click(document.querySelector('.sidenav .navlink[href="#/settings"]'));
  await settle(settingsRendered);

  const options = [...document.querySelectorAll('.segmented__option')];
  if (options.length === 3) pass('theme control offers light, dark and auto');
  else fail('theme control offers light, dark and auto', `${options.length} options`);

  const lightOption = options.find((node) => /light/i.test(node.textContent));
  await click(lightOption);
  if (document.documentElement.dataset.theme === 'light') pass('choosing light repaints');
  else fail('choosing light repaints', String(document.documentElement.dataset.theme));

  // Auto has to resolve to a concrete palette, never leak the word "auto" into
  // the attribute the stylesheet reads.
  const autoOption = options.find((node) => /auto/i.test(node.textContent));
  await click(autoOption);
  const resolved = document.documentElement.dataset.theme;
  if (document.documentElement.dataset.themePref === 'auto'
      && ['light', 'dark'].includes(resolved)) {
    pass('auto resolves to a real palette', resolved);
  } else {
    fail('auto resolves to a real palette', `${document.documentElement.dataset.themePref}/${resolved}`);
  }

  const before = document.documentElement.dataset.themePref;
  await click(document.querySelector('.topbar .themebtn'));
  const after = document.documentElement.dataset.themePref;
  if (after && after !== before) pass('topbar toggle cycles the theme', `${before} → ${after}`);
  else fail('topbar toggle cycles the theme', `${before} → ${after}`);

  const homeRendered = nextRender('/');
  await click(document.querySelector('.sidenav .navlink[href="#/"]'));
  await settle(homeRendered);
  const keywords = document.querySelectorAll('#main .kw').length;
  if (keywords >= 2) pass('key words set in the accent face', `${keywords} found`);
  else fail('key words set in the accent face', `${keywords} found`);

  // ---- 8. Runtime health --------------------------------------------------
  if (errors.length === 0) pass('no runtime errors');
  else fail('no runtime errors', errors.slice(0, 3).join(' | '));

  record('DONE', `${lines.filter((l) => l.startsWith('FAIL')).length} failures`);
}

run().catch((error) => {
  fail('run aborted', error.message);
  record('DONE', `${lines.filter((l) => l.startsWith('FAIL')).length} failures`);
});
