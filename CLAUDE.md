# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

No build system or dependencies **for development**. To run the app, open `index.html` directly in
a browser:

```bash
open index.html
```

Deployment is automated via GitHub Actions (`.github/workflows/deploy.yml`) — any push to `main`
deploys to GitHub Pages.

### The deploy minifies; the repo does not (v4.27)

**`app.js` and `styles.css` are minified in CI, in the runner's checkout only.** Nothing is
committed, no dependency enters local dev, and `open index.html` still works from plain readable
source. Only the bytes GitHub Pages serves are minified — 196→94 KB and 124→70 KB, 41.6 KB off
gzipped. This exists because mobile Lighthouse Performance was 79 against a ≥90 target, with
102 KiB of unused JS and ~880 ms of render-blocking as the top drivers.

**Do not "simplify" this into a committed build output or a repo-level toolchain.** Minifying at
deploy time is the whole point: it buys the bytes without paying the maintenance cost that
[[Vanilla JS No Framework]] was decided to avoid.

**Maintenance traps:**

- **esbuild is PINNED** (`0.28.2`). `@latest` on a job that publishes to the live site is both
  non-deterministic and a supply-chain foothold. Bump it deliberately, and re-run the app against
  minified output when you do.
- **`npx --yes` caches into `~/.npm`, not the working directory.** That matters: the deploy ships
  `path: '.'`, so anything that creates a `node_modules/` in the checkout would publish it. Never
  replace this with a plain `npm install` in the repo root.
- **The `Verify minified output` step is a release gate, not decoration.** `app.js` is a plain
  script, so its top-level declarations *are* the globals, and `index.html`'s stale-cache fallback
  probes exactly two of them **by name** (`window.showScreen`, `window.startMatch`). If a future
  esbuild flag ever mangled those, the file would still parse and the app would silently
  misbehave — which is precisely the failure `node --check` alone cannot catch. The step also
  asserts `prefers-reduced-motion` is still the last rule in the stylesheet.
- **The minify step is a hardcoded filename list, not a glob.** It names `app.js` and
  `styles.css` and nothing else, and the verify gate likewise asserts properties of those two
  known outputs — so **neither can detect a new asset that should have been minified and wasn't.**
  Any future deployed `.js`/`.css` file (the SEO plan's `guides/*.html` pages are the concrete
  case on the horizon) must be added to **both** that step and `APP_SHELL` in `sw.js`, or it ships
  unminified and unavailable offline.
- **`index.html` and `sw.js` are deliberately NOT minified.** `index.html` carries inline scripts
  (the entry gate, the stale-cache net) where the risk outweighs a few hundred bytes; `sw.js` is
  ~2.5 KB and cache-busts everything else, so minifying it buys nothing.
- **A change to what the deploy emits still needs the `sw.js` VERSION bump**, even when no source
  file changed — `app.js` and `styles.css` are cache-first, so without it returning clients keep
  the previous bytes and never receive the improvement.

## Naming: the app is SpikeSheet, the repo is VolleyballReferee (v4.23)

The app was renamed from "Volleyball Referee" to **SpikeSheet** in v4.23 after an app store
rejection — the old name was a category label rather than a mark, colliding with a field of
identically-named volleyball scoring apps. **The rename covered app identity only. The repo and the
GitHub Pages URL deliberately did not move**, because moving them orphans every installed PWA at
the old service-worker `scope`, breaks the absolute OG tags, and splits the analytics history.

That split leaves three things looking wrong that are correct:

- **`og:url`, `og:image`, and `twitter:image` in `index.html` still contain `/VolleyballReferee/`.**
  This is deliberate. "Finishing the rename" by rewriting them produces a dead link and a broken
  unfurl image. Same for every `github.com/watermenon09/VolleyballReferee` URL in the docs.
- **Every `localStorage` key keeps its `vb-` prefix** — `vb-settings`, `vb-match-state`,
  `vb-match-history`, `vb-team-colors`. Renaming one silently wipes users' in-flight matches,
  history, settings, and colours. Never rebrand a storage key.
- **The `vbref-` service worker cache prefix stays.** It is internal, and the cleanup in `sw.js`
  filters on `k !== CACHE` rather than the prefix, so renaming it gains nothing.

The full reasoning is in the v4.23 `CHANGELOG.md` entry.

## Architecture

The app is a single-page vanilla JS application with three source files plus PWA support files:

- `index.html` — all markup; five screens toggled via the `hidden` CSS class, all routed through `showScreen()`
- `styles.css` — all styling; uses CSS variables and flexbox
- `app.js` — all logic; single file, no modules
- `manifest.webmanifest` — installability metadata; relative `start_url`/`scope` resolve correctly under the `/VolleyballReferee/` GitHub Pages subpath
- `sw.js` — service worker (see PWA / offline section below)
- `fonts/` — self-hosted woff2 (Big Shoulders Display 600/800, Saira Semi Condensed 400–700); every file is listed in sw.js APP_SHELL

### Screen flow

Five views are shown/hidden by toggling the `hidden` class on their container divs. **Never
toggle one directly — call `showScreen(name)`** (see the screen-router section).

1. `#home` — the homepage, shown when no match is in progress. **The markup default** (the only
   one without `hidden`), and the only screen that is a `<body>` child rather than living inside
   `.container`
2. `#setup` — match configuration form
3. `#rotationSetup` — starting rotation assignment (before each set)
4. `#scoreboard` — active game screen
5. `#matchResult` — post-match result

Ten modals are used across screens: `#subModal` (player substitution, overlays scoreboard), `#timeoutModal` (30-second countdown, overlays scoreboard), `#setBreakModal` (3-minute set break timer, shown between sets), `#returnToSetupModal` (confirmation dialog for returning to setup mid-match), `#deciderSwitchModal` (side-switch notification at 8 points in the deciding set), `#serveSwitchModal` (confirmation for a manual serve flip, added v4.12), `#settingsModal` (configurable match rules and app preferences), `#feedbackModal` (in-app feedback form via Web3Forms), `#historyModal` (match history log), and `#changelogModal` (in-app "What's new", added v4.22).

### State management

All game state lives in a single global `state` object (top of `app.js`). A secondary `rotationSetupState` object holds transient rotation-setup UI state (selected position, pending assignments) and is reset each time rotation setup is shown.

`updateDisplay()` is the single render function that syncs the entire UI to `state`. All mutations to `state` end with a call to `updateDisplay()`.

### Settings and rules

User-configurable settings are stored in the `vb-settings` localStorage key. On load, `loadSettings()` merges the stored value against `DEFAULT_SETTINGS`, applying per-field type checking and numeric clamping — adding a new setting with a default is safe and never corrupts existing saves.

Settings are split into two categories with different consumption semantics:
- **Match rules** (timeout duration, timeouts per set, technical timeouts toggle, set break duration, regular/final set points) — snapshotted into `state.rules` by `snapshotRules()` inside `beginMatch()` and never mutated mid-match. `getRules()` returns `state.rules` during a match, falling back to a fresh `snapshotRules()` call if `state.rules` is null (e.g., on a stats-only path). This means changing settings mid-match has no effect until the next match starts.
- **App preferences** (sound, vibration, keepAwake) — read live from the `settings` object at the point of use; changes take effect immediately.

The owner must replace `WEB3FORMS_ACCESS_KEY` in `app.js` with a live key from web3forms.com for the feedback form to deliver submissions.

### Undo system

Before each point is added, a deep snapshot of all mutable state fields is pushed onto `state.pointHistory`. `undoLastPoint()` pops the last snapshot and restores state. On `swapTeams()`, all snapshots in `pointHistory` are remapped (team1/team2 fields swapped) so undo works correctly even after a swap. The `points` array inside each `setHistory` entry is also remapped.

### Rotation array layout

The rotation is stored as a flat 6-element array. The mapping between array index and court position is:

```
index: 0  1  2  3  4  5
pos:   1  2  3  4  5  6
```

The server occupies position 1 (index 0, back-right). The `rotateTeam()` function shifts element 0 (position 1) to the end of the array (position 6) — clockwise rotation per FIVB rules, where the player at position 2 (front-right, index 1) moves to position 1 and becomes the new server. The `updateRotationDisplay()` function uses a separate `positionMap = [3, 2, 1, 4, 5, 0]` to translate DOM node order (front row left-to-right: 4-3-2, back row left-to-right: 5-6-1) into rotation array indices.

### Team color identity

Teams are assigned a permanent color identity: 'A' and 'B'. Colors are stored in CSS variables `--team1-color` / `--team2-color` (user-editable via color picker in setup, persisted in `localStorage`). `state.team1OriginalId` and `state.team2OriginalId` track which identity ('A'/'B') each side holds, even after swaps. Colors are applied in `updateTeamColors()` and `updateRotationSetupColors()` by checking `originalId`, not position number. v4.10: side-mapped `--side1-rgb/--side2-rgb/--side1-ink/--side2-ink` custom props are derived in `updateTeamColors()` — ink flips to dark navy when the team color is light (luminance > 0.62).

### Side-swap vs. team-swap

There are two separate swap operations:
- `switchSides()` — called automatically between sets; swaps names/scores/players (and `lastStartingRotation1 ↔ lastStartingRotation2`) but **not** current-set score or timeouts (those reset for the new set)
- `swapTeams()` — triggered by the user swap button during play; swaps everything including current scores, timeouts, rotations, and serving (and `lastStartingRotation1 ↔ lastStartingRotation2`); remaps all `pointHistory` snapshots so undo remains valid across the swap

### Set break flow

When a set ends, `checkSetWin()` calls `showSetBreakModal(nextSetNumber)` which starts a 3-minute countdown. On modal close (`closeSetBreakModal()`): if `state.hasRotation` is false (first set of next group needs rotation setup) it calls `showNewSetRotationSetup()`; otherwise it resumes play directly. `confirmReturnToSetup()` cancels the set break interval directly to avoid triggering `showNewSetRotationSetup()` as a side effect.

### "Use previous rotation" feature

`state.lastStartingRotation1` and `state.lastStartingRotation2` store the flat 6-element rotation arrays from the most recently confirmed starting rotation for each team. They are written in `confirmRotationSetup()` after building `state.team1Rotation`/`team2Rotation`, and nulled in `resetMatchState()`. Both fields are included in the `beginMatch()` save/restore block so they survive the `resetMatchState()` call. The `.use-prev-rotation[data-team="1/2"]` buttons are hidden (via `updatePrevRotationButtons()`) when the corresponding field is null (set 1), and shown from set 2 onward.

### PWA / offline

`manifest.webmanifest` — installability metadata; relative `start_url`/`scope` (`"./"`) resolve correctly under the `/VolleyballReferee/` GitHub Pages subpath and also work for local server testing.

`sw.js` — service worker. Cache name is `vbref-v${VERSION}`; **bump `VERSION` in `sw.js` to invalidate all clients on the next deploy** and force re-download of updated assets. `APP_SHELL` lists every file precached at install — **add new CSS, JS, or icon files here or they will not be available offline**. The six font files in `fonts/` are precached; Google Fonts is no longer used. HTML navigations use network-first (fresh on online reload, cached fallback offline). All other same-origin assets use cache-first. Cross-origin requests (Analytics) are not intercepted and not cached — they silently fail offline, which is acceptable.

### Design tokens (v4.10)

`styles.css` opens with a design-token `:root` block (spacing `--sp-*`, radii `--r-*`, surfaces `--surface-1/2/3`, strokes `--stroke-1/2/3`, ink opacities `--ink-*`, gold/navy palette, motion `--dur-*/--ease-*`). Use tokens — never raw rgba values — for new surfaces/strokes/spacing. A fixed app bar (`.app-bar`) replaces the old floating h1/.top-actions. `updateTeamColors()` additionally writes side-mapped custom props `--side1-rgb/--side2-rgb/--side1-ink/--side2-ink` on `:root`; scoreboard CSS consumes them via `.team.team1/.team.team2 { --side-rgb; --side-ink }`. The `prefers-reduced-motion` block must remain the LAST rule in `styles.css`.

### Substitution rules and the per-set cap (v4.21)

FIVB 15.6.2/15.6.3 lock a starter and their substitute into a pair for the set. This is enforced by **player identity, never court position** — `rotateTeam()` remaps position keys on every side-out, and `makeSubstitution()` deletes its `subs[]` entry when a starter returns, so neither can carry set-long history.

`state.team1SubPairs` / `team2SubPairs` are arrays of `{ starter, sub, returned }` keyed by jersey number. One structure, two readers: `substitutionBlockReason()` enforces the pair lock, `subEntriesUsed()` counts the cap. Counting is **entries onto court, not pairs** (FIVB 15.6.1), so a starter going off and back consumes two: `pairs.length + pairs.filter(p => p.returned).length`.

Enforcement is defence-in-depth, same shape as the v4.11 libero fix: `showSubModal()` disables the illegal chip and states why (in `title` *and* on screen in `#subRuleNote`), and `makeSubstitution()` guards independently.

**Maintenance traps:**
- These are mutable persisted fields, so they must appear in **three** hand-maintained lists — the `pointHistory` snapshot push, the `undoLastPoint()` restore, and the `swapTeams()` remap (live *and* snapshot). They are team-specific, so unlike `techTimeoutsFired` they **cannot** be omitted from the swap. The snapshot push must **deep-copy**, because `recordSubstitution()` sets `returned` in place.
- Cleared at the set transition in `checkSetWin()` and in `resetMatchState()`. Deliberately **not** swapped by `switchSides()` — that runs only at the set boundary, after the reset, so there is nothing left to swap.
- **The libero is outside this system entirely.** FIVB 19 replacements are not substitutions: they create no pair and never consume the cap. Two helpers keep it that way — `isLiberoReturn()` (the libero going back off arrives at `makeSubstitution()` with `isLibero === false`, via the "Return original player" chip) and `liberoSlotBlockReason()` (a bench player may not be substituted straight into a libero-covered slot; the libero comes off first). Without the latter, `recordSubstitution()` reads the slot's occupant as the "starter" and files a pair naming the *libero*, locking the covered player out of the set.
- `substitutionsPerSet` is a **match rule**: `null` = unlimited, `0` = a literal "none permitted". Never `Infinity` — `JSON.stringify(Infinity)` is `null`, so it cannot round-trip. Read it only through `getRules()`; `NULLABLE_SETTINGS` exists because `onSettingChange()`'s `parseInt('')` → `NaN` would otherwise revert an intentionally cleared field.

### Modal focus trap and dialog a11y (v4.24)

All ten modals share one focus-trap mechanism in `app.js`. It is driven by a **`MutationObserver` on
each modal's `class` attribute** — `observeModalVisibility()`, registered in `init()` — **not** by
setup/teardown calls inside the ten open/close functions.

**Why the observer, and why it must stay one:** `confirmReturnToSetup()` force-hides `#setBreakModal`
and `#deciderSwitchModal` with `classList.add('hidden')` directly, deliberately bypassing their close
functions (calling `closeDeciderSwitchModal()` there would fire `swapTeams()`). Teardown wired into
close functions leaks on exactly those paths. Observing the class attribute catches every hide path
and keeps the whole feature additive — no match-flow code was restructured to get it.

The observer compares the **net transition across the mutation batch** (`mutations[0].oldValue` vs the
live `classList`), so a redundant re-hide of an already-hidden modal cannot fire a phantom close.

**The Escape table (`MODAL_ESCAPE_CLOSERS`) has two deliberate omissions. Do not "complete" it:**

- **`#deciderSwitchModal`** — its only close function sets `state.deciderSideSwitched = true` and calls
  `swapTeams()`. It is a confirm-only acknowledgement with no cancel path, so Escape would let a stray
  keypress silently perform the court switch.
- **`#setBreakModal`** — `closeSetBreakModal()` branches into `showNewSetRotationSetup()`, a full screen
  transition. Escape as screen navigation is a behaviour change, not an a11y fix, and this modal opens
  with no user gesture.

Escape entries always map to the **cancel** function, never a confirm, and always route through the
existing close function rather than the `hidden` class — `#timeoutModal`/`#setBreakModal` own live
intervals and a repeating vibration that only those functions clear.

**Maintenance traps:**

- **`getModalFocusables()` must keep its explicit `el.tabIndex >= 0` filter.** The
  `[tabindex]:not([tabindex="-1"])` clause in `MODAL_FOCUSABLE_SELECTOR` does **not** exclude
  negative-tabindex elements on its own, because the earlier type clauses match them independently.
  `#feedbackBotcheck` is a spam honeypot (`<input type="checkbox" tabindex="-1">` at `left:-9999px`
  with real 13×13 layout), so neither the selector nor the `getClientRects()` filter drops it. A
  focusable honeypot sends focus off-screen and, once typed into, makes `submitFeedback()` discard
  genuine feedback as spam behind a fake success.
- **The focusable list is recomputed on every Tab press, never cached** — `#setKeepAwake` and
  `#submitFeedback` toggle `disabled` while their modal is open.
- **Keep `checked` on the first `feedbackCategory` radio.** The group collapses to one tab stop via
  `group.find(o => o.checked) || group[0]`; with nothing checked, Shift+Tab focuses the last radio
  while the stop list holds the first, and the next Tab yanks focus back to the top of the modal.
- `role="dialog"` / `aria-modal="true"` / `aria-labelledby` live on **`.modal-content`** (the element
  that takes focus), not the `.modal` backdrop. The four backdrop-dismiss handlers compare
  `e.target === <wrapper>`, so the wrapper must keep its identity — do not move those attributes back.
- A grep for `role="dialog"` and for `aria-modal` must each return exactly **10**.

### In-app changelog (v4.22)

`#changelogModal` renders `CHANGELOG_ENTRIES`, an array in `app.js`. It deliberately does **not** `fetch('./CHANGELOG.md')` — that file is developer-toned, and fetching it would need adding to `APP_SHELL` in `sw.js` to survive offline.

> **Release chore:** `CHANGELOG_ENTRIES` does not read `CHANGELOG.md`. **Add a user-facing entry to the array whenever you add one to `CHANGELOG.md`,** or the in-app panel silently goes stale. Write it for a referee, not a developer.

The button (`#changelogBtn`) is shown only on `#setup`, via `updateAppBarForScreen(name)` called from `trackScreen()` — the one function that already fires at every screen entry point. It is called **before** the `ANALYTICS_DISABLED` guard so an ad blocker (which blocks `gtag` but not `app.js`) cannot strand the button.

### Screen tracking / virtual page views (v4.21)

The app is an SPA, so GA4 would otherwise record one `page_view` per session and pool all engagement time onto it. `trackScreen(name)` sends a virtual `page_view` (and a `gtag('set', ...)` so GA4's automatic engagement measurement follows the screen) whenever one of the five screens becomes visible. `trackVisibleScreen()` is the catch-all at the tail of `init()`; since `showScreen()` landed it is a safety net rather than the reporter for any specific path.

**Two invariants this depends on. Breaking either silently corrupts the analytics:**

1. **Exactly one of the five screens may be visible at a time.** `trackVisibleScreen()` reports the *first* visible screen in `SCREEN_IDS` order, so two visible screens produce a wrong or phantom pageview. This is not merely an analytics concern: whichever screen is the markup default renders stacked above the real screen whenever a path forgets to hide it. That shipped twice while `#setup` was the default, both the same class: reloading onto the result screen (v4.20), and reloading into the set-2 rotation screen with the rotation screen ~1400px below the fold (through v4.20). **Since the homepage landed, `#home` is the markup default and `#setup` carries `hidden`** — see the homepage section for the consequences of that flip. **`showScreen()` now enforces this structurally** — see the screen-router section below. **One legitimate exception:** while `#setBreakModal` is open, `showSetBreakModal()` has hidden `#scoreboard` as a modal backdrop and **zero** screens are visible. An assertion of "exactly one visible screen" is therefore false during a set break — assert it on screen *entry*, not at arbitrary moments.
2. **Any new site that shows one of the five screens must call `showScreen(name)`** — never `classList.remove('hidden')` on a screen directly. `showScreen()` hides every other screen *and* calls `trackScreen()` itself, so the DOM and the analytics cannot drift apart, and this is no longer a convention each site has to remember. Corollary: do **not** add a bare `trackScreen()` tail call at a new entry point. `app.js` has exactly **two** `trackScreen()` callers — `showScreen()` and `trackVisibleScreen()` — and that count is itself the invariant.

`sw.js`'s `VERSION` **must** be bumped whenever `index.html` and `app.js` change together. `index.html` is served network-first but `app.js` is cache-first, so without the bump a returning client can run a new `index.html` against a stale cached `app.js` — which for this feature means `send_page_view: false` applies while `trackScreen()` doesn't exist, and the client records **zero** pageviews indefinitely.

### The screen router: `showScreen()`

`showScreen(name)` is the only sanctioned way to change screens. It hides every id in
`SCREEN_IDS` except `name`, then calls `trackScreen(name)`. It replaced ten scattered toggle
sites that each hand-listed which siblings to hide — the arrangement that produced both bugs in
invariant 1 above. It landed as its own behaviour-identical change, before `#home` existed,
because adding a fifth screen turns every one of those sites into a place that can forget to
hide the new one.

**Maintenance traps:**

- **Modals are out of scope.** They overlay screens and the v4.24 `MutationObserver` system owns
  them. Do not route modal visibility through `showScreen()`.
- **`#rotation1` / `#rotation2` are not screens.** They are `.rotation-grid` panels *inside*
  `#scoreboard`, and three call sites toggle them independently. Their toggles stay where they
  are, **after** the `showScreen()` call; `showScreen()` must never touch them.
- **One deliberate omission. Do not "complete" it.** `showSetBreakModal()` hides `#scoreboard` as
  a modal backdrop without showing any screen — there is no target screen to pass, and zero
  visible screens is the correct state for a set break (see invariant 1's exception). Its
  partner `closeSetBreakModal()` *does* route through `showScreen('scoreboard')`.
- **Keep the `if (el)` null guard inside `showScreen()`.** Every current `SCREEN_IDS` entry does
  exist in `index.html`, so the guard is unreachable today — it is there so `SCREEN_IDS` *may*
  name a screen a given page lacks, and it mirrors the same guard in `trackVisibleScreen()`.
  Removing it as dead code would break the first caller that relies on that.
- **`trackVisibleScreen()` at the tail of `init()` is now a pure safety net, not load-bearing.**
  It stopped covering a unique path when the homepage landed: `routeInitialScreen()` calls
  `showScreen()` on **both** of its branches, so every entry path already reports for itself.
  Keep it anyway — nothing structurally stops a future path from un-hiding a screen directly,
  and the `trackScreen` dedupe makes the redundant call free.
- **`restoreSavedMatch()`'s `matchOver` branch calls `showScreen('matchResult')` immediately
  before `endMatch({ fromRestore: true })`, which calls it again. That is not redundant — do not
  delete it.** `endMatch()` runs two `state.setHistory.reduce(...)` calls *before* it routes, and
  `loadState()` does no field validation, so corrupted storage throws in those reduces and
  nothing has hidden `#setup` — the v4.20 stacking bug's exact shape. The second call dedupes on
  `_currentScreen`, so exactly one page_view still fires. **The obvious-looking alternative —
  hoisting `showScreen()` to the top of `endMatch()` — is wrong:** on the live path it would move
  the page_view ahead of `track('match_complete')` and re-attribute the app's most valuable
  conversion event from the scoreboard URL to the result URL. This is the only place a screen is
  routed by a *caller* rather than at the screen's own entry point.
- **`showScreen()` fires the page_view *before* the screen's DOM is populated**, where the old
  hand-placed tail calls fired after (most visibly in `endMatch()`, now ahead of
  `renderFinalScore()`). Harmless — `trackScreen()` reads nothing from the DOM or `state`, and
  `updateAppBarForScreen()` only toggles `#changelogBtn`'s `display` — but don't "restore" the
  old ordering by re-adding a tail call.

### The homepage (`#home`)

A fifth screen at the canonical URL, shown whenever **no match is in progress**. A restorable
match always wins and routes to its own screen exactly as before.

- **The gate is `restoreSavedMatch()`'s return value and nothing else.** `routeInitialScreen()`
  is the authority: `if (!restored) showScreen('home')`. There is deliberately **no**
  "has used this app before" flag and **no** standalone/installed special case (owner decision,
  31-Aug-2026). Do not add a `vb-returning` key — it was designed, then cut, because the only
  question worth asking is whether a match is restorable.
- **`matchOver` counts as restorable**, so reloading on the result screen shows the result, not
  the homepage.
- **`#home` is a `<body>` child, NOT inside `.container`.** `.container` caps at 800px and
  carries the app-bar top padding — both wrong for a full-width homepage. `showScreen()` stamps
  `document.body.dataset.screen`, and CSS collapses `.container` (and un-fixes `.credits`) on
  home. That body attribute is the sanctioned hook for any screen-scoped CSS.
- **`#setup` now carries `hidden` in the markup and `#home` does not.** `#home` is the
  default-visible screen, so a crawler or a JS-less load gets real prose instead of a dead form.

**Maintenance traps:**

- **The one sanctioned exception to "never toggle a screen directly".** The stale-cache safety
  net at the bottom of `index.html` toggles `#home`/`#setup` classes by hand. It has to: it runs
  precisely when `showScreen()` does **not** exist. `index.html` is served network-first while
  `app.js` is cache-first, so a returning client can run this HTML against a pre-homepage
  `app.js` — for one load after a deploy, or forever until `sw.js`'s `VERSION` is bumped. That
  old `app.js` has no `'home'` in `SCREEN_IDS` and so cannot hide the homepage: mid-match you get
  the marketing page stacked over a live scoreboard, and as a new visitor an unstyled homepage
  whose "Start scoring" button has no handler. Its three branches are deliberate —
  `showScreen` present → return (this page's app.js owns routing); `startMatch` present but
  `showScreen` absent → old-but-working app.js, fall back to the pre-homepage layout; neither →
  `app.js` is dead, so leave the homepage's static prose up rather than a form that cannot work.
  **It also drops `data-entry` unconditionally**, because in that last branch nothing else will,
  and `#setup` is `hidden` in the markup — the combination is a blank page.
- **Watch item: `#setup`'s `tabindex="-1"` makes it match `MODAL_INVOKER_SELECTOR`**, which
  includes a bare `[tabindex]`. `stashModalInvoker()` uses `closest()`, so a pointerdown on the
  setup panel's own background could in principle stash the *panel* as the modal invoker and
  return focus there on close. Not reachable today — every modal opener on that screen is a
  `<button>` in the app bar, which `closest()` matches first — but if you add a modal trigger
  inside `#setup` that is not itself focusable, check this.
- **The two-part entry gate.** A synchronous `<head>` script sets `data-entry="app"` on `<html>`
  when `vb-match-state` exists, and CSS hides `#home` so a restore cannot flash it.
  `routeInitialScreen()` then **removes that attribute** once `showScreen()` has set the `hidden`
  class. Deleting the removal permanently hides the homepage from anyone holding a stale,
  unrestorable `vb-match-state` — presence in storage is not the same as restorable.
  **Three parts of that function are load-bearing; do not simplify any of them:** the removal
  sits in a `finally` so it survives a throw in `showScreen()`; the `restoreSavedMatch()` call
  sits in a `try` because `loadState()` does no field validation, so a corrupt save throws
  mid-restore and — with `#setup` now `hidden` in the markup — used to paint *nothing at all*;
  and the `catch` calls `resetMatchState()` so the poisoned key cannot reproduce the failure on
  every subsequent reload. None of it can help when `app.js` never executes, which is why the
  stale-cache net above drops the attribute unconditionally.
- **`.reveal` is double-gated: `html[data-js]` AND `prefers-reduced-motion: no-preference`.**
  Scroll reveals start at `opacity: 0`, so an ungated failure renders the homepage's prose
  invisible — destroying the whole reason for putting prose at the canonical URL. Without the
  motion gate, a reduced-motion user would depend on an observer that never runs for them.
  **`data-js` is set inside `initHomeReveals()`, immediately before the observer is created —
  NOT in the `<head>` script.** That placement is the whole point: the head script runs
  unconditionally, so an attribute set there means only "JS is enabled", which is still true
  when `app.js` throws — and then all six feature cards and all three steps sit at `opacity: 0`
  with no observer alive to reveal them. Set where it is, the attribute means "reveals are being
  managed", which is the condition the hidden start state actually depends on. `initHomeReveals()`
  also reveals anything already in the viewport synchronously, so arming the gate cannot flash
  above-the-fold content.
- **The hero H1 is the page's only `<h1>`.** `.app-brand` in the app bar was demoted to a
  `<div role="img" aria-label="SpikeSheet">` — it keeps `role="img"` because the wordmark span is
  `display: none` at ≤360px and the mark is `aria-hidden`, so without it the brand has no
  accessible name at all. A grep for `<h1` must find exactly one element.
- **`.home` needs `overflow: clip` on BOTH axes.** `.home-court` is deliberately oversized so its
  drift cannot expose an edge; with `overflow-x` alone it inflated document height by ~620px.
- **The desktop demo bleed targets `.demo-widget`, not `#homeDemoRoot`.** The widget carries its
  own `max-width: 700px; margin: 0 auto`, which silently re-centres it inside the full-bleed rail
  and cancels the effect. It is intentionally uncapped on ultra-wide: capping produces an awkward
  small gap instead of a clean bleed.
- **FAQ `summary` is `display: block`, not flex.** As a flex container the question text became an
  anonymous flex item with `min-width: auto`, so it could not shrink below its longest word and
  overflowed by ~4px at 320px. The chevron is positioned out of flow.
- **`.home-ghost-link` underlines with `text-decoration`, not `border-bottom`.** A border sits on
  the box, so growing the box to a 44px touch target drags the underline away from the text.
- **The iOS install banner writes `vb-install-dismissed` the moment it is SHOWN, not only when
  dismissed (v4.26). That is deliberate — do not "fix" it.** **And "shown" means
  `showScreen('home')` actually ran — NOT `initInstallBanner()`.** `init()` calls `initHome()`
  *before* `routeInitialScreen()`, so when `initInstallBanner()` runs, nothing yet knows whether
  this load lands on the homepage or restores straight into a match. The iOS branch therefore only
  *arms* a one-shot (`_revealIosInstallBanner`) which `showScreen()` fires on its `home` branch,
  beside the `homeDemo` lifecycle. **Do not collapse that back into `initInstallBanner()`.** The
  write is permanent and nothing ever clears it, and `matchOver` counts as restorable — so an iOS
  referee who finished a match reloads onto `#matchResult` indefinitely, and firing at init time
  would burn their one-time instruction without ever showing it to them.
- **That one-shot is itself two stages, and both are needed.** It reveals the banner, then writes
  the key only when an `IntersectionObserver` says the banner actually entered the viewport.
  `#homeInstall` is the LAST band in `#home` — below the hero, the showcase, What's-new and the
  FAQ, roughly four viewport heights down on a phone — so a first-time visitor who taps
  "Start scoring" in the hero never reaches it. Writing on reveal would burn their one-time
  instruction just one step later than firing at init() did. **The reveal must come first**: while
  the banner carries `hidden` it is `display: none !important`, has no layout box, and the
  observer would never fire. Unlike `initHomeReveals()`, this observer is deliberately **not**
  gated on `prefers-reduced-motion` — it records an impression, it does not animate anything. An already-installed iOS user browsing
  in a Safari tab reports display-mode `browser`: `navigator.standalone` is true only inside the
  installed shell, and no web API exposes "is installed", so `initInstallBanner()`'s standalone
  guard cannot see them. Without the write they are re-offered, forever, the share-sheet
  instruction they already followed. It is a one-time instruction, not an offer. **Chromium's
  branch deliberately does NOT do this** — there `beforeinstallprompt` only fires when the app
  genuinely qualifies, so the offer is real and repeatable and stays until the user dismisses it.
  `getInstalledRelatedApps()` is not an option: it needs a `related_applications` manifest entry
  pointing at a native app, which does not exist here.

### The hero demo widget (`homeDemo`)

A scripted, self-playing replay of a deciding set's last rallies, inlined in `app.js` as an IIFE
exposing one global: `window.homeDemo = { init, start, pause, destroy, isPlaying }`.

- **Inlined deliberately.** A separate `home-demo.js`/`.css` would need `APP_SHELL` entries in
  `sw.js` or it would 404 offline, and this repo keeps all logic in `app.js`.
- **Isolation is the contract, and a reviewer greps for breaches.** It never reads or writes
  `state`, never calls `addPoint`/`updateDisplay`/`saveState`/`trackScreen`/`track`, never touches
  storage, and **every class it creates or queries is `demo-` prefixed** so app restyles and demo
  restyles cannot collide in either direction. It renders only inside the root passed to `init()`.
- **`showScreen()` owns its lifecycle:** lazily `init()`-ed the first time `#home` is shown
  (`init()` is idempotent, so a user who never sees home never builds its DOM) and `pause()`-d on
  the way to any other screen, so its timers never tick behind the scoreboard.
- **The demo owns its team colours; it must NOT read `--team1-color`/`--team2-color`.** Those are
  the *visitor's* colours — `applyTeamColors()` writes them to `:root` and persists them under
  `vb-team-colors` — so consuming them made the homepage hero change colour depending on what
  colours the visitor last picked for their own teams, and made the "isolated" demo depend on app
  state. It now declares `--demo-t1`/`--demo-t2` (+ `-rgb`) on `.demo-widget` itself, which also
  stops them leaking outward. **These two hex literals are the one sanctioned exception to the
  tokens-only rule** — a token has to be defined somewhere, exactly as `:root` defines
  `--team1-color`. Everything else in the demo block still composes off tokens.
- **The teams are a Haikyuu!! homage** (owner's call): MSBY Black Jackals play black with
  antique-gold claw markings, so gold is the only usable half of that pair on a dark panel; the
  Schweiden Adlers are white with royal-blue lettering, lifted for legibility on navy. Real club
  names are long, so `.demo-teamname` reserves `min-height: 2.2em` — without it a name that wraps
  on one side only would knock that side's score off the shared baseline.
- **Edit the replay via the `SCRIPT` array**, not the interpreter. Each beat carries exactly one of
  `point` / `serve` / `timeout` / `rotate` / `label` / `hold`, with an optional `ms` override.
- Auto-pauses offscreen (`IntersectionObserver`) and on `visibilitychange`, tracking user intent
  separately so an automatic resume never overrides an explicit pause. Under
  `prefers-reduced-motion` it creates **no timers** and renders the final frame statically, and
  the play/pause control is **hidden** — with no motion there is nothing for it to pause, and a
  "Replay" button there was provably inert (it re-derived the frame already on screen, so every
  render branch skipped). WCAG 2.2.2 only asks for a control when something is moving.
- **`el.hidden` only works here because of the `[hidden] { display: none !important }` rule near
  the top of `styles.css`.** The UA stylesheet's own `[hidden]` rule loses to any author rule
  that sets `display`, so `els.toggle.hidden = true` against `.demo-toggle`'s
  `display: inline-flex` was a silent no-op — the control stayed visible, tab-reachable and
  inert, which is worse than not having tried. There are exactly **two** `el.hidden` assignments
  in `app.js` — the demo toggle, and `btn.hidden = true` in the install banner's iOS branch — and
  **both** only work because of that reset (`.btn` declares `display: flex`, so it would have
  lost too). Everything else toggles the `.hidden` class (`display: none !important`). If you add
  another `el.hidden`, that reset rule is what makes it real.
- The decorative subtree is `aria-hidden="true"` with `.demo-controls` kept outside it, so
  assistive tech never announces a permanently-present "MATCH POINT" or unlabelled digit changes.

### Deciding-set side switch

`state.deciderSideSwitched` (boolean, persisted) tracks whether the mid-set side switch has fired in the current deciding set. When either team reaches 8 points in a 15-point final set, `maybeTriggerDeciderSwitch()` fires `showDeciderSwitchModal()`. On confirm, `closeDeciderSwitchModal()` sets the flag to `true` then calls `swapTeams()`. The flag is reset in `resetMatchState()` and in the set-transition branch of `checkSetWin()`. It is intentionally **not** included in `pointHistory` snapshots — it is sticky for the set, so undoing the trigger point reverts the score but keeps the swap in place (same semantics as the manual swap button).

### Technical timeouts

`state.techTimeoutsFired` is a flat array of numeric thresholds (8 and 16) that have already triggered in the current set. `maybeTriggerTechnicalTimeout()` is called after every point: it checks the leading score against each configured threshold and, if the threshold has not yet fired, pushes it into `techTimeoutsFired` (marking it sticky) before showing the timeout modal. The array is reset to `[]` at `beginMatch()` and at each set transition inside `checkSetWin()`.

`techTimeoutsFired` is intentionally **not** included in `pointHistory` snapshots — same precedent as `deciderSideSwitched`. Undoing the trigger point reverts the score but keeps the threshold marked as fired for the current set. `swapTeams()` does not touch this array because the thresholds are team-neutral (they fire on the leading score, regardless of which team is ahead). Known limitation: undoing a point that crossed a set boundary can leave a threshold marked as fired in a set where it was never actually triggered — this is acceptable given the same sticky semantics used elsewhere.

### Match state persistence

The full `state` object is serialized to localStorage under the key `vb-match-state` after every `updateDisplay()` call. On `init()`, `restoreSavedMatch()` reads it and routes the user back to the correct screen (scoreboard / rotation setup / match result). Stored under a `_schema` version field — `STORAGE_SCHEMA` is currently **4**. Bump it when the state shape changes in a way that breaks restore. Unlike earlier versions, schema changes are handled by `migrate()` rather than by silently dropping state: the 2 → 3 migration injects hardcoded v2-era rule constants into `state.rules` and seeds `state.techTimeoutsFired = []`; the 3 → 4 migration (v4.21) seeds `team1SubPairs`/`team2SubPairs` to `[]` and `currentSetStartedAt` to `null`, sets `rules.substitutionsPerSet = null` (a v3 match was definitionally played with no limit), **and seeds the same three fields into every snapshot already on `state.pointHistory`** — without that, undoing back past the upgrade restores `undefined`. Both preserve in-flight matches. Only add a `return null` (discard) path for truly irrecoverable breaks. `resetMatchState()` clears the stored state so a "Return to Setup" reliably starts fresh. Timer intervals (timeout countdown, set break) live in module-level vars, not in state — they are NOT restored, so a timeout interrupted by reload simply ends.

### Result screen stats layer (v4.20)

The result screen is no longer a static readout — it renders a **computed stats layer** derived entirely from `state.setHistory` (no new tracking, no schema change).

- `renderFinalScore(fromRestore)` builds the whole `#finalScore` innerHTML. It was extracted out of `endMatch()` in v4.20; `endMatch()` passes `fromRestore` in explicitly. **Never read `fromRestore` from a global** — the count-up animation is gated on it (animate on live finish, render final values instantly on reload-restore).
- **Pure stat functions**, all taking the `setHistory` array and returning plain values with no `state` or DOM access: `longestRun` / `longestRunInSet`, `biggestComeback`, `leadChanges`, `largestLead`. `longestRun` delegates to `longestRunInSet` so the chart's run marker and the "Longest Run" card share one source of truth and can never disagree on screen. Every one must tolerate legacy saves via `(s.points || [])`.
- `leadChanges` counts changes of *which team is ahead*. A tie is not a change and does not clear the incumbent leader — a naive "count sign flips" reading double-counts every deuce.
- `buildMatchStoryCards()` caps the strip at 5. Selection priority is **not** display order: the two never-hide cards (Total Rallies, Points) take guaranteed slots, remaining slots go story-first. Display order stays left-to-right as pushed.
- **Colour rule:** use `sideColors()`, which resolves the identity-mapped `--team1-color`/`--team2-color` (keyed to `originalId`) into the current side order. Never use those custom properties directly for anything ordered by side — that mismatch was a real bug in the pre-v4.20 set pills.
- **Restore path is the regression trap.** `endMatch({fromRestore:true})` runs the same render on reload, so every element must derive from persisted state only — no transient variables, no `Date.now()` in the render path. After changing anything here, verify a reload on the result screen re-renders identically and the count-up does not replay.

### Team names wrap, they do not truncate (v4.26)

Three surfaces display a team name in a box that does **not** grow with viewport width, and all
three used to clip it with `white-space: nowrap` + `text-overflow: ellipsis`. They now wrap:
`.ft-name` (the full-time scoreline), `.box-score td.box-score-name`, and `.history-team-name`.
This matches `.story-card-detail`, which has wrapped rather than truncated team names since v4.20
for the same reason — an ellipsis silently drops information the referee typed in.

The bug was not cosmetic at the edges: the scoreline's `1fr` track is capped at roughly
`(container − digits − gaps) / 2` and **does not widen with the viewport** — 99px at 400px, 82px at
375px, 54px at 320px — so it clipped anything past ~12 characters at *every* screen size. The
history modal was worse, at 81px per name on a 320px phone.

**Maintenance traps:**

- **`min-width: calc(9ch + 26px)` on `.box-score td.box-score-name` (in the `≤480px` block) is
  load-bearing. It is NOT a redundant twin of the `max-width` beside it.** Wrapping reduces a
  cell's min-content contribution, and min-content is what reserves a column in auto table layout,
  so without the pin the name column *collapses*: 105px → 63px at 375px in the five-set case, with
  rows 89px tall. `overflow-wrap: break-word` does not avoid this either — it leaves min-content at
  the longest word, still only 76px. **The pin is required whichever wrap mode is used.** Pinned,
  rows grow only 44px → 52px and the panel's horizontal scroll is unchanged from before the fix.
- **`overflow-wrap: anywhere`, not `break-word` — the reason is intrinsic sizing, not line
  breaking.** Both values break an otherwise-unbreakable word; per CSS Text 3 the *only*
  difference is that `break-word` does **not** fold those break opportunities into min-content.
  All three surfaces are flex items or table cells whose automatic minimum size is min-content, so
  under `break-word` each is unable to shrink below its longest word — the two flex items then
  spill their track outright, while the table cell instead surrenders the column (the 76px figure
  in the box-score bullet above). Same mechanism, seen from two sides. Verified against a
  60-character single word: it wraps and no element overflows its box. **Note `html` and `body`
  both set `overflow-x: hidden` (styles.css:77, :123), so a page-level horizontal-scroll assertion
  cannot fail — always verify these surfaces with per-element `scrollWidth > clientWidth`.**
- **Do not add `text-align` to `.ft-name`** — it already computes `center` by inheritance.
- **Do not add `title=` tooltips as a "better" fix.** They were considered and rejected: `title` is
  inert on touch, which is exactly where the truncation was worst.
- **Do not add `maxlength` to the name inputs.** The layout survives pathological input — a
  60-character unbroken word wraps with the digits still centred and **no element reporting
  `scrollWidth > clientWidth`** (stated per-element on purpose: see the overflow-x warning above) —
  so a `maxlength` would be cosmetic only, while silently truncating what the user typed and doing
  nothing for names already in `vb-match-history`.
- A wrapped name **cannot** ragged the box score's numeric columns — a table row's cells share a
  height by definition. This was the stated reason for keeping the ellipsis; measurement disproved
  it (`columnsAligned` holds at every viewport).

## Code Review Checklist

Every code review for this repo **must** verify UI across all of these viewports:

| Viewport | Dimensions |
|---|---|
| Desktop | 1280 × 800 (or wider) |
| Tablet landscape | 1024 × 768 |
| Tablet portrait | 768 × 1024 |
| Mobile portrait | 390 × 844 (iPhone 14 proxy) |
| Mobile landscape | 844 × 390 |
| Small phone | 375 × 667 (iPhone SE proxy) |

For each affected screen/modal, confirm:
- No overflow or horizontal scroll
- Touch targets are large enough (≥ 44px)
- Text is readable (no truncation, no overlap)
- Modals are fully visible and scrollable if needed
- Buttons and interactive elements are reachable (not clipped by safe-area or other elements)
