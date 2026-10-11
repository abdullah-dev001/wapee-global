# OFF — Offline overlay

[← Back to the index](../launch-test-checklist.md) · 2 cases (P0 0, P1 1, P2 1)

### OFF-001 · Offline overlay on dashboard and public pages `P1`

- [ ] **Actor:** Any signed-in member (`ANY`) · **Screen:** `(all)`
- **Preconditions:** Chrome DevTools > Network > Offline
- **Steps:**
  1. Go offline on /today and on /<slug>/book
  2. Press Try again while offline
  3. Go online
- **Expected:** Full-screen 'No internet connection' + description + Try again ('Checking…' while probing); stays while offline; disappears by itself when online.
- **Must be refused / negative:** A second tap while checking is ignored; form data typed before going offline is still there afterwards.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### OFF-002 · Captive portal / flaky network `P2`

- [ ] **Actor:** Any signed-in member (`ANY`) · **Screen:** `(all)`
- **Preconditions:** Online flag but requests failing (block supabase host)
- **Steps:**
  1. Use the app
- **Expected:** No overlay (known); screens show their own error states with retry.
- **Must be refused / negative:** No infinite spinners.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
