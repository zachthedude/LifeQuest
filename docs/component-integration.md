# Integrating the shadcn components into LifeQuest

Five components were handed over for integration:

| Source | Where it lives now |
|---|---|
| `cinematic-landing-hero.tsx` | `web/js/components/introActs.js` — two acts inline in the opening page; the other two merged into it |
| `orbiting-circles-02.tsx` + `particalsphear` | `web/js/components/orbitingCircles.js`, `web/js/components/particleSphere.js` |
| `limelight-nav.tsx` | `web/js/components/limelightNav.js` — the app's navigation, both bars |
| `woven-light-hero.tsx` | `web/js/components/wovenLight.js` — the opening page's background |
| `modern-login-signup.tsx` | `web/js/components/dotMatrix.js` + `web/js/views/auth.js` — the sign-in screen |

All five are live. `python run.py`, open <http://127.0.0.1:8770>, and the
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
`web/js/views/` holds screens (`opening`, `auth`). Same separation, project-native
names.

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
not the whole viewport: the widest ring otherwise pushes its lowest seats out of
the card on a short window.

### Unsplash imagery

Not used, and deliberately: the same CSP forbids remote images, and the card art
is generated (the particle sphere is drawn on a canvas, the mockup is CSS). The
landing ships with zero image dependencies beyond the existing local
`/img/emblem.svg`.

---

## 3. The answers to the integration questions

**What data/props does it take?** It began as `landingView({ onEnter, brandName,
tagline1, tagline2, cardHeading, cardDescription, metricValue, metricLabel,
ctaHeading, ctaDescription })` — the same prop set as `CinematicHeroProps`, plus
`onEnter`. Now that the acts are sections rather than a screen, the props that
were text the page already owned went with them: `introActs({ metricValue,
metricLabel, cardHeading, cardDescription })`, and the taglines and the closing
copy are `openingView`'s. There is no `onEnter` — the acts contain no doors,
because the page they are in has four. `orbitingCircles({ rings, animate, sphere,
logo, variant, caption })` is unchanged.

**State management?** None beyond the view. The acts render before any session
exists, so they read nothing from the store except the reduced-motion preference.
No provider, no context, no hook.

**Required assets?** None. Emblem aside, everything is drawn.

**Responsive behaviour?**

| Width | The acts |
|---|---|
| ≥ 900px | Three columns: copy, mockup, wordmark. Mockup at full scale. |
| < 900px | Column: wordmark, mockup, copy — the reorder the original does at the same breakpoint. Mockup at 0.68. |
| < 560px | Mockup at 0.58, supporting paragraph dropped. |
| any, `prefers-reduced-motion` | Laid out with no motion at all, and the dial settled rather than left counting from zero. |

**Where does it belong?** In the opening page (`web/js/views/opening.js`), after
the progression loop has been explained and before the case for students — by
then a reader knows what a quest and a proof are, which is what the mockup is
showing them. It is not a screen of its own any more; see §3f.

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

## 3d. `modern-login-signup.tsx`

The fifth component, and the second one to replace something rather than add to
it: it **is** the sign-in screen now. The layout is the component's — a
full-bleed animated dot field, a vignette, and one card centred on top of it —
where the old screen was a split art panel.

It also arrived with the same two blocked dependencies as everything before it,
plus a new one worth naming. The component does not import `three`; it *injects*
it, appending a `<script src="https://cdnjs.cloudflare.com/…/three.min.js">` to
the head on mount. `script-src 'self'` blocks that tag outright, and the
`onload` handler simply never runs — so the effect would have failed silently
rather than loudly, leaving a permanently empty canvas over the login form. That
is the worst of the failure modes seen in this project so far, and the reason
the port checks that its first frame actually painted before it commits to
being visible.

So the shader was kept and its host was replaced. three.js contributes four
things to this effect — a canvas, an orthographic camera that is the identity
transform for a clip-space quad, a two-triangle plane, and a uniform bag — and
all four are a few lines of WebGL2 each. `web/js/components/dotMatrix.js` is
that, with the fragment shader carried over as-is.

**What data/props does it take?** The original takes none — every value is
hard-coded in the component body. The port takes
`mountDotMatrix(container, { colors, opacities, totalSize, dotSize, speed,
scale, blend, animate, maxDpr })`, all defaulted to the original's constants, and
returns `{ canvas, painted, setPalette, destroy }`.

**State management?** None. `authView` owns the handle and tears it down when
sign-in succeeds; `ui.js`'s `mount()` clears a view's container without telling
it, so the loop also stops itself if it ever finds its canvas detached.

**Required assets?** None. Everything is generated, and — as with the landing —
no Unsplash imagery was used, because `img-src 'self' data: blob:` forbids
remote images. The only file involved is the existing local `/img/emblem.svg`.

**Responsive behaviour?** One centred column at every width; the field tracks its
container through a `ResizeObserver`. Below 780px of *height* the supporting
paragraph is dropped, which is the axis that actually matters for a screen whose
whole job is to fit a form. Under reduced motion the field paints one settled
frame and never starts a loop.

Five things differ from the original, each for a reason:

* **No OAuth buttons.** The component stacks Continue with Google / GitHub /
  Apple, and a Vercel terms-of-service footer. LifeQuest has one credential —
  username and password, hashed on this machine — and no OAuth of any kind, so
  all three would have been controls that cannot work, over small print naming
  a company that has nothing to do with this app. The three promises took the
  slot under the divider: same rhythm, and true.
* **highp, not mediump.** `u_resolution` is declared in both shaders, and the
  original's vertex stage inherits a different default precision than its
  fragment stage. A precision mismatch on a shared uniform is a **link error**,
  not a slow path. mediump also only holds integers exactly to 2048, which a
  2560-wide field in ×2 resolution units is well past.
* **WebGL2 is required, and its absence is designed for.** The effect indexes
  two uniform arrays with a computed value (`u_opacities[int(rand * 10.0)]`),
  which GLSL ES 1.00 does not guarantee. Rather than degrade to a blank
  rectangle, `.auth__field` draws the same grid as a CSS `radial-gradient`, and
  the canvas only takes over once it reports that it painted.
* **The first frame is not the frame it checks.** The effect opens on an empty
  grid and sweeps outwards from the centre, so at t≈0 a *correct* shader has
  drawn almost nothing. Probing the first frame reported failure every time; the
  probe draws a settled frame, reads that, and lets the animation restart.
* **The palette is the project's, and light mode is a different blend.** The
  original is white dots on black with `SrcAlpha, One` — additive, which is
  invisible on a pale ground. Light mode blends the same premultiplied output
  normally and inks dark dots instead. The colours are the app's, with exactly
  one of the six seats given to XP gold.

**Where does it belong?** `web/js/views/auth.js`, and nowhere else. The reactive
orb is still not on this screen — that decision (and its test) predates this
component and is unchanged; the dot field is a different layer in a different
container, and a fragment shader on two triangles is not the cost the orb was.

---

## 3e. The decrypt effect, on the front page

The brief that brought the login component in asked for the sign-in screen's text
transition to be carried over to the landing page's main text. It landed on the
cinematic's two taglines first; when the acts were folded into the opening page,
it followed the words rather than staying with the file.

The taglines were, word for word, the opening page's own headline — one `<h1>`
holding both sentences — so that is where the effect lives now:

| Line | Behaviour |
|---|---|
| `.open__headline` — "Real life is the game. You are the main character." | Decrypts on `mount`. One element for both sentences is what makes the sequence work: the glyphs lock left to right across the whole line, so the second sentence resolves after the first on its own, with no second timer to keep in step. |
| `.open__closinghead` — "Start at level 1." | Decrypts on `inview`. This is where act IV's closing headline went, and it is at the bottom of a long page, so it has to still be unresolved when it is finally reached. |

One CSS consequence is worth knowing about, and it caught both headlines. Each
paints a vertical gradient with `background-clip: text` **on the element itself**
— so the cells the decrypt layer builds have to give up their fill entirely and
let the parent's gradient through their glyphs, or the line is quietly repainted
flat. Only a *scrambling* glyph paints its own ink, so the boil stays visible
against the gradient.

`tests/browser/harness.js` asserts this by setting a cell to its settled state and
reading the computed fill, rather than racing the animation: the states are driven
by `requestAnimationFrame`, and frame delivery is not dependable under the
headless virtual clock — the same reason `timeline.js` carries a watchdog.

---

## 4. How it is wired in

`web/js/main.js`:

```
boot() → no session? → renderOpening()  →  onEnter('signup' | 'login') → renderAuth(mode)
       → session, not onboarded         →  renderOnboarding()
       → session, onboarded             →  enterApp()
```

There is one signed-out screen now. `renderLanding` is gone, and so is the route
it rendered: a signed-out visitor gets the opening page, reads down through the
acts if they keep scrolling, and leaves by one of the four doors on it. A session
that expires mid-visit drops to sign-in directly.

### The four acts

| Act | Where it is now |
|---|---|
| I — The call | Merged into the opening hero, which already said the same words. It kept the decrypt. |
| II — The system | A section: the mockup flies in, the dial counts to level, badges pop, wordmark and copy slide in. |
| III — The constellation | A section: the rings rise around the mark, the motto as the heading, the three goals named. |
| IV — Character creation | Merged into the opening page's closing section, which already was a headline and the two doors. It took the decrypt. |

Acts II and III animate against their own trip through the viewport rather than a
shared 0→1 track — `throughViewport` in `web/js/timeline.js`, passed to
`scrollScrub` as its `measure`. That is the one substantive change to the motion.
On a single track each act had to clear the stage for the next one, so every act
had an exit as well as an entrance; a section that faded out as you scrolled past
it would just be content you cannot read, so each act now arrives and stays. The
`from`/`to` values and the eases are the film's, untouched.

### What went with the film

The HUD, the corner brackets, the `LV 1 → 100` chip, the act rail with its live
percentage, the **Skip intro** button, <kbd>Esc</kbd>-to-skip, and the level-up
chime at each act boundary. All of it existed to make a film feel like a film you
could get out of. A page needs none of it: there is nothing to skip, the doors are
in the first viewport, and a page that plays a chime at you while you scroll is a
page people close. Roughly 240 lines of CSS went with them.

---

## 5. Verification

```bash
python tests/browser_e2e.py     # 66 assertions, real clicks in headless Chrome
```

Eight cover the opening page: it renders first, leads with the tagline, is
addressed to students, offers both doors in the first screen, names the three
domains, spells out the evidence-before-XP loop, and lists the student values.

Ten cover the acts now inside it: there is no intro button and no separate intro
screen left to launch, both acts are part of the page, the mockup mounts inline,
the rings build (16 seats), the particle canvas mounts, the constellation turns
around the logo, the three goals are named, the headline decrypts and exposes its
readable string, it keeps its gradient through the decrypt layer, and — the one
that actually proves the motion runs — **scrolling to an act drives it**: the
harness scrolls the mockup act into view and waits for the dial to leave zero.
Markup assertions cannot tell a working scrub from a dead one, so this is the
assertion that would have caught the whole feature failing.

Four cover the login port: the dot field's layer is present (and reports which of
the shader and the CSS fallback is live), the card is centred on it, the orb is
still absent, and the login artwork is there. The layer is what is asserted rather
than the canvas — the run is headless with `--disable-gpu`, so WebGL2 may or may
not exist there, and the fallback is a supported outcome rather than a failure.

The suite also still proves the whole original journey — sign-up, onboarding,
every nav route, quest completion with evidence — from behind the new front
door, with zero runtime errors.
