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

Five modals are used across screens: `#subModal` (player substitution, overlays scoreboard), `#timeoutModal` (30-second countdown, overlays scoreboard), `#setBreakModal` (3-minute set break timer, shown between sets), `#returnToSetupModal` (confirmation dialog for returning to setup mid-match), and `#deciderSwitchModal` (side-switch notification at 8 points in the deciding set).

### State management

All game state lives in a single global `state` object (top of `app.js`). A secondary `rotationSetupState` object holds transient rotation-setup UI state (selected position, pending assignments) and is reset each time rotation setup is shown.

`updateDisplay()` is the single render function that syncs the entire UI to `state`. All mutations to `state` end with a call to `updateDisplay()`.

### Undo system

Before each point is added, a deep snapshot of all mutable state fields is pushed onto `state.pointHistory`. `undoLastPoint()` pops the last snapshot and restores state. On `swapTeams()`, all snapshots in `pointHistory` are remapped (team1/team2 fields swapped) so undo works correctly even after a swap. The `points` array inside each `setHistory` entry is also remapped.

### Rotation array layout

The rotation is stored as a flat 6-element array. The mapping between array index and court position is:

```
index: 0  1  2  3  4  5
pos:   1  2  3  4  5  6
```

The `rotateTeam()` function shifts element 5 (position 6, server) to the front (index 0, position 1) — a clockwise rotation. The `updateRotationDisplay()` function uses a separate `positionMap = [3, 2, 1, 4, 5, 0]` to translate DOM node order (front row left-to-right: 4-3-2, back row left-to-right: 5-6-1) into rotation array indices.

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

`sw.js` — service worker. Cache name is `vbref-v${VERSION}`; **bump `VERSION` in `sw.js` to invalidate all clients on the next deploy** and force re-download of updated assets. `APP_SHELL` lists every file precached at install — **add new CSS, JS, or icon files here or they will not be available offline**. HTML navigations use network-first (fresh on online reload, cached fallback offline). All other same-origin assets use cache-first. Cross-origin requests (Google Fonts, Analytics) are not intercepted and not cached — they silently fail offline, which is acceptable.

### Deciding-set side switch

`state.deciderSideSwitched` (boolean, persisted) tracks whether the mid-set side switch has fired in the current deciding set. When either team reaches 8 points in a 15-point final set, `maybeTriggerDeciderSwitch()` fires `showDeciderSwitchModal()`. On confirm, `closeDeciderSwitchModal()` sets the flag to `true` then calls `swapTeams()`. The flag is reset in `resetMatchState()` and in the set-transition branch of `checkSetWin()`. It is intentionally **not** included in `pointHistory` snapshots — it is sticky for the set, so undoing the trigger point reverts the score but keeps the swap in place (same semantics as the manual swap button).

### Match state persistence

The full `state` object is serialized to localStorage under the key `vb-match-state` after every `updateDisplay()` call. On `init()`, `restoreSavedMatch()` reads it and routes the user back to the correct screen (scoreboard / rotation setup / match result). Stored under a `_schema` version field — bump `STORAGE_SCHEMA` when the state shape changes in a way that breaks restore, and stale data is silently dropped. `resetMatchState()` clears the stored state so a "Return to Setup" reliably starts fresh. Timer intervals (timeout countdown, set break) live in module-level vars, not in state — they are NOT restored, so a timeout interrupted by reload simply ends.

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
