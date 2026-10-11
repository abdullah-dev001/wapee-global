# AUTH — Auth, session and route guard

[← Back to the index](../launch-test-checklist.md) · 24 cases (P0 7, P1 15, P2 2)

### AUTH-001 · Sign up with valid details `P1`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/signup`
- **Preconditions:** Fresh email you can read (or ask for SQL confirm). Signed out.
- **Steps:**
  1. Open /signup
  2. Enter full name, email, password of 8+ chars
  3. Read the legal line under the form
  4. Press Create account
- **Expected:** Account created, you land on /verify showing 'We sent a link to <email>'. Legal line reads 'By creating an account you agree to our Terms of Service · Privacy Policy' with working links.
- **Must be refused / negative:** Submitting with any field empty shows the field error under the field ('Enter your name' / 'Enter your email' / 'Use at least 8 characters') and nothing is created.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-002 · Sign up validation limits `P1`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/signup`
- **Preconditions:** Signed out on /signup
- **Steps:**
  1. Type a 7-char password, submit
  2. Type a 73-char password, submit
  3. Type 'abc@' as email, submit
  4. Type a 121-char name, submit
  5. Type ' User@Example.COM ' as email and valid rest
- **Expected:** 7 chars: 'Use at least 8 characters'. 73 chars: 'That password is too long'. Bad email: 'Enter a valid email address'. Email with spaces/caps is accepted and stored lowercase.
- **Must be refused / negative:** 121-char name must not be accepted (max 120). Submit button stays disabled while a request is running (double-tap creates one account).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-003 · Sign up with an email that already exists `P1`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/signup`
- **Preconditions:** Existing account email
- **Steps:**
  1. /signup with an already-registered email
  2. Submit
- **Expected:** No second account is created. The screen does not reveal more than Supabase allows (generic behaviour).
- **Must be refused / negative:** Must never sign you into the existing account or overwrite its name/password.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-004 · Verify screen: resend and wrong email `P1`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/verify`
- **Preconditions:** Just signed up, not confirmed
- **Steps:**
  1. On /verify press Resend email
  2. Press it again several times quickly
  3. Press 'Wrong email? Sign out and start again.'
- **Expected:** First resend shows 'Sent. Check your inbox.'. Sign-out link returns to /login and clears the session.
- **Must be refused / negative:** Repeated resends hit the mail rate limit: a calm error, no crash, no endless spinner. Unconfirmed user opening any /today etc. URL is sent back to /verify.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-005 · Unverified account cannot enter the app `P0`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/verify`
- **Preconditions:** Account created but email not confirmed
- **Steps:**
  1. Try to sign in with the unconfirmed account
  2. Type /today, /clients, /settings in the address bar
- **Expected:** Every private URL redirects to /verify. No business data, no menu.
- **Must be refused / negative:** No route under (app) or (admin) renders for an unverified session.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-006 · Confirm email link finishes signup `P1`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/verify`
- **Preconditions:** Unconfirmed account; confirmation email (or SQL confirm)
- **Steps:**
  1. Open the confirmation link
  2. Wait for 'Checking your link…'
- **Expected:** You are redirected out of /verify. With no business you land on /onboarding.
- **Must be refused / negative:** An already-used or broken confirmation link must not sign you in; you stay on /verify or /login.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-007 · Sign in with correct details `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/login`
- **Preconditions:** Owner dev account, signed out
- **Steps:**
  1. Open /login
  2. Enter email and password
  3. Press Sign in
- **Expected:** You land on / then the default business (Today). Header/sidebar shows the business.
- **Must be refused / negative:** While the request runs the button shows a spinner and cannot be pressed twice.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-008 · Sign in with wrong password or unknown email `P0`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/login`
- **Preconditions:** Signed out
- **Steps:**
  1. Enter a real email with a wrong password
  2. Enter an unknown email with any password
- **Expected:** Both show the same error box (server text 'Invalid login credentials'), so you cannot tell which emails exist. No session is created.
- **Must be refused / negative:** Must not say 'no such user' or 'wrong password' separately. Note: message comes untranslated from the server (see mismatches).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-009 · Login form validation `P1`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/login`
- **Preconditions:** Signed out on /login
- **Steps:**
  1. Submit empty form
  2. Submit invalid email
- **Expected:** 'Enter your email' / 'Enter a valid email address' and 'Enter your password' under the fields.
- **Must be refused / negative:** No network call is made with an invalid form.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-010 · Forgot password always reports success `P1`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/forgot-password`
- **Preconditions:** Signed out
- **Steps:**
  1. Open /login > Forgot password?
  2. Enter a registered email, send
  3. Repeat with an unregistered email
- **Expected:** Both show 'Check your email' + 'If an account exists for <email>, a reset link is on its way.' Back to sign in works.
- **Must be refused / negative:** The two answers must be identical (no account discovery).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-011 · Reset password from email link `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/reset-password`
- **Preconditions:** Reset email received (team-member address) for a throwaway account
- **Steps:**
  1. Open the reset link
  2. Enter new password and a different confirm
  3. Fix confirm, submit
  4. Sign in with the new password
- **Expected:** Mismatch shows 'Both passwords must match'. Success shows 'Password updated'; the new password works, the old one does not.
- **Must be refused / negative:** A 7-char or 73-char new password is refused with the length errors. Opening /reset-password directly without a link must not change any password.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-012 · Session persists across reload and new tab `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/today`
- **Preconditions:** Signed in (web)
- **Steps:**
  1. Reload the page
  2. Open the app URL in a new tab
  3. Close and reopen the browser
- **Expected:** Still signed in on the same business each time, no flash of the login screen beyond the loading spinner.
- **Must be refused / negative:** After Sign out, reloading must show /login (no stale session).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-013 · Every protected route redirects a signed-out visitor `P0`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `(all)`
- **Preconditions:** Signed out, private window
- **Steps:**
  1. Type each URL: /today /calendar /clients /clients/<any id> /services /staff /members /schedule /invoices /reports /commission /packages /inventory /reviews /website /more /settings and every /settings/* sub-route /invoice-print/<id> /report-print /admin /admin/platform /admin/business/<id> /admin/2fa /onboarding
- **Expected:** Every one redirects to /login. No data, no layout of the app is shown.
- **Must be refused / negative:** None of them may render content or call a data RPC that returns data while signed out.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-014 · Public routes stay reachable signed out `P0`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `(public)`
- **Preconditions:** Signed out
- **Steps:**
  1. Open /login /signup /forgot-password /<slug> /<slug>/book /<slug>/manage /<slug>/review /<slug>/sign /<slug>/portal /unsubscribe /delete-account /accept-invite?token=x
- **Expected:** Each renders its own page (or its own generic 'not valid' state) without redirecting to /login.
- **Must be refused / negative:** None of them shows dashboard chrome (sidebar / tabs).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-015 · Signed-in user opening auth screens is sent home `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/login`
- **Preconditions:** Signed in, has a business
- **Steps:**
  1. Type /login, /signup, /forgot-password, /onboarding
- **Expected:** Each redirects to / (your business).
- **Must be refused / negative:** /accept-invite is the exception: it must still render (see MEM).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-016 · Sign out from sidebar and from More `P1`

- [ ] **Actor:** Any signed-in member (`ANY`) · **Screen:** `/more`
- **Preconditions:** Signed in (desktop: sidebar; mobile: More tab)
- **Steps:**
  1. Desktop: press Sign out in the sidebar
  2. Mobile 375: More > Sign out
  3. Press browser Back
- **Expected:** You land on /login. Back does not show cached business data; private URLs redirect to /login.
- **Must be refused / negative:** No data from the previous user is visible after signing in as a different user in the same tab (cache cleared).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-017 · No data leaks between two users in one browser `P0`

- [ ] **Actor:** Any signed-in member (`ANY`) · **Screen:** `/clients`
- **Preconditions:** Two accounts of DIFFERENT businesses
- **Steps:**
  1. Sign in as user A, open Clients and Calendar
  2. Sign out
  3. Sign in as user B in the same tab
  4. Open Clients, Calendar, Invoices
- **Expected:** Only business B data appears, including in lists that were cached for A.
- **Must be refused / negative:** Any row of business A visible to B is a P0 failure.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-018 · Suspended business: all members cannot sign in `P0`

- [ ] **Actor:** Owner, business suspended (`OWN-S`) · **Screen:** `/login`
- **Preconditions:** Super admin sets the only business of this owner to Suspended; Custom Access Token hook ENABLED on the project
- **Steps:**
  1. Owner (and a member of that business) try to sign in
- **Expected:** Login shows 'This account is disabled. Contact support@wapee.online'. No session.
- **Must be refused / negative:** If the hook is not enabled on the project this check cannot pass: report it as a configuration blocker, not a code pass.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-019 · Suspended while signed in: session ends on focus `P0`

- [ ] **Actor:** Owner, business suspended (`OWN-S`) · **Screen:** `/today`
- **Preconditions:** Owner signed in; super admin suspends the business
- **Steps:**
  1. Switch to another tab and back (focus), or wait up to the token expiry
- **Expected:** The app signs out locally and shows the disabled message on /login.
- **Must be refused / negative:** The user must not keep working beyond the next focus/refresh check.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-020 · Member of a suspended AND an active business can still sign in `P1`

- [ ] **Actor:** Member of two businesses (`MULTI`) · **Screen:** `/login`
- **Preconditions:** User is member of business X (suspended) and Y (active)
- **Steps:**
  1. Sign in
- **Expected:** Sign-in works; the user lands on their default business.
- **Must be refused / negative:** Must not be blocked because one of two businesses is suspended.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-021 · Trial ended does NOT block sign-in `P1`

- [ ] **Actor:** Owner, trial ended / inactive (`OWN-X`) · **Screen:** `/login`
- **Preconditions:** Owner whose trial ended (inactive, not suspended)
- **Steps:**
  1. Sign in
- **Expected:** Sign-in works and the lock screen is shown (see PLAN).
- **Must be refused / negative:** Must not show the 'account disabled' message.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-022 · Super admin never blocked by suspension `P1`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/login`
- **Preconditions:** Super admin is also a member of a suspended business
- **Steps:**
  1. Sign in
- **Expected:** Super admin signs in normally (then TOTP).
- **Must be refused / negative:** No disabled message for the super admin.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-023 · Password field show/hide `P2`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/login`
- **Preconditions:** Any password field (login, signup, reset, account)
- **Steps:**
  1. Type a password
  2. Press the eye icon twice
- **Expected:** Text becomes visible then hidden again; accessible label switches 'Show password'/'Hide password'.
- **Must be refused / negative:** Showing the password must not clear or change the value.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### AUTH-024 · Keyboard submit on auth forms `P2`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/login`
- **Preconditions:** Web, /login
- **Steps:**
  1. Fill fields with the keyboard only (Tab)
  2. Press Enter in the password field
- **Expected:** Form submits once.
- **Must be refused / negative:** Enter on an invalid form shows errors, no request.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
