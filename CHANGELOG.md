# Changelog

All notable changes to **Volleyball Referee** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [calendar-incremented semantic versioning](#versioning):
each change merged to `main` increments the patch version by `0.01`.

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
