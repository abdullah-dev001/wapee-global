# LCH — Launch switches (features OFF at launch)

[← Back to the index](../launch-test-checklist.md) · 2 cases (P0 2, P1 0, P2 0)

### LCH-001 · Widget is not visible or usable `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/website`
- **Preconditions:** launch.widget = false
- **Steps:**
  1. Website editor: look for a Widget tab
  2. Embed /<slug>/book in an iframe on another site
- **Expected:** No Widget tab; framed booking page refuses to show the form.
- **Must be refused / negative:** No widget key/snippet reachable in the UI.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### LCH-002 · SMS is not visible or usable `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/notifications`
- **Preconditions:** launch.sms = false
- **Steps:**
  1. Settings hub: look for SMS credits
  2. Type /settings/sms-credits
  3. Notification settings: SMS block
  4. Message preview channel options
- **Expected:** No credits card; route redirects to Settings; 'SMS messages are coming soon.'; preview shows email only.
- **Must be refused / negative:** Clients without email get no SMS. Note: role editor still lists sms.* permissions and super admin keeps credit tools (record, not a fail).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
