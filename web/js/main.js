// Bootstrap: shell chrome, routing, and the auth / onboarding gates.

import { api } from './api.js';
import { bootstrap, refreshNotifications, refreshPlayer, refreshQuests, state, subscribe }
  from './store.js';
import { navigate, onNavigate, register, render, setNotFound, start } from './router.js';
import { el, emptyState, meter, modal, mount, toast } from './ui.js';

import { mountAppBackground, unmountAppBackground } from './components/appBackground.js';
import { icon } from './components/icons.js';
import { limelightNav } from './components/limelightNav.js';
import { themeButton } from './components/themeControl.js';
import { dashboardView } from './views/dashboard.js';
import { questsView } from './views/quests.js';
import { characterView } from './views/character.js';
import { skillsView } from './views/skills.js';
import { progressView } from './views/progress.js';
import { guideView } from './views/guide.js';
import { achievementsView } from './views/achievements.js';
import { settingsView } from './views/settings.js';
import { authView } from './views/auth.js';
import { landingView } from './views/landing.js';
import { openingView } from './views/opening.js';
import { onboardingView } from './views/onboarding.js';

export const MOTTO = 'Build the person you want to be';

// Path, accessible name, icon. The names are still here — they are the tooltip
// and the accessible name — but the bar itself is icons only.
const NAV = [
  ['/', 'Home', 'home'],
  ['/quests', 'Quests', 'sword'],
  ['/character', 'Character', 'user'],
  ['/skills', 'Skills', 'sprout'],
  ['/progress', 'Progress', 'trending'],
  ['/guide', 'AI Guide', 'sparkles'],
  ['/achievements', 'Achievements', 'trophy'],
  ['/settings', 'Settings', 'settings'],
];

// Five thumb-reachable tabs; everything else lives behind "More" so no screen
// is unreachable on a phone.
const MOBILE_PRIMARY = ['/', '/quests', '/character', '/progress', '/guide'];
const MOBILE_MORE = ['/skills', '/achievements', '/settings'];

/**
 * A labelled row for the "More" sheet. The bar is icons only, so this sheet is
 * the one place on a phone where the three secondary screens can be *read* —
 * which is exactly why it keeps its labels.
 */
function navLink(path, label, glyph, current) {
  return el('a', {
    class: 'navlink navlink--sheet', href: `#${path}`,
    'aria-current': current === path ? 'page' : null,
  },
    icon(glyph, { size: 20, className: 'navlink__glyph' }),
    el('span', { class: 'navlink__label', text: label }));
}

function openMoreMenu(current) {
  modal({
    title: 'More',
    body: el('div', { class: 'stack', style: { gap: '8px' } },
      ...MOBILE_MORE.map((path) => {
        const [, label, glyph] = NAV.find(([p]) => p === path);
        const link = navLink(path, label, glyph, current);
        link.addEventListener('click', () => {
          import('./ui.js').then((ui) => ui.closeModal());
        });
        return link;
      })),
  });
}

// The limelight has to *travel* between screens, which it cannot do if the bar
// is rebuilt on every navigation. So both bars are built once and then updated:
// `setActive` moves the beam, `setBadge` keeps the quest count honest.
let rail = null;
let tabs = null;
let railLevel = null;

function buildChrome() {
  const sidenav = document.getElementById('sidenav');
  const tabbar = document.getElementById('tabbar');

  rail = limelightNav({
    orientation: 'vertical',
    ariaLabel: 'Primary',
    items: NAV.map(([path, label, glyph]) => ({
      id: path, href: `#${path}`, label, icon: icon(glyph, { size: 22 }),
    })),
  });

  // Level and XP, compacted to fit an icon rail: the ring is the meter.
  railLevel = el('div', { class: 'rail__level' });

  mount(sidenav,
    el('a', { class: 'rail__brand', href: '#/', 'aria-label': 'LifeQuest home' },
      el('img', { class: 'brand__mark', src: '/img/emblem.svg', alt: '',
                  width: '32', height: '32' })),
    rail.node,
    el('div', { class: 'nav-spacer' }),
    railLevel);

  const tabItems = MOBILE_PRIMARY.map((path) => {
    const [, label, glyph] = NAV.find(([p]) => p === path);
    return { id: path, href: `#${path}`, label, icon: icon(glyph, { size: 22 }) };
  });
  tabItems.push({
    id: 'more', label: 'More', icon: icon('more', { size: 22 }),
    onClick: () => openMoreMenu(window.location.hash.replace(/^#/, '').split('?')[0] || '/'),
  });

  tabs = limelightNav({
    orientation: 'horizontal',
    ariaLabel: 'Primary mobile',
    items: tabItems,
  });
  mount(tabbar, tabs.node);
}

/** Drop the cached bars so the next entry rebuilds them for the new session. */
function resetChrome() {
  rail?.destroy();
  tabs?.destroy();
  rail = null;
  tabs = null;
  railLevel = null;
}

function paintChrome(current) {
  const snapshot = state.snapshot;
  const sidenav = document.getElementById('sidenav');
  const topbar = document.getElementById('topbar');
  const tabbar = document.getElementById('tabbar');
  if (!sidenav || !topbar || !tabbar) return;

  const openQuests = state.quests.filter((q) => q.status !== 'verified').length;

  if (!rail || !tabs) buildChrome();

  const railIndex = NAV.findIndex(([path]) => path === current);
  if (railIndex >= 0) rail.setActive(railIndex);
  rail.setBadge('/quests', openQuests);

  // "More" owns the beam whenever the screen you are on lives behind it.
  const tabIndex = MOBILE_PRIMARY.indexOf(current);
  tabs.setActive(tabIndex >= 0 ? tabIndex : (MOBILE_MORE.includes(current)
    ? MOBILE_PRIMARY.length
    : tabs.activeIndex()));
  tabs.setBadge('/quests', openQuests);

  mount(railLevel, snapshot
    ? el('div', { class: 'rail__ring', style: { '--pct': String(Math.round(snapshot.xp.percent)) },
                  title: `${snapshot.title} — level ${snapshot.level}, `
                    + `${Math.round(snapshot.xp.percent)}% to the next` },
      el('b', { class: 'num', text: String(snapshot.level) }))
    : null);

  mount(topbar,
    el('a', { class: 'topbar__brand', href: '#/', 'aria-label': 'LifeQuest home' },
      el('img', { class: 'brand__mark', src: '/img/emblem.svg', alt: '', width: '28', height: '28' }),
      el('b', { class: 'topbar__name', text: 'LifeQuest' })),
    snapshot
      ? el('div', { class: 'topbar__xp' },
        meter(snapshot.xp.percent, 'xp',
          `Level ${snapshot.level}`,
          snapshot.xp.isMaxLevel ? 'MAX'
            : `${snapshot.xp.xpIntoLevel.toLocaleString()} / ${snapshot.xp.xpForNextLevel.toLocaleString()} XP`))
      : null,
    el('div', { class: 'row topbar__actions' },
      snapshot ? el('span', { class: 'chip chip--xp', title: 'Current streak',
                              text: `🔥 ${snapshot.streak.current}` }) : null,
      themeButton(),
      state.unreadNotifications
        ? el('button', {
          class: 'btn btn--ghost btn--sm', text: `${state.unreadNotifications} new`,
          onClick: async () => {
            const items = await api.notifications();
            await api.markNotificationsRead();
            await refreshNotifications();
            for (const item of items.notifications.slice(0, 4)) {
              toast('Notification', item.body, 'info');
            }
          },
        })
        : null,
      el('a', { class: 'btn btn--ghost btn--sm topbar__settings', href: '#/settings',
                text: 'Settings' })));
}

function showShell(visible, bare = false) {
  const app = document.getElementById('app');
  const boot = document.getElementById('boot');
  boot.hidden = true;
  app.hidden = !visible;
  app.classList.toggle('app--bare', bare);
  document.body.classList.toggle('body--bare', bare);
  // The orb belongs to the app chrome. Every bare screen — opening, cinematic,
  // sign-in, onboarding — has its own artwork and gets the plain colour field, so
  // one call here covers all of them rather than four call sites that can drift.
  if (bare) unmountAppBackground();
}

/** Enter the playable app. Called from every entry path. */
async function enterApp() {
  await Promise.all([refreshPlayer(), refreshQuests(), refreshNotifications()]);
  showShell(true, false);
  mountAppBackground();
  if (!window.location.hash || window.location.hash === '#') {
    window.location.replace('#/');
  }
  start();          // idempotent: attaches the hashchange listener once, then renders
}

function renderAuth(mode = 'signup') {
  showShell(true, true);
  window.scrollTo(0, 0);
  mount(document.getElementById('main'), authView({
    mode,
    onAuthenticated: async (user) => {
      state.user = user;
      if (user.onboarded) await enterApp();
      else renderOnboarding();
    },
  }));
}

/**
 * The cinematic intro. Reached from the opening page's "watch the intro"
 * button; the HUD's skip button and both closing buttons hand straight over to
 * sign-in, so nobody has to sit through it to reach the product.
 */
function renderLanding() {
  showShell(true, true);
  // A reload part-way down the intro would otherwise restore the old scroll
  // position and drop you into the middle of act III with no context.
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  mount(document.getElementById('main'), landingView({ onEnter: renderAuth }));
}

/**
 * The front door. A signed-out visitor sees this first — a still page that says
 * what LifeQuest is for and offers the two ways in. The home screen is the
 * dashboard, which lives behind sign-in; the cinematic intro is one click away
 * at the bottom of this page for anyone who wants the long version.
 */
function renderOpening() {
  showShell(true, true);
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  mount(document.getElementById('main'), openingView({
    onEnter: renderAuth,
    onIntro: renderLanding,
  }));
}

function renderOnboarding() {
  showShell(true, true);
  mount(document.getElementById('main'), onboardingView({
    onComplete: async () => {
      state.user = { ...state.user, onboarded: true };
      await enterApp();
    },
  }));
}

function registerRoutes() {
  register('/', dashboardView);
  register('/quests', questsView);
  register('/character', characterView);
  register('/skills', skillsView);
  register('/progress', progressView);
  register('/guide', guideView);
  register('/achievements', achievementsView);
  register('/settings', settingsView);
  setNotFound(() => Promise.resolve(emptyState('🧭', 'Screen not found',
    'That page does not exist in this build.',
    el('a', { class: 'btn btn--primary', href: '#/', text: 'Back to home' }))));
}

async function boot() {
  registerRoutes();
  onNavigate((path) => paintChrome(path));
  subscribe(() => paintChrome(window.location.hash.replace(/^#/, '').split('?')[0] || '/'));

  try {
    await bootstrap();
  } catch (error) {
    document.getElementById('boot').hidden = true;
    showShell(true, true);
    mount(document.getElementById('main'), emptyState('🔌', 'Cannot reach LifeQuest',
      'The server is not responding. Check that it is running, then reload.',
      el('button', { class: 'btn btn--primary', text: 'Reload',
                     onClick: () => window.location.reload() })));
    return;
  }

  if (!state.user) return renderOpening();
  if (!state.user.onboarded) return renderOnboarding();
  await enterApp();
}

// A session can expire mid-visit; drop cleanly back to sign-in either way.
function handleUnauthenticated() {
  state.user = null;
  state.snapshot = null;
  resetChrome();
  renderAuth();
}
window.addEventListener('lifequest:unauthenticated', handleUnauthenticated);
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.status === 401) {
    event.preventDefault();
    handleUnauthenticated();
  }
});

boot();
