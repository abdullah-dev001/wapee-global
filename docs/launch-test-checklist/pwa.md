# PWA — PWA (testable parts on the dev build)

[← Back to the index](../launch-test-checklist.md) · 2 cases (P0 0, P1 0, P2 2)

### PWA-001 · Install hint (Chromium) `P2`

- [ ] **Actor:** Any signed-in member (`ANY`) · **Screen:** `(shell)`
- **Preconditions:** Chrome desktop/Android, not installed
- **Steps:**
  1. Open the app
  2. Dismiss the hint, reload
- **Expected:** 'Install Wapee' hint with Install button (when the browser offers beforeinstallprompt); after dismiss it does not return.
- **Must be refused / negative:** Never shown when already installed (standalone).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PWA-002 · iOS manual install hint `P2`  🔒 prod/device

- [ ] **Actor:** Any signed-in member (`ANY`) · **Screen:** `(shell)`
- **Preconditions:** iPhone Safari
- **Steps:**
  1. Open the app
- **Expected:** Text 'Tap the Share button, then “Add to Home Screen”.'
- **Must be refused / negative:** Not shown inside the installed app.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
