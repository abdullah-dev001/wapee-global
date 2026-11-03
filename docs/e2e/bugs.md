# E2E bugs

Found while running `test-plan.md` on DEV. Report only; fixes are separate tasks.
Severity: `Blocker` (cannot launch), `High`, `Medium`, `Low`. Status: `Open`, `Fixing`, `Fixed (commit)`, `Retest passed`, `Won't fix (reason)`.
Never paste tokens, passwords, keys or real customer data here.

| ID | Flow / case | Severity | Steps | Expected | Actual | Status |
|---|---|---|---|---|---|---|
| KG-01 | F10-07 | P1 (Known gap) | Reviews → look for a field to set the Google review URL | Owner can set `branches.google_review_url` (doc §6.4) | Column exists, read by the review page; no screen writes it, so the Google button never shows | Known gap — confirmed 2026-11-03 |
| KG-02 | F09-18 | P1 (Known gap) | Calendar → appointment drawer → look for "send manage link again" | Business can resend the guest manage link (doc §0 #3, §6.1) | Edge Function `resend_manage_link` deployed; no app button calls it | Known gap — confirmed 2026-11-03 |
| KG-03 | F03-16 | P1 (Known gap) | Sign in as Receptionist or Staff; look for Account / Delete my account in sidebar, More, avatar menu | Reachable from a menu (store rule for account deletion) | Only via the Settings hub, which is hidden for them; typed URL `/settings/account` works | Known gap — confirmed 2026-11-03 |
| KG-04 | F21-02, F21-05 | P1 (Known gap) | As Manager, REST update `notification_settings.sms_enabled = true`; call widget RPCs / `validate_widget` | OFF-at-launch features are blocked on the server too | Only hidden in the UI (`launch.ts`); server accepts SMS setting and widget calls. Today blocked only by missing Twilio secrets and `frame-ancestors 'self'` | Known gap — confirmed 2026-11-03 |
| KG-05 | F16-06 | P2 (Known gap) — needs founder decision | Solo business → Team → add a Manager by email | Doc §10: Solo = Owner only | Accepted (`default_roles` flag not enforced). Decide: enforce it, or remove it from the pricing table | Known gap — decision pending |
| KG-06 | F02-05, F04-12 | P2 (Known gap) | Schedule → Rooms; Services form | Link a service to a room and set room capacity (doc §6.2) | No UI for `service_resources` or capacity (SQL only) | Known gap — confirmed 2026-11-03 |
| KG-07 | F08-12 | P2 (Known gap) | Advanced reports with Packages add-on on | Packages section "when on" (doc §8.3) | Not built | Known gap — confirmed 2026-11-03 |
| KG-08 | F06-11 | P2 (Known gap) | Clients list → look for export | Client list export (`clients.export`, doc §9) | Only per-client GDPR JSON export | Known gap — confirmed 2026-11-03 |
| KG-09 | F17-11 | P2 (Known gap) | Super admin saves an industry preset; new owner signs up with that industry | Preset applies starter fields, terminology, template (doc §3) | Only the industry key is stored; presets never applied | Known gap — confirmed 2026-11-03 |
| KG-10 | F17-01..03 | DECISION | Super admin signs in | Doc §5/§13: mandatory 2FA | Password-only + 12-hour rule (`20261026130000`, founder decision 2026-10-23). Product doc still says 2FA | Decision recorded — doc to be updated |
