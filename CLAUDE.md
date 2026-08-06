# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

No build system or dependencies. To run the app, open `index.html` directly in a browser:

```bash
open index.html
```

Deployment is automated via GitHub Actions (`.github/workflows/deploy.yml`) — any push to `main` deploys to GitHub Pages.

## Architecture

The app is a single-page vanilla JS application with three source files plus PWA support files:

- `index.html` — all markup; four screens toggled via the `hidden` CSS class
- `styles.css` — all styling; uses CSS variables and flexbox
- `app.js` — all logic; single file, no modules
- `manifest.webmanifest` — installability metadata; relative `start_url`/`scope` resolve correctly under the `/VolleyballReferee/` GitHub Pages subpath
- `sw.js` — service worker (see PWA / offline section below)
- `fonts/` — self-hosted woff2 (Big Shoulders Display 600/800, Saira Semi Condensed 400–700); every file is listed in sw.js APP_SHELL

### Screen flow

Four views are shown/hidden by toggling the `hidden` class on their container divs:

1. `#setup` — match configuration form
2. `#rotationSetup` — starting rotation assignment (before each set)
3. `#scoreboard` — active game screen
4. `#matchResult` — post-match result

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

### In-app changelog (v4.22)

`#changelogModal` renders `CHANGELOG_ENTRIES`, an array in `app.js`. It deliberately does **not** `fetch('./CHANGELOG.md')` — that file is developer-toned, and fetching it would need adding to `APP_SHELL` in `sw.js` to survive offline.

> **Release chore:** `CHANGELOG_ENTRIES` does not read `CHANGELOG.md`. **Add a user-facing entry to the array whenever you add one to `CHANGELOG.md`,** or the in-app panel silently goes stale. Write it for a referee, not a developer.

The button (`#changelogBtn`) is shown only on `#setup`, via `updateAppBarForScreen(name)` called from `trackScreen()` — the one function that already fires at every screen entry point. It is called **before** the `ANALYTICS_DISABLED` guard so an ad blocker (which blocks `gtag` but not `app.js`) cannot strand the button.

### Screen tracking / virtual page views (v4.21)

The app is an SPA, so GA4 would otherwise record one `page_view` per session and pool all engagement time onto it. `trackScreen(name)` sends a virtual `page_view` (and a `gtag('set', ...)` so GA4's automatic engagement measurement follows the screen) whenever one of the four screens becomes visible. `trackVisibleScreen()` is the catch-all called at the tail of `init()` for paths with no named entry point — notably every `restoreSavedMatch()` branch.

**Two invariants this depends on. Breaking either silently corrupts the analytics:**

1. **Exactly one of the four screens may be visible at a time.** `trackVisibleScreen()` reports the *first* visible screen in `SCREEN_IDS` order, so two visible screens produce a wrong or phantom pageview. This is not merely an analytics concern — `#setup` carries no `hidden` class in the markup, so it is default-visible on a fresh page, and any restore path that forgets to hide it renders the whole setup form stacked above the real screen. That shipped as a real bug through v4.20: reloading into the set-2 rotation screen showed the setup form with the rotation screen ~1400px below the fold. Fixed in v4.21 by hiding `#setup` inside `showNewSetRotationSetup()`.
2. **Any new site that un-hides one of the four screens must call `trackScreen()`** or be reachable from the `init()` catch-all. Nothing enforces this structurally — the screens are toggled at ~12 scattered sites rather than through a central `showScreen()` helper. Centralising was considered and deliberately rejected (it means refactoring match-flow code on a scoresheet that must not break mid-match) but invariant 1's bug is the standing argument for doing it if that code is ever touched for other reasons.

`sw.js`'s `VERSION` **must** be bumped whenever `index.html` and `app.js` change together. `index.html` is served network-first but `app.js` is cache-first, so without the bump a returning client can run a new `index.html` against a stale cached `app.js` — which for this feature means `send_page_view: false` applies while `trackScreen()` doesn't exist, and the client records **zero** pageviews indefinitely.

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
