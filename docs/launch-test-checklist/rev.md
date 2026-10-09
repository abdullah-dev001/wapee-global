# REV — Reviews

[← Back to the index](../launch-test-checklist.md) · 9 cases (P0 3, P1 6, P2 0)

### REV-001 · Review link after completing `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Confirmed booking
- **Steps:**
  1. Mark completed (Today or Calendar)
- **Expected:** Dialog shows the review link once with Copy.
- **Must be refused / negative:** Reopen + complete again does not create a second request.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REV-002 · Get review link again `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Completed, unreviewed appointment
- **Steps:**
  1. Detail > Get review link again
  2. Open the old link
- **Expected:** New link shown; old link shows the generic invalid page.
- **Must be refused / negative:** Not offered once reviewed.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REV-003 · Public review page `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/review`
- **Preconditions:** Valid review link
- **Steps:**
  1. Open /<slug>/review#token=...
  2. Submit without rating
  3. Rate 2 stars + comment
  4. Submit
- **Expected:** No rating -> 'Choose a rating from 1 to 5.'; thanks page for every rating with the same Google prompt/button (only if a Google review URL is set on the branch).
- **Must be refused / negative:** Low ratings are never filtered or treated differently.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REV-004 · Used, expired, tampered review link `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/review`
- **Preconditions:** Link already used; edited token; >30 days
- **Steps:**
  1. Open each
- **Expected:** 'This review link isn't available' + 'It may have expired or already been used.' for all.
- **Must be refused / negative:** Second submission impossible.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REV-005 · Comment limit and honeypot `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/review`
- **Preconditions:** Review page
- **Steps:**
  1. Paste 2001 chars
  2. Fill the hidden honeypot via DevTools
- **Expected:** Input stops at 2000 ('Up to 2000 characters.'); honeypot submission does not create a review.
- **Must be refused / negative:** Rate limit: 10 submits/h per IP -> 'Too many attempts...'.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REV-006 · Reviews screen filters and reply `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/reviews`
- **Preconditions:** Several reviews
- **Steps:**
  1. Filter rating, replied yes/no, featured, branch
  2. Reply (≤1000 chars), edit reply
- **Expected:** Filters in URL; reply saved and shown; empty-filter state with 'clear filters'.
- **Must be refused / negative:** Reply over 1000 chars blocked; customer words cannot be edited.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REV-007 · Feature on website (max 12) `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/reviews`
- **Preconditions:** 13 published reviews
- **Steps:**
  1. Feature 12
  2. Feature the 13th
  3. Unfeature one
- **Expected:** Featured ones appear on the website Testimonials (first name only); 13th -> 'You can feature up to 12 reviews on your website. Remove one first.'
- **Must be refused / negative:** Removed (super admin) reviews cannot be featured.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REV-008 · Staff sees own reviews only `P0`

- [ ] **Actor:** Staff (own scope) (`STF`) · **Screen:** `/reviews`
- **Preconditions:** Staff
- **Steps:**
  1. Open Reviews
- **Expected:** Only reviews of their own appointments; no feature/reply unless permitted.
- **Must be refused / negative:** Other staff's reviews never visible.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REV-009 · Google review button setting `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/reviews`
- **Preconditions:** Branch without google_review_url
- **Steps:**
  1. Look for a place to set the Google review link
- **Expected:** Expected: owner can set it.
- **Must be refused / negative:** KNOWN GAP: no UI field (DB column only); button appears only if set by SQL.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
