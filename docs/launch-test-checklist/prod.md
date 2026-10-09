# PROD — Needs production build / real device (NOT testable on the dev web build)

[← Back to the index](../launch-test-checklist.md) · 22 cases (P0 8, P1 14, P2 0)

> Run on `npm run build:web` deployed to the real host (Cloudflare Pages) with the production Supabase project, or on real phones. These cases are listed separately and excluded from dev runs.

### PROD-001 · Service worker registers and caches the shell `P1`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(web prod)`
- **Preconditions:** Production web build on https
- **Steps:**
  1. Open the app
  2. DevTools > Application > Service workers
- **Expected:** /sw.js active; shell + static assets cached; API calls never cached.
- **Must be refused / negative:** No SW in dev builds (by design).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-002 · Update toast `P1`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(web prod)`
- **Preconditions:** Deploy a new build while the app is open
- **Steps:**
  1. Wait / refocus
- **Expected:** 'Update available' toast with Reload; reload loads the new version.
- **Must be refused / negative:** No stale bundle after Reload.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-003 · Manifest and install (Android Chrome) `P1`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(web prod)`
- **Preconditions:** Production URL on Android
- **Steps:**
  1. Install from the browser menu / hint
  2. Launch from home screen
- **Expected:** Name, icons (incl. maskable), theme colour from brand; opens standalone.
- **Must be refused / negative:** Install hint not shown once installed.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-004 · Installed PWA on iPhone (Add to Home Screen) `P1`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(web prod)`
- **Preconditions:** iPhone iOS 16.4+
- **Steps:**
  1. Add to Home Screen
  2. Open from the icon
- **Expected:** Opens full-screen; apple-touch icon; safe areas respected.
- **Must be refused / negative:** No browser chrome inside.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-005 · Web push on Android Chrome (installed PWA) `P0`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(device)`
- **Preconditions:** VAPID keys set on prod; member enables push
- **Steps:**
  1. Enable notifications
  2. Create a booking from another device
  3. Tap the notification
- **Expected:** Notification arrives (new booking); tapping opens the app.
- **Must be refused / negative:** Revoked browser permission -> 'blocked' state; dead subscription removed after 404/410.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-006 · Web push on iPhone installed PWA `P0`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(device)`
- **Preconditions:** iOS 16.4+, installed PWA
- **Steps:**
  1. Open from Home Screen > My notifications > Enable
  2. Trigger a booking
- **Expected:** Prompt appears after the button; notification delivered.
- **Must be refused / negative:** In a Safari tab: 'add this app to your Home Screen first' (needs_install).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-007 · Native (Expo) push `P1`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(native)`
- **Preconditions:** Requires EAS projectId (not configured)
- **Steps:**
  1. Native app > My notifications
- **Expected:** Currently shows 'Push notifications are not set up for this build yet.'
- **Must be refused / negative:** Must be configured before a native release.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-008 · Security headers on the host `P0`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(web prod)`
- **Preconditions:** Production host
- **Steps:**
  1. curl -I / and /<slug>/book and /<slug>/manage
- **Expected:** /: X-Frame-Options DENY, CSP frame-ancestors 'none', HSTS, nosniff; /<slug>/book: SAMEORIGIN + frame-ancestors 'self'; token pages: Referrer-Policy no-referrer.
- **Must be refused / negative:** Booking page framed by another origin must be blocked by the browser.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-009 · Pretty URLs and deep refresh `P1`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(web prod)`
- **Preconditions:** Production host
- **Steps:**
  1. Open /privacy, /terms, /<slug>, /<slug>/book, /clients/<id>, /invoice-print/<id>, /admin/business/<id> directly and refresh
- **Expected:** Each resolves (rewrites in _redirects); unknown path shows the app's not-found screen.
- **Must be refused / negative:** No host 404 on refresh.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-010 · Custom Access Token hook enabled `P0`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(supabase)`
- **Preconditions:** Supabase Dashboard > Auth > Hooks on prod
- **Steps:**
  1. Suspend a test business; try to sign in as its member
- **Expected:** Sign-in refused with the disabled message.
- **Must be refused / negative:** If not enabled only the focus check protects: launch blocker.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-011 · Auth emails from the real domain `P0`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(email)`
- **Preconditions:** Custom SMTP + redirect URLs for the real domain
- **Steps:**
  1. Sign up / reset password with a non-team address
- **Expected:** Emails arrive branded from the real domain; links open https://<domain>/verify and /reset-password.
- **Must be refused / negative:** No 'built-in sender' recipient restriction or 429 at normal volume.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-012 · Customer emails to real inboxes `P0`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(email)`
- **Preconditions:** Resend verified domain; PUBLIC_SITE_URL = real domain
- **Steps:**
  1. Book with a Gmail and an Outlook address
- **Expected:** Confirmation/reminder land in inbox (not spam); links point to the real domain and work.
- **Must be refused / negative:** Unsubscribe header (List-Unsubscribe-Post) works from Gmail's UI.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-013 · CORS allow-list on the real domain `P0`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(web prod)`
- **Preconditions:** PUBLIC_SITE_ORIGINS set
- **Steps:**
  1. Use the booking page from the real domain
  2. Call get_slots from another origin (curl with Origin header)
- **Expected:** Real domain works; foreign origin gets no CORS permission.
- **Must be refused / negative:** Placeholder origins removed.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-014 · Rate-limit client IP behind the real host `P1`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(web prod)`
- **Preconditions:** Production
- **Steps:**
  1. Two different networks book; one exceeds the per-IP cap
- **Expected:** Only the abusive network is limited (cf-connecting-ip keyed).
- **Must be refused / negative:** Not every visitor in one shared bucket.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-015 · Dev routes stripped `P1`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(web prod)`
- **Preconditions:** Production build
- **Steps:**
  1. Open /_gallery
- **Expected:** Not found.
- **Must be refused / negative:** No component gallery link in More.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-016 · Android native: hardware back everywhere `P1`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(native)`
- **Preconditions:** Android device, native build
- **Steps:**
  1. Back from drawers, dialogs, booking steps, manage reschedule view, business erase progress
- **Expected:** Closes the top overlay / steps back; blocked while erase runs.
- **Must be refused / negative:** Never exits the app from the middle of a flow.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-017 · Android/iOS keyboard and safe areas `P1`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(native)`
- **Preconditions:** Native builds, devices with notches and gesture bars
- **Steps:**
  1. Fill forms near the bottom of drawers
  2. Check bottom tab bar and footers
- **Expected:** Inputs stay above the keyboard; bottom spacing includes the inset.
- **Must be refused / negative:** No control under the home indicator.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-018 · Native pickers and sharing `P1`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(native)`
- **Preconditions:** New native build (expo-image-picker, expo-document-picker, clipboard)
- **Steps:**
  1. Upload a photo and a PDF
  2. Copy a manage/invite link
  3. Share an invoice / CSV
- **Expected:** Picker permissions requested once; content:// URIs work; copy and share work.
- **Must be refused / negative:** Old builds show 'needs an app update' instead of crashing.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-019 · Native deep links `P1`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(native)`
- **Preconditions:** Installed native app
- **Steps:**
  1. Open wapee://<slug>/manage#token=..., wapee://<slug>/review#token=...
- **Expected:** Opens the right page with the token read from the fragment.
- **Must be refused / negative:** Bad token -> generic invalid page.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-020 · Offline overlay on native `P1`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(native)`
- **Preconditions:** Airplane mode
- **Steps:**
  1. Toggle airplane mode on a dashboard screen
- **Expected:** Overlay appears and hides when back online.
- **Must be refused / negative:** No crash.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-021 · Cron worker reaches the production function `P0`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(supabase)`
- **Preconditions:** outbox_worker_url set in Vault on prod
- **Steps:**
  1. Create a booking with email
  2. Watch the message log
- **Expected:** Status 'sent' within ~1-2 minutes; reminders queued every 5 minutes.
- **Must be refused / negative:** Rows stuck 'queued' = configuration blocker.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PROD-022 · Super admin TOTP on production `P1`  🔒 prod/device

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `(supabase)`
- **Preconditions:** Prod admin account created per go-live plan
- **Steps:**
  1. Enrol TOTP, sign in
- **Expected:** aal2 reached; admin screens work.
- **Must be refused / negative:** Secret stored in a password manager (no recovery flow).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
