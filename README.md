# LifeQuest

**Real life is the game. You are the main character.**

A progression system where the quests are real actions: train the body, train the
mind, build something meaningful. Level 1 → 100, over months and years, with
evidence required before XP is awarded.

```
python run.py     →     http://127.0.0.1:8770
```

No dependencies to install. No build step. Python 3.11+ and a browser.

---

## Why this stack

The brief recommended Next.js + Prisma + PostgreSQL. This machine has no Node,
no npm, no Docker and no Postgres — that stack could have been *written* here but
never run, tested, or verified, and the brief is explicit that this must be a
working application rather than a mockup.

So the same architecture is implemented on what this machine can actually
execute and prove:

| Brief | Built as | Same properties |
|---|---|---|
| Next.js / React | Vanilla ES modules, no build step | Component functions, client router, central store |
| Tailwind | A CSS design-token system | One coherent visual language, light + dark + auto |
| Framer Motion | Web Animations API + CSS | XP flight, level-up, micro-interactions, `prefers-reduced-motion` |
| PostgreSQL + Prisma | SQLite + a thin typed data layer | Real relational schema, FKs, constraints, indexes, migrations |
| Server actions | A small router over `http.server` | Same middleware chain: auth → rate limit → CSRF → validate |

Every architectural requirement is met — the substitutions are transport-level.
Porting to Next.js/Postgres later is a rewrite of `server/routing.py`, `server/db.py`
and the view layer; the game engine, AI modules and schema move unchanged.

---

## Running it

```bash
cd lifequest
cp .env.example .env      # optional
python run.py
```

Then open <http://127.0.0.1:8770>, create a character, and complete the five-step
onboarding. You'll get a level 1 character with three domain quests plus a
teaching first mission.

Run the tests:

```bash
python tests/run_tests.py      # 71 unit + API + journey tests
python tests/browser_e2e.py    # 56 assertions driven by real clicks in headless Chrome
```

The browser suite signs up, onboards, clicks every nav link, starts a quest and
submits proof — all in one session. It exists because the navigation bug it now
guards was invisible to tests that loaded a URL with a cookie already set.

---

## The AI layer

Five separate modules, each with its own prompt and its own fallback:

| Module | File | Does |
|---|---|---|
| Quest Generator | `server/ai/quest_generator.py` | Scores 31 archetypes against the player model, then personalises the winner |
| Proof Evaluator | `server/ai/proof_evaluator.py` | Scores evidence on relevance / completion / quality / reflection / authenticity |
| Difficulty Engine | `server/ai/difficulty.py` | Moves a per-domain offset to hold success rate in the 55–80% band |
| Player Analyst | `server/ai/analyst.py` | XP over time, domain balance, consistency, success rates, time investment |
| Guide (VERA) | `server/ai/guide.py` | Reads the whole history and answers with real numbers |

**The app is fully functional with no API key.** Selection, scoring, evaluation
and analysis are deterministic local algorithms — a model, when configured,
improves the prose and the judgement but is never load-bearing.

Three providers sit behind one interface, chosen by `AI_PROVIDER` (default
`auto`):

| | |
|---|---|
| `AI_API_KEY` is set | the hosted API (`claude-opus-5` by default, official SDK if installed, else a stdlib HTTPS call) |
| Ollama is answering on `OLLAMA_URL` | that local model — no key, and nothing leaves the machine |
| neither | the built-in engine |

So `ollama serve` is the whole setup: VERA, quest generation, proof scoring and
difficulty all pick it up on the next restart. The default model is
`qwen2.5:latest`.

Two things about a local model are worth knowing, because they are the
difference between "usable" and "did it crash?":

- **Loading costs far more than answering.** Cold, a 4.7GB model took ~88s to
  return one sentence here; resident, the same call takes ~6s. So the server
  pre-warms it in a background thread at startup and asks Ollama to keep it
  resident (`OLLAMA_KEEP_ALIVE`, default 15m). Set `OLLAMA_WARM=0` to reclaim
  the RAM instead.
- **The timeout is separate** (`OLLAMA_TIMEOUT_SECONDS`, default 180). The
  hosted default of 45s would abort good replies mid-sentence.

Both test suites pin `AI_PROVIDER=none`. They assert the game loop, not a
model's opinion of the sample evidence, and must not change behaviour depending
on whether a daemon happens to be running on the machine.

The hosted key lives only in the server process and is never sent to the browser.

Critically, **anti-cheat runs server-side after the model**: a persuasive
submission cannot talk its way past duplicate-evidence detection, cooldowns,
repetition decay or the daily cap.

---

## Progression design

The per-level requirement grows geometrically with a decaying growth rate:

```
req(1) = 100        g(n) = 1.02 + 0.48 · e^(−(n−1)/8)
req(n+1) = req(n) · g(n)
```

| Level | XP for next | Cumulative |
|---|---|---|
| 1 | 100 | 0 |
| 2 | 150 | 100 |
| 3 | 217 | 250 |
| 10 | 1,242 | 4,280 |
| 25 | 4,788 | 47,989 |
| 50 | 9,494 | 224,725 |
| 75 | 15,707 | 530,715 |
| 100 | — | **1,033,946** |

Level 10 is a couple of weeks. Level 100 is a multi-year arc — and cannot be
short-cut, because:

- **Daily XP cap** of `300 + 60 × level`; XP past it drops to 20%.
- **Repetition decay**: `1 / (1 + 0.55 × prior completions)` on the same archetype
  in a rolling 7 days, floored at 0.15.
- **Same-archetype day limit**: the third attempt in one day is refused outright.
- **Cooldowns** on weekly, milestone and epic quests.
- **Quality multiplier** (0.4–1.15) from the proof assessment.
- **Burst detection**, duplicate-evidence hashing, and daily-XP anomaly damping.

Milestone and epic quests are deliberately exempt from the daily cap — finishing
a real project should not be penalised for also stretching that morning.

---

## Structure

```
run.py                    entry point
server/
  app.py                  middleware chain, static serving, HTTP adapter
  routing.py              Request/Response/Router (transport-agnostic → testable)
  api.py                  every endpoint
  security.py             pbkdf2, sessions, CSRF, rate limits, uploads, validation
  db.py  schema.sql       SQLite layer + relational schema
  game/
    xp.py                 level curve, attributes, reward formula, caps
    player.py             XP ledger, streaks, snapshots
    quests.py             quest lifecycle: generate → start → submit → award
    anticheat.py          gates, decay, anomaly detection
    catalog.py            31 quest archetypes + 3 questlines
    skills.py             21-node skill tree + 9 level milestones
    achievements.py       19 achievements
    safety.py             unsafe-request detection and redirects
  ai/                     the five modules + provider abstraction
web/
  index.html  css/  js/   the SPA: 8 screens, opening, landing, auth, onboarding
    js/theme.js           light/dark/auto, resolved before first paint
    js/timeline.js        scroll-scrubbed timeline (the GSAP/ScrollTrigger stand-in)
    js/views/opening.js   the opening page — first screen for signed-out visitors
    js/views/landing.js   the cinematic intro, one click from the opening page
    js/blob.js            the WebGL orb (noise-displaced icosphere)
    js/components/        limelight nav, icons, app background, orbiting circles,
                          particle sphere, theme control
tests/                    71 tests, including the full journey from the brief
```

## Colour, theme and emphasis

The palette is cool throughout — indigo, violet, cyan, teal — with exactly one
warm colour left in it: **XP gold**. Gold is reserved for levels, XP and
streaks, which is what makes it read as reward rather than decoration; primary
actions use the indigo accent instead. The centred display type runs dark blue
into purple in both themes.

**Light, dark and auto.** `js/theme.js` runs from `<head>`, before the first
paint, so a light-mode visitor never sees a black flash. The stylesheet only
ever sees a *resolved* palette:

```
data-theme       light | dark          what is on screen
data-theme-pref  light | dark | auto   what the player chose
```

which is why no palette is written twice, once for an explicit choice and again
inside a `prefers-color-scheme` query. "Auto" keeps following the OS — a machine
that switches at sunset switches the app with it, mid-session. The choice is
stored locally (so it applies before sign-in) and on the account (so it follows
you to another browser). Change it from the topbar toggle, the opening page's
bar, the landing HUD, or Settings → Experience.

The deep card on the landing and the phone mockup inside it stay dark in both
themes: they are the product surface being shown off, not chrome.

**Key words change face mid-sentence**, on three channels at once — weight,
typeface and colour. Colour alone would be doing the job for nobody who cannot
separate the tint from the text, so every variant also changes face or weight:

| Variant | Face | Means |
|---|---|---|
| default | serif italic, violet | an idea being named |
| `strong` | rounded black, ink | a plain, hard emphasis |
| `xp` | monospace, gold | a number, a level, an amount |
| `physical` / `academic` / `passion` | rounded bold, domain colour | one of the three domains |

`rich(text, words)` in `js/ui.js` does the splitting — `[word, variant]` pairs,
longest match first — and everything goes through `textContent`, so a key word
is never a markup hole. Inside the deep card the tints come from a fixed set
instead of the tokens, because the light-mode values are far too dark to read
against it.

## The opening page

The front door, and the first thing a signed-out visitor sees. It is not the home
screen — that is the dashboard, behind sign-in — and it is deliberately not the
cinematic either: one still hero (wordmark, tagline, one line of what this is,
two doors), then the case for the product in three calm sections. Both ways in
are reachable before any scrolling, and the whole page works with scripting off.

The audience it is written for is students, and the copy says so in the product's
own vocabulary rather than in slogans:

* **Three domains, one character** — train the body, train the mind, build
  something. School measures one of the three; a student who is growing is moving
  on all of them, so all three are levelled here. Each domain card carries a real
  quest from the catalogue rather than a promise.
* **Evidence first, then XP** — the loop in four beats: get your quests, do the
  real thing away from the screen, submit the proof, and *then* the level moves.
* **Built to grow a person, not a score** — an honest curve, growth rather than
  grades (no leaderboard, nobody to lose to), a guide rather than a grader, and
  private by default.

Physical quests are described the way the game actually generates them — about
capability and health, never appearance — because that is the promise a student
should be able to read before signing up, not discover afterwards.

`js/views/opening.js` + `css/opening.css`, self-contained and built from the same
tokens as everything else, so it themes light/dark with the rest of the app. The
cinematic intro sits behind **Watch the two-minute intro** at the bottom.

## Navigation

Icons only, in both bars. `js/components/limelightNav.js` is a port of the
`limelight-nav` component: a bright bar — the limelight — slides to the active
item and throws a cone of light over it. One component, two orientations: an
88px rail on the desktop with the beam down its trailing edge, and a bar pinned
to the bottom of a phone with the beam across its top.

The active item belongs to the **route**, not to the component. The original
holds it in `useState`; here `paintChrome` calls `setActive` on every navigation,
so the light cannot end up on a screen you are not looking at — after a back
button, a redirect, or a navigation that failed.

The labels did not disappear, they moved: every item keeps an `aria-label` for
assistive tech and a `title` for the tooltip, and the phone's **More** sheet still
names its three screens in text, since an icon on a touch screen cannot be
hovered. The emoji are gone entirely — `js/components/icons.js` draws the nine
glyphs the bar needs in lucide's idiom (24×24, no fill, 2px round caps,
`currentColor`), because `lucide-react` needs npm and the CSP forbids fetching
the same shapes from a CDN.

## The reactive orb

`js/blob.js` is a noise-displaced icosphere in raw WebGL — the vertices ride
Perlin noise along their normals, and the displacement drives the colour. It runs
as the background of the signed-in app: one fixed layer under every screen,
including home, mounted by `js/components/appBackground.js` when a player enters
and torn down whenever the shell goes bare.

Two things make it a background rather than a decoration:

* **The pointer comes from the window.** A layer behind the content never receives
  pointer events of its own, so reading them from the container would leave the
  orb frozen in the middle of the page.
* **`reach: 'viewport'` removes the leash.** The pointer is mapped to the visible
  world extent rather than to a unit box, so the orb's centre lands wherever the
  cursor is — including the corners, where most of it hangs off the edge — and it
  eases there over a few frames rather than snapping.

The ceiling on how strong it can be is text contrast, not taste: every card in the
app is translucent, so anything bright behind one lifts its background and eats the
contrast of the copy on top. Both dials live on `.appbg` in `styles.css` —
`--orb-opacity` and `--orb-blur`, per theme — so the intensity is two numbers to
change, and the layer removes its canvas entirely if WebGL is missing or the first
frame drew nothing, leaving a cursor-tracked highlight that needs no GPU.

## The landing

The cinematic intro, reached from the opening page: a four-act film. It opens
on the emblem under the motto — *build the person you want to be* — the headline
decrypts, a deep card rises and takes the screen, the app mockup flies in and
counts up a level, and then act III brings the mark back at the centre of the
stage with every system in the product turning around it: the three domains on
the inner ring, quests and skills next, achievements, progress and the guide
outermost. The card then pulls back to reveal the two ways in. A HUD frames it — corner brackets, a
`LV 1 → 100` chip, and an XP-style rail that tracks progress through the intro
with a marker per act.

The whole thing plays over 8.5 viewports of scrolling (7 on a phone, where the
same number of viewports is a lot more thumb work). The act boundaries are
proportions of that track, so the pace is one number to change.

It is skippable from the first frame (**Skip intro**, or <kbd>Esc</kbd>), nobody is
made to sit through it to reach the product — it is opt-in from the opening page —
signed-in players never see it, and under `prefers-reduced-motion` it degrades to
the same content as one plain scrolling page.

Both screens were ported from React/Tailwind/shadcn components — the how and the
why, including how to set this up as a real shadcn project on a machine that has
Node, is in [`docs/component-integration.md`](docs/component-integration.md).

## Verified

The suite walks the brief's own acceptance checklist end to end: create account →
onboard → level 1 character → starter quests → start → submit proof → AI
evaluation → XP → attributes → achievements → skills → analytics → new quest →
difficulty adaptation → every screen → error and empty states. Screens were also
rendered in headless Chrome at desktop and mobile widths.
