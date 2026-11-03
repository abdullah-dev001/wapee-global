# Claude checks (C-Sxx-yy)

Run by Claude when the tester says **"run C-S05-03"** or **"run all checks for S05"**. Reply: **pass / fail + one line**, then record it in `results.md`.
DEV only (`rfuovquhultjydtswtqf`). Never production.

## How to run
- **SQL** = Supabase MCP `execute_sql` on DEV. **Read-only** unless the check says **WRITE**.
- **AS** = `node --env-file=.env.remote-backup scripts/e2e/as-user.mjs <user> <rpc|select|update|delete|fn> …` — signs in as a fixture user
  (passwords from `~/.wapee-e2e/e2e-secrets.json`), prints `{data, error}`. `anon` = no sign-in. Negative REST writes are expected to be refused.
- **SUITE nn** = `python3 supabase/tests/run_pgtap.py supabase/tests/nn_*.sql`. It writes `/tmp/pgtap_run.sql` (whole suite in one
  transaction ending in `rollback`); if the CLI is not linked, run that file through `execute_sql`. Pass = `failed: 0`.
- **WRITE (ask first)** = changes DEV data or spends a rate-limit budget. Say what it writes, wait for "yes".
- Manage / review / signing tokens: read from the tester's private `~/.wapee-e2e/links.md`. Never print a token, password or key.
- Short names: `B(slug)` = `(select id from businesses where slug = '<slug>')`; `BR(slug,name)` = branch id by business slug + branch name.
- An "unchanged" check compares the row to a snapshot taken before the action (CLAUDE.md §5): take it when the tester starts the step, or compare `updated_at` + values.

```sql
-- helper used by many checks: last appointment of a client in a business
-- select a.* from appointments a join clients c on c.id = a.client_id
--  where a.business_id = B('<slug>') and c.full_name = '<name>' order by a.created_at desc limit 1;
```

---

## S01 — sign-up and onboarding
**C-S01-01** · F01-04 · SQL — no account for the address typed in step 4 (ask the tester which).
`select count(*) from auth.users where email = '<address>';` Pass: 0.

**C-S01-02** · F01-08 · AS — `AS m01 rpc is_slug_available '{"p_slug":"<s>"}'` for `today`, `admin`, `e2e-other`, `Bad Slug!`, `a`. Pass: all false.
(m01 is not in the secrets file: use `AS team-owner`.)

**C-S01-03** · F01-10 · SQL
```sql
select b.slug, s.status, s.plan, round(extract(epoch from s.trial_ends_at - b.created_at)/86400,2) trial_days,
  br.name, br.invoice_prefix, br.currency, br.timezone,
  (select count(*) from booking_settings x where x.branch_id = br.id) settings,
  (select r.key from business_members m join member_role_assignments ra on ra.member_id = m.id join roles r on r.id = ra.role_id
    where m.business_id = b.id and m.user_id = b.created_by) owner_role,
  (select p.default_business_id = b.id from profiles p where p.id = b.created_by) default_ok
from businesses b join business_subscriptions s on s.business_id = b.id join branches br on br.business_id = b.id
where b.slug = 'm01-studio';
```
Pass: trialing, plan null, ~14.0 days, 1 branch with prefix, settings 1, owner, default_ok true.

**C-S01-04** · F01-11 · SQL (as the user) — `select count(*) from businesses where created_by = (select id from auth.users where email = 'wapeeglobal+m01@gmail.com');`
Pass: 1. (The RPC refusal itself: AS cannot sign in as m01; check `audit_logs`/count only, and note it.)

**C-S01-05** · F01-12/13 · SQL
```sql
select sp.display_name, sp.member_id is not null linked, m.user_id = b.created_by own_member,
  branch_is_bookable((select id from branches where business_id = b.id and is_primary)) bookable
from businesses b join staff_profiles sp on sp.business_id = b.id left join business_members m on m.id = sp.member_id
where b.slug = 'm01-studio';
```
Pass: linked true, own_member true, `{"bookable": true, "reasons": []}`.

## S02 — business setup
**C-S02-01** · F02-01 · SQL — `select day_of_week, start_minute, end_minute from branch_hours where branch_id = BR('e2e-team','New York') order by 1;` Pass: 6 rows 540–1080, no Sunday.

**C-S02-02** · F02-02 · SQL — appointments of clients `S02 Fri A`, `S02 Fri B`: `starts_at`, `ends_at`, `status`, `staff_id`, `updated_at` equal to the values before the hours change (`updated_at` < the save time). Pass: unchanged.

**C-S02-03** · F02-07 · SQL — `select s.duration_minutes, sb.price_minor, br.currency from services s join service_branches sb on sb.service_id = s.id join branches br on br.id = sb.branch_id where s.name = 'S02 Blow-dry' and s.business_id = B('e2e-team');` Pass: 45, 2500, USD.

**C-S02-04** · F02-12 · SQL — `select * from get_free_slots(BR('e2e-multi','LDN'), <Haircut LDN id>, <Zoe id>, '<weekday>', '<weekday>', true, false);` Pass: no start in 12:31–13:29 London that overlaps 13:00–13:30.

**C-S02-05** · F02-13 · SQL — `select sp.display_name, t.starts_at, t.ends_at, t.is_all_day from staff_time_off t join staff_profiles sp on sp.id = t.staff_id where t.reason = 'S02 off';`
Pass: Lena = D2 00:00 London → D2+1 00:00 London; Nora = D2 00:00 New York → D2+1 00:00 New York (UTC differs by 5 h). If the UI showed a 2-day range for Lena in NYC, confirm **B-008** as display-only.

**C-S02-06** · F02-15 · SQL — `select is_active, deleted_at, updated_at from staff_profiles where id = '<Sam id>';` Pass: active, not deleted, `updated_at` not changed by the attempt.

**C-S02-07** · F02-16 · SQL — `select br.name, bs.minimum_notice_minutes, bs.booking_window_days from booking_settings bs join branches br on br.id = bs.branch_id where br.business_id = B('e2e-multi');` Pass: LDN 60/180, NYC 60/180, TYO 60/180.

**C-S02-08** · F02-17 · AS — snapshot `booking_settings` for New York; `AS team-rec rpc save_booking_settings '{"p_branch_id":"<NY>","p_settings":{"minimum_notice_minutes":5}}'`. Pass: error (forbidden), row identical.

**C-S02-09** · F02-19 · SQL — `select version, created_at, jsonb_array_length(fields) from form_versions where business_id = B('e2e-solo') order by version;` + `select label, field_type, applies_to_all_services from custom_fields where business_id = B('e2e-solo');`
Pass: one new version per saved change; 5 fields with the right types; "S02 number" not for all services.

**C-S02-10** · F02-21 · SQL — `select max(version) from form_versions where business_id = B('e2e-multi');` before and after the no-op save. Pass: same.

## S03 — public booking basics
**C-S03-01** · F04-01 · SQL
```sql
select a.status, a.source, a.starts_at, c.full_name, c.email is not null has_email,
  (select string_agg(o.event||':'||o.channel||':'||o.status||':'||(o.sealed is not null), ', ') from message_outbox o where o.appointment_id = a.id) outbox
from appointments a join clients c on c.id = a.client_id where a.business_id = B('e2e-team') and c.full_name = 'Ada Real' order by a.created_at limit 1;
```
Pass: confirmed, online, `booking_confirmed:email` (sealed true until sent) and `staff_new_booking:push` rows.

**C-S03-02** · F09-01 · SQL — same appointment: `select status, provider, provider_id is not null from messages where appointment_id = '<id>' and event = 'booking_confirmed';` Pass: sent, resend, provider id present.

**C-S03-03** · F04-05 · SQL — appointment of `S03 Any`: staff name; then count per staff of non-cancelled appointments that New York day. Pass: assigned staff had the minimum count (not Sam).

**C-S03-04** · F04-06 · AS — `AS anon fn get_slots '{"slug":"e2e-team","service_id":"<Haircut>","from_date":"<today NY>","to_date":"<today NY>"}'` → first slot ≥ now+60 min; then `AS anon fn create_booking` at now+30 min (rounded to 15) with a start token. Pass: `slot_unavailable`; `select count(*)` of appointments at that time = 0.

**C-S03-05** · F04-07 · AS — `create_booking` on today+31 (NY). Pass: refused; nothing written. Also `get_slots` day 30 non-empty (if Mon–Sat).

**C-S03-06** · F04-08 · SQL — `get_free_slots(BR('e2e-team','New York'), <Haircut>, <Sam>, D4, D4, true, false)`. Pass: no start 11:31–13:44 New York (Colour 12:00–13:30 + 15, break 13:00–13:30).

**C-S03-07** · F04-10 · SQL — `get_free_slots` for Sam on next Saturday, 26 Nov and a time-off day. Pass: Saturday 10:00–16:30 only, none 12:31–13:29; 26 Nov none.

**C-S03-08** · F04-16 / F09-06 · SQL — appointment of `Ben Nomail` in e2e-team: client `phone_e164`, outbox events. Pass: `+447700900123`; no client-channel row (email/sms); `staff_new_booking` push present.

**C-S03-09** · F04-17 · SQL — `select phone_e164 from clients where business_id = B('e2e-team') and full_name = 'S03 UK';` Pass: `+447700900125`.

**C-S03-10** · F04-19 · SQL — `select id, full_name, updated_at from clients where business_id = B('e2e-team') and phone_e164 = '+12025550101';` + the D1 14:00 appointment's `client_id`. Pass: one client "Ada Real", appointment linked to it, name not changed.

**C-S03-11** · F04-23 · AS — `AS anon fn get_booking_page '{"slug":"<s>"}'` for `e2e-nope-xyz`, `rosario-clinic-19481`, `e2e-other` (while off), `m01-studio` (while not bookable). Pass: identical status and body (`not_bookable`).

## S04 — locations, approval, manage link, time
**C-S04-01** · F04-15 / F04-18 / F19-01 · SQL — Ada's LDN Colour: `status`, `starts_at` (UTC), `form_version_id`, answers (`appointment_field_values` label/value/is_sensitive), outbox events. Pass: pending; 10:00Z; answers with the version id, Allergies sensitive; `pending_received` email + `staff_pending_approval` push.

**C-S04-02** · F04-12 · SQL — `select r.name, r.capacity from service_resources sr join resources r on r.id = sr.resource_id where sr.service_id = <Colour multi>;` + `get_free_slots(LDN, Colour, Liam, D1, D1, true, false)`. Pass: only Room 1 (capacity 1); no 10:00 for Liam.

**C-S04-03** · F04-11 · SQL + AS — count appointments NYC Nora D1 17:00 not cancelled = 3; then **WRITE (ask first, uses 1 booking)**: `create_booking` 4th. Pass: 3 rows; 4th `slot_unavailable`; still 3.

**C-S04-04** · F09-04 · SQL — outbox rows of the "Ada D1" appointment ordered by created_at. Pass: `rescheduled` email; old `reminder` status cancelled (code rescheduled); a new `reminder` due 24 h before the new time.

**C-S04-05** · F04-25 · SQL — same appointment: `status`, `cancelled_by_guest`, outbox. Pass: cancelled, true, `cancelled` email, reminder superseded.

**C-S04-06** · F04-26 · AS — token "Soon": `AS anon fn manage_booking '{"action":"cancel","token":"<t>"}'`. Pass: `cancel_window_passed`; appointment unchanged.

**C-S04-07** · F04-29 · AS — token of S04 NoCancel (while the setting was off — if already back on, ask the tester to switch it off for a minute). Pass: `not_cancellable`.

**C-S04-08** · F04-22 · SQL — appointments Lee D2 15:00 not cancelled = 1; `select count(*) from clients where full_name in ('S04 Race A','S04 Race B')` = 1. Pass: both 1.

**C-S04-09** · F19-02 · SQL — `get_free_slots(NYC, Haircut, Nora, '2027-03-15', '2027-03-15', true, false)` first slot = `2027-03-15 13:00Z`. Plus `npm test -- slot` (DST unit cases) green. Pass: both.

**C-S04-10** · F19-03 / F19-04 · SQL — Cara Fake LDN 2027-03-29: `starts_at` = `2027-03-29 09:00Z`; reminder `deliver_after` = `2027-03-28 09:00Z` (or computed by `enqueue_due_reminders_at` logic if not queued yet: check suite 17's DST block). Pass: both.

**C-S04-11** · F04-20 · AS **WRITE (ask first: spends booking attempts)** — `create_booking` with honeypot filled; without `start_token`; with a forged token; with a token issued 0 s ago. Pass: all refused generically (`too_fast` only for the instant one); nothing written.

**C-S04-12** · F04-21 · AS **WRITE (ask first: spends the whole hourly IP budget)** — 11 `create_booking` calls (distinct phones, free slots) from this machine. Pass: 11th `429`/`rate_limited`; `public_request_attempts` rows for all 11 kept. Clean-up: cancel the 10 test bookings as team-owner.

**C-S04-13** · F19-07 · **WRITE (ask first)** — SUITE 09 (`09_booking_concurrency.sql`, rolled back). Pass: exactly 1 winner.

**C-S04-14** · F19-08 · **WRITE (ask first)** — SUITE 49 (rolled back). Pass: 1 row, no orphan client.

**C-S04-15** · F19-06 · SQL — `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'appointments'::regclass and contype = 'x';` Pass: staff + time and resource + time EXCLUDE constraints (Round 0 passed; re-run).

## S05 — calendar
**C-S05-01** · F05-01 · SQL — appointments per staff for the week shown (New York dates), by status. Pass: equal to the screen.

**C-S05-02** · F05-02 / F09-08 · SQL — Ada D2 10:00 (source dashboard): outbox. Pass: `booking_confirmed` email (payload has no manage link: `payload->>'manage_url' is null`), staff push.

**C-S05-03** · F05-04 · SQL — `select count(*) from clients where full_name = 'S05 Orphan';` Pass: 0.

**C-S05-04** · F05-05 / F09-07 · SQL — Ada's walk-in: `source = 'walk_in'`, `select count(*) from message_outbox where appointment_id = <id>`. Pass: walk_in, 0.

**C-S05-05** · F05-07 · SQL — outbox for that appointment after both reschedules. Pass: exactly one new `rescheduled` (time change); none for the staff-only change.

**C-S05-06** · F05-08 · AS — `AS team-stf1 rpc update_appointment '{"p_appointment_id":"<Sam appt>","p_staff_id":"<Lee>"}'`. Pass: refused; row unchanged.

**C-S05-07** · F05-09 / F09-05 · SQL + AS — outbox (cancelled email, staff_cancelled push, reminder superseded); then `AS team-rec rpc approve_appointment` and `update_appointment` on it. Pass: all later changes refused.

**C-S05-08** · F05-11 · SQL — `select count(*) from review_requests where appointment_id = <Cara>;` + outbox `review_request`. Pass: 1 and 1.

**C-S05-09** · F05-14 / F10-01 · SQL — audit `appointment.reopened` by team-mgr; review_requests still 1; outbox `review_request` still 1. Pass.

**C-S05-10** · F05-12 · SQL — Ada LDN Colour: confirmed; `booking_confirmed` row after approval. Pass.

**C-S05-11** · F05-13 · AS — `AS biz-stf-nyc rpc approve_appointment` and `cancel_appointment` on a Nora appointment. Pass: refused; unchanged.

**C-S05-12** · F05-18 · AS — `AS team-stf1 rpc list_appointments '{"p_business_id":"<team>","p_limit":100}'` and `get_calendar_appointments` for the week. Pass: every row has Sam's staff id.

## S06 — clients
**C-S06-01** · F06-04 · AS + SUITE 28 — `AS team-stf1 select clients id,phone_e164`, `AS team-stf1 select clients_v id,phone_e164,email`, search by phone via `list_clients`. Pass: column refused; view NULLs; 0 matches; suite 28 green.

**C-S06-02** · F06-05 · SUITE 43. Pass: green.

**C-S06-03** · F06-08 · AS + SQL — `AS team-rec rpc gdpr_export_client '{"p_client_id":"<Ada team>"}'` refused; `select action from audit_logs where action = 'client.exported' order by created_at desc limit 1`. Pass.

**C-S06-04** · F06-09 · SQL — S03 UK unchanged (`erased_at` null, name kept); E2E Past Haircut `erased_at` set, name/phone/email blank, its appointment present. Pass.

**C-S06-05** · F06-10 · AS — `AS oth-owner select clients id '{"id":"<S02 Fri B>"}'`. Pass: `[]`.

## S07 — money
**C-S07-01** · F07-01 · SQL — draft for Cara: `invoice_items.unit_price_minor = 2500`, `appointments.invoice_id = <draft>`. Pass.

**C-S07-02** · F07-03 · AS — `AS team-rec rpc update_invoice_draft` with a discount on a line. Pass: refused; items identical.

**C-S07-03** · F07-05/06 · SQL — `select number, number_seq, status from invoices where branch_id = BR('e2e-team','New York') order by number_seq;` Pass: 1, 2 consecutive; discarded drafts without a number.

**C-S07-04** · F07-07 · **WRITE (ask first)** — SUITE 15 (`15_invoice_concurrency.sh`). Pass: consecutive, no duplicate, no gap.

**C-S07-05** · F07-04 · SQL — TEA-000001: `tax_rate_bp, tax_number, net_minor, tax_minor, total_minor` = 888, E2E-TEA-TAX, 4750, 422, 5172; branch `tax_rate_bp` 888 again. Pass.

**C-S07-06** · F07-10 · SQL — credit notes of TEA-000001: (1000, 89, 1089) and (3750, 333, 4083), sum total 5172; payments: reversal row `reverses_payment_id` set. Pass.

**C-S07-07** · F07-11 · AS — as team-owner: `update invoices {notes}`, `delete invoice_items`, `update invoice_payments {amount_minor}`, `delete credit_notes` on TEA-000001. Pass: all error / 0 rows; rows byte-identical (`to_jsonb` before = after).

**C-S07-08** · F07-16 · SQL — `select action, count(*) from audit_logs where business_id = B('e2e-team') and action in ('invoice.issued','invoice.payment_added','invoice.payment_reversed','invoice.credit_note_created','invoice.draft_discarded') group by 1;` (exact action names may differ: list `action like 'invoice.%'`). Pass: each present.

**C-S07-09** · F07-14 / F19-09 · SQL — LDN/NYC/TYO first invoices: `currency, net_minor, tax_minor, total_minor`; column types `bigint`. Pass: GBP 2500/500/3000, USD 2500/222/2722, JPY 3000/300/3300.

**C-S07-10** · F06-09 · SQL — LDN-000001: amounts unchanged, `bill_to_name` blank/NULL, client `erased_at` set. Pass.

## S08 — team
**C-S08-01** · F03-01 · SQL — m02's member row `status active`, role manager @ New York; audit `member.joined_by_email`. Pass.

**C-S08-02** · F03-02 · SQL — outbox `member_added` for m03: payload link ends `/login`, no token field; `select count(*) from businesses where created_by = <m03>` = 0. Pass.

**C-S08-03** · F03-04 · SQL — m05: one `business_members` row, role receptionist, `invite_expires_at` ≈ now+30 d after resend, then deleted/revoked; audit `invite.revoked`. Pass.

**C-S08-04** · F03-05 · **WRITE (ask first)** — `update business_members set invite_expires_at = now() - interval '1 minute' where invited_email = 'wapeeglobal+m06@gmail.com'` on a fresh pending add made for this check; then the person signs in. Pass: not joined; UI "Expired".

**C-S08-05** · F03-06 · **WRITE (ask first: 31 adds)** — 31 × `add_member_by_email` as team-owner with throwaway addresses, then cancel them. Pass: 31st `rate_limited`; counter rows kept.

**C-S08-06** · F03-07 · AS — `AS biz-mgr-ldn rpc add_member_by_email` with the Owner role, then Manager @ NYC. Pass: `cannot_grant`; no row.

**C-S08-07** · F03-08 · AS — same as team-rec and team-stf1. Pass: `forbidden`; no row.

**C-S08-08** · F03-11 · AS — `AS team-rec rpc create_credit_note '{"p_invoice_id":"<TEA-000002>","p_reason":"x","p_net_minor":100}'`. Pass: refused; no credit note.

**C-S08-09** · F03-13 · SQL — audit `role.assignment_changed` for m03. Pass.

**C-S08-10** · F03-15 · AS + SUITE 41 — `AS team-owner update member_role_assignments '{"member_id":"<own>"}' '{"role_id":"<receptionist>"}'`. Pass: refused; one active Owner; suite green.

## S09 — custom roles
**C-S09-01** · F14-01 · AS — `AS team-owner rpc create_custom_role '{"p_business_id":"<team>","p_name":"x","p_permissions":[],"p_clone_from":null}'` (before the add-on). Pass: `feature_unavailable`.

**C-S09-02** · F14-05 · AS — `AS biz-owner delete role_permissions '{"role_id":"<system manager role>"}'` and an insert. Pass: refused; count unchanged.

**C-S09-03** · F14-04 · SUITE 02 (escalation part) — rolled back. Pass: green.

**C-S09-04** · F14-06 · AS — `AS biz-custom rpc list_appointments` for e2e-multi. Pass: only LDN branch ids.

**C-S09-05** · F14-08 · SQL — `select action, before is not null, after is not null from audit_logs where business_id = B('e2e-multi') and action like 'role.%' order by created_at desc limit 20;` Pass: created/updated/deleted/assigned/unassigned present.

**C-S09-06** · F14-10 · SUITE 41. Pass: green.

## S10 — locations
**C-S10-01** · F12-02 · AS — `AS team-owner rpc create_branch` with valid values. Pass: refused; branch count 1.

**C-S10-02** · F19-10 · SQL — S10 Nepal `starts_at` = `<date> 04:15Z`. Pass.

**C-S10-03** · F12-06 · SQL — London 2 `deleted_at`/archived set; then (as m01) `create_branch` with prefix `LO2` refused. Pass.

**C-S10-04** · F19-05 · SQL — S10 Late TYO = `<day> 14:30Z`, S10 Early TYO = `<day> 15:30Z` (next Tokyo day); a whole-day TYO time off = 15:00Z → 15:00Z. Pass.

**C-S10-05** · F12-09 · SUITE 21 + AS — `AS biz-mgr-ldn select appointments id,branch_id '{"branch_id":"<NYC>"}'`, same for invoices, staff_branches, service_branches, booking_settings; an update on NYC booking settings. Pass: 0 rows; suite green.

## S11 — reports and commission
**C-S11-01** · F13-02 · SQL — `select staff_id, kind, amount_minor from commission_entries where invoice_id = <Comm A invoice>;` Pass: Sam, earned, 1000.

**C-S11-02** · F13-04 · SQL — Comm A entries sum = 0 (1000, −500, −500). Pass.

**C-S11-03** · F13-05 · AS — `AS team-stf1 rpc get_commission_report` with `p_staff_id` = Lee. Pass: empty / refused.

**C-S11-04** · F13-07 · AS + SQL — `AS solo-owner rpc set_commission_rule …` → `feature_unavailable`; Solo paid invoices have no `earned` entries. Pass.

**C-S11-05** · F13-08 · **WRITE (ask first)** — SUITE 20 (`20_commission_concurrency.sh`). Pass: one set of entries.

**C-S11-06** · F08-01 · AS + SQL — `AS team-owner rpc get_basic_report` vs SQL sums of issued invoices / payments / credit notes in New York today and this month. Pass: equal.

**C-S11-07** · F08-05 · AS + SQL — `get_advanced_report` sections revenue/staff/services/clients/appointments for this month vs SQL. Pass: equal.

**C-S11-08** · F08-06 · AS — `AS team-owner rpc get_advanced_report '{… "p_section":"branches" …}'`. Pass: `feature_unavailable`.

**C-S11-09** · F08-09 · SQL (Monday after the send hour) — `select event, status, payload is null or payload = '{}'::jsonb emptied from message_outbox where event = 'report_summary' and business_id = B('e2e-team') order by created_at desc;` Pass: one row per eligible person; payload emptied after finish.

**C-S11-10** · F08-10 · AS — `AS solo-owner rpc get_advanced_report …`. Pass: `feature_unavailable`.

**C-S11-11** · F08-11 · AS — `AS biz-owner rpc get_advanced_report` period week, anchors 2027-03-24 and 2027-03-31, branch LDN; compare period bounds. Pass: Mon 00:00 London → next Mon 00:00 London (UTC 00:00 then 23:00), Cara's 29 Mar booking counted once.

## S12 — messages and reviews
**C-S12-01** · F09-03 · SQL — reminder for Ada tomorrow 15:00: `deliver_after` = tomorrow 15:00 NY − 24 h on the wall clock; `staff_reminder` row. (If not yet queued: it is queued by the 5-min cron within the window — re-check after it is due.) Pass.

**C-S12-02** · F09-03 · SQL — that row `sent`, `sent_at - deliver_after` < 6 min. Pass.

**C-S12-03** · F09-09 · SQL + AS — `message_suppressions` for Ada's hash (none before, `reminder`+`review_request` after); forged `AS anon fn unsubscribe '{"t":"forged"}'` → same answer, no new row. Pass.

**C-S12-04** · F09-11 · SQL — new outbox row for the retry with a different `idempotency_key`/`idem_suffix`; rows with `last_error like 'ambiguous%'` have no retry. Pass.

**C-S12-05** · F09-12 · SQL — grep `messages`, `audit_logs`, `message_outbox.payload` for `@`, `token`, `http` substrings; `select count(*) from message_outbox where status in ('sent','dead') and sealed is not null and finished_at < now() - interval '48 hours'`. Pass: no raw address / token; 0.

**C-S12-06** · F09-06 · SQL — outbox for Ben Nomail's appointments: no `email`/`sms` channel rows. Pass.

**C-S12-07** · F09-15 / F09-13 · SQL — `staff_new_booking` rows for team-rec's user id for S12 Push (yes) and S12 Push 2 (no); `push_tokens` for team-rec after sign-out = 0. Pass.

**C-S12-08** · F09-16 · SUITE 17 (caps part). Pass: green.

**C-S12-09** · F09-17 · SQL — `select jobname, status, count(*) from cron.job_run_details d join cron.job j using (jobid) where start_time > now() - interval '24 hours' group by 1,2;` + dead outbox count trend. Pass: all succeeded; dead not growing.

**C-S12-10** · F10-02 · SQL — `select rating, reviewer_first_name, staff_id, comment from reviews where business_id = B('e2e-team') order by created_at desc limit 2;` Pass: 2 and 5, first names only, Lee / Sam.

**C-S12-11** · F10-03 · **WRITE (ask first)** — on a fresh review request: `update review_requests set expires_at = now() - interval '1 minute'`; open its link. Pass: generic page.

**C-S12-12** · F10-04 · AS + SQL — `AS team-rec rpc reply_to_review` → refused; audit `review.replied` for the owner's reply. Pass.

**C-S12-13** · F10-05 · SUITE 16 (featured cap). Pass: green.

**C-S12-14** · F10-06 · AS — `AS team-owner update reviews '{"id":"<r>"}' '{"comment":"x","rating":5}'`. Pass: refused; unchanged.

**C-S12-15** · F10-09 · SQL + AS — audit `review.removed` with the reason; `AS team-owner select audit_logs action,after '{"action":"review.removed"}'` returns it. Pass.

## S13 — website
**C-S13-01** · F11-02 · AS — `AS team-owner rpc save_website_section '{"p_business_id":"<team>","p_section_type":"nope","p_is_visible":true,"p_content":{}}'`. Pass: `invalid_content` / unknown section.

**C-S13-02** · F11-07 · HTTP — headless Chromium on `http://localhost:8090/e2e-team`: read `<title>`, meta description, `og:*`, parse JSON-LD; HEAD `/e2e-team` has no `X-Robots-Tag`, `/e2e-team/book` has noindex. Pass.

**C-S13-03** · F11-05 · AS — `AS team-mgr rpc set_website_published '{"p_business_id":"<team>","p_published":false}'`. Pass: refused; `websites.is_published` unchanged.

**C-S13-04** · F11-11 · AS — storage upload as oth-owner to `website-assets/<team id>/x.jpg` (small script with supabase-js `storage.from('website-assets').upload`). Pass: refused.

## S14 — packages and inventory
**C-S14-01** · F15-01 · AS — as team-owner one RPC per add-on (`deduct_session`, products select, `list_client_files`, forms select, `list_data_requests`); `AS anon fn portal '{"action":"request_login","slug":"e2e-team","email":"wapeeglobal@gmail.com"}'`. Pass: `feature_unavailable` / generic; no `portal_login` row.

**C-S14-02** · F15-02 · SQL — `to_jsonb(packages)` for "S14 Team pack" before / after the off-on cycle. Pass: identical.

**C-S14-03** · F15-03 · SQL — `client_packages` for Ada (e2e-multi): `sessions_purchased 5, sessions_bonus 1, price_minor 10000, currency GBP, expires_at` = London midnight after sold date + 30. Pass.

**C-S14-04** · F15-04 · SQL + SUITE 22 — `session_usages` for Ada's package; suite 22 (expiry, balance, other client). Pass.

**C-S14-05** · F15-05 · SUITE 22 (undo window part). Pass.

**C-S14-06** · F15-08 · SQL — `products.stock_qty` = 1; second draft still `draft`, no `stock_movements` for it. Pass.

**C-S14-07** · F15-10 · SQL — outbox `low_stock` email + `staff_low_stock` push for S14 Shampoo: exactly one each. Pass.

**C-S14-08** · F15-10 · SQL — still one each after stock 1 → −1. Pass.

**C-S14-09** · F15-12 · AS — `AS biz-stf-nyc select products id`. Pass: `[]` or refused.

## S15 — files, forms, portal
**C-S15-01** · F15-13 · SQL — `files` for Ben (status ready, kinds photo/pdf); `client_consents` row; audit consent change. Pass.

**C-S15-02** · F15-14 · SQL — no `files` rows with status ready for fake-exe / heic / 11 MB; `storage.objects` has no matching names. Pass.

**C-S15-03** · F15-15 · AS — anon GET of the object path, list the bucket, `getPublicUrl` fetch → all refused; `AS biz-owner fn client_files '{"action":"signed_url",…}'` → fetch works; fetch again after 5 min → refused. Pass.

**C-S15-04** · F15-17 · SQL + AS — `signed_consents` row (signature non-empty, signed_via link); `AS biz-owner update signed_consents …` refused. Pass.

**C-S15-05** · F15-18 · **WRITE (ask first)** — SUITE 24 (single-use part) or two parallel `sign_form` submits on a fresh link. Pass: one signed copy.

**C-S15-06** · F15-20 · AS + SQL — `AS anon fn portal request_login` for e2e-team → `{sent:true}`; `portal_login_tokens` / outbox rows for it = 0. Pass.

**C-S15-07** · F15-21 · SQL — outbox `portal_login` rows in the last hour: one for Ada's address hash, none for `nobody.e2e@…`. Pass.

**C-S15-08** · F18-12 · SQL + SUITE 29 — `data_requests` statuses done/declined, `requester_email` null after resolve; audit `data_request.done`/`declined`; suite 29 (erase) green. Pass.

**C-S15-09** · F15-25 · AS — `AS biz-owner fn portal '{"action":"bookings","session":"<dashboard JWT>"}'` refused; portal session token as REST bearer refused. Pass.

**C-S15-10** · F15-26 · SQL — `portal_login` sends for Ada in the hour = 3; 4th attempt counted in `public_request_attempts`. Pass.

## S16 — plans and super admin
**C-S16-01** · F17-01 · SQL — audit `admin.signed_in` and `admin_signin_alerts` row for sa in the last 10 min. Pass.

**C-S16-02** · F17-02/03 · UT + SUITE 18 — `npm test -- adminLogic` and suite 18. Pass: green.

**C-S16-03** · F17-04 · AS — `AS team-owner rpc list_businesses '{"p_limit":5}'`. Pass: `forbidden`.

**C-S16-04** · F17-06 · SQL — active staff, branches, appointments this month (UTC), issued invoices for e2e-team. Pass: equal to the screen.

**C-S16-05** · F17-09 · SQL — audit `admin.support_viewed` (2 rows for 2 presses) for e2e-team; readable by team-owner (`AS team-owner select audit_logs …`). Pass.

**C-S16-06** · F17-07 · SQL — audit rows for m01-studio plan/status/trial/add-on; `select count(*) … where before::text ilike '%S16 note%' or after::text ilike '%S16 note%'` = 0. Pass.

**C-S16-07** · F17-08 · SQL — `select price… from plans where key = 'team'` back to 3900 monthly. Pass.

**C-S16-08** · F17-12 · SQL — audit rows for SMS credits and the rate. Pass.

**C-S16-09** · F16-01 · SQL — `select count(*) from staff_profiles where business_id = B('e2e-solo') and deleted_at is null;` Pass: 1.

**C-S16-10** · F16-04/05 · AS — Solo: `set_commission_rule`, `get_advanced_report`, `create_branch`, `create_custom_role`; Team: `create_branch`, `create_custom_role` (add-on off), report section branches. Pass: all refused.

**C-S16-11** · F16-07 · **WRITE (ask first)** — `update business_subscriptions set trial_ends_at = now() - interval '1 minute' where business_id = B('e2e-onboard');` (before: snapshot the row).

**C-S16-12** · F16-07 · SQL + AS — row counts (clients, services, staff) same as before; `AS onb01 rpc create_appointment …` refused. Pass.

**C-S16-13** · F16-09 · SQL — Auth hook config: `select * from pg_proc where proname like '%auth_hook%'` exists; whether it is switched on is a dashboard setting → ask the founder / Management API. Pass: enabled.

## S17 — security and account
**C-S17-01** · F18-13 · SQL — `select count(*) from businesses where slug = 'm01-studio'` = 0; `erasure_log` newest row counts only (no names); `storage.objects` under its id = 0; SUITE 29 business-erase part (Manager refused). Pass.

**C-S17-02** · F22-01 · SQL — audit `account.password_changed` for m04. Pass.

**C-S17-03** · F22-02 · SQL — `profiles.email` for m04 = `wapeeglobal+m04b@gmail.com`. Pass.

**C-S17-04** · F18-14 / F22-04 · SQL — auth users m02 / m04 gone; `staff_profiles` Kim `member_id` null; their appointments present. Pass.

**C-S17-05** · F18-01 · SUITE 01 + AS — as oth-owner `select` every public table with `business_id = <team>` and call `get_calendar_appointments`, `gdpr_export_client`, `list_reviews`, `my_features` with team ids. Pass: 0 rows / refused.

**C-S17-06** · F18-02 · AS — as oth-owner `update`/`delete` on team appointments, clients, invoices, services. Pass: 0 rows; snapshot equal.

**C-S17-07** · F18-03 · SUITE 01, 02, 07, 21, 28, 31, 41, 43. Pass: all green.

**C-S17-08** · F18-04 · SQL — anon EXECUTE list and anon table grants (Round 0 query). Pass: only `get_public_pricing`; only `reserved_slugs`.

**C-S17-09** · F18-05 · AS — `AS anon fn get_booking_page/get_slots/get_website` for e2e-team and `manage_booking get` with a links.md token; scan keys. Pass: no client data, no emails, no phone except the business's.

**C-S17-10** · F18-06 · **WRITE (ask first, one endpoint per run)** — exceed one `rate_limit_rules` row (e.g. `get_website` 60/min). Pass: 429; counter rows kept.

**C-S17-11** · F18-07 · AS — token of appointment A used with `manage_booking cancel` cannot target B (no id parameter exists; try a token from another business with this slug); `select count(*) from booking_manage_tokens where token_hash ~ '^[0-9a-f]{64}$'` = all rows. Pass.

**C-S17-12** · F18-08 · grep `~/.wapee-e2e/web-dist` for `service_role`, `sb_secret_`, `sk_`, `RESEND`, `TWILIO`, `VAPID_PRIVATE`, `-----BEGIN`; decode every JWT. Pass: only the anon key.

**C-S17-13** · F18-09 · HTTP — `curl -sI http://localhost:8090/<path>` for `/today`, `/settings`, `/e2e-team/book`, `/e2e-team`. Pass: noindex on app routes and `/book`; `frame-ancestors 'self'` on `/book`, `'none'` elsewhere. (Mirrors `vercel.json`; re-check on the Vercel preview.)

**C-S17-14** · F18-11 · AS — `select audit_logs` as team-owner (own business only), team-mgr (per scope), oth-owner for team ids (0). Pass.

**C-S17-15** · F18-15 · AS — `AS team-owner update profiles '{"id":"<own>"}' '{"is_super_admin":true}'`. Pass: refused; still false.

## S18 — platform
**C-S18-01** · F20-06 · build — `npm run build:web` with the DEV env (same command as the first build), copy `dist` to `~/.wapee-e2e/web-dist` while the server runs. Pass: tester sees "Update available".

**C-S18-02** · F20-10 · `npm run lint`, `npm test`, grep `app/` + `src/` for JSX text literals; headless scan of main screens for `\b[a-z]+\.[a-zA-Z]+\.[a-zA-Z]+\b` raw keys. Pass: none.

**C-S18-03** · F20-15 · written review of native-only code paths (`Platform.OS` branches, push, file pickers). Result is "reviewed in code, not run".

**C-S18-04** · F21-02 · **WRITE (ask first; reverted)** — `AS biz-mgr-ldn update notification_settings '{"branch_id":"<LDN>"}' '{"sms_enabled":true}'`; then dashboard booking for Ben Nomail at LDN; outbox SMS row skipped / not claimed, no credit debit; set `sms_enabled` false again. Pass: no SMS sent; record that the API accepted it (KG-04).

**C-S18-05** · F21-04 · serve `~/.wapee-e2e/frame-test.html` (an `<iframe src="http://localhost:8090/e2e-multi/book">` and a `<script src="http://localhost:8090/widget.js">` test) on port 8091; give the tester `http://localhost:8091/frame-test.html`. Pass: tester sees the frame refused.

**C-S18-06** · F21-05 · AS **WRITE (ask first: may create a widget key)** — `AS biz-owner rpc ensure_widget_key '{"p_business_id":"<multi>"}'` and `AS anon fn validate_widget '{"action":"validate",…}'`. Record the answers (KG-04; decision needed).
