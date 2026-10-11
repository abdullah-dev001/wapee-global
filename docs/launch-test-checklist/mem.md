# MEM — Members and invites

[← Back to the index](../launch-test-checklist.md) · 18 cases (P0 7, P1 10, P2 1)

### MEM-001 · Team list `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/members`
- **Preconditions:** Business with active members and pending invites
- **Steps:**
  1. Open Members
- **Expected:** Each person shows name + email, role(s) per location, status badge: Active / Invited / Expired / Disabled.
- **Must be refused / negative:** Members of other businesses never appear.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### MEM-002 · Invite a member `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/members`
- **Preconditions:** Owner
- **Steps:**
  1. Members > Invite
  2. Enter email, choose role and location (or all locations)
  3. Send
- **Expected:** A one-time link is shown once with a Copy button and expiry (7 days). List shows the person as Invited.
- **Must be refused / negative:** Invalid email -> 'Enter a valid email address'; no role -> 'Choose a role'. The link cannot be shown again later (resend makes a new one).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### MEM-003 · Manager invites only roles they may grant `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`) · **Screen:** `/members`
- **Preconditions:** Manager of branch A
- **Steps:**
  1. Open Invite: read the role list
  2. Try (API) to invite an Owner or a Manager-level role
- **Expected:** Role picker offers only roles whose permissions the Manager holds (e.g. Receptionist, Staff), locations limited to branch A.
- **Must be refused / negative:** Forced Owner invite is refused ('You cannot grant ...'); nothing created.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### MEM-004 · Receptionist / Staff cannot invite `P0`

- [ ] **Actor:** Receptionist (`REC`) · **Screen:** `/members`
- **Preconditions:** Receptionist, Staff
- **Steps:**
  1. Open Members
- **Expected:** List visible (staff.view) but no Invite button and no Manage action.
- **Must be refused / negative:** invite_member via API is refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### MEM-005 · Re-invite same email replaces the old link `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/members`
- **Preconditions:** Pending invite for x@...
- **Steps:**
  1. Invite x@ again (or Manage > new link)
  2. Open the OLD link
- **Expected:** New link works; old link shows the generic 'not valid' message.
- **Must be refused / negative:** Never two live links for one address.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### MEM-006 · Invite an existing active member is refused `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/members`
- **Preconditions:** Active member y@
- **Steps:**
  1. Invite y@ again
- **Expected:** Refused with a clear message; nothing changes.
- **Must be refused / negative:** No duplicate membership.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### MEM-007 · Accept invite: signed out, new account `P0`

- [ ] **Actor:** Invited person (`INVITEE`) · **Screen:** `/accept-invite`
- **Preconditions:** Valid invite for new address; private window
- **Steps:**
  1. Open the link
  2. Read business name + invited email
  3. Sign up with that email (name + password)
  4. Confirm email, reopen the link, Accept
- **Expected:** Joins the business with the role chosen at invite time; lands in the app; no onboarding.
- **Must be refused / negative:** Invitee never chooses their own role.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### MEM-008 · Accept invite: existing account joins a second business `P0`

- [ ] **Actor:** Invited person (`INVITEE`) · **Screen:** `/accept-invite`
- **Preconditions:** Invite for an address that already owns another business
- **Steps:**
  1. Sign in with that address
  2. Open link, Accept
- **Expected:** Now member of both; the first membership untouched; user still lands on their default (first) business.
- **Must be refused / negative:** See MULTI: there is no business switcher in the UI (gap).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### MEM-009 · Accept with the wrong signed-in account `P0`

- [ ] **Actor:** Invited person (`INVITEE`) · **Screen:** `/accept-invite`
- **Preconditions:** Signed in as z@ while invite is for x@
- **Steps:**
  1. Open the link, Accept
- **Expected:** Generic refusal (same message as invalid); z@ does not join.
- **Must be refused / negative:** Never attaches the membership to the wrong account.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### MEM-010 · Expired, used, revoked, tampered token `P0`

- [ ] **Actor:** Invited person (`INVITEE`) · **Screen:** `/accept-invite`
- **Preconditions:** Prepare: an accepted link, a revoked link, a link with 1 char changed, an expired one (SQL: set invite_expires_at past)
- **Steps:**
  1. Open each link
- **Expected:** All show the same generic 'not valid' message; preview shows no business name for a bad token.
- **Must be refused / negative:** No difference between the four cases (no oracle).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### MEM-011 · Accept rate limit `P1`

- [ ] **Actor:** Invited person (`INVITEE`) · **Screen:** `/accept-invite`
- **Preconditions:** One token
- **Steps:**
  1. Try to accept with a wrong account 11+ times within an hour
- **Expected:** After 10 attempts: 'Too many attempts' type refusal.
- **Must be refused / negative:** Counter persists (not reset by failures).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### MEM-012 · Manage: add / change / remove a role per location `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/members`
- **Preconditions:** Business plan, 2 branches, member with one role
- **Steps:**
  1. Members > Manage person
  2. Add a role at branch B
  3. Change role at branch A
  4. Remove the role at branch B
- **Expected:** Each change saves and the member's access updates (next focus).
- **Must be refused / negative:** Removing an Owner's last Owner role -> 'A business must always keep at least one Owner.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### MEM-013 · Last Owner and self-removal guards `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/members`
- **Preconditions:** Single-owner business
- **Steps:**
  1. Manage yourself: remove from business
  2. Remove your Owner role
- **Expected:** 'You cannot remove yourself. Ask another Owner.' / 'A business must always keep at least one Owner.'
- **Must be refused / negative:** No change persisted.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### MEM-014 · Remove member `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/members`
- **Preconditions:** Member with assignments
- **Steps:**
  1. Manage > Remove from business > confirm
- **Expected:** Member disappears (or shows Disabled); they lose access at next focus; their staff profile and past appointments stay.
- **Must be refused / negative:** Removed user opening the business sees no data.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### MEM-015 · Manager can resend / cancel invites but not manage roles `P1`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`) · **Screen:** `/members`
- **Preconditions:** Manager; pending invite
- **Steps:**
  1. Manage pending invite: new link
  2. Cancel invite
  3. Manage an active member
- **Expected:** New link and cancel work. For active members, role changes / remove are not offered.
- **Must be refused / negative:** assign_member_role / remove_member via API -> forbidden.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### MEM-016 · Cancel invite `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/members`
- **Preconditions:** Pending invite
- **Steps:**
  1. Manage > Cancel invite > confirm
  2. Open the link
- **Expected:** Invite gone from the list; link shows generic invalid.
- **Must be refused / negative:** Trying to remove an invited person via 'remove member' -> 'This person has not joined yet: cancel the invite instead.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### MEM-017 · Invite link is an https link (not wapee://) `P2`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/members`
- **Preconditions:** Owner on native or web
- **Steps:**
  1. Invite, read the link
- **Expected:** Link starts with the public https site URL and /accept-invite?token=
- **Must be refused / negative:** Never a wapee:// deep link.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### MEM-018 · Solo plan can still invite (known limit) `P1`

- [ ] **Actor:** Owner on Solo plan (`SOLO`) · **Screen:** `/members`
- **Preconditions:** Solo plan owner
- **Steps:**
  1. Invite a Receptionist
- **Expected:** Allowed (Solo 'owner only' is not enforced; only the 1-staff cap applies).
- **Must be refused / negative:** Record result; product doc says Solo = owner only (see mismatches).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
