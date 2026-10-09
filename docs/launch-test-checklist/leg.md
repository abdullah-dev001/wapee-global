# LEG — Legal pages and LegalLinks

[← Back to the index](../launch-test-checklist.md) · 2 cases (P0 0, P1 2, P2 0)

### LEG-001 · Terms and Privacy pages `P1`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/privacy`
- **Preconditions:** Dev: /privacy.html and /terms.html; production: /privacy and /terms
- **Steps:**
  1. Open both
- **Expected:** Static branded pages marked 'DRAFT - replace with reviewed text'.
- **Must be refused / negative:** Production launch with DRAFT text = launch blocker (content, not code).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### LEG-002 · LegalLinks placements `P1`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `(public)`
- **Preconditions:** Signed out and in
- **Steps:**
  1. Check signup (with 'By creating an account you agree to our'), Settings hub, website footer, booking page, manage page, portal, review page, sign page, unsubscribe page
- **Expected:** 'Terms of Service · Privacy Policy' visible and opening the right page (new tab on web).
- **Must be refused / negative:** No placement links to a 404.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
