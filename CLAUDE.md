# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

No build system or dependencies. To run the app, open `index.html` directly in a browser:

```bash
open index.html
```

Deployment is automated via GitHub Actions (`.github/workflows/deploy.yml`) — any push to `main` deploys to GitHub Pages.

## Architecture

The app is a single-page vanilla JS application with three files:

- `index.html` — all markup; four screens toggled via the `hidden` CSS class
- `styles.css` — all styling; uses CSS variables and flexbox
- `app.js` — all logic; single file, no modules

### Screen flow

Four views are shown/hidden by toggling the `hidden` class on their container divs:

1. `#setup` — match configuration form
2. `#rotationSetup` — starting rotation assignment (before each set)
3. `#scoreboard` — active game screen
4. `#matchResult` — post-match result

Four modals are used across screens: `#subModal` (player substitution, overlays scoreboard), `#timeoutModal` (30-second countdown, overlays scoreboard), `#setBreakModal` (3-minute set break timer, shown between sets), and `#returnToSetupModal` (confirmation dialog for returning to setup mid-match).

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
