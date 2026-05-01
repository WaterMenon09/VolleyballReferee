# Contributing to Volleyball Referee

Thanks for your interest in contributing. This is a small, focused project — no build system, no dependencies — so the bar to get started is low. Contributions that fix bugs, improve mobile usability, correct refereeing rules, or add missing FIVB features are especially welcome. Please be respectful and constructive in all interactions.

See the [README](README.md) for a full feature overview and the live demo link.

---

## Reporting bugs and suggesting features

**Bugs** → open a [GitHub Issue](https://github.com/watermenon09/VolleyballReferee/issues) and include:

- Browser and version (e.g. Safari 17, Chrome 124)
- Device and OS (e.g. iPhone 15 / iOS 17, Android 14)
- Steps to reproduce
- What you expected vs. what happened
- Screenshot or screen recording if it's a visual issue

**Feature ideas** → the [Discussions tab](https://github.com/watermenon09/VolleyballReferee/discussions) is the right place for open-ended proposals, rule-set questions, and "what if" ideas before they become issues.

---

## Local development

No install step required.

```bash
git clone https://github.com/watermenon09/VolleyballReferee.git
cd VolleyballReferee
open index.html          # macOS — or just open the file in any modern browser
```

The app works directly from the filesystem for all features except the service worker (PWA/offline). To test that:

```bash
python3 -m http.server 8000   # or: npx serve
# then open http://localhost:8000 in Chrome or Safari
```

Recommended browsers for development: **Chrome** (DevTools device emulation) and **Safari** (iOS fidelity).

---

## Architecture

The app is three source files:

| File | Purpose |
|---|---|
| `index.html` | All markup — four screens, five modals |
| `styles.css` | All styling — CSS variables, flexbox |
| `app.js` | All logic — single file, no modules |

Plus `sw.js` (service worker) and `manifest.webmanifest` (PWA metadata).

Key concepts you'll encounter:

- **Single state object** — all game state lives in a global `state` object. One render function, `updateDisplay()`, syncs the entire UI to it. Every mutation to `state` ends with a call to `updateDisplay()`.
- **Undo system** — before each point is added, a deep snapshot of all mutable state fields is pushed onto `state.pointHistory`. `undoLastPoint()` pops and restores.
- **Rotation array** — stored as a flat 6-element array (index 0–5 → positions 1–6). `positionMap = [3, 2, 1, 4, 5, 0]` translates DOM order to array indices.
- **Screen flow** — views are shown/hidden by toggling the `hidden` CSS class on their container `div`s.
- **Persistence** — the full `state` object is serialized to `localStorage` after every `updateDisplay()`. `STORAGE_SCHEMA` in `app.js` gates compatibility; bump it when the shape changes in a breaking way.

For the full architectural deep-dive, read [`CLAUDE.md`](CLAUDE.md).

---

## PWA / service worker — required steps when changing assets

If your change adds, removes, or renames any CSS, JS, or icon file, two things must happen in `sw.js`:

1. **Bump `VERSION`** (e.g. `'v3.0.4'` → `'v3.0.5'`) — this invalidates the old cache on all clients and forces them to re-download updated assets.
2. **Update `APP_SHELL`** — add the path of any new file to the array. Files not listed here will not be available offline.

```js
// sw.js
const VERSION = 'v3.0.5';                 // ← bump this
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/volleyball.png',
  './icons/swap.png',
  './icons/timer.png',
  './icons/undo.png',
  './icons/new-icon.png',                 // ← add new assets here
];
```

---

## Coding conventions

- **Vanilla JS only** — no build step, no bundler, no frameworks, no npm packages.
- **File boundaries** — all logic in `app.js`, all styles in `styles.css`, all markup in `index.html`. Don't create new files unless the change genuinely requires it.
- **State mutations** — every change to `state` must be followed by `updateDisplay()`. Never mutate the DOM directly outside of render functions.
- **Naming** — camelCase for functions and variables. Descriptive names; no single-letter variables outside of short loops.
- **CSS** — extend the existing CSS variable palette (`--team1-color`, `--panel-bg`, etc.) rather than hardcoding new color values. Layouts use flexbox.
- **Comments sparingly** — only when the *why* is non-obvious: a hidden constraint, a workaround for a specific bug, or behavior that would surprise a reader.

---

## UI verification checklist

Before opening a PR, test every screen and modal your change affects at all six supported viewports. Resize using Chrome DevTools (or equivalent) device emulation.

| Viewport | Dimensions |
|---|---|
| Desktop | 1280 × 800 |
| Tablet landscape | 1024 × 768 |
| Tablet portrait | 768 × 1024 |
| Mobile portrait | 390 × 844 (iPhone 14) |
| Mobile landscape | 844 × 390 |
| Small phone | 375 × 667 (iPhone SE) |

For each viewport, confirm:

- No overflow or horizontal scroll
- Touch targets are large enough (≥ 44px)
- Text is readable — no truncation, no overlap
- Modals are fully visible and scrollable if needed
- Buttons and interactive elements are reachable (not clipped by safe-area insets or other elements)

---

## Pull request workflow

1. Fork the repo and create a branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name   # or fix/your-bug-name
   ```
2. Make small, focused commits.
3. Verify the UI checklist above.
4. Open a PR against `main`. In the description, include:
   - What changed and why
   - Browsers and viewports you tested
   - Screenshots or a short GIF for any visual change
   - A reference to the related issue if one exists (e.g. `Closes #42`)

Merging to `main` automatically deploys to GitHub Pages via GitHub Actions — changes go live within a minute or two of merge.

---

## License

By contributing, you agree that your changes will be released under the [MIT License](LICENSE) that covers this project.
