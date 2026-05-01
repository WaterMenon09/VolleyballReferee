## Summary

<!-- What does this PR do and why? One or two sentences. -->

Closes #<!-- issue number, if applicable -->

## Changes

<!-- Bullet list of what changed. Keep it factual — the diff already shows what, focus on why. -->

-

## Testing

**Browsers tested:**
- [ ] Chrome
- [ ] Safari

**Viewports tested** (check all that apply to your change):

| Viewport | Tested |
|---|---|
| Desktop (1280×800) | |
| Tablet landscape (1024×768) | |
| Tablet portrait (768×1024) | |
| Mobile portrait (390×844) | |
| Mobile landscape (844×390) | |
| Small phone (375×667) | |

## Screenshots / recording

<!-- For any UI change, include a screenshot or short GIF. Drag and drop here. -->

## Checklist

- [ ] All `state` mutations end with `updateDisplay()`
- [ ] No new files created unless genuinely required
- [ ] No external dependencies added
- [ ] If assets were added/removed/renamed: `VERSION` bumped and `APP_SHELL` updated in `sw.js`
- [ ] If the `state` object shape changed in a breaking way: `STORAGE_SCHEMA` bumped in `app.js`
- [ ] If a new mutable `state` field was added: included in the `pointHistory` snapshot so undo restores it
- [ ] README "Version History" entry added and `index.html` footer version updated
- [ ] UI verified at the viewports above
