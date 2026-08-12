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

  // ---- 0b. The cinematic intro -------------------------------------------
  const introButton = document.querySelector('.open__introlink');
  if (introButton) pass('opening offers the cinematic intro');
  else fail('opening offers the cinematic intro');
  await click(introButton || document.querySelector('.open__door--solid'));

  const landing = await waitFor('landing', () => document.querySelector('[data-landing]'), 600);
  pass('the intro plays from the opening page', landing.dataset.landing);

  if (document.querySelector('.landing__card .phone__screen')) pass('cinematic card mounted');
  else fail('cinematic card mounted');

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
  if (document.querySelector('.landing__hero .landing__mark')
      && /build the person you want to be/i.test(text('.landing__hero .eyebrow'))) {
    pass('landing opens on the mark and the motto');
  } else {
    fail('landing opens on the mark and the motto', text('.landing__hero .eyebrow'));
  }
  const goals = document.querySelectorAll('.landing__goals li').length;
  if (goals === 3) pass('the three goals are named', `${goals}`);
  else fail('the three goals are named', `${goals}`);

  // The timeline is scroll-driven, so scrolling is the only honest way to
  // prove the acts advance rather than just that the markup exists.
  window.scrollTo(0, document.documentElement.scrollHeight);
  try {
    await waitFor('final act', () => text('.landing__railpct') === '100%', 500);
    pass('scrubbing the intro reaches the final act');
  } catch {
    fail('scrubbing the intro reaches the final act', text('.landing__railpct') || '(no rail)');
  }
  const ctaVisible = getComputedStyle(document.querySelector('.landing__cta')).visibility;
  if (ctaVisible !== 'hidden') pass('closing call to action revealed');
  else fail('closing call to action revealed', ctaVisible);

  const ctaStart = [...document.querySelectorAll('.landing__cta-btn')]
    .find((node) => /start my quest/i.test(node.textContent));
  if (ctaStart) pass('landing offers a way into sign-up');
  else fail('landing offers a way into sign-up');
  await click(ctaStart || document.querySelector('.landing__skip'));

  // ---- 1. Sign-up screen -------------------------------------------------
  await waitFor('auth form', () => document.querySelector('form input[name="username"]'), 600);
  pass('auth screen renders');

  if (document.querySelector('.auth__stage .auth__image')) pass('login artwork present');
  else fail('login artwork present');

  // The reactive orb moved off this screen and into the app background, so its
  // absence here is part of the contract, not an accident.
  if (!document.querySelector('.appbg') && !document.querySelector('.auth__stage canvas')) {
    pass('no orb on the sign-in screen');
  } else {
    fail('no orb on the sign-in screen');
  }

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

  // ---- 3b. The reactive orb behind the app -------------------------------
  const orb = await waitFor('orb layer', () => document.querySelector('.appbg'), 400);
  pass('reactive orb layer runs behind the app');

  const orbCanvas = orb.querySelector('.blob__canvas');
  if (orbCanvas) {
    // Layout box against the layout viewport. The painted box is deliberately
    // larger — the canvas is scaled up so its blur spills past the frame — so
    // measuring `getBoundingClientRect` here would be measuring the overspill.
    const viewport = {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    };
    const spans = orbCanvas.offsetWidth >= viewport.width - 2
      && orbCanvas.offsetHeight >= viewport.height - 2;
    const detail = `${orbCanvas.offsetWidth}x${orbCanvas.offsetHeight} of `
      + `${viewport.width}x${viewport.height}`;
    if (spans) pass('orb spans the whole viewport', detail);
    else fail('orb spans the whole viewport', detail);
    if (orb.classList.contains('appbg--live')) pass('orb painted a first frame');
    else fail('orb painted a first frame', orb.className);
  } else {
    // No usable WebGL in this browser: the layer must degrade to the cursor
    // highlight rather than leave an empty canvas over the app.
    if (orb.classList.contains('appbg--flat')) pass('orb degrades without WebGL');
    else fail('orb degrades without WebGL', orb.className);
  }

  // Cursor tracking is window-level and unclamped: a pointer in the far corner
  // has to move the orb to the far corner, not to the edge of a small box.
  const corner = { x: window.innerWidth - 4, y: window.innerHeight - 4 };
  window.dispatchEvent(new PointerEvent('pointermove', {
    clientX: corner.x, clientY: corner.y, bubbles: true,
  }));
  await sleep(80);
  const tracked = {
    x: parseFloat(orb.style.getPropertyValue('--orb-x')),
    y: parseFloat(orb.style.getPropertyValue('--orb-y')),
  };
  if (Math.abs(tracked.x - corner.x) <= 1 && Math.abs(tracked.y - corner.y) <= 1) {
    pass('orb follows the cursor to the far corner', `${tracked.x},${tracked.y}`);
  } else {
    fail('orb follows the cursor to the far corner',
      `${tracked.x},${tracked.y} vs ${corner.x},${corner.y}`);
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

  // ---- 4b. The skill tree, drawn as a tree --------------------------------
  const treeRendered = nextRender('/skills');
  await click(document.querySelector('.sidenav .navlink[href="#/skills"]'));
  await settle(treeRendered);

  const buds = [...document.querySelectorAll('.grow__bud')];
  if (buds.length === 21) pass('every skill is a bud on the tree', `${buds.length}`);
  else fail('every skill is a bud on the tree', `${buds.length}`);

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

  const areas = document.querySelectorAll('#proof-form textarea');
  areas[0].value = 'Read the chapter on rotational dynamics, then studied for thirty focused '
    + 'minutes and worked eight practice problems, marking the two I got wrong and reviewing '
    + 'the concept behind each error.';
  if (areas[1]) {
    areas[1].value = 'I learned that my errors cluster in the setup rather than the arithmetic.';
  }
  const minutes = document.querySelector('#proof-form input[name="minutes"]');
  if (minutes) minutes.value = '30';
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
