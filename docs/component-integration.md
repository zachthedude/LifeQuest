# Integrating the shadcn components into LifeQuest

Four components were handed over for integration:

| Source | Where it lives now |
|---|---|
| `cinematic-landing-hero.tsx` | `web/js/views/landing.js` — the cinematic intro |
| `orbiting-circles-02.tsx` + `particalsphear` | `web/js/components/orbitingCircles.js`, `web/js/components/particleSphere.js` |
| `limelight-nav.tsx` | `web/js/components/limelightNav.js` — the app's navigation, both bars |
| `woven-light-hero.tsx` | `web/js/components/wovenLight.js` — the opening page's background |

All four are live. `python run.py`, open <http://127.0.0.1:8770>, and the
opening page is what loads; the limelight nav is the bar on every screen after
sign-in.

---

## 1. Does this codebase support the shadcn project structure?

**No — and it cannot be made to on this machine.** The brief for the components
assumes a shadcn project: TypeScript, Tailwind, `@/components/ui`, npm
dependencies. LifeQuest is none of those:

| Assumed | Actual |
|---|---|
| TypeScript | Plain ES modules, no build step |
| Tailwind CSS | A CSS custom-property design system (`web/css/styles.css`) |
| `@/…` path alias | Real relative paths, resolved by the browser |
| npm packages (`gsap`) | No `package.json`; **`node` and `npm` are not installed** |
| React components | Functions returning DOM nodes via `el()` in `web/js/ui.js` |

This is a deliberate, documented decision, not an accident — see the "Why this
stack" table in `README.md`. The machine has no Node, so a shadcn/Tailwind
project could have been *written* here but never run, tested or verified.

Two further constraints ruled out the original code even as a drop-in:

* **`script-src 'self'`** (`server/app.py`) — `gsap` cannot be loaded from a CDN
  as a substitute for installing it.
* **`img-src 'self' data: blob:`** — the orbiting component's icons, which it
  fetches from `images.shadcnspace.com`, would every one of them be blocked.

So every one of them was **ported**, not pasted: same structure, same
choreography, same prop names, rebuilt on what this project actually runs.
`limelight-nav.tsx` adds a fourth blocked dependency to the list —
`lucide-react` — and `woven-light-hero.tsx` a fifth and sixth, `three` and
`framer-motion`, for exactly the same two reasons. The woven hero also injects a
Google Fonts `<link>` on mount, which `style-src 'self'` and `font-src 'self'`
both refuse; the project has a local display face already.

### If you do want the shadcn structure

On a machine with Node 18+, in a fresh project:

```bash
# 1. A TypeScript + Tailwind app
npm create vite@latest lifequest-web -- --template react-ts
cd lifequest-web
npm install
npm install -D tailwindcss @tailwindcss/vite

# 2. Point Tailwind at the entry stylesheet (src/index.css)
#    @import "tailwindcss";

# 3. The @/* alias that every shadcn component imports through,
#    in tsconfig.json and tsconfig.app.json:
#    "baseUrl": ".", "paths": { "@/*": ["./src/*"] }
#    and the matching resolve.alias in vite.config.ts

# 4. shadcn itself — this writes components.json and src/lib/utils.ts (cn)
npx shadcn@latest init

# 5. Then drop the two .tsx files into src/components/ui/ and:
npm install gsap
```

`npx shadcn@latest init` records the paths it will use in `components.json`
(`aliases.components`, `aliases.ui`). The default resolves to
**`src/components/ui`**.

### Why the `/components/ui` folder matters

It is not decoration. Every shadcn component is published assuming it:

* **imports its siblings by that exact path** — `orbiting-circles-02.tsx` does
  `import ... from "@/components/ui/orbiting-circles-02-utils/particalsphear"`,
  and `cinematic-landing-hero.tsx` does `import { cn } from "@/lib/utils"`. Put
  the files elsewhere and every one of those imports has to be hand-edited, and
  re-editing is needed each time you pull an update.
* **is yours to edit** — shadcn copies source into your repo rather than
  installing a package. `ui/` is the agreed home for "vendored primitives I own
  and may modify", which keeps them separate from your feature components.
* **is where the CLI writes** — `npx shadcn@latest add <component>` resolves
  `aliases.ui` and writes there. A missing or non-standard folder means the CLI
  and every future `add` disagree with your tree.

The equivalent boundary exists in this port: `web/js/components/` holds
reusable, self-contained pieces (`orbitingCircles`, `particleSphere`);
`web/js/views/` holds screens (`landing`). Same separation, project-native names.

### Where components and styles live here

| shadcn | LifeQuest |
|---|---|
| `src/components/ui/*` | `web/js/components/*` |
| feature components | `web/js/views/*` |
| `src/lib/utils.ts` (`cn`) | `web/js/ui.js` (`el`, `svg`, `mount`, `whenSized`) |
| `src/index.css` + Tailwind theme | `web/css/styles.css` (tokens) + `web/css/landing.css` |

---

## 2. What replaced the external dependencies

### `gsap` + `ScrollTrigger` → `web/js/timeline.js`

The landing needs three things from GSAP: a pinned stage, a normalised 0→1
scroll progress, and eased tweens that read that progress instead of a clock.
That is ~180 lines, so it is owned outright rather than faked.

Differences worth knowing:

* **Pinning is CSS**, `position: sticky`, not JS. A sticky stage cannot drift
  while a frame is being computed and survives a stalled script.
* **The tick races `requestAnimationFrame` against a timer, and a 200 ms
  watchdog re-measures the scroll position.** This is not defensive
  programming for its own sake: in headless Chrome the page verifiably scrolls
  and the sticky stage verifiably moves, but *no scroll event is ever
  dispatched*, because scroll delivery rides the frame lifecycle. The same
  happens in background tabs and low-power mode. Without the watchdog the intro
  freezes at act I in exactly those environments.
* Tweens merge per element and sequence like a GSAP timeline: a later tween
  leaves a property alone until it starts, so the card can rise in act I and
  leave in act IV without the second tween pinning it flat for the first half.

### Remote SVG logos → LifeQuest's own glyphs

The CSP blocks `images.shadcnspace.com`, and lucide-react is a React package
that cannot be installed here. The orbiting seats carry the same icon vocabulary
the sidebar already uses (⚡ 🧠 🔥 ⚔️ 🌿 🏆 📈 ✨) — which is also more honest,
since the rings now show *this* product's systems rather than an unrelated logo
wall. No network request is involved, so the landing looks identical offline.

### The shape of the constellation

`orbiting-circles-02` ships as a half-globe cut off by the bottom edge, with a
particle sphere as its subject. That shape is still available as
`variant: 'horizon'`, but the landing uses `variant: 'centred'`: whole rings
around **the LifeQuest emblem**, in the middle of the stage.

The brief is that the animation revolves around the logo, and that is also the
argument the act is making — the mark stands for the character, the inner ring
is the three domains, then quests and skills, then achievements, progress and
the guide. The particle sphere stays, demoted to a halo behind the mark.

Ring diameters are in `vmin` and sized against the space *left under the copy*,
not the whole viewport: the widest ring otherwise pushes its lowest seats behind
the act rail on a short window.

### Unsplash imagery

Not used, and deliberately: the same CSP forbids remote images, and the card art
is generated (the particle sphere is drawn on a canvas, the mockup is CSS). The
landing ships with zero image dependencies beyond the existing local
`/img/emblem.svg`.

---

## 3. The answers to the integration questions

**What data/props does it take?** `landingView({ onEnter, brandName, tagline1,
tagline2, cardHeading, cardDescription, metricValue, metricLabel, ctaHeading,
ctaDescription })` — the same prop set as `CinematicHeroProps`, plus `onEnter`,
which is called with `'signup'` or `'login'`. `orbitingCircles({ rings, animate,
sphere, logo, variant, caption })`.

**State management?** None beyond the view. The landing is rendered before any
session exists, so it reads nothing from the store except the reduced-motion
preference. No provider, no context, no hook.

**Required assets?** None. Emblem aside, everything is drawn.

**Responsive behaviour?**

| Width | Landing |
|---|---|
| ≥ 900px | Three columns: copy, mockup, wordmark. Mockup at full scale. |
| < 900px | Column: wordmark, mockup, copy — the reorder the original does at the same breakpoint. Mockup at 0.68. |
| < 560px | Mockup at 0.58, supporting paragraph dropped, CTA buttons stack. |
| any, `prefers-reduced-motion` | No pin, no scrub: every act laid out as one static scrolling page. |

**Where does it belong?** One step behind the entry point. The opening page
(`web/js/views/opening.js`) is what a signed-out visitor gets first; the intro is
opt-in from its **Watch the two-minute intro** button — see below.

---

## 3b. `limelight-nav.tsx`

The third component, and the only one that replaced something rather than adding
to it: it **is** the app's navigation now, in both places the app has navigation.

**What data/props does it take?** `limelightNav({ items, defaultActiveIndex,
onTabChange, orientation, ariaLabel, className, limelightClassName,
iconContainerClassName, iconClassName })` — the original prop set, plus
`orientation`. An item is `{ id, icon, label, href, onClick, badge }`: `href`
renders an anchor so the hash router still owns navigation, and `badge` carries
the open-quest count the old sidebar showed as a pill.

**State management?** The original owns `activeIndex` in `useState`. Here the
**route owns it** — the returned handle exposes `setActive(index)`, and
`paintChrome` calls it on every navigation. That is not a stylistic port
decision: a bar that moves its own light on click would drift out of step with
the screen the moment a navigation failed, or the browser back button was used,
or a redirect landed somewhere else.

**Required assets?** None, and this is the third time the same constraint has
decided it: the demo imports `lucide-react`, npm does not exist on this machine,
and `img-src 'self'` forbids fetching the same glyphs from a CDN. So
`web/js/components/icons.js` draws the nine it needs in lucide's own idiom —
24×24, no fill, 2px round-capped strokes, `currentColor` so the bar's own state
colours them.

**Responsive behaviour?**

| Width | Navigation |
|---|---|
| ≥ 900px | Vertical rail, 88px wide, all 8 screens. Beam runs down the trailing edge, cone spills left across the icons. |
| < 900px | Horizontal bar pinned to the bottom: 5 primary screens plus **More**. Beam across the top edge, cone falling into the bar. |
| any, reduced motion | The beam is placed, not travelled — `setActive` adds `limelight--instant`. |

Both bars exist at all times and one of them is always `display: none`. A hidden
bar has no offsets, so placement is driven by a `ResizeObserver`: it fires when
the media query stops hiding the bar, which is the only moment the beam can be
measured correctly.

**Where does it belong?** Replacing `.sidenav` and `.tabbar`, which is where the
"remove the text and the emoji" part of the brief lands: the bar is icons only.
The names did not disappear, they moved — every item keeps an `aria-label` (for
assistive tech) and a `title` (the tooltip a pointer user gets), and on a phone
the **More** sheet still lists its three screens with labels, because that is the
one surface where an unfamiliar icon cannot be hovered.

---

## 3c. `woven-light-hero.tsx`

Used as a background, so only the canvas was ported — the component's own
headline, nav and button would have been thrown away on arrival, since the page
it now sits behind has all three.

**What data/props does it take?** The original takes none; the port takes
`mountWovenLight(container, { count, hues, saturation, lightness, size, opacity,
additive, spin, maxDpr, animate })`. Everything has a default, so the call site
in `opening.js` passes one thing: `animate: motionAllowed()`.

**State management?** None. It owns a WebGL context and a physics buffer, and
returns `{ destroy, setTheme, painted }` — the view calls `destroy` on teardown
and `setTheme` when the palette changes.

**Required assets?** None. The knot is generated.

**Responsive behaviour?** The layer is the hero's height and fades out at the
bottom; the canvas tracks its container. Below 900px the weave drops from 50,000
particles to 14,000 — the physics is CPU work and a phone is doing it on a
smaller battery. Under reduced motion it draws one still frame.

Four things differ from the original, each for a reason:

* **Every particle is distinct.** The original indexes 50,000 particles into a
  ~6,600-vertex geometry with `i % count`, so about seven particles share each
  position — and since the forces depend only on position, they never separate.
  Sampling the knot's tube parametrically gives the density the effect is after
  at the same particle count.
* **No allocation in the loop.** The React version news up four `THREE.Vector3`
  per particle per frame: 200,000 objects a frame. The arithmetic here is the
  same, written flat.
* **The cursor is un-rotated into model space.** The original tests the pointer
  against unrotated positions while the mesh spins, so the parting drifts away
  from the actual cursor.
* **The palette is the project's**, not `Math.random()` across the full
  spectrum: cyan → indigo → violet, with gold on a few strands because in this
  app gold is rare and means XP. `hues: [[0, 1]]` restores the rainbow.

**Where does it belong?** Behind the hero of the opening page — the pre-login
screen — and nowhere else. It stops before the sections below it, which are
reading matter.

---

## 4. How it is wired in

`web/js/main.js`:

```
boot() → no session? → renderOpening()  →  onEnter('signup' | 'login') → renderAuth(mode)
                                        →  onIntro() → renderLanding() → onEnter(...) → renderAuth
       → session, not onboarded         →  renderOnboarding()
       → session, onboarded             →  enterApp()
```

Signed-in players never see the intro, and neither does a signed-out visitor who
does not ask for it: the opening page is the first screen, and the cinematic is
one button at the bottom of it. A session that expires mid-visit drops to sign-in
directly, not into a cinematic.

The intro is skippable from the very first frame — the HUD's **Skip intro**
button and the <kbd>Esc</kbd> key both go straight to sign-up — so nobody has to
sit through 4 acts to reach the product.

### The four acts

| Progress | Act | What happens |
|---|---|---|
| 0.00 – 0.17 | I — The call | Headline decrypts, then blurs back as the card rises from below |
| 0.17 – 0.50 | II — The system | Card fills the screen; mockup flies in, dial counts to level, badges pop, wordmark and copy slide in |
| 0.56 – 0.86 | III — The constellation | The rings rise around the LifeQuest mark: the motto as the heading, the three goals named, every system orbiting the logo |
| 0.86 – 1.00 | IV — Character creation | Card pulls back and leaves; the two doors into the app are underneath |

### The game layer

The brief asked for it to feel more like a game, so the frame is a HUD: corner
brackets, a `LV 1 → 100` chip, and a bottom rail that reports progress through
the intro as an **XP bar with an act marker for each milestone**. Crossing an
act lights its marker, flashes the act name, announces it to screen readers, and
plays the app's own level-up chime (only after a real user gesture — browsers
block audio before one, and a page that beeps unprompted deserves the block).

---

## 5. Verification

```bash
python tests/browser_e2e.py     # 63 assertions, real clicks in headless Chrome
```

Six of those cover the cinematic itself: the card mounts, the rings build (16
seats), the particle canvas mounts, scrubbing the intro reaches the final act, and
the closing call to action is revealed and leads into sign-up. Eight more cover
the opening page in front of it: it renders first, leads with the tagline, is
addressed to students, offers both doors in the first screen, names the three
domains, spells out the evidence-before-XP loop, lists the student values, and
hands over to the intro on request.

The suite also still proves the whole original journey — sign-up, onboarding,
every nav route, quest completion with evidence — from behind the new front
door, with zero runtime errors.
