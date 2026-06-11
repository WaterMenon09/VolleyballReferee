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

### Screen flow

Four views are shown/hidden by toggling the `hidden` class on their container divs:

1. `#setup` — match configuration form
2. `#rotationSetup` — starting rotation assignment (before each set)
3. `#scoreboard` — active game screen
4. `#matchResult` — post-match result

Eight modals are used across screens: `#subModal` (player substitution, overlays scoreboard), `#timeoutModal` (30-second countdown, overlays scoreboard), `#setBreakModal` (3-minute set break timer, shown between sets), `#returnToSetupModal` (confirmation dialog for returning to setup mid-match), `#deciderSwitchModal` (side-switch notification at 8 points in the deciding set), `#settingsModal` (configurable match rules and app preferences), `#feedbackModal` (in-app feedback form via Web3Forms), and `#historyModal` (match history log).

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

Teams are assigned a permanent color identity: 'A' and 'B'. Colors are stored in CSS variables `--team1-color` / `--team2-color` (user-editable via color picker in setup, persisted in `localStorage`). `state.team1OriginalId` and `state.team2OriginalId` track which identity ('A'/'B') each side holds, even after swaps. Colors are applied in `updateTeamColors()` and `updateRotationSetupColors()` by checking `originalId`, not position number.

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

`sw.js` — service worker. Cache name is `vbref-v${VERSION}`; **bump `VERSION` in `sw.js` to invalidate all clients on the next deploy** and force re-download of updated assets. `APP_SHELL` lists every file precached at install — **add new CSS, JS, or icon files here or they will not be available offline**. HTML navigations use network-first (fresh on online reload, cached fallback offline). All other same-origin assets use cache-first. Cross-origin requests (Google Fonts, Analytics) are not intercepted and not cached — they silently fail offline, which is acceptable. Note: the v4.00 release did not add any new files to `APP_SHELL` — whistle sounds are synthesized via Web Audio API at runtime, and new icons use inline SVG — so the precache list is unchanged.

### Deciding-set side switch

`state.deciderSideSwitched` (boolean, persisted) tracks whether the mid-set side switch has fired in the current deciding set. When either team reaches 8 points in a 15-point final set, `maybeTriggerDeciderSwitch()` fires `showDeciderSwitchModal()`. On confirm, `closeDeciderSwitchModal()` sets the flag to `true` then calls `swapTeams()`. The flag is reset in `resetMatchState()` and in the set-transition branch of `checkSetWin()`. It is intentionally **not** included in `pointHistory` snapshots — it is sticky for the set, so undoing the trigger point reverts the score but keeps the swap in place (same semantics as the manual swap button).

### Technical timeouts

`state.techTimeoutsFired` is a flat array of numeric thresholds (8 and 16) that have already triggered in the current set. `maybeTriggerTechnicalTimeout()` is called after every point: it checks the leading score against each configured threshold and, if the threshold has not yet fired, pushes it into `techTimeoutsFired` (marking it sticky) before showing the timeout modal. The array is reset to `[]` at `beginMatch()` and at each set transition inside `checkSetWin()`.

`techTimeoutsFired` is intentionally **not** included in `pointHistory` snapshots — same precedent as `deciderSideSwitched`. Undoing the trigger point reverts the score but keeps the threshold marked as fired for the current set. `swapTeams()` does not touch this array because the thresholds are team-neutral (they fire on the leading score, regardless of which team is ahead). Known limitation: undoing a point that crossed a set boundary can leave a threshold marked as fired in a set where it was never actually triggered — this is acceptable given the same sticky semantics used elsewhere.

### Match state persistence

The full `state` object is serialized to localStorage under the key `vb-match-state` after every `updateDisplay()` call. On `init()`, `restoreSavedMatch()` reads it and routes the user back to the correct screen (scoreboard / rotation setup / match result). Stored under a `_schema` version field — `STORAGE_SCHEMA` is currently **3**. Bump it when the state shape changes in a way that breaks restore. Unlike earlier versions, schema changes are handled by `migrate()` rather than by silently dropping state: the 2 → 3 migration injects hardcoded v2-era rule constants into `state.rules` and seeds `state.techTimeoutsFired = []`, preserving in-flight matches. Only add a `return null` (discard) path for truly irrecoverable breaks. `resetMatchState()` clears the stored state so a "Return to Setup" reliably starts fresh. Timer intervals (timeout countdown, set break) live in module-level vars, not in state — they are NOT restored, so a timeout interrupted by reload simply ends.

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
