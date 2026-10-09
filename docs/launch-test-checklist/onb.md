# ONB — Onboarding (create business)

[← Back to the index](../launch-test-checklist.md) · 9 cases (P0 1, P1 7, P2 1)

### ONB-001 · Create business: happy path `P1`

- [ ] **Actor:** Owner on trial (`OWN-T`) · **Screen:** `/onboarding`
- **Preconditions:** New verified account with no business
- **Steps:**
  1. Step 1: name 'QA Salon', keep suggested slug, pick industry
  2. Next
  3. Step 2: country, check currency + timezone pre-filled, location name
  4. Create
- **Expected:** Business created; you are Owner; trial ends in 14 days (Billing shows it); first branch is the main one with that country/currency/timezone; you land in the app.
- **Must be refused / negative:** Back button keeps entered values; Create cannot be pressed twice (one business only).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ONB-002 · Slug suggestion and manual edit `P1`

- [ ] **Actor:** Owner on trial (`OWN-T`) · **Screen:** `/onboarding`
- **Preconditions:** Onboarding step 1
- **Steps:**
  1. Type name 'Café Élan & Co'
  2. Edit the slug by hand
  3. Change the name again
- **Expected:** Suggested slug 'cafe-elan-co' (accents stripped). After a manual edit, changing the name no longer overwrites the slug.
- **Must be refused / negative:** Slug field never contains uppercase, spaces or accents.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ONB-003 · Slug validation rules `P1`

- [ ] **Actor:** Owner on trial (`OWN-T`) · **Screen:** `/onboarding`
- **Preconditions:** Onboarding step 1
- **Steps:**
  1. Try 'ab'
  2. Try a 41-char slug
  3. Try 'Bad_Slug', 'a--b', '-ab', 'ab-'
  4. Try reserved words: admin, login, api, wapee, support, book, privacy, delete-account
- **Expected:** 'Use at least 3 characters' / 'That is too long' / 'Use lowercase letters, numbers and hyphens only' / 'That address is reserved. Please pick another.' (delete-account is refused by the server even though the app list lacks it).
- **Must be refused / negative:** None of these can be submitted; the database refuses them too.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ONB-004 · Slug that equals an app route is refused `P0`

- [ ] **Actor:** Owner on trial (`OWN-T`) · **Screen:** `/onboarding`
- **Preconditions:** Onboarding step 1
- **Steps:**
  1. Try slugs: today, more, members, schedule, website, packages, inventory, commission, accept-invite, invoice-print, report-print
- **Expected:** Expected: refused as reserved (these are app routes; a business with that slug would have an unreachable website).
- **Must be refused / negative:** KNOWN RISK: these words are in neither the app nor the DB reserved list (see mismatches). If accepted, mark FAIL and do not keep the business.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ONB-005 · Slug already taken `P1`

- [ ] **Actor:** Owner on trial (`OWN-T`) · **Screen:** `/onboarding`
- **Preconditions:** Another business uses slug nova-hair-studio
- **Steps:**
  1. Type 'nova-hair-studio'
  2. Wait ~0.5 s
- **Expected:** 'That address is already taken' (live check).
- **Must be refused / negative:** Create is impossible with a taken slug; a race (two people same slug) is refused by the DB.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ONB-006 · Country / currency / timezone choices `P1`

- [ ] **Actor:** Owner on trial (`OWN-T`) · **Screen:** `/onboarding`
- **Preconditions:** Step 2
- **Steps:**
  1. Pick United States: check timezone list starts with main US zones
  2. Pick a country without pre-fill (e.g. Bhutan)
  3. Pick Japan (JPY) and Kuwait (KWD) in two throwaway businesses
- **Expected:** US shows its main zones first then all others; a country without pre-fill leaves currency/timezone empty to choose; 280 countries, 162 currencies, 418 timezones available; currency warning text says it is hard to change later.
- **Must be refused / negative:** Create without country/currency/timezone shows 'Pick your country' / 'Pick a currency' / 'Pick a timezone'.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ONB-007 · Only one self-serve business per account `P1`

- [ ] **Actor:** Owner on trial (`OWN-T`) · **Screen:** `/onboarding`
- **Preconditions:** Owner who already created a business
- **Steps:**
  1. Open /onboarding by URL
- **Expected:** Redirected to / (has a business). A second create via the RPC is refused.
- **Must be refused / negative:** No second business is created.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ONB-008 · Invited person never sees onboarding `P1`

- [ ] **Actor:** Invited person (`INVITEE`) · **Screen:** `/accept-invite`
- **Preconditions:** Brand-new account that signed up from an invite link
- **Steps:**
  1. Confirm email
  2. Reopen the invite link and accept
- **Expected:** After accepting, user lands in the inviting business; onboarding is not forced.
- **Must be refused / negative:** Opening /accept-invite is never redirected to /onboarding.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ONB-009 · Industry and branch name optional `P2`

- [ ] **Actor:** Owner on trial (`OWN-T`) · **Screen:** `/onboarding`
- **Preconditions:** Step 1/2
- **Steps:**
  1. Leave industry empty and location name empty
  2. Create
- **Expected:** Allowed; first location is named after the business; an invoice prefix (first 3 letters, uppercased) is set on the branch.
- **Must be refused / negative:** A 121-char business or location name is refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
