# ACC — Account: change email, change password, delete account

[← Back to the index](../launch-test-checklist.md) · 11 cases (P0 2, P1 8, P2 1)

### ACC-001 · Account screen is reachable by every member `P1`

- [ ] **Actor:** Any signed-in member (`ANY`) · **Screen:** `/settings/account`
- **Preconditions:** Any role (incl. Staff)
- **Steps:**
  1. Open Settings (desktop) or More > Settings
  2. Open Account
- **Expected:** Settings hub shows 'Account' and 'My notifications' for every member; /settings/account opens with Change email, Change password, Delete my account.
- **Must be refused / negative:** A Staff member must not see owner-only cards on the hub (Billing, Roles, Locations, Delete this business...).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ACC-002 · Change password: success `P1`

- [ ] **Actor:** Any signed-in member (`ANY`) · **Screen:** `/settings/account`
- **Preconditions:** Throwaway account signed in on TWO browsers
- **Steps:**
  1. Browser 1: Account > Change password
  2. Enter current, new (8-72), confirm
  3. Save
  4. Use browser 2
- **Expected:** Toast confirms; browser 1 stays signed in; browser 2 is signed out at its next refresh; new password works at next login.
- **Must be refused / negative:** Wrong current password: 'That password is not right.' and nothing changes.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ACC-003 · Change password validation `P1`

- [ ] **Actor:** Any signed-in member (`ANY`) · **Screen:** `/settings/account`
- **Preconditions:** Account screen
- **Steps:**
  1. Confirm differs from new
  2. New equals current
  3. New is 7 chars
- **Expected:** 'Both passwords must match' / 'Choose a password you have not used just now.' / 'Use at least 8 characters'.
- **Must be refused / negative:** No request is sent while the form is invalid.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ACC-004 · Change email: pending state `P1`

- [ ] **Actor:** Any signed-in member (`ANY`) · **Screen:** `/settings/account`
- **Preconditions:** Throwaway account
- **Steps:**
  1. Change email: enter a new email + current password
  2. Save
  3. Reload the screen
- **Expected:** A 'waiting for confirmation' state shows the new address with a Resend button; the sign-in email stays the old one until the link is confirmed.
- **Must be refused / negative:** Wrong password -> 'That password is not right.'; same email -> 'That is already your email.'; an email used by another account -> 'That email is already used by another account.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ACC-005 · Change email: resend rate limit `P2`

- [ ] **Actor:** Any signed-in member (`ANY`) · **Screen:** `/settings/account`
- **Preconditions:** Pending email change
- **Steps:**
  1. Press Resend several times
- **Expected:** After the limit: 'Too many tries. Wait a minute and try again.'
- **Must be refused / negative:** No crash, no duplicate state.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ACC-006 · Change email: confirm link updates profile `P1`

- [ ] **Actor:** Any signed-in member (`ANY`) · **Screen:** `/settings/account`
- **Preconditions:** Pending change; confirm link reachable
- **Steps:**
  1. Open the confirmation link
  2. Sign out, sign in with the new email
- **Expected:** New email works; Account shows it with no pending state.
- **Must be refused / negative:** Old email no longer signs in.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ACC-007 · Delete account refused for the only Owner `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/delete-account`
- **Preconditions:** Owner who is the ONLY active Owner of a live business
- **Steps:**
  1. Settings > Account > Delete my account
  2. Enter password + type your email
  3. Confirm
- **Expected:** Refused before anything is written: lists the business name(s) and says to delete the business or add another Owner.
- **Must be refused / negative:** Account, membership and data must be fully intact afterwards (sign in still works).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ACC-008 · Delete account succeeds for a non-owner `P0`

- [ ] **Actor:** Staff (own scope) (`STF`) · **Screen:** `/settings/delete-account`
- **Preconditions:** Throwaway Staff user with a staff profile and past appointments
- **Steps:**
  1. Account > Delete my account
  2. Type a wrong email first, then the right one, password
  3. Confirm
- **Expected:** Wrong email: 'The email you typed does not match your account.'. Success: signed out to /login; the account cannot sign in again. In the business, the staff profile and all past appointments remain (profile now has no app access).
- **Must be refused / negative:** Wrong password: 'That password is not right.' and nothing is deleted.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ACC-009 · Delete account works when a co-Owner exists `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/delete-account`
- **Preconditions:** Business with two active Owners (throwaway)
- **Steps:**
  1. Second owner deletes their account
- **Expected:** Allowed; the business keeps its other Owner and all data.
- **Must be refused / negative:** Business must never end up with zero Owners.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ACC-010 · Super admin cannot delete their account here `P1`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/settings/delete-account`
- **Preconditions:** Super admin signed in (aal2)
- **Steps:**
  1. Open /settings/delete-account (if reachable) and try
- **Expected:** Refused: 'A platform administrator account cannot be deleted here.'
- **Must be refused / negative:** Nothing deleted.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ACC-011 · Public data-deletion page `P1`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/delete-account`
- **Preconditions:** Signed out
- **Steps:**
  1. Open /delete-account
- **Expected:** Static explanation page with the steps and support email; Legal links present; no login needed.
- **Must be refused / negative:** No form that deletes anything without signing in.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
