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

## Live demo

https://zachthedude.github.io/LifeQuest/ runs the real Python server in your browser
with Pyodide (`web/js/demo.js`); your save stays in that browser. Rebuild and publish
with `python tools/build_pages.py --push`.

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
python tests/run_tests.py      # 108 unit + API + journey tests
python tests/browser_e2e.py    # 101 assertions driven by real clicks in headless Chrome
```

The browser suite signs up, onboards, clicks every nav link, starts a quest and
submits proof — all in one session. It exists because the navigation bug it now
guards was invisible to tests that loaded a URL with a cookie already set.

---

## The AI layer

Five separate modules, each with its own prompt and its own fallback:

| Module | File | Does |
|---|---|---|
| Quest Generator | `server/ai/quest_generator.py` | Scores 48 archetypes against the player model, then personalises the winner |
| Proof Evaluator | `server/ai/proof_evaluator.py` | Scores evidence on relevance / completion / quality / **evidence** / authenticity |
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

## Forgetting your password

The front page promises no email address is ever asked for, and the app has no
mail server. So there is nowhere to send a reset link to, and inventing one would
be a lie about where the data goes.

The code is printed to the server log instead — the terminal running
`python run.py`, which on a machine the player owns is the most private channel
available and needs no third party at all:

```
17:27:33  WARNING  PASSWORD RESET for zach - code LQ-E9C3-DGLP-723L (valid 15 minutes).
```

`POST /api/auth/recover` mints it, `POST /api/auth/reset` spends it, and the
rules around it are the ordinary ones:

* **Only the hash is stored**, exactly as for a session token, so a stolen
  database yields no usable codes.
* **Single use, fifteen minutes.** The row is marked spent rather than deleted,
  so a code cannot be replayed inside its own expiry window, and asking again
  drops the previous code rather than leaving two that work.
* **A code is bound to its account.** It cannot be spent against a different
  username even by someone holding it.
* **The response never says whether the account exists.** An unknown username and
  a real one return the same body, and nothing is minted or logged for the
  unknown one — otherwise this endpoint would be a way to enumerate players.
* **Every session is signed out on success.** Someone resetting a password may be
  doing it precisely because another browser is still signed in as them.
* **A rejected password does not burn the code**, and the alphabet has no O/0,
  I/1 or U in it, because the code is going to be copied by hand off a terminal
  at least once.

Recovery is a detour off sign-in rather than a third door: a quiet **Forgot your
password?** under the form, never shown on the sign-up tab, since there is nothing
to recover on the way to making a new character. A successful reset does not sign
you in — the new password gets typed once more against the login form, which is
the cheapest possible proof that it was actually remembered.

## Competitions

Above level 25 the catalogue stops being something you can grade yourself.

| Quest | Domain | From level | What it asks |
|---|---|---|---|
| Enter a local competition | physical | 25 | a real dated fixture — parkrun, club meet, league match, belt grading |
| Enter an academic competition | academic | 25 | an olympiad, maths challenge, science fair, essay prize or debate |
| Enter a jam, contest or showcase | passion | 25 | a game jam, hackathon, open call or local exhibition |
| Place in a competition | physical | 50 | a top-half finish or a beaten personal best, published |
| Earn a result in an academic competition | academic | 50 | a qualifying score, distinction or shortlisting |

They are milestone and epic quests, so the daily cap does not apply and the
cooldowns are long — a month for the entry quests, months for the ranked ones.

Two things make them different from everything below them. **The date is not
yours**: an event has a closing entry and a start time, so the quest cannot be
quietly rescheduled the way a study block can. And **the proof is written by
somebody else** — an organiser's result listing, a published score, a submission
page — which is the only kind of evidence in the whole product that the player
has no hand in producing at all.

The tier-3 entry quests deliberately do not ask you to win. Entering and
finishing is the quest; placing is what the tier-4 versions ask, and those need
level 50 and a training block behind them.

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

## Evidence, and why a write-up is no longer enough

**Every quest now requires something a reviewer can open.** Eighteen of the
forty-three archetypes used to accept a paragraph and nothing else, which made
those quests an honour system with an XP bar attached. All forty-eight now demand
a verifiable artifact — and which one is the archetype's own decision, because
"film everything" does not survive contact with the catalogue. You can film
push-ups; you cannot meaningfully film *twelve minutes of attention training*,
and demanding it would only teach students to fake footage.

| The task | The artifact |
|---|---|
| A run, a session, a week of training | the tracker link your watch already wrote |
| Push-ups, a plank, a skill drill | a video of a set |
| A problem set, mental arithmetic, a memory drill | a photograph of the worked pages |
| An essay, a summary, a revision pack | the document itself |
| A build, a release, a competition entry | the repository, listing or result page |

The rule is enforced **server-side**, in the verdict rather than the form: a quest
that offers a way to attach evidence cannot reach `verified` without it, whatever
the prose scored. The browser asks nicely — the requirement is stated above the
write-up before a word is typed, and the submit button stays disabled until
something is attached — but the browser is not what enforces it, because a
crafted request would walk straight past a disabled button. The verdict is
`needs_info` rather than `rejected` on purpose: nothing is wrong with the player,
the submission is simply incomplete, and the quest stays open.

**Reflection is gone.** It used to be its own field, worth 16% of the score and a
slice of the XP multiplier. It was also the easiest part of a submission to write
without doing the work — which meant the app was paying for willingness to type.
That weight now belongs to an **evidence** axis that scores the artifact instead:
video highest (filmed here and now), then a tracker link (written by a device
rather than by the player), then a photograph of the work, then the document. A
write-up alone scores zero on it. Stronger evidence is worth more XP, so the
ladder is a reward rather than only a gate — the same push-up set verifies at
×1.00 with a photo and ×1.08 with a video.

A photo picker asks the player to *find a file*. For "three sets of push-ups"
there is no file — the evidence is something that happens once, away from the
keyboard, and then is gone. So the proof fields meet the player where the work
actually ends.

**Film it.** Seven archetypes accept video, and on those the proof modal opens a
recorder rather than a file dialog: `getUserMedia` for the preview,
`MediaRecorder` for the clip, and the same `/api/uploads` endpoint every other
attachment goes through. Recording is capped at 60 seconds and watched for size,
because `MediaRecorder` has no limit of its own and the server takes 32 MB — a
cap that fails before the upload is kinder than one that fails after it.

**Say it.** The write-up is the field players most often leave thin, because it
arrives after the work when nobody wants to type. A **Speak it** button runs the
Web Speech API into the same textarea: interim results show in a preview line and
only finalised phrases are committed, so the field stays the source of truth and
typing mid-dictation never fights the recogniser. Chrome sends that audio to a
Google service, which the hint says out loud rather than burying — the honest
note to make in a product whose selling point is that nothing else leaves the
machine.

**And the draft survives.** Filling in proof means leaving the page: to film
something, to fetch a link out of a tracker, to move a photo off a phone. Before,
the write-up died every time, which taught players to submit something thin
immediately rather than risk losing it. `js/components/proofDraft.js` writes the
form to `localStorage` as it is typed, restores it when the same quest is opened
again, and clears it the moment a submission is accepted. It deliberately does
not save to the server (a draft is not evidence and has no business in the quest
record), does not restore uploaded files (re-attaching evidence the player did
not consciously attach this time is exactly the wrong default — the upload
already happened, so they re-attach in one click), and does not outlive the
quest: drafts older than a fortnight are swept at startup.

Both are progressive to the bone. No `MediaRecorder`, no camera, no Web Speech,
or a declined permission prompt, and each degrades to the plain input underneath.
Evidence rules must never depend on hardware, so every quest stays completable
by typing and attaching a file — the recorder is the fast path, never the only
one.

Three things this cost elsewhere, all of them deliberate:

* `permissions-policy` now reads `microphone=(self) camera=(self)` and the CSP
  `media-src` accepts `blob:`, because a recording is a Blob read through an
  object URL before it is uploaded. Both are still behind the browser's own
  permission prompt, and both are only ever requested when the player presses
  record.
* Uploads are size-capped **per type** (`upload_limit_for`) rather than by one
  number: 8 MB for a photo or a PDF, 32 MB for a clip.
* Every exit from the proof modal — the ×, the backdrop, Escape, or a successful
  submit — puts the camera light out and stops the recogniser, through one
  `onClose` rather than at each call site. A camera that stays live after the
  modal closes is the worst bug this feature can have, so it is closed by
  construction rather than by remembering.

**And a drawing per quest.** Every one of the 48 archetypes has a line drawing of
the thing being done (`web/js/components/questArt.js`), in the same idiom as the
nav icons — 64×44, no fill, 2px round caps, `currentColor`, so one drawing sits
on a teal physical card and a violet passion card without a second file. A list
of quests is scanned far more often than it is read, and one glance says
"push-ups" before any word is. The title says the same thing in words, so the
drawings are `aria-hidden` rather than given a duplicate label, and anything
without art of its own — custom quests, questline steps — falls through to its
domain's drawing so a card is never blank.

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
    catalog.py            48 quest archetypes + 3 questlines
    skills.py             33-node skill tree + 9 level milestones
    achievements.py       19 achievements
    safety.py             unsafe-request detection and redirects
  ai/                     the five modules + provider abstraction
web/
  index.html  css/  js/   the SPA: 8 screens, opening, auth, onboarding
  fonts/                  Nunito + Baloo 2, self-hosted (font-src is 'self')
    js/theme.js           light/dark/auto, resolved before first paint
    js/timeline.js        scroll-scrubbed timeline (the GSAP/ScrollTrigger stand-in)
    js/views/opening.js   the opening page — first screen for signed-out visitors
    js/components/introActs.js   the intro acts, inline in the opening page
    js/components/constellationGrid.js  the spring mesh behind the signed-in app
    js/blob.js            the WebGL orb it replaced (retained, unmounted)
    js/components/wovenLight.js  the woven-light weave behind the opening hero
    js/components/questArt.js    a line drawing per archetype, on every card
    js/components/videoCapture.js  film the evidence; dictation.js  speak it
    js/components/proofDraft.js  the half-written proof survives leaving the page
    js/components/flipDisk.js    the flip-disk board counting down to a deadline
    js/components/        limelight nav, icons, app background, orbiting circles,
                          particle sphere, theme control, dot matrix
tests/                    108 tests, including the full journey from the brief
```

## The deadline board

`expiresAt` shipped on every quest from the first build, and nothing in the
interface ever read it. A daily quest simply vanished at 36 hours, a weekly one
at 8 days, with no warning at any point before it went.

`js/components/flipDisk.js` is the warning: an electromechanical flip-disk
board, ported from `flip-disk-matrix.tsx`. Every cell is a disk, dark on one face
and lit on the other, that rotates 180° about its horizontal axis to change
state — a railway departure board, which is the right object for a thing that
leaves whether or not you are ready. Characters are drawn on a 5×7 bitmap the way
they are on the real hardware.

It sits on the dashboard, showing whichever open quest runs out first. Over an
hour it reads **HH:MM**; under an hour it switches to **MM:SS**, because at that
point the seconds are the story and a board still showing "00" for fifty-nine
minutes would be telling you nothing while the thing expired. The lit face is XP
gold with time in hand, amber under an hour, red under ten minutes — on a
countdown the colour is information, not decoration.

**One board, not one per card.** A board is roughly 800 elements; five of them on
a quest list would be four thousand nodes sitting in front of a live canvas. So
the cards carry a plain text chip — `1d left`, `4h left`, `12m left`, amber under
six hours and red under one — and the board carries the drama.

Four things differ from the component as shipped, and each is this codebase
rather than taste:

* **The mode switcher is gone.** The original ships with time/text/wave/noise
  buttons and a text box — a showcase for the effect. The board has one job here
  and its reading has to be trusted at a glance.
* **It is sized to its content.** The original is a fixed 31×11; this measures
  the string and builds the smallest grid that fits it.
* **It diffs instead of re-rendering.** React rebuilt the matrix every tick and
  let reconciliation sort it out. There is no reconciler here, so the board keeps
  its disks and flips only the ones whose bit changed — which is also what the
  hardware does, and why a real board clatters in patches rather than all at once.
* **It stops when it cannot matter.** The original runs `requestAnimationFrame`
  for ever. This ticks on a timer aligned to the next second boundary, stops on a
  hidden tab, and under `prefers-reduced-motion` renders the same board with the
  flip disabled.

Wiring it up surfaced a live bug that had nothing to do with it. `lifequest:detach`
was being *listened for* in two places and dispatched from none, so the theme
button's listener and anything else holding a resource survived every navigation.
`clear()` in `js/ui.js` now fires it on the outgoing subtree before detaching, and
the browser suite watches for it — otherwise the board's timer would have joined
the leak.

## Type and marks

**Two self-hosted faces, no emoji anywhere.**

`web/fonts/` holds Nunito and Baloo 2, committed rather than fetched: the CSP
sets `font-src 'self'`, so a Google Fonts `<link>` would be blocked twice over —
once for the stylesheet and once for the file — and a product that promises to
work offline should not have its typography depend on a CDN. Both are variable
fonts, so one file each covers every weight and the whole type system costs two
requests and about 70 KB. Every stack keeps the rounded system fallbacks the
faces replaced, so a slow first paint degrades to the previous design.

| Token | Face | For |
|---|---|---|
| `--font` | Nunito | everything you read |
| `--font-display` | Baloo 2 | headings, the wordmark, levels, big numbers |
| `--font-mono` | system mono | XP amounts, recovery codes |
| `--font-accent` | a serif | key words lifted mid-sentence |

The accent face is deliberately **not** rounded. With a body face this friendly,
the emphasis channel has to be a real change of voice to register at all.

**Every mark in the app is drawn.** `js/components/icons.js` started as the nine
glyphs the navigation needed and is now the product's whole icon vocabulary —
50 glyphs in lucide's idiom, 24×24, no fill, 2px round caps, `currentColor`
throughout: the three domains, the achievements, the rank tiers, every empty
state, the verdicts, the theme control and the evidence controls.

There is no emoji left in the product, and that is a functional decision rather
than a stylistic one. An emoji is a different size, a different colour and a
different vertical rhythm on every operating system, and none of that can be
brought back into line with CSS; it cannot take the tier colour an achievement
tile is built around, which a stroked `currentColor` icon does for free. The
server sends *names* — `"flame"`, `"brain"`, `"shield"` — and the client draws
them, so there is exactly one place that knows what a mark looks like.

Two things stayed as type, because type is what they are: the Roman numerals on
the level achievements (`X`, `XXV`, `L`, `LXXV`, `C` — "XXV" says level 25 better
than any drawing of a medal), and the arrows in running copy. The unlocked-skill
tick is drawn in CSS from two rotated borders rather than set as a character,
for the same reason as everything else: a glyph drifts, a border does not.

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
bar, or Settings → Experience.

The deep card in the intro acts and the phone mockup inside it stay dark in both
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
screen — that is the dashboard, behind sign-in. One hero (wordmark, tagline, one
line of what this is, two doors), then the case for the product in calm sections,
with the two intro acts in the middle of it. Both ways in are reachable before any
scrolling, and the whole page works with scripting off.

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
headline decrypts on arrival, and the intro acts are sections of the page rather
than a film behind a button.

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
hovered.

**The mark goes to the front page, not to the dashboard.** `#/welcome` is a real
route, so the opening page is reachable at any time rather than only while signed
out — home for a player is their character, and the dashboard already has a nav
item of its own. The route strips the chrome on the way in and puts it back on the
way out, and a visitor who already has a character is offered **Back to your
character** instead of two invitations to create another one. The emoji are gone entirely — `js/components/icons.js` draws the nine
glyphs the bar needs in lucide's idiom (24×24, no fill, 2px round caps,
`currentColor`), because `lucide-react` needs npm and the CSP forbids fetching
the same shapes from a CDN.

## The skill tree, as a tree

The data was always a tree — every skill names its parents in `requires`, and
every skill has a level it becomes reachable at — but the old screen printed four
rows of cards per domain and threw both away.

It is now drawn literally, in SVG, with height as level:

* **The roots** are level 1, below the ground line.
* **The trunk** carries the nine level milestones as growth rings, and fills with
  sap up to the level actually reached.
* **Three limbs** are the domains. They fork exactly where the real prerequisites
  fork, because the branch edges *are* the `requires` graph.
* **The crown** above the last ring is what is left after level 100 — bare until
  Master of Life is unlocked, which is the honest reading of a curve whose top is
  years of work away.

Everything at or below your level is grown and in its domain's colour; everything
above it is bare wood. Buds are focusable and explain themselves in a side panel;
the per-domain lists are still underneath, so nothing is only available as a
picture.

**Thirty-three nodes**, up from twenty-one: each domain now has a discipline
branch off its root, two specialisms above it, and a second tier-4 capstone
beside the original one — so the climb from level 20 to 50 has something waiting
at 24 and at 50 rather than one node at 45 and nothing else.

Growing it broke the layout, which is worth recording because the failure was
subtle. Buds were spread by clustering nodes of similar height and fanning each
cluster sideways; both the clustering and the later tidy-up pass measured
membership against the *first* node in a group, so a group's span grew as it
filled and two buds from neighbouring groups could end up 29px apart having never
been compared with each other at all. The fan is now sized to the room it has,
and the last word belongs to a relaxation pass that finds any pair still too
close and pushes both apart by half the shortfall until nothing moves. It runs on
the real constraint rather than a proxy for it, so it keeps holding however many
skills the tree grows to.

## The constellation mesh

`js/components/constellationGrid.js` is the background of the signed-in app: one
fixed layer under every screen, including home, mounted by
`js/components/appBackground.js` when a player enters and torn down whenever the
shell goes bare.

A lattice of nodes sits on a grid, each anchored to its home point by a spring.
The pointer shoves them away with a force that scales with how fast it is moving,
and the springs pull them back; nodes near each other are joined by a line, so the
displacement reads as a sheet of fabric being swept rather than as dots moving
independently. Sweep the cursor fast and a shockwave crosses the whole screen.

It replaced a WebGL orb — a noise-displaced icosphere, still in `js/blob.js` and
no longer mounted. The orb *leaned towards* the cursor; the mesh is *moved by* it,
which is a background that reacts rather than one that drifts.

Two things make it a background rather than a decoration:

* **The pointer comes from the window.** A layer behind the content never receives
  pointer events of its own, so reading them from the container would leave the
  mesh frozen and flat.
* **Nothing is clamped to a box.** The push is computed in page coordinates
  against the real pointer, so the effect reaches the corners instead of leaning
  slightly towards them.

The ceiling on how strong it can be is text contrast, not taste: every card in the
app is translucent, so anything bright behind one lifts its background and eats the
contrast of the copy on top. The dials live on `.appbg` in `styles.css` per theme —
`--orb-opacity` for the whole layer, `--mesh-node`, `--mesh-accent` and
`--mesh-link` for the lattice itself. The mesh reads those three from CSS rather
than carrying colours of its own, so a theme change only has to tell it to look
again, and the palette can never drift from the rest of the app.

Three details are worth knowing, because they are the difference between "a nice
effect" and "why is the app slow":

* **Links are spatially binned, not compared pairwise.** Every-node-against-every-
  other is 60k distance tests on a laptop but 800k on a 1440p display, every frame,
  behind every screen. A link only reaches 84px and the grid pitch is 62, so nodes
  are hashed into cells and each is tested against four forward neighbours — same
  picture, linear cost. The lattice also has a hard node ceiling: past it the pitch
  widens rather than the count growing, so a 4K display loses density instead of
  frame rate.
* **The canvas is transparent.** The original fills its surface opaquely, which
  here would paint over the drifting halo field at `body::before` that every screen
  is laid out on. It clears instead.
* **A pointer teleport is not a velocity.** Speed comes from the distance covered
  since the last step, and the cursor is parked off-screen while it is away — so
  the first step after it returns would otherwise see it travel 1000px in 16ms and
  detonate the lattice.

Under `prefers-reduced-motion` the mesh is drawn once, at rest: legible as a still
image, with nothing lost but the movement. If there is no 2D context, or the first
frame draws nothing, the canvas is dropped entirely and the layer falls back to a
cursor-tracked highlight that needs no GPU at all.

## The intro acts

The cinematic used to be a screen of its own: a four-act film on a pinned stage,
8.5 viewports of scrolling, reached from a **Watch the two-minute intro** button
and framed by a HUD with an act rail, a skip button and a level-up chime per act.

It is part of the opening page now, and you scroll down through it. Two of the
four acts became sections, because only two had anything the page did not already
say: **the system**, where the app mockup flies in and counts up a level with its
proof badges, and **the constellation**, where the mark sits at the centre with
every system in the product turning around it — the three domains on the inner
ring, quests and skills next, achievements, progress and the guide outermost.

The other two merged into the page they joined. Act I was the mark, the motto and
*"Real life is the game. You are the main character."* — word for word the opening
page's own hero, so it handed over its decrypt and nothing else. Act IV was a
closing headline and the two doors, which is what the closing section already was.

Each act animates from its own trip through the viewport, with the film's own
tweens: the phone still arrives from -520 in z with a 46° tilt, the copy still
slides in from the left, the constellation still rises. What went with the film is
its video furniture — the pinned stage, the act rail and its scrubber, the skip
button, the chimes. Nothing is opt-in and nothing is skippable, because there is
no longer anything to skip: it is a page.

Under `prefers-reduced-motion` the acts are laid out and legible with no motion at
all, and the dial is settled rather than left counting from zero.

These were ported from React/Tailwind/shadcn components — the how and the
why, including how to set this up as a real shadcn project on a machine that has
Node, is in [`docs/component-integration.md`](docs/component-integration.md).

## Verified

The suite walks the brief's own acceptance checklist end to end: create account →
onboard → level 1 character → starter quests → start → submit proof → AI
evaluation → XP → attributes → achievements → skills → analytics → new quest →
difficulty adaptation → every screen → error and empty states. Screens were also
rendered in headless Chrome at desktop and mobile widths.
