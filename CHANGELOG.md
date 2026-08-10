# Changelog

All notable changes to **SpikeSheet** (released as "Volleyball Referee" through v4.22) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [calendar-incremented semantic versioning](#versioning):
each change merged to `main` increments the patch version by `0.01`.

## v4.24 — 2026-08-10

Every dialog in the app becomes properly keyboard- and screen-reader-usable. Until now no modal trapped focus, so a keyboard user could Tab straight out of an open dialog and reach the controls behind it — including the scoring buttons sitting behind a confirmation prompt. The v4.20 review demonstrated the consequence: with the serve-switch confirmation open, you could Tab behind it, score the set-winning point, then confirm, and the side switch would apply to the *next* set. This release closes that for all ten modals at once, as a single shared mechanism rather than ten patched copies.

### Added
- **Focus is trapped inside the open dialog.** Tab and Shift+Tab now cycle within the modal and wrap at the ends; the controls behind it are unreachable until it closes. Verified against the v4.20 exploit above — it no longer reproduces.
- **Escape closes most dialogs**, and always means *cancel*, never *confirm*. On the "Return to setup?" and "Switch serving team?" prompts it takes the cancel branch. **Two dialogs deliberately ignore Escape:** the deciding-set **Switch Sides** notice, whose only action performs the court switch, and the **Set Break** timer, whose only action advances the match to the next set. Neither has a cancel path, so a stray keypress must not be able to trigger them — their buttons stay the only way through.
- **Dialogs announce themselves to screen readers** — each carries a dialog role, a modal flag, and a title reference, and focus moves onto the dialog when it opens so its heading is read out. Focus returns to the control that opened it on close.
- **The match-history and What's-new lists are keyboard-scrollable.** Both were scrollable regions that keyboard users could not reach at all; each is now a labelled, focusable region.

### Fixed
- **The What's-new and match-history dialogs could hide their own Close button.** Each had a scrolling list inside an already-scrolling box, so on a short screen — a phone held in landscape, most obviously — reaching Close required scrolling the outer box after the inner list had bottomed out. Both now use the same single-scroll layout the Settings dialog already used; the Close button stays put and visible at every supported size.
- **The feedback form's hidden spam trap could receive keyboard focus.** It is parked off-screen, so focus would have vanished with no visible cursor, and anything typed into it would have made a genuine submission look like spam and be silently discarded behind a success message. It is now excluded from the tab order.

### Internal
- The trap is driven by a `MutationObserver` on each modal's `class` attribute rather than by edits inside the ten open/close functions. `confirmReturnToSetup()` force-hides `#setBreakModal` and `#deciderSwitchModal` directly, deliberately bypassing their close functions (calling `closeDeciderSwitchModal()` there would fire `swapTeams()`), so teardown wired into close functions would leak on exactly those paths. Observing the class attribute catches every hide path and keeps the change additive — no match-flow code was restructured.
- Escape routes through the existing close functions, never the `hidden` class, because `#timeoutModal` and `#setBreakModal` own live intervals and a repeating vibration that only those functions clear.
- The focusable-element scan is recomputed on every Tab press, since `#setKeepAwake` and `#submitFeedback` toggle `disabled` while their dialog is open, and it collapses each radio group to a single stop to match native behaviour.
- No change to scoring, rotation, substitution, or persistence logic. `STORAGE_SCHEMA` stays at **4** — no state shape changed, so there is no migration.

## v4.23 — 2026-08-10

The app is renamed from **Volleyball Referee** to **SpikeSheet**. The old name is a category label rather than a mark, which put it inside a crowded cluster of identically-named volleyball scoring apps and caused an app store rejection. Stores reject on confusing similarity, not exact match, so a similarly descriptive replacement would have failed the same way — the new name is distinctive, and the descriptive keywords move to the store listing fields where they belong.

### Changed
- **App name is now SpikeSheet** — window title, app-bar brand, web manifest `name`/`short_name` (was `VB Ref`), Open Graph and Twitter card titles, feedback email subject, and the match-result share text. The name fields carry the **bare mark only**: a store's duplicate-name check reads `name` and `<title>`, so appending a category label there would partly re-create the collision this release exists to fix. Descriptive wording lives in `description` and the store listing fields
- **Meta description rewritten** to lead with "Volleyball scoresheet tracker" and name rotations, substitutions, libero, timeouts, FIVB rules, and offline support, so the rename costs no search relevance

### Fixed
- **The app name is visible on phones again.** A `@media (max-width: 460px)` rule hid the app-bar wordmark because the old 18-character name could not fit beside four buttons. At 10 characters it fits, so the threshold dropped to 360px. Measured at 375px with all four buttons visible: the wordmark renders complete with 6px of clearance and no overflow
- **`.top-btn` now declares a font.** It previously declared none, and since the `*` reset sets no font and there is no `button {}` rule, the History button's label rendered in the browser's default button font. That made it the one width-variable element in a `flex-shrink: 0` row, so the app bar's fit depended on which browser was rendering it. Pinned to the app's own typeface, which also fixes History being the only app-bar text in a foreign font
- **The app-bar heading has an accessible name.** Below 360px the wordmark is hidden and the volleyball mark is `aria-hidden`, which left the `<h1>` with no name for screen readers. An `aria-label` closes it at every width
- **iOS home-screen name pinned** via `apple-mobile-web-app-title`, for versions predating manifest `short_name` support

Known and accepted: at 375px with browser text scaling at 110% or above, the wordmark ellipsizes. Text scaling grows fonts without changing viewport width, so no media query can detect it. Measured to 200% — the bar never overflows and touch targets hold at 44px, so it degrades to a truncated wordmark rather than a broken layout. Raising the breakpoint would fix it only by hiding the brand on iPhone SE and mini at default settings, which is the worse trade.

### Internal
- **The repository and GitHub Pages URL are deliberately unchanged.** Renaming them would move the Pages path, which orphans every installed PWA at the old service-worker `scope`, breaks the absolute `og:url`/`og:image` tags, and splits the analytics history. The absolute URLs in `index.html` are therefore left pointing at `/VolleyballReferee/` on purpose
- **No `localStorage` key was touched** — `vb-settings`, `vb-match-state`, `vb-match-history`, and `vb-team-colors` keep their names, so an in-flight match, saved history, settings, and team colours all survive the upgrade. `STORAGE_SCHEMA` stays at **4**: the state shape is unchanged, and a bump would route live matches through `migrate()` with no 4 → 5 path
- The `vbref-` service worker cache prefix is retained; it is internal and renaming it buys nothing
- `APP_VERSION` bumped to v4.23 so analytics events and feedback submissions report the current build
- Service worker v4.2.3

## v4.22 — 2026-08-07

An in-app "What's new" panel, so changes are visible to whoever wants to read them without leaving the app, plus the metadata that makes a shared link unfurl properly.

### Added
- **"What's new" button on the home screen** — a small icon beside the gear that opens a readable summary of recent releases, written for referees rather than developers. It appears only on the setup screen; mid-match the app bar stays out of the way
- **Open Graph and Twitter card tags** — sharing the app previously unfurled as bare text. It now carries a title, description, and icon on every platform that reads them

### Fixed
- The web manifest claimed the app icon existed at 192×192 as well as 512×512. Only the 512×512 file was ever there, so the smaller declaration was a lie browsers had to work around by downscaling. It now states only what is true

### Internal
- Changelog content is an in-app array rather than a fetch of `CHANGELOG.md`: the raw file is developer-toned, and fetching it would need adding to the service worker's precache list to survive offline. **The array must be updated with each release** — it does not read this file
- Homepage-only visibility hangs off `trackScreen()`, which since v4.21 already fires at every screen entry point, rather than adding toggles to the ~12 scattered places that show and hide screens. The app-bar update runs before the analytics guard, so an ad blocker cannot leave the button stranded
- Service worker v4.2.2

## v4.21 — 2026-08-06

Substitutions now follow the FIVB rulebook. A starter and their substitute are locked to each other for the rest of the set, so a player can no longer be walked around the court by subbing out and back in somewhere else — the loophole that quietly defeated the rotation rule the scoresheet exists to enforce.

### Added
- **Substitution position lock (FIVB 15.6.2 / 15.6.3)** — when two players substitute against each other they become a pair for the set: the starter may only come back in place of their own substitute, and that substitute may only ever be replaced by that same starter. Illegal options are greyed out in the substitution list with the reason stated on screen, citing the rule, rather than failing silently when tapped
- **Substitutions per team per set** — a new match rule in Settings. Empty means unlimited, which stays the default, so nothing changes unless you set a number; the field suggests 6 for FIVB indoor. `0` is a real setting meaning no substitutions at all. The substitution dialog shows how many of the allowance you've used. Note this counts *entries onto the court*, per 15.6.1 — a starter going off and coming back consumes two
- **Per-set durations** on the result screen — the box score gains a duration row beneath the set scores. Sets under a minute read in seconds. Matches recorded before this release simply omit the row rather than showing blanks
- **Per-screen analytics** — the app is a single page, so all four screens previously reported as one, making it impossible to see which screen people actually use or how long they spend there. Each screen now reports itself. No personal data is collected: screen names and counts only, never team or player names

### Fixed
- **Reloading between sets rendered the entire match-setup form above the rotation screen**, pushing the real screen roughly 1400px below the fold — it read as though the app had thrown the match away. The set-2-onward rotation path was the only one that never hid the setup screen. This had been shipping since before v4.20; found while verifying this release
- Taking the libero off court no longer counts as a substitution — it never was one under FIVB 19, but it would have consumed the new per-set allowance and filed a bogus pairing
- A bench player could be substituted directly into the slot the libero was covering. That is not a legal single step (the libero comes off first, then you substitute), and doing it recorded the *libero* as the starter of the pair, permanently locking the covered player out of the set with a message quoting the wrong shirt number

### Internal
- Substitution legality is tracked by **player pairing, not court position** — `state.team{1,2}SubPairs` holds `{starter, sub, returned}` records keyed by shirt number. Position keys are remapped by `rotateTeam()` on every side-out, so anything position-keyed cannot survive a set. One structure serves both readers: the pair lock and the allowance counter
- `STORAGE_SCHEMA` 3 → 4, with a real migration. In-progress matches saved under v4.20 restore intact; the new fields are seeded into live state **and** into every undo snapshot already on the stack, so undoing back past the upgrade still works
- New pure helpers `substitutionBlockReason()`, `subEntriesUsed()`, `isLiberoReturn()`, `liberoSlotBlockReason()`; enforcement is defence-in-depth, gating the UI *and* guarding `makeSubstitution()`, the same shape as the v4.11 libero fix
- Virtual page views via `trackScreen()`, with `send_page_view: false` on the GA4 config. `sw.js` v4.2.1 — the bump is load-bearing here, not housekeeping: `index.html` is served network-first while `app.js` is cache-first, so shipping them apart would leave returning clients running new markup against a stale script
- Four unused image assets deleted (~1.5 MB of dead repo weight, none of them referenced or precached)

## v4.20 — 2026-08-05

Match result screen rebuilt as a post-match broadcast graphic. Every new number is computed from data the app already stored — no new tracking, no schema change.

### Added
- **Full-time scoreline** — the sets score is now the hero of the screen, with each team's name and colour dot, and the winner's digit in gold. The digits count up when a match finishes live, and render instantly on a reload so you never see a wrong number
- **Box score table** — set scores are a proper table (teams as rows, sets as columns) instead of a loose row of pills, so you can scan one team across the whole match. Set winners are highlighted per column
- **"Match Story" strip** — computed insight cards: longest scoring run, biggest comeback, lead changes, largest lead, match duration, total rallies, and total points. Cards that would read as noise hide themselves, so a straight-sets win shows fewer, stronger cards rather than a wall of zeroes
- **Chart annotations** — each set's momentum chart now marks where the longest run began and enlarges the final point, so the shape of the set is readable without decoding it
- Set charts become a swipeable carousel on phones instead of shrinking to fit

### Fixed
- **Reloading on the result screen rendered the entire match-setup form above the result**, which read as though the match had been thrown away. The result-restore path was the only one that never hid the setup screen. Long-standing bug, found while verifying this release
- Set-score pills coloured themselves from the persisted team-colour slots rather than the current side, so they showed the wrong team's colour after a mid-match swap. The pills are gone and the replacement resolves colour through the same side-mapping the momentum charts already used
- Losing set scores in the box score rendered at full strength instead of dimmed, so the gold winner didn't stand out as intended
- A match ending within 30 seconds of an hour boundary showed a nonsense duration ("60m", "1h 60m")
- The version credit is pinned to the bottom of the screen, so on a short landscape phone it floated over the result screen instead of sitting below it. It is now hidden at that size, alongside the other chrome that block already sheds
- `prefers-reduced-motion` zeroed animation *durations* but not *delays*, so staggered entrances still revealed progressively over ~0.7s for users who asked for no motion. Now zeroed too, which also fixes the pre-existing result-screen staggers

### Internal
- The result-screen HTML builder was extracted out of `endMatch()` into `renderFinalScore(fromRestore)`; the stats layer is a set of pure functions (`longestRun`/`longestRunInSet`, `biggestComeback`, `leadChanges`, `largestLead`) that take the set history and return plain values
- `sideColors()` centralises the identity-to-side colour resolution that was previously inline in the chart renderer
- CI now gates deployment on `node --check` for `app.js` and `sw.js` — previously every push to `main` shipped to production unverified
- Service worker v4.2.0 (cache invalidation); `APP_SHELL` unchanged, `STORAGE_SCHEMA` stays 3

### Not included
- Share-as-image ("Share Card") is deliberately held back. Its whole value is the share sheet firing on a real device, and that cannot be verified in an automated browser — it ships separately after on-device testing. Sharing result text is unchanged

## v4.12 — 2026-08-05

Polish release addressing eight pieces of end-user feedback on the v4.10 build. No scoring-logic changes.

### Added
- "Match Settings" button on the setup screen — settings were previously only reachable via the app-bar gear, which users weren't finding (the gear stays where it is)
- "Return to Setup" button on the rotation-setup screen — you're no longer forced to finish assigning positions before going back to fix a setup mistake. Pre-match it returns directly; mid-match (set 2+) it asks for confirmation first
- Serve indicator now responds to Enter/Space when focused, so the control is reachable by keyboard and assistive tech

### Changed
- Manually switching the serving team mid-set now asks for confirmation. Serve already follows the score automatically, so an accidental tap was a real source of scoring confusion. Switching is still free at 0–0, before any point is played
- Timeout countdown shows whole seconds instead of centiseconds — the rapidly changing digits made the timer visibly jitter. The progress ring still animates smoothly. The countdown now rounds up rather than down, so it starts at the full duration and reaches zero only at expiry (rounding down was harmless while centiseconds were displayed, but would have shown "29" immediately and hit "0" a second early once they were dropped)
- The "rule changes apply to the next match" note now sits under the *Match Rules* heading instead of above it, where it read as if it applied to every setting

### Fixed
- The timeout button visually clipped the team colour bar above it
- Point timeline never actually auto-scrolled to the newest point — the scroll was applied to a container that cannot scroll, so long rallies scrolled out of view and stayed there
- Point timeline no longer pops a scrollbar into view once points overflow; the edge fade remains as the overflow cue
- Settings and feedback modals scrolled the rounded outer container, so the scrollbar track was clipped at the corners. Both now scroll an inner region with the heading and buttons pinned, matching the match-history modal. The feedback submit status can no longer be scrolled out of view as it appears

### Internal
- Service worker v4.1.2 (cache invalidation); `APP_SHELL` unchanged, no new files
- Persisted state shape untouched — `STORAGE_SCHEMA` stays 3
- The service worker no longer registers on `localhost`/`127.0.0.1`, and actively unregisters any leftover registration and clears its caches there. Cache-first serving was handing back stale CSS/JS during local development and masking edits — it caused false verification failures twice while testing this release. Production behaviour is unchanged

## v4.11 — 2026-06-13

### Fixed
- Libero can now be subbed into position 1 (back-right) while their team is receiving — previously blocked unconditionally, which violated FIVB rules (position 1 is only restricted when the team is serving)
- Manual serve-indicator tap while a team has its libero at position 1 (receiving) now auto-evicts the libero before rendering, preventing an illegal server display

## v4.10 — 2026-06-12

### Changed — full UI/UX revamp ("Stadium Night: Broadcast Edition")
- New typography: Big Shoulders Display + Saira Semi Condensed, self-hosted woff2 (works offline; Google Fonts dependency removed)
- New design-token system (palette unchanged): spacing/radius/type/motion/elevation scales
- Fixed app bar with brand wordmark replaces floating title and action buttons
- Broadcast-style scoreboard: fluid hero scores, team-color +1 buttons with auto-contrast text, center score bug, set chips
- Rotation screens drawn as real court diagrams (net strip, attack line, zone tiles)
- Unified modal shell: blurred backdrop, bottom sheets on phones, consistent headers
- All PNG UI icons replaced with inline SVG; emoji icons removed
- Component library: segmented controls, redesigned inputs/switches/buttons, gold focus rings
- Motion pass: score pop, screen entrances, serve glow; full prefers-reduced-motion support

### Internal
- Service worker v4.1.0: fonts precached, dead PNG icons dropped from APP_SHELL
- Legacy CSS variables being retired in favor of tokens (completed in this release)

## [v4.01] - 2026-06-11

### Fixed

- **Feedback form delivery**: replaced `WEB3FORMS_ACCESS_KEY` placeholder with a live
  key so submissions now reach the owner's inbox. (Previously the API rejected every
  submission silently.)
- **Service worker cache bust**: bumped `VERSION` in `sw.js` to `v4.0.1` so existing
  clients evict the stale `vbref-v4.0.0` cache and receive the corrected `app.js`.

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
