# SEC — Security checks a tester can do by URL / UI

[← Back to the index](../launch-test-checklist.md) · 13 cases (P0 11, P1 2, P2 0)

### SEC-001 · Other business's appointment / client / invoice ids `P0`

- [ ] **Actor:** Signed-in user of another business (`OTHER`) · **Screen:** `(app)`
- **Preconditions:** Signed in to business B; ids from business A (ask the owner of A)
- **Steps:**
  1. Open /clients/<A id>
  2. Open /invoices?invoice=<A id>
  3. Open /invoice-print/<A id>
- **Expected:** Nothing of A is shown (not found / empty).
- **Must be refused / negative:** Any A data shown = P0.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SEC-002 · Other business's data through the API with your token `P0`

- [ ] **Actor:** Signed-in user of another business (`OTHER`) · **Screen:** `(API)`
- **Preconditions:** DevTools: copy your access token; REST call to /rest/v1/clients?business_id=eq.<A>
- **Steps:**
  1. Call it
  2. Call rpc list_appointments with A's business id
- **Expected:** Empty result or permission error.
- **Must be refused / negative:** No rows of A.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SEC-003 · Anon key cannot read tables or private RPCs `P0`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `(API)`
- **Preconditions:** Publishable key only
- **Steps:**
  1. GET /rest/v1/clients, /appointments, /invoices, /business_members
  2. POST /rest/v1/rpc/get_booking, cancel_booking, check_rate_limit
- **Expected:** 401/permission errors or 404 (function not visible).
- **Must be refused / negative:** Only reserved_slugs is readable by anon.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SEC-004 · Staff cannot widen scope by URL params `P0`

- [ ] **Actor:** Staff (own scope) (`STF`) · **Screen:** `/calendar`
- **Preconditions:** Staff
- **Steps:**
  1. Calendar URL with ?staff=<other id> or list filters for another staff
  2. /clients?search=<other client phone>
- **Expected:** Still only own data.
- **Must be refused / negative:** No other staff's appointments or clients.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SEC-005 · Role routes typed directly `P0`

- [ ] **Actor:** Receptionist (`REC`) · **Screen:** `(app)`
- **Preconditions:** Receptionist
- **Steps:**
  1. Type /settings/roles, /settings/branches, /settings/billing, /settings/delete-business, /settings/advanced-reports, /website, /services, /reports, /commission, /admin
- **Expected:** Each shows no-access, not-included or not-found; no data loads.
- **Must be refused / negative:** No write possible from any of them.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SEC-006 · Tampered tokens on every public link `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `(public)`
- **Preconditions:** manage, review, sign, portal, unsubscribe, accept-invite links
- **Steps:**
  1. Change one character of each token
  2. Use a token from another business with this slug
- **Expected:** Each shows its generic invalid page; nothing changes.
- **Must be refused / negative:** No page reveals whether the token was close to valid.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SEC-007 · Reused single-use tokens `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `(public)`
- **Preconditions:** Used review link, used portal link, used invite, used signing link, cancelled manage link
- **Steps:**
  1. Open each again
- **Expected:** Generic invalid page.
- **Must be refused / negative:** No second action possible.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SEC-008 · Tokens never in query string, logs or referrer `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `(public)`
- **Preconditions:** Open each tokenised link, then click an external link from the page
- **Steps:**
  1. Watch address bar and network tab
- **Expected:** Token only in #fragment, stripped after load; requests send it in the POST body; Referrer-Policy no-referrer on those pages (production headers).
- **Must be refused / negative:** Token never appears in a URL query or outgoing Referer.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SEC-009 · No service-role key or secrets in the web bundle `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `(bundle)`
- **Preconditions:** Built web app
- **Steps:**
  1. Search the JS bundle / page source for 'service_role', 'sk_', 'RESEND', 'TWILIO', 'VAPID_PRIVATE'
- **Expected:** Only the publishable key and the VAPID PUBLIC key.
- **Must be refused / negative:** Any secret = P0.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SEC-010 · Signed-out visitor on admin routes `P0`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/admin`
- **Preconditions:** Signed out
- **Steps:**
  1. Open /admin/*
- **Expected:** Redirect to /login.
- **Must be refused / negative:** No admin RPC returns data.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SEC-011 · XSS-style input is shown as text `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `(all)`
- **Preconditions:** Client name / service name / review / FAQ with '<script>alert(1)</script>' and '<img src=x onerror=alert(1)>'
- **Steps:**
  1. Save, then view in lists, profile, website, emails, print
- **Expected:** Shown literally; no script runs; JSON-LD escapes '<'.
- **Must be refused / negative:** Any alert = P0.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SEC-012 · CSV injection neutralised `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/settings/advanced-reports`
- **Preconditions:** Client name '=HYPERLINK("http://x")'
- **Steps:**
  1. Export advanced report CSV / client JSON
- **Expected:** Cell starts with a neutralising character in CSV.
- **Must be refused / negative:** Formula never runs in the spreadsheet.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SEC-013 · Two-business member: no cross-business leakage `P0`

- [ ] **Actor:** Member of two businesses (`MULTI`) · **Screen:** `(app)`
- **Preconditions:** User in business X (default) and Y with different roles
- **Steps:**
  1. Use every screen in X
  2. Paste ids of Y's clients/invoices into X's URLs
- **Expected:** Only X data; Y ids show nothing in X's screens.
- **Must be refused / negative:** Permissions of Y never apply in X (e.g. Owner in Y, Staff in X).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
