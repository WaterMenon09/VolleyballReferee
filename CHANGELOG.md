# Changelog

All notable changes to **Volleyball Referee** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [calendar-incremented semantic versioning](#versioning):
each change merged to `main` increments the patch version by `0.01`.

## [v4.00] - 2026-06-11

### Added

- **Settings modal** (`#settingsModal`): configurable match rules (timeout duration,
  timeouts per set, technical timeouts at 8 & 16 pts, set break duration, regular-set
  points, final-set points) and app preferences (sound on/off, vibration on/off,
  keep-awake screen lock). Rules are snapshotted into `state.rules` at `beginMatch()`
  and never mutated mid-match; app prefs are read live from `settings`.
- **Technical timeouts**: automatic 60-second timeout at the first team to reach 8 and
  16 points in any non-deciding set (when enabled). `state.techTimeoutsFired` tracks
  fired thresholds per set; sticky, excluded from `pointHistory` snapshots (same
  semantics as `deciderSideSwitched`).
- **Synthesized whistle sounds** via Web Audio API (no audio files shipped); all sound
  playback gated behind the `settings.sound` preference.
- **Haptic feedback gating**: `navigator.vibrate()` calls now check `settings.vibration`
  before firing — previously always-on.
- **Wake Lock** (`navigator.wakeLock`): keeps the screen on during an active match when
  the keep-awake preference is enabled; released on match end or app blur.
- **Feedback modal** (`#feedbackModal`): in-app feedback form submitted to Web3Forms.
  Owner must replace the `WEB3FORMS_ACCESS_KEY` placeholder in `app.js` with a live key
  from web3forms.com before submissions will deliver.
- **Share result button**: uses the Web Share API (with clipboard fallback) to share the
  final match scoresheet from the match-result screen.
- **Top action row** fixed top-right across all screens: feedback, settings, and history
  buttons grouped in a persistent header row.
- **Stadium Night visual polish**: contrast lift across all panels, ≥ 44 px tap targets
  enforced, `:focus-visible` keyboard rings on all interactive elements, full
  `prefers-reduced-motion` support, staggered entrance animation on the match-result
  screen, team-colored serve indicator dot.
- **Dynamic timeout dots**: remaining timeouts per team rendered as filled/empty dots
  built dynamically from the configured count; the dot row hides entirely when timeouts
  per set are configured to 0 (v3.09 showed dots, but fixed at 2 regardless of settings).
- `#historyModal` for the match history log (already present since v3.03, now
  explicitly listed alongside the other modals).

### Changed

- `STORAGE_SCHEMA` bumped from 2 to 3. The `migrate()` function performs a real 2 → 3
  migration (injects hardcoded v2-era rule constants into `state.rules` and seeds
  `state.techTimeoutsFired = []`) so in-flight matches are preserved rather than dropped.
- `settings` object loaded from `vb-settings` localStorage key; merged against
  `DEFAULT_SETTINGS` on load with per-field type checking and numeric clamping so
  future additions never corrupt existing saves.
- Version string format in `sw.js` now uses the dotted form `v4.0.0` (was `v3.0.9`).

### Known limitations

- iOS hardware silent switch mutes Web Audio whistles; there is no programmatic
  workaround available in the browser.
- Undoing a point across a set boundary can re-arm a technical timeout threshold in the
  restored set. This is intentional: `techTimeoutsFired` is sticky per set and excluded
  from `pointHistory` snapshots, mirroring the existing `deciderSideSwitched` semantics.
- The feedback form requires the owner to replace the `WEB3FORMS_ACCESS_KEY` placeholder
  in `app.js` with a live key from web3forms.com before submissions will deliver.

## [v3.09] - 2026-05-25

### Fixed

- Libero is no longer allowed to occupy position 1 (the server), per FIVB rule
  19.3.2.5 ("the libero cannot serve"). Position 1 is technically a back-row
  position, so `checkLiberoFrontRow` did not cover it.
  - The substitution modal now disables the libero option when position 1 is
    selected and shows the tooltip "Libero cannot serve (FIVB rule 19.3.2.5)".
  - `makeSubstitution` rejects any libero sub targeting `rotationIndex === 0`
    as defence-in-depth.
  - A new `checkLiberoAtServer(team)` helper runs after every `rotateTeam`
    call: if the libero rotated into index 0, the original player they
    replaced is restored automatically (mirroring the existing front-row
    auto-sub-out behaviour).

## [v3.08] - 2026-05-25

### Fixed

- Team rotation direction. `rotateTeam()` was rotating counter-clockwise (pos 6
  → pos 1 became the new server) instead of clockwise per FIVB rules (pos 2
  → pos 1 becomes the new server). Both teams were affected identically. The
  sub remap and libero shift were inverted to match (`(idx + 5) % 6`).

### Changed

- `STORAGE_SCHEMA` bumped to `2`. Any in-flight match saved under v3.07 or
  earlier is dropped on next load — restoring it would place players on the
  wrong court positions for the rest of the set.

## [v3.07] - 2026-05-25

### Added

- PWA telemetry: `launch` event with `display_mode` (standalone / minimal-ui /
  fullscreen / standalone-ios / browser) and `online` status; `pwa_installed`
  event on `appinstalled`.
- Core Web Vitals reporting via `PerformanceObserver`: `LCP` on observation,
  `CLS` and `INP` reported once on the first `visibilitychange` → hidden or
  `pagehide`.
- JS error tracking: `js_error` (window `error` events) and
  `js_promise_rejection` (`unhandledrejection`), with messages clamped to
  200 chars and source-paths to basename only.
- `app_version` param attached to every analytics event for release-cohort
  slicing.
- Match duration: `match_complete` now includes `duration_sec` (computed
  from a new `state.matchStartedAt` set in `beginMatch()`).

### Changed

- `track()` no-ops on `localhost`, `127.0.0.1`, `::1`, and `file://` so dev
  sessions don't pollute production analytics.

### Fixed

- `match_complete` no longer re-fires (with an inflated `duration_sec`)
  every time the user reloads while the result screen is showing.
  `endMatch()` now takes a `{ fromRestore }` flag and the duration is
  frozen into persisted state at match-end time.

## [v3.06] - 2026-05-25

### Added

- `CHANGELOG.md` as the single source of truth for release notes.

### Changed

- `README.md` Version History section replaced with a link to this changelog.

## [v3.05] - 2026-05-25

### Added

- Google Analytics 4 event instrumentation for the full match flow:
  `match_start`, `set_complete`, `match_complete`.
- Feature-usage events: `timeout_used`, `substitution`, `swap_teams_manual`,
  `decider_side_switch`, `undo_point`, `history_open`, `use_prev_rotation`,
  `color_swatch_used`.
- Safe `track()` helper in `app.js` that no-ops if `gtag` is unavailable
  (ad blockers, privacy mode).

## [v3.04]

### Added

- FIVB Rule 18.2.2: automatic side-switch modal when either team reaches
  8 points in the deciding set; state survives page reload.
- Timer-end shake animations and haptic feedback (vibration on supporting
  devices) for timer expirations and the deciding-set side-switch popup.

### Fixed

- Timeout and set-break timers now keep accurate time when the browser tab
  is in the background.

## [v3.03]

### Added

- Schema migration framework for future localStorage upgrades.
- Rotation-setup state persisted across reloads.
- Match history log with per-set score pills.

### Fixed

- Serve indicator behavior.

## [v3.02]

### Added

- Full match state survives app close/reload (full scoresheet retention
  via localStorage).

## [v3.01]

### Added

- PWA support: installable to home screen, full offline capability via
  service worker.

## [v3.0]

### Added

- Drag-and-drop rotation assignment.
- Customizable team colors.
- Letter/emoji jerseys.
- Lead-margin charts and total-points display.
- Return-to-setup mid-match.
- "Use previous rotation" button.

### Changed

- Polished indoor arena theme.

## [v2.01]

### Changed

- Optimized landscape mode for mobile phones; reduced scrolling.

## [v1.7]

### Added

- Live demo link and GitHub Actions deployment.

## [v1.5]

### Added

- README and deployment documentation.

## [v1.4]

### Added

- Mobile responsiveness, substitution system, rotation management.

## [v1.3]

### Added

- Timeout timer with countdown.

## [v1.2]

### Added

- Score timeline and service tracking.

## [v1.1]

### Added

- Basic scoring and set management.

## [v1.0]

### Added

- Initial release.

---

## Versioning

Each change merged to `main` bumps the version by `0.01`. When bumping:

1. Add a new entry at the top of this file under the new version heading.
2. Update the footer in `index.html` to match.
3. Update the `VERSION` constant in `sw.js` so the service worker cache
   invalidates and clients re-download updated assets.
