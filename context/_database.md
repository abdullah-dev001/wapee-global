# Database
Status: in progress · Phase: 6B · Last updated: 2026-10-09

## Project
- Supabase project **Wapee Global Development**, ref `rfuovquhultjydtswtqf`, Postgres 17, region ap-south-1.
- Applied through the **Supabase connector** (`apply_migration`). The local CLI is signed in to a different account and cannot link this project, so `supabase db push` and `supabase test db` are unavailable. Every migration file in `supabase/migrations/` matches what was applied.
- Extensions: `citext`, `pg_trgm`, `btree_gist` (ready for Phase 3 no-double-booking), `pgtap`, `uuid-ossp`, `pgcrypto`.

## Replay from an empty database (2026-10-11)
- The chain of 147 files now replays cleanly from empty and equals dev (21 of 22 fingerprint categories identical; the 22nd is the hand-set vault entry `outbox_worker_url`). Prove it with `npm run check:migrations`; compare two projects with `scripts/schema-fingerprint.sql`. Details and the production procedure: `docs/production-setup.md`.
- Fixed in place (dev's history already records these versions, nothing re-runs there): rate-limit rule for `get_booking_page` (seeded in `20261004090000`, guarded in `20261003223121`); `check_appointment_collision_v2` created in `20261004045723` (the text-returning v1 stays, deprecated); `create_appointment` / `update_appointment` final versions (store `resource_id`) in `20261004045754` / `20261004045817`; six comments in `20261004152214`.
- **Rule going forward:** never apply SQL to a database by hand (execute_sql / dashboard) without the same SQL in a migration file in the same task; a placeholder "no-op" migration that claims a fix is folded elsewhere hides this. Run `npm run check:migrations` before every production push.
- A local Supabase image lacks the hosted default privileges for objects `postgres` creates in `public`; the script adds them. Suites 19 and 34 assume rows from other businesses and fail on an empty database.

## Tables (38)

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | id→auth.users, email, full_name, **is_super_admin**, default_business_id, locale | 1:1 with auth.users via trigger. `is_super_admin` set **only by hand in SQL**. |
| `businesses` | name, **slug** (citext unique), industry, language, **plan**, **status**, **trial_ends_at**, **current_period_end** (mirrored, 2026-10-14), plan_activated_at, `default_country_code`, `default_currency`, `default_timezone` (all nullable) | Tenant root. The `default_*` columns are **PRE-FILL ONLY** for a new branch — never read them for tax, SMS rates, slots or reporting. |
| `branches` | business_id, name, is_primary, **country_code**, **currency**, **timezone** (all NOT NULL), address, phone, **tax_number**, **tax_rate_bp**, **invoice_prefix**, **invoice_next_no**, **credit_note_next_no** | **Owns country, currency, timezone and tax** (decision 23). A business can have branches in different countries. `tax_rate_bp` = basis points (2000 = 20%). |
| `business_members` | business_id, user_id, status, invited_email, **invite_token_hash**, invite_expires_at, invited_by, joined_at | One user ↔ many businesses. Only the token *hash* is stored. |
| `roles` | business_id (**null = system role**), key, name, is_system | 4 system roles; custom roles (Phase 9) carry a business_id. |
| `role_permissions` | role_id, permission→permissions.key, **scope** | scope = own / branch / all. |
| `member_role_assignments` | member_id, role_id, **branch_id (null = all branches)** | The per-branch role. **branch_id is the whole multi-branch mechanism.** |
| `permissions` | key, area, min_plan, addon | 47-row catalogue (product doc §9 + `clients.erase`, Phase 11A). Read-only to the app. |
| `audit_logs` | business_id, actor_user_id, action, entity_type, entity_id, before/after jsonb | **Append-only**: no INSERT/UPDATE/DELETE policy exists. |
| `reserved_slugs` | slug | 112 rows, mirrors `src/config/reservedSlugs.ts`. Readable by anon so signup can check availability. |
| `invite_accept_attempts` | token_hash, attempts, first/last_attempt_at | Rate limit for `accept_invite()`. RLS on with **no policy**: only the SECURITY DEFINER function touches it. |
| **Phase 2 — catalogue** | | |
| `service_categories` | business_id, name, sort_order | Optional grouping; a service may have none. |
| `services` | business_id, category_id (nullable), name, **duration_minutes**, buffer_minutes, is_active | Duration per service; **no** per-staff duration or price (doc §6.3). |
| `service_branches` | service_id, branch_id, **price_minor**, enabled | **Price lives here**, per branch. Currency is read from `branches.currency`, never stored (decision 23, doc §8.2). |
| `resources` | business_id, branch_id, name, capacity | Rooms/chairs/bays. Consumed by the Phase 3 slot engine. |
| `service_resources` | service_id, resource_id | Which resource a service needs. |
| **Phase 2 — staff & schedule** | | |
| `staff_profiles` | business_id, **member_id (nullable)**, display_name, is_active | A staff member need not have a login (doc §10 counts staff, not seats). |
| `staff_branches` | staff_id, branch_id | Assignable before any hours exist. |
| `service_staff` | service_id, staff_id | Who performs what. |
| `staff_working_hours` | staff_id, branch_id, day_of_week, **start_minute/end_minute** | Weekday + local minutes, never timestamps, so DST cannot move a shift. |
| `staff_breaks` | same shape + label | Recurring gap inside the day. |
| `staff_time_off` | staff_id, branch_id (nullable), starts_at/ends_at | Real instants (UTC). **No approval workflow** (doc defines none). |
| `branch_hours` | branch_id, day_of_week, start_minute/end_minute | A weekday with no row is closed. |
| `branch_closures` | branch_id, starts_on/ends_on (date), name | Holidays. **Inclusive** date range. |
| **Phase 3 — booking settings & form** | | |
| `booking_settings` | business_id, **branch_id (unique)**, online_booking_enabled, staff_choice, slot_display, confirmation, show_prices, slot_interval, buffer_minutes, minimum_notice_minutes, booking_window_days, customer_can_cancel, cancel_cutoff_hours, use_resources, people_per_slot | **ONE ROW PER BRANCH**, created by an AFTER INSERT trigger on `branches`. Defaults are exactly doc §6.2. Editing needs `settings.booking`. |
| `custom_fields` | business_id, label, field_type, help_text, is_required, **is_sensitive**, applies_to_all_services, options text[], is_active, sort_order | Extra booking-form questions, per BUSINESS. Exactly 5 types. `is_sensitive` can only escalate. |
| `custom_field_services` | custom_field_id, service_id, business_id | Only read when `applies_to_all_services` is false. |
| `form_versions` | business_id, version, **fields jsonb**, fields_hash | **IMMUTABLE** snapshot of the whole field set. Created by a trigger when the set changes, NOT per booking. No write policy for anyone. |
| **Phase 3 — bookings** | | |
| `clients` | business_id, full_name, **phone_e164**, email, notes, first_branch_id, source | Belongs to the BUSINESS, not the branch. Unique `(business_id, phone_e164)` among live rows. |
| `appointments` | business_id, branch_id, client_id, service_id, staff_id, resource_id, **starts_at/ends_at**, duration_minutes, buffer_minutes, status, source, **form_version_id**, **is_exclusive**, price_minor, cancelled_at, **invoice_id** (Phase 5 seam, no FK yet) | UTC instants; slots computed in the branch timezone. duration/buffer/price are snapshots. **No DELETE policy** — soft delete or cancel. In the `supabase_realtime` publication (Phase 4). |
| `appointment_field_values` | business_id, appointment_id, custom_field_id, form_version_id, value, **is_sensitive** | One row per answer, so the sensitive gate can be per field. |
| `booking_manage_tokens` | business_id, appointment_id, **token_hash**, expires_at, revoked_at, last_used_at | Guest cancel/reschedule. Only the sha256 HASH is stored. One live token per appointment. |
| **Phase 3 — public endpoint protection** | | |
| `public_request_attempts` | endpoint, **ip_hash**, key_hash, outcome, created_at | Rate-limit ledger. `ip_hash` is sha256(salt‖ip) — **never a raw IP**. RLS on, **no policy**; only `check_rate_limit()` touches it. Rows >7 days old deleted nightly by pg_cron. |
| `rate_limit_rules` | **(endpoint, scope, window_seconds)**, max_attempts, note | THE one place the limits live, tunable without a deploy. scope = ip / key (hashed phone) / biz. Super admin may read. |
| **Phase 4 — dashboard appointments** | | |
| `appointment_status_transitions` | **(from_status, to_status)** | The ONE place every allowed status change is defined. No row with `cancelled`/`completed`/`no_show` as `from_status` — terminal, no reopen, ever. Readable by `authenticated` AND `anon` (reference data). |
| **Phase 5A — invoices** | | |
| `invoices` | business_id, branch_id, client_id?, appointment_id?, status (draft/issued), number, number_seq, currency, tax_rate_bp, tax_number, bill_to_name, subtotal/discount/net/tax/total_minor, issued_at/by | Draft editable, issued IMMUTABLE. Written only by RPCs. One live per appointment. Full detail: `context/invoices.md`. |
| `invoice_items` | invoice_id, service_id?, description, quantity, unit_price_minor, discount_minor + reason, generated `line_net_minor` | Price at sale time. Editable only while the invoice is a draft. |
| `invoice_payments` | invoice_id, kind (payment/reversal), method, amount_minor, currency, reverses_payment_id, reason | Append-only. A refund is a reversal row. |
| `credit_notes` | invoice_id, number (`<prefix>-CN-<n>`), net/tax/total_minor, reason | Append-only, own gapless series per branch. |

Enums: `business_status` (trialing/active/inactive/suspended), `business_plan` (solo/team/business), `member_status` (invited/active/disabled), `permission_scope` (own/branch/all).
Phase 5A adds: `invoice_status`, `invoice_payment_kind`, `invoice_payment_method`.
Phase 3 adds: `appointment_status` (pending/confirmed/completed/cancelled/no_show), `booking_source` (online/dashboard/walk_in/portal), `custom_field_type` (short_text/long_text/dropdown/yes_no/number), `staff_choice_mode`, `slot_display_mode`, `booking_confirmation_mode`, `slot_interval_mode`.

| **Phase 7A — website, reviews, widget** | | |
| `websites` / `website_sections` | business_id, branch_id, theme, is_published / 7 fixed section types, jsonb content | Writes via RPC only; SELECT for website.edit/publish. See `context/website-reviews-widget.md`. |
| `review_requests` / `reviews` | one per appointment, sha256 token hash / rating, comment, first name, owner reply, featured | Customer words immutable; `token_hash` not readable by authenticated. Staff see own via `staff_id`. |
| `widget_keys` | business_id, public_key, allowed_domains, is_active | One live key per business. |

`branches.google_review_url` added. Storage bucket `website-assets` (public by URL, no anon listing).

## Branch-owned settings (decisions 23–25)
A business can have branches in different countries, so the **branch** is the
source of truth for locale and money:

- **Timezone:** slot calculation, reminders and "today" use `branch.timezone`. There is no business timezone. `src/lib/time/` already takes an explicit zone on every function, so nothing assumes one per business.
- **Currency:** belongs to the branch. **Locked (hard, Phase 5A)** while the branch has any non-discarded invoice — `enforce_branch_currency_lock` raises 23514. The trigger also refuses ANY manual change to `invoice_next_no`/`credit_note_next_no` (only the invoice RPCs, via the transaction-local flag `wapee.numbering`).
- **Tax:** `tax_number` and `tax_rate_bp` are per branch, because tax is a property of the location.
- **Invoice numbering:** per branch, `prefix-000123`, gapless within the branch (decision 24, replaces the old per-business rule). `invoice_prefix` is required, unique within the business, and locked once numbering has started. `suggest_invoice_prefix()` derives one from the location name (first 3 letters, uppercased, suffixed if it collides).
- **Reports must never add different currencies** (decision 25). Group by currency and show separate totals ("£2,400 · Rs 180,000"). No conversion at launch: that needs dated exchange rates, and a wrong rate silently corrupts financial reports. Revisit with multi-branch in Phase 9.
- **SMS credits and rates depend on the BRANCH country**, not the business (§8.4, Appendix B). A message from a UK branch and one from a Pakistani branch cost different amounts. Note for Phase 6.

## Phase 2 representation choices
- **Recurring hours are `day_of_week` + minutes from local midnight**, not `time`
  and not `timestamptz`. Postgres has **no range type over `time`**, and the
  no-overlap exclusion constraints need one; `int4range` over minutes is exact and
  GiST-indexable. `lib/time` converts to "HH:MM" for the UI.
- **5 exclusion constraints** guarantee no overlapping intervals:
  `staff_working_hours`, `staff_breaks`, `branch_hours` (int4range),
  `staff_time_off` (tstzrange), `branch_closures` (daterange, inclusive).
  These are DB guarantees, not UI validation.
- **Price is per branch** (`service_branches`), because currency is branch-level.

## Phase 3: no double-booking, and where the guarantee is weaker
**Two GiST exclusion constraints on `appointments`** (doc §6.2, §11):
`appointments_no_staff_double_booking` (staff_id + tstzrange) and
`appointments_no_resource_double_booking` (resource_id + tstzrange). Both carry
the partial predicate:

```
status not in ('cancelled','no_show') and deleted_at is null and is_exclusive
```

- **`pending` HOLDS the slot**, so two customers cannot both await approval on
  one time. Only `cancelled` and `no_show` release it.
- **The constraints use the real `starts_at`/`ends_at`, not start..end+buffer.**
  The buffer is a scheduling courtesy, not a physical conflict: the slot engine
  hides buffered slots and the booking RPC re-checks it, but a receptionist
  deliberately overriding a buffer in Phase 4 must not be refused by a database
  constraint.
- **`is_exclusive`** is true when `people_per_slot` was 1 at booking time, so a
  group class is not refused by the constraint.

**THE WEAKER GUARANTEE — read this before building `create_booking`.**
A Postgres exclusion constraint can express "no two rows overlap". It **cannot**
express "at most N rows overlap". So for `people_per_slot > 1`, and for a
`resources.capacity > 1`, there is **no DB-level guarantee**: the booking RPC
must do a counted check under

```
pg_advisory_xact_lock(branch_id, service_id, staff_id, starts_at)
```

so two concurrent group bookings serialise instead of both reading "2 seats
left". **That lock now exists**, in `create_booking` (20261003160000):
`pg_advisory_xact_lock(hashtext('booking:'||branch||':'||service), hashtext(starts_at))`.
Everything after it — the slot re-check, the group count, the resource count and
the insert — runs serialised per slot, while two different slots never contend.

1:1 booking, the default and the overwhelming majority of real use, IS fully
guaranteed by the DB and needs no lock.

**Resource capacity was broken and is fixed.** The resource constraint originally
keyed off `is_exclusive` (a people_per_slot concept), so a `capacity: 2` room
could still hold only one booking: the engine offered the slot and the constraint
then refused it, telling the customer "that slot just went" when it had not.
It now keys off **`resource_is_exclusive`**, a generated column
(`resource_id is not null and resource_capacity_at_booking <= 1`), where
`resource_capacity_at_booking` is snapshotted at write time and defaults to 1 —
i.e. to the stricter behaviour. So capacity 1 is a hard DB guarantee and
capacity > 1 is the counted check, same as group bookings.

## RLS helpers
| Function | Returns |
|---|---|
| `is_super_admin()` | platform flag of the caller |
| `is_member(business_id)` | caller is an active member |
| `business_is_active(business_id)` | status active, **or** trialing and `trial_ends_at > now()` |
| `member_branch_ids(business_id)` | branches the caller holds a branch role in |
| `has_permission(business_id, branch_id, perm)` | permission held, honouring scope |
| `can(business_id, branch_id, perm)` | `business_is_active()` **AND** `has_permission()` — **use this for operational policies** |
| `my_grants(business_id)` | SETOF (permission, scope, branch_id): the caller's own grants, in one round trip. **For UI gating only** — `usePermission()` reads it instead of calling `has_permission()` once per question. Not a boundary. |
| `my_role_labels(business_id)` | SETOF (role_name, branch_id, permission_count): the caller's own role name(s) per branch, for the dashboard header's "Manager"/"Owner"/custom-role label. **Display only**, not a permission check. |
| `has_permission_at_branch_scope(business_id, branch_id, perm)` | Permission held at **branch or all** scope — **`own` does NOT count**. `has_permission()` deliberately ignores `own` (it answers "do you hold this anywhere relevant"), so this is the other half: it lets a policy separate "sees the whole branch" from "sees only their own rows". Used by the `appointments` and `clients` policies. |
| `is_own_staff_profile(staff_id)` | True when that staff profile is the caller's. **Implements the `own` scope** for schedule rows: `has_permission()` can say "you hold this at own scope" but not "this row is yours". |

**Phase 3 RPCs.**
`create_booking(...)` → jsonb: the whole public booking write in one transaction,
**`service_role` only**. Returns `{ok:false,code}` for every expected failure and
never raises — a raise would roll back step 7's rate-limit counter (the
`accept_invite` lesson).
`save_booking_settings(branch, jsonb)` → jsonb: SECURITY INVOKER, only the keys
present change, blocks a `people_per_slot` downgrade that a future slot already
exceeds.
`branch_is_bookable(branch)` → jsonb `{bookable, reasons[]}`.
`get_free_slots(...)` / `pick_staff_for_slot(...)`: `service_role` only.

**Phase 4 RPCs (dashboard appointments).** Full detail in `context/appointments.md`.
`create_appointment`/`update_appointment`/`cancel_appointment`/`mark_no_show`/
`mark_completed`/`approve_appointment`/`reopen_appointment`: **DEFINER**,
explicit `can()` + `has_permission_at_branch_scope()`/`is_own_staff_profile()`
as the real boundary — same posture as `resend_manage_link`, because they
write `audit_logs` (DEFINER-only) and the collision check must see rows
outside the caller's own RLS visibility. Staff may book/reschedule outside
hours/notice/window but never double-book or violate capacity
(`check_appointment_collision_v2`, NOT `get_free_slots` — see appointments.md
for why the engine cannot be reused here, and for the bug the v1 helper had:
it never surfaced the resolved resource_id, so no dashboard appointment ever
stored one). Status changes gated by `is_allowed_appointment_transition()`;
`cancelled` is permanently final; `no_show`/`completed` can be reopened to
`confirmed` ONLY via `reopen_appointment` (Owner/Manager role check,
`invoice_id` must be null, audited) — `approve_appointment` deliberately
checks `status = 'pending'` directly rather than the transitions table, so it
cannot become a side door into that reopen path. An Own-scope caller's
`staff_id` is FORCED to their own profile (`my_staff_profile_id()`), never
merely validated. `list_appointments`/`get_calendar_appointments`: pure
reads, **INVOKER** — RLS is the boundary, not an explicit check.

**Schedule writes go through RPCs, not direct table writes.**
`replace_staff_working_hours(staff, branch, jsonb)`,
`replace_staff_breaks(...)` and `replace_branch_hours(branch, jsonb)` clear and
re-insert a week in one transaction. They are **SECURITY INVOKER** so RLS applies
as usual, and each re-checks the permission to return a clear `42501` rather than
a silent no-op. Note they are the only functions in the project that are *not*
SECURITY DEFINER — deliberately, because the policies should stay the boundary.

All are `SECURITY DEFINER`, `STABLE`, `search_path = ''`. `anon` has no EXECUTE; trigger functions have none at all.

**`anon` now has NO table privileges either (2026-10-03).** Supabase's bootstrap
had run `grant all on all tables in schema public to anon`, so all 31 tables
granted anon SELECT/INSERT/UPDATE/DELETE/TRUNCATE going back to Phase 1. Nothing
was exposed — RLS is on everywhere and anon has no policy anywhere — but a
single over-broad policy in a later phase would have silently published a table.
`20261003113000_revoke_anon_table_grants.sql` revokes the lot and sets default
privileges, keeping **one** deliberate exception: `select on reserved_slugs`
(signup checks a slug before the user has an account). **A new table needs no
anon grant.** If a future feature genuinely needs an anon read, grant SELECT on
that one table explicitly, with the policy, in the same migration, and say why
it is safe to publish.

**Trial expiry needs no cron.** `business_is_active()` compares `trial_ends_at` to `now()` at query time, so access stops the second the trial ends.

**`businesses.plan` is nullable and null during the trial** — the super admin assigns a plan by hand (product doc §10). Null therefore means "everything included", **not** the cheapest tier; `hasFeature()` treats it that way. Do not add a `solo` default.

## RLS policies (every table, 10/10)
- `profiles`: read/update own row; super admin reads all. Guard trigger blocks changing `is_super_admin`, `id`, `email`.
- `businesses`: read = member; update = `settings.business`. **Not** gated on `business_is_active`, so an expired trial can still reach settings and billing. No INSERT (signup RPC only), no DELETE (soft delete).
- `branches`: read = member; write = `can(settings.business)`.
- `business_members`: read = own row or fellow member; insert = `users.invite`; update = own row (accepting an invite) or `roles.manage`.
- `roles` / `role_permissions`: read = system roles + own business; write = custom roles only, needs `roles.manage`.
- `member_role_assignments`: read = member; write = `roles.manage`.
- `permissions`, `reserved_slugs`: read-only catalogues.
- `audit_logs`: read = super admin or `settings.business`. **No write policy at all.**
- **Phase 3:**
  - `booking_settings`: read = member; UPDATE = `settings.booking`. **No INSERT/DELETE policy** — the trigger on `branches` owns the row's lifecycle.
  - `custom_fields` / `custom_field_services`: read = member; write = `settings.booking`.
  - `form_versions`: read = member; **no write policy for anyone**, including the Owner (like `audit_logs`). Rows come only from the SECURITY DEFINER trigger, and an immutability trigger refuses UPDATE/DELETE.
  - `clients`: read = `clients.view`, **narrowed at `own` scope to clients the caller has an appointment with** (the Phase 1 seed grants Staff `clients.view` at own scope meaning "their own clients"); create = `clients.create`; edit = `clients.edit`. **No DELETE policy** (soft delete).
  - `appointments`: read/create/edit = `appointments.view`/`.create`/`.edit`, each **narrowed at `own` scope to the caller's own appointments**. **No DELETE policy** — cancel or soft-delete.
  - `appointment_field_values`: read = can see the appointment **AND** (not sensitive **OR** `clients.view_sensitive`) — doc §6.1.
  - `booking_manage_tokens`: read = `appointments.view` on the appointment; **no write policy** (RPC only).

## Guard triggers (rules RLS alone cannot express)
- `enforce_profile_guard` — no self-promotion to super admin.
- `enforce_business_slug` — normalises the slug, rejects the reserved list.
- `enforce_business_guard` — a tenant cannot change its own `plan`, `status` or trial dates.
- `enforce_role_assignment_guard` — **you cannot grant a permission you do not hold.**
- `enforce_last_owner` — a business always keeps ≥1 active Owner.
  **Gap:** it is a `BEFORE DELETE` trigger on `member_role_assignments` with no
  exemption for the business itself being deleted, so `delete from businesses`
  cascades into it and is refused — a business row can never be hard-deleted while
  it has an Owner. Soft delete (`deleted_at`) is the intended path, so this is not
  urgent, but a cleanup or a GDPR erase has to disable the trigger for the
  transaction. Worth adding a "the business is going too" exemption.

  **This is a recurring family of bug, now seen three times:** a guard or
  bookkeeping trigger written for a tenant action also fires for the cascade that
  is deleting the tenant. `enforce_form_version_immutable` refused the cascade
  (fixed 20261003140000) and `touch_form_version` tried to CREATE a version for a
  business already gone (fixed 20261003210000); `enforce_last_owner` is the one
  still outstanding. **Any new trigger on a tenant-owned table should be checked
  against `delete from businesses`** — `supabase/tests/08_create_booking.sql`
  now asserts that a business with bookings, answers and form versions can be
  hard-deleted.
- **Phase 3 guards:**
  - `enforce_custom_field_guard` — **`is_sensitive` can only escalate** (clearing it would retroactively expose answers given under a stricter promise), and a field's **type is frozen once answers exist**.
  - `escalate_sensitive_answers` — marking a field sensitive marks **every existing answer** sensitive too, old ones included.
  - `enforce_form_version_immutable` — `form_versions` rows refuse UPDATE and DELETE.
  - `create_default_booking_settings` / `create_initial_form_version` — a new branch gets its settings row, a new business gets form version 1 (the empty form), from triggers rather than from the signup RPC, so every creation path is covered.
  - `touch_form_version` — any change to the field set creates a new version **in the same transaction**, so a booking can never reference a stale snapshot. An unchanged set is deduped by a sha256 digest.
  - Tenant guards on all four new tables (`enforce_appointment_tenant`, `enforce_field_value_tenant`, `enforce_manage_token_tenant`, `enforce_booking_settings_tenant`, `enforce_custom_field_service_tenant`): RLS checks the caller, these check the data.

## Default roles (product doc §9)
| Role | Grants | Scope |
|---|---|---|
| Owner | 47 (all, incl. `clients.erase`) | all |
| Manager | 39 — no billing, roles.manage, website.publish, **website.edit**, **settings.business**, commission.manage_rules, sms.buy_credits. Keeps `settings.booking` (doc §9: "Booking settings"). | branch |
| Receptionist | 20 — no discounts, credit notes, revenue reports, staff management, settings | branch |
| Staff | 10 — own appointments, own schedule, own commission | own |

## Verification (2026-10-05, Phase 4 part A + closure round)
`supabase/tests/12_dashboard_appointments.sql` — **141 passing** (was 103
after the first pass):
`create_appointment` (existing client by id, walk-in by phone with never-
overwrite, "any staff", out-of-hours succeeding, double-booking refused with
no orphan row left behind, Own-scope staff booking themselves, **passing
someone else's staff_id is overridden — the booking still succeeds but FOR
THE CALLER**, another business forbidden, anon refused outright); `update_appointment`
(notes-only edit, reschedule to a free slot, **rescheduling onto a taken
slot refused with the original appointment surviving untouched**,
out-of-hours reschedule succeeding, a terminal row refusing even a
notes-only edit, Own-scope staff forbidden on someone else's row);
**every one of the 25 (from,to) status pairs checked against
`is_allowed_appointment_transition`**, including the two REOPEN transitions;
approve/no_show/complete/cancel/reopen each exercised on real rows, every
terminal-or-refused path leaving the row provably unchanged;
**`reopen_appointment`**: Receptionist and Staff both refused (role check,
not permission), Manager/Owner succeed when `invoice_id is null`, an
INVOICED completed appointment refused even for the Owner, `cancelled`
refused via reopen too, another business and anon refused; **a REAL bug
found and fixed**: `create_appointment`/`update_appointment` never stored
`resource_id`, caught by a new assertion on the stored column (not just the
return code) — a capacity-1 resource booked twice via the dashboard used to
silently succeed; group AND resource capacity now proven on BOTH create and
update; DST on America/New_York (fall-back) AND **Asia/Karachi (no DST at
all, same UTC offset June and January)**; audit_logs rows asserted for
EVERY write RPC (`created`, `rescheduled`, `cancelled`, `no_show`,
`completed`, `approved`, `reopened`); `list_appointments` pagination,
filters, search, Own-scope narrowing, cross-business/anon seeing nothing;
`get_calendar_appointments` branch-timezone day boundaries and cancelled
rows excluded; no Realtime publication; grants on every RPC
including both collision helpers.

**Realtime RLS proved with a LIVE subscription** (not SQL fixtures, which
cannot hold a real JWT): three signed-in `supabase-js` clients against the
deployed project showed a cross-business subscriber receives zero events
and an Own-scope Staff subscriber receives only their own appointment's
events, never a colleague's, on the same unfiltered channel. See
`context/appointments.md`.

Re-ran **07, 08, 11 unchanged** (54, 134, 106 passing) after the first pass
AND again after the closure round's fixes and the migration-filename
renames, to confirm no regression at either point.

**Migration history reconciled**: `supabase migration list` now reports
**56/56 matched**, zero local/remote mismatches, confirmed 2026-10-05.
The cause: `apply_migration` timestamps each migration by when it actually
ran, not by the local filename's prefix, so several Phase 3/4 files had
drifted. Fixed by renaming local files to the real remote timestamps
(confirmed with the user first) — no `supabase migration repair`, no
database changes, purely local `mv`.

Advisors: security — the 6 new DEFINER functions add the same "executable by
authenticated" warning `resend_manage_link` already had (intentional, the
explicit check inside is the boundary). No new errors. Performance — no new
unindexed FKs.

## Verification (2026-10-04, Phase 3)
**430 assertions passing** against the live database, run as plain SQL inside
rolled-back transactions (`supabase db query --linked -f ...`):

- `supabase/tests/06_booking_form_and_slot_engine.sql` — **93 passing**. Slot
  generation; three timezones (Europe/London, America/New_York, **Asia/Karachi
  = no DST**); **DST spring-forward (23-hour day) and fall-back (25-hour day)**,
  including a branch open across the repeated hour, which yields 6 distinct
  instants and not 7; breaks; closures; time off; existing bookings; `pending`
  holding the slot; `cancelled`/`no_show` freeing it; the exclusion constraint
  **refusing an overlapping booking**; a **group booking NOT being refused**;
  buffer; slot interval (15/30/60/service length); booking window; minimum
  notice; `online_booking_enabled`; resources and `capacity`; people-per-slot
  seat counting; a branch with no hours yielding nothing; staff eligibility;
  the "Any staff" least-loaded rule; form versioning, dedupe and immutability;
  sensitivity escalation; client identity; tenant guards; and the grants.
- `supabase/tests/07_booking_rls_per_role.sql` — **54 passing**. Owner,
  manager, receptionist, **staff at Own scope**, another business, and **anon
  refused outright on all 8 tables**. Also: the sensitive-answer gate (a
  receptionist sees the non-sensitive answer and not the sensitive one),
  soft-delete-only appointments, form versions unwritable even by the Owner,
  manage tokens RPC-only, **even an Owner cannot call `get_free_slots`**, and an
  expired trial hiding operational data while leaving booking settings
  reachable.

- `supabase/tests/08_create_booking.sql` — **126 passing**. The success path and
  the whole response contract; every rejection path; manual confirmation creating
  a PENDING booking that still gets a token and still holds the slot; all five
  field types validated against the snapshot; group and resource capacity filling
  and freeing; `staff_choice = hidden` ignoring a supplied staff id; grants;
  `include_booked`; `save_booking_settings` with the downgrade guard;
  `branch_is_bookable`; and **a business with bookings, answers and form versions
  can still be hard-deleted**.
- `supabase/tests/09_booking_concurrency.sql` — **14 passing**. The advisory-lock
  keys (same slot → same key, different instant → different key, and two
  spellings of one instant → the same key), the 1:1 constraint proved without the
  RPC, and the counted checks at every seat count. **It cannot execute two
  concurrent backends** — see the limitation in `context/booking-engine.md`.

- `supabase/tests/10_rate_limiting.sql` — **43 passing**. A window allowing then
  blocking; **a BLOCKED attempt being recorded**, which is what makes an attack stay
  blocked; the retry hint; a different IP unaffected; a NULL endpoint failing
  CLOSED; a missing IP neither disabling the endpoint nor escaping the other caps;
  the per-phone and per-business caps; **the hourly cap biting before the daily one
  and reporting the hourly retry hint**; the daily cap still biting when the hourly
  is clear; retention; grants.
- `supabase/tests/11_guest_manage_link.sql` — **106 passing**. `get_booking`'s
  contract and its privacy limits (first name only); every token failure returning
  the same `invalid_token`; cancel inside/outside the cutoff; an expired token;
  revocation and replay; **the original booking surviving every failed reschedule**;
  manual confirmation sending a reschedule back to pending; resend invalidating the
  old token, its permission check and audit row; **`get_booking_reschedule_slots`**
  (the manage page's reschedule screen: resolves a token to its own booking's
  slots with no id in the payload, token failures identical to `get_booking`'s,
  a finished booking refused); grants.

**Advisors after Phase 3:** security = **0 errors**. Intentional new warnings:
`public_request_attempts` (RLS on, no policy — only the SECURITY DEFINER function
touches it, same as `invite_accept_attempts`), and `resend_manage_link` executable
by `authenticated` (the `can()` check inside IS the boundary). Plus the two from
before: `has_permission_at_branch_scope` and `branch_is_bookable` executable by
`authenticated` — same family as the 6 pre-existing permission helpers (they only
report on the caller's own access). `create_booking`, `get_free_slots` and
`pick_staff_for_slot` do NOT appear: they are `service_role` only and are not
even visible to anon over REST (404). Performance = no unindexed FKs; the long
"unused index" list is expected noise on an empty dev database.

## Verification (2026-10-02)
21 security checks run against the live database, all passing: tenant isolation (owner A / owner B / staff / anon), cross-tenant writes affect 0 rows, staff cannot reach invoices/billing/roles, expired trial locks operational data but not settings, and all four escalation guards hold. Test files: `supabase/tests/01_rls_tenant_isolation.sql`, `02_role_assignment_guard.sql`, `03_branch_locale_and_invoice_series.sql` (pgTAP).

**Advisors:** security = clean (0 errors). The 6 remaining SECURITY DEFINER warnings are intentional — those helpers only ever report on the caller's own access and `usePermission()` needs them. Performance = clean except the item below.

## Migrations
| File | What |
|---|---|
| `20261001182500_foundation_profiles.sql` | extensions, `set_updated_at`, profiles, new-user trigger, `is_super_admin()` |
| `20261001183000_businesses_branches.sql` | enums, reserved_slugs (112), businesses, branches, slug guard |
| `20261001184000_permissions_and_roles.sql` | permission catalogue (46; 47 since 11A), 4 system roles, grants |
| `20261001184500_members_assignments_audit_helpers.sql` | business_members, member_role_assignments, audit_logs, all RLS helpers |
| `20261001190000_phase1_rls_policies.sql` | every policy + the role/owner guard triggers |
| `20261001190500_fix_rls_and_function_grants.sql` | **fixed: RLS was missing on `business_members`**; revoked EXECUTE on trigger fns |
| `20261002080000_perf_rls_initplan_and_indexes.sql` | `(select auth.uid())` initplan fix, 2 FK indexes |
| `20261002080500_perf_split_for_all_policies.sql` | Split FOR ALL policies — **applied 2026-10-02 via `supabase db push`** |
| `20261002093000_create_business_with_owner.sql` | Signup RPC, `is_slug_available`, `write_audit_log` |
| `20261002094000_fix_role_guard_allow_first_owner.sql` | Narrowed escalation guard for the founding Owner |
| `20261002120000_branch_owns_locale_and_tax.sql` | **Branch owns country/currency/timezone/tax**; invoice series per branch; business columns renamed `default_*` |
| `20261002123000_lock_down_new_functions.sql` | Revoked anon EXECUTE on `suggest_invoice_prefix` |
| `20261002140000_my_grants.sql` | `my_grants(business_id)` for UI permission caching; EXECUTE to `authenticated` only |
| `20261002160000_invite_flow.sql` | `invite_member`, `accept_invite`, `invite_preview`, `invite_accept_attempts`, 7-day invite default |
| `20261002161000_invite_grants_lockdown.sql` | Revoked anon EXECUTE on `invite_member` / `accept_invite` (Supabase grants new functions to anon by default) |
| `20261002162000_fix_invite_member_ambiguous_column.sql` | **Fixed 42702**: OUT column `member_id` collided with `member_role_assignments.member_id`; OUT columns now `out_*` |
| `20261002163000_fix_invite_rate_limit.sql` | **Fixed the throttle**: raising rolled back the attempt counter, so failures now RETURN NULL |
| `20261002170000_fix_manager_settings_grants.sql` | **Seed fix**: Manager no longer holds `settings.business` or `website.edit` (doc §9 grants booking settings only). Manager 41 → 39. |
| `20261002180000_catalogue.sql` | Phase 2 catalogue: categories, services, per-branch prices, resources, RLS, tenant guard |
| `20261002181000_staff_and_schedule.sql` | Phase 2 staff + schedule: profiles, branch/service assignment, hours, breaks, time off, branch hours, closures, 5 exclusion constraints, `is_own_staff_profile()` |
| `20261002182000_catalogue_fk_indexes.sql` | Indexes for the 5 FKs the performance advisor flagged |
| `20261002190000_replace_schedule_rpcs.sql` | `replace_staff_working_hours`, `replace_staff_breaks`, `replace_branch_hours` — replacing a week is now ONE transaction. SECURITY INVOKER, so RLS still applies. |
| `20261003090000_booking_settings_and_form.sql` | Phase 3 part 1: booking_settings (one row per branch, doc §6.2 defaults, auto-create trigger + backfill), custom_fields, custom_field_services, form_versions with digest-deduped immutable snapshots, 5 enums, RLS |
| `20261003100000_clients_and_appointments.sql` | Phase 3 part 2: clients, appointments, appointment_field_values, booking_manage_tokens, **2 exclusion constraints**, `has_permission_at_branch_scope()`, `normalise_phone_e164()`, sensitivity escalation, RLS, the 2 FK indexes the advisor flagged on part 1 |
| `20261003110000_slot_engine.sql` | Phase 3 part 3: `free_slot` type, `get_free_slots()`, `pick_staff_for_slot()` — **service_role only** |
| `20261003112000_fix_slot_interval_cast.sql` | **Fixed 22P02**: `get_free_slots` assigned the `slot_interval` ENUM into an integer variable, so every call failed. Enum and minute count now have separate variables. |
| `20261003113000_revoke_anon_table_grants.sql` | **Revoked anon's table privileges project-wide** (Supabase's bootstrap had granted all 31 tables to anon since Phase 1). Keeps `select on reserved_slugs`. |
| `20261003140000_form_version_cascade_fix.sql` | **Fixed**: the form-version immutability trigger refused the cascade from `delete from businesses`, making a business undeletable. UPDATE still refused always; DELETE only when the parent is already gone. |
| `20261003150000_slots_include_booked.sql` | `get_free_slots` gains `p_include_booked`; `free_slot` gains `available` (doc §6.2 `all_greyed`). Occupancy moved from WHERE filters to one `is_available` expression. |
| `20261003160000_create_booking.sql` | **`create_booking`** — the public booking write, one transaction, service_role only |
| `20261003170000_save_booking_settings.sql` | `save_booking_settings` (+ people_per_slot downgrade guard) and `branch_is_bookable` |
| `20261003180000_fix_resource_capacity.sql` | **Fixed**: a resource with `capacity` > 1 was unusable. Adds `resource_capacity_at_booking` + generated `resource_is_exclusive` and re-keys the resource constraint. |
| `20261003190000_fix_booking_answers_and_capacity.sql` | **Fixed**: `create_booking` inserted RAW answers, discarding normalisation (a yes_no "TRUE" stayed "TRUE"), and did not snapshot the resource capacity. |
| `20261003210000_form_version_trigger_cascade_fix.sql` | **Fixed**: `touch_form_version` tried to CREATE a form version during the business-delete cascade (23503). No-ops when the business is gone. |
| `20261004090000_public_request_attempts.sql` | Step 7: `public_request_attempts`, `rate_limit_rules`, `check_rate_limit()` (records AND decides in one call; records BLOCKED attempts too; fails closed), `cleanup_public_request_attempts()` |
| `20261004093000_schedule_attempts_cleanup.sql` | `pg_cron` nightly retention job (03:17 UTC, 7 days). Asserts the API roles cannot reach the scheduler — and established that **reachability is schema USAGE *and* the function grant**, not the grant alone. |
| `20261004100000_guest_manage_rpcs.sql` | Step 6: `resolve_manage_token`, `get_booking`, `cancel_booking`, `reschedule_booking`, `resend_manage_link` |
| `20261004110000_fix_reschedule_rollback.sql` | **Fixed**: a FAILED reschedule left the appointment cancelled, because a `RETURN` does not roll back — only an exception does. Now validates everything before mutating and excludes the row from its own collision check (`a.id <> v_id`). |
| `20261004120000_business_hourly_cap.sql` | Per-business **hourly** cap (30) beside the daily one (200). Widened the `rate_limit_rules` PK to (endpoint, scope, window_seconds) so one dimension can hold several windows. |
| `20261005090000_lower_business_daily_cap.sql` | Per-business daily cap 200 → 120, with a migration-time assertion that the hourly cap never exceeds the daily one (which would make the hourly rule unreachable). |
| `20261005100000_require_client_email.sql` | `booking_settings.require_client_email` — the ONE toggleable default field (doc §6.1). Wired into `save_booking_settings` and `create_booking`, which now returns `email_required` rather than silently dropping a malformed address. Also adds `conflicting_slots` to the people_per_slot refusal so the UI can say how many upcoming slots clash. |
| `20261003223040_get_booking_page_catalogue.sql` | Phase 3 step 5: `get_booking_page_catalogue()` for the public booking page's bootstrap endpoint |
| `20261003223121_get_booking_page_rate_limit.sql` | Rate-limit rule for `get_booking_page` |
| `20261004035654_guest_manage_reschedule_slots.sql` | Step 6 (cont.): `get_booking_reschedule_slots` — reschedule screen's slots, resolved from a TOKEN not an id |
| `20261004042720_phase4_appointments_schema.sql` | Phase 4 part A: `appointments.invoice_id` (Phase 5 seam, no FK yet), `appointment_status_transitions` table + `is_allowed_appointment_transition()`, `appointments` was added to `supabase_realtime` (removed again by `20261019100000_remove_realtime.sql`) |
| `20261004042940_phase4_appointment_rpcs.sql` | `check_appointment_collision_v2()` shared helper (final form — see below), `create_appointment` (final form) |
| `20261004043110_phase4_update_appointment.sql` | `update_appointment` (final form: reschedule or notes-only, validates fully before one write, stores `resource_id`) |
| `20261004043134_phase4_status_rpcs.sql` | `cancel_appointment`, `mark_no_show`, `mark_completed`, `approve_appointment` (final form: pending-only, not a reopen side door) |
| `20261004043313_phase4_read_rpcs.sql` | `list_appointments` (keyset pagination), `get_calendar_appointments` (branch-timezone day boundaries) |
| `20261004043628, 20261004045004, 20261004045754, 20261004045817, 20261004045901` | Historical no-op placeholders for intermediate `apply_migration` calls this session, folded into the FINAL bodies of the files above. See `context/appointments.md`'s Files table. |
| `20261004044911_phase4_reopen_and_own_staff_fix.sql` | Closure round: `reopen_appointment`, `my_staff_profile_id()`, the two reopen transitions |
| `20261006090000_phase5_invoices_schema.sql` | Phase 5A: 4 invoice tables, enums, RLS (select only), immutability guards, hard currency lock + counter protection, `branches.credit_note_next_no`, `appointments.invoice_id` FK + RPC-only guard |
| `20261006100000_phase5_invoice_draft_and_issue_rpcs.sql` | helpers, `create_invoice_draft`, `update_invoice_draft`, `discard_invoice_draft`, `issue_invoice` |
| `20261006110000_phase5_payment_and_credit_note_rpcs.sql` | `invoice_money`, `add_payment`, `reverse_payment`, `create_credit_note` |
| `20261006130000_report_basic_at_internal.sql` | `get_basic_report` loses the public `p_as_of`: the clock-injectable body is now INTERNAL `report_basic_at` (no API grant), public `get_basic_report(business, branch?)` calls it with `now()` |
| `20261006120000_phase5_invoice_read_and_report_rpcs.sql` | `list_invoices`, `get_invoice_print_data`, `report_windows`, `get_basic_report` |
| `20261004045723_fix_dashboard_resource_id_not_stored.sql` | **Fixed a real bug**: `create_appointment`/`update_appointment` never stored `resource_id`, making resource capacity a no-op from the dashboard. Adds `appointment_collision_result` composite + `check_appointment_collision_v2` (returns the resolved resource id). |

## Phase 7A migrations
`20261007090000_phase7_website`, `20261007100000_phase7_reviews` (also redefines `mark_completed`), `20261007110000_phase7_widget`, `20261007120000_phase7_website_assets_bucket`, `20261007130000_phase7_regex_and_dedupe_fixes`. Applied with `db query --linked` + `migration repair`. 417 assertions in `16_website_reviews_widget.sql`; regression 13/14/07/08/11 unchanged. Advisors: no errors; intentional authenticated-DEFINER warnings for the owner RPCs.

## Phase 6A migrations (notifications backend)
`20261008090000_phase6_messaging_schema` (tables, Vault keys, pg_net, `appointments.scheduled_at`), `…100000_phase6_messaging_helpers` (seal, hash, `sms_segments`, ledger post, quiet hours), `…110000_phase6_enqueue_and_hooks` (enqueue, appointments trigger; redefines `create_booking`, `resend_manage_link`, `create_review_request_internal`, `reissue_review_request` ONLY to add an enqueue call), `…120000_phase6_worker_rpcs`, `…130000_phase6_reminders_and_cron`, `…140000_phase6_least_privilege`, `…150000_phase6_worker_tweaks`. Tables: `notification_settings`, `message_outbox`, `messages`, `message_suppressions`, `push_tokens`, `messaging_limits`, `sms_country_rates`, `sms_credit_accounts`, `sms_credit_ledger`. Full detail: `context/notifications.md`. 304 assertions in `17_notifications_backend.sql`. Advisors: no errors; new warnings are the intentional authenticated-DEFINER RPCs and `pg_net` listed in `public` (extension not relocatable).
**Privileges (fixed 2026-10-09, `20261009100000_revoke_table_privileges`):** `authenticated` no longer holds TRUNCATE/REFERENCES/TRIGGER on any public table; `anon` holds only SELECT on `reserved_slugs`; INSERT/UPDATE/DELETE are revoked from `authenticated` wherever no RLS policy covers that command; default privileges stop new tables getting TRUNCATE/REFERENCES/TRIGGER. A NEW table still gets full DML by default: revoke what no policy needs in the same migration. Re-tested: login, REST reads/writes, RPCs, all SQL suites.
Phase 6B migrations: `20261009090000_phase6_idempotency_and_slug` (`message_outbox.idem_suffix`, `outbox_fail(…, p_definite)`, reserved slug `unsubscribe`), `20261009100000_revoke_table_privileges`, `20261009110000_phase6b_backend` (log read on `settings.booking`, `push_preferences`, `save_push_preferences`, `get_appointment_messages`, enqueue honours preferences). `17_notifications_backend.sql` now 341 assertions.

## Phase 5A (invoices backend)
Full detail in `context/invoices.md`. Four tables with a SELECT-only policy
(`can()` + `has_permission_at_branch_scope()` on `invoices.view`); every write is
a DEFINER RPC. Four guard triggers make issued invoices/items/payments/credit
notes immutable for every role and release rows only when the business itself
is deleted (tested). Numbering is gapless: issuers serialise on the branch row
(`for no key update`), counters move only inside the RPCs, a failed issue rolls
the counter back. `appointments.invoice_id` now has a real FK and may only be
written by the invoice RPCs (trigger + flag `wapee.invoice_link`).
**Verification (2026-10-06):** `supabase/tests/14_invoices.sql` 310/310;
`15_invoice_concurrency.sh` (3 real parallel sessions) passes. Advisors: security
= no errors; the 10 new RPCs add the intentional "authenticated can execute
SECURITY DEFINER" warning (the explicit check inside is the boundary);
performance = no unindexed FKs (new indexes show as unused until used).

## Phase 8A migrations (plans, add-ons, super admin)
`20261010090000_phase8_plans_schema` (plans, addons, business_subscriptions, business_addons, industry_presets, seeds, backfill, mirror triggers, tightened `enforce_business_guard`), `…100000_phase8_feature_gating` (`business_has_feature`, `business_plan_limits`, `feature_gate_error`, `my_features`, `plan_limit_violations`, staff-cap / branch-limit / custom-roles triggers, real `widget_feature_enabled`), `…110000_phase8_super_admin_rpcs` (`admin_gate` + 13 RPCs). Applied with `db query --linked` + `migration repair`. 341 assertions in `18_plans_addons_super_admin.sql`. Advisors: no errors; new warnings are the intentional authenticated-DEFINER admin RPCs. Detail: `context/plans-super-admin.md`. NOTE: 100000 and 110000 were applied once before 090000 (which first failed on a duplicate index and was fixed and re-applied); function bodies are late-bound so the end state is correct.

Phase 8 follow-ups: `20261010120000_phase8a_super_admin_requires_aal2` (`platform_flag()`, `is_super_admin()` = flag AND aal2), `20261010130000_phase8b_admin_reviews_and_plan_usage` (`admin_list_reviews`, `my_plan_usage`). `18_*.sql` is now 356 assertions.

## Phase 9A migrations (plan features backend)
`20261011090000_phase9_custom_roles`, `…100000_phase9_commission`, `…110000_phase9_multi_branch`, `…120000_phase9_advanced_reports`, `…130000_phase9_report_schedules`, then fixes found by the suite: `…140000_role_update_diff`, `…150000_create_branch_fix`, `…160000_grant_can_grant_at`, `…170000_commission_reason_credited`, `…180000_report_summary_fix`, `…190000_enqueue_count_fix`, `…200000/210000_role_fk_*` (role FK deferred), `…220000_fk_indexes`. New tables: `commission_rules`, `commission_lines`, `commission_entries`, `report_schedules` (RLS select only). New columns: `roles.deleted_at/created_by`, `business_members.permissions_version`. Full detail: `context/plan-features.md`. Suite `19_phase9_plan_features.sql` 543 assertions; suites 08/14/16/17/18 edited (deferred role FK; 18: the primary-branch archive fixture runs as service role). Advisors: no errors; new warnings are the intentional authenticated-DEFINER RPCs.

## Phase 9B migrations
`20261012090000_phase9b_branch_scope` (helpers `perm_all_branches`, `staff_in_scope`, `client_in_scope`; policies for staff, time off, service_staff, services, categories, service_resources, custom fields, clients, audit log; report-email payload purge trigger + CHECK on `message_outbox`), `…100000_client_scope_fix`, `…110000_member_admin` (`remove_member`, `revoke_invite`), `…120000_list_roles_count` (count scoped to the business), `…130000_covers_every_branch` ("all branches" = every LIVE branch covered, so a Manager of the only branch of a single-branch business keeps services / custom fields). Suites: `21_branch_scope.sql`; `01`-`05` repaired and run through `supabase/tests/run_pgtap.py` (pgTAP rewritten on the fly to collect every `ok`/`not ok`). Detail: `plan-features.md`.

## Phase 10A migrations (add-ons Packages & Sessions, Inventory)
`20261013090000_phase10_member_names` (`list_business_member_names(business)`: user id, name, email of the ACTIVE members of the caller's own business, nothing for a non-member; `profiles` RLS unchanged), `…100000_phase10a_schema` (enums `session_usage_kind`, `stock_movement_kind`; tables `packages`, `package_services`, `client_packages`, `client_package_services`, `client_package_cancellations`, `session_usages`, `products`, `inventory_settings`, `stock_movements`; `invoice_items.package_id/product_id`; read gates `addon_read_access` / `package_visible`; guards; RLS select-only; Staff gets `packages.deduct_session` at own scope), `…110000_phase10a_package_and_inventory_rpcs` (13 RPCs + internal `deduct_session_at` / `reverse_session_at`, `session_usage_backstop`), `…120000_phase10a_invoice_integration` (`normalise_invoice_items`, `insert_invoice_items`, `issue_invoice`, `create_credit_note` redefined), `…130000_phase10a_low_stock_alert` (outbox events `staff_low_stock` / `low_stock`, `low_stock_recipients`, `enqueue_low_stock`, `apply_stock_movement`, `outbox_recipient` + `outbox_guard` extended), `…140000_phase10a_print_data_item_links` (`get_invoice_print_data` items carry `package_id` / `product_id`). Applied with `db query --linked` + `migration repair`. Suite `22_packages_inventory.sql` (198) + `23_addons_concurrency.sh`; suite 21 now 113 (member names, no-branch staff profile). Detail: `packages-sessions.md`, `inventory.md`. Advisors run at the end of the phase (see _handoff.md).

## Phase 10B migrations (add-ons Files & Photos, Forms & Consent)
`20261014090000_phase10b_schema` (private bucket `client-files` with NO storage policy; `client_access()` (client scope incl. Own); tables `client_consents`, `files` (column-level SELECT without `storage_path`), `form_templates`, `form_template_versions` (immutable), `form_template_services`, `form_requests` (guarded: used/revoked once, never deleted), `signed_consents` (immutable, no API grant), `signed_consent_voids`; `forms_read_access`, `file_visible`; Staff gets `files.upload` at own scope; rate-limit rules `get_form_request` / `submit_form_request`; outbox event `form_request`), `…100000_phase10b_files_rpcs` (`files_prepare_upload`, `files_finalize` (service_role), `files_access`, `list_client_files`, `delete_file`, `set_photo_consent`, `get_client_files_state`), `…110000_phase10b_forms_rpcs` (validators, `save_form_template`, `delete_form_template`, `create_signed_consent`, `record_signed_consent`, `create_form_request`, public `get_form_request` / `submit_form_request`, `list_signed_consents`, `get_signed_consent`, `appointment_forms`, `void_signed_consent`), `…120000_phase10b_outbox_form_request` (`outbox_guard` re-check). Applied with `db query --linked` + `migration repair` (a failed file must be re-marked `reverted` first: the repair command does not check the file ran). Suite `24_files_forms.sql` (144) + `25_files_forms_http.mjs` (42 real HTTP checks). Detail: `files-photos.md`, `forms-consent.md`.

## Phase 10C migrations (add-on Client portal)
- `20261015090000_phase10c_portal_schema_and_auth.sql`: `portal_login_tokens`, `portal_sessions` (RLS on, no policy, service_role only, guards), rate-limit rules, outbox event `portal_login`, `portal_info`, `portal_request_login`, `portal_exchange_token`, `portal_sign_out`.
- `20261015100000_phase10c_portal_rpcs.sql`: read RPCs (overview, bookings, packages, invoices, invoice, photos, photo paths, forms) and actions (cancel, reschedule slots / booking, create booking) re-using the guest-manage and booking engines.
- `20261015110000_phase10c_outbox_portal_login.sql`: `outbox_guard` drops a stale `portal_login` email.
- `20261015120000` + `20261015130000`: the borrowed manage token coexists with the booking's own live token (exact restore).

## Phase 11A migrations (hardening: GDPR, contact lock, security, performance)
- `20261016090000_phase11a_view_contact_lock`: `authenticated` loses SELECT on `clients.phone_e164` / `email` (column grants on the rest), `contact_business_ids()`, view `clients_v`, `list_appointments` reads the view.
- `20261016100000_phase11a_gdpr_schema`: permission `clients.erase` (Owner), `clients.erased_at`, tables `storage_cleanup_queue`, `erasure_log` (no grants), `data_requests` (RLS select `clients.export`), `gdpr_erasing()` flag + exemptions in `enforce_invoice_guard` / `enforce_addon_ledger_guard` (signed_consents only) / `enforce_review_guard` / portal guards / `enforce_last_owner` (`wapee.erase_business`), RPCs `gdpr_export_client`, `gdpr_erase_client`, `gdpr_business_erase_check`, `gdpr_erase_business_commit`, `gdpr_storage_done`, `portal_create_data_request`, `list_data_requests`, `resolve_data_request`, rate rule `portal_data_request`.
- `20261016110000_phase11a_gdpr_fixes`: `enforce_last_owner` handles the cascade (member row already gone), `data_requests.email_hash` for the daily cap.
- `20261016120000_phase11a_security_hardening`: anon loses `is_slug_available` / `my_grants`; API roles lose `business_is_active` / `suggest_invoice_prefix`.
- `20261016130000` / `…140000` / `…150000` / `…160000` (RLS performance): STABLE set functions `perm_branch_ids(perm, branch_scope_only)`, `perm_business_ids`, `perm_cover_business_ids`, `member_business_ids`, `own_staff_ids`, `scoped_client_ids`, `own_client_ids`, `client_has_live_appt`; SELECT policies of appointments, invoices, invoice_items, invoice_payments, credit_notes, messages, clients, services, staff_profiles, branches, service_branches, staff_branches test membership of those sets (computed once per statement) instead of calling `can()` per row; `clients_v` becomes a security-barrier definer view carrying the clients_select rule (kept equal by suite 31); `client_phone` / `client_email` dropped.
- `20261016170000_phase11a_list_indexes`: `appointments(business_id, starts_at desc, id desc)`, `messages(business_id, id desc)`, `clients(business_id, full_name, id)`.
- `20261016180000_phase11a_list_appointments_fast`: name from `clients`, phone search / phone shown through one lookup in `clients_v`.
- `20261017090000_phase11b_clients_notes_lock`: `clients.notes` not granted; `clients_v` blanks it without `clients.view_contact`.
- `20261017100000_phase11b_invoice_payment_state`: side table `invoice_payment_state` (triggers on invoices / payments / credit notes, backfilled; no grants), `list_invoices` filters on it and computes `invoice_money()` for page rows only (payment filter 4 s to 48 ms at 20k invoices).
- Rule for new tables: a policy that checks a permission on ROW columns must use the set functions (`col IN (select perm_branch_ids('x.y', true))`), never `can(business_id, branch_id, ...)` per row (about 1 ms per row; see docs/performance-review.md).

## Public pricing (2026-10-10)
`20261021090000_public_pricing`: `plans.priced_per_branch`, `addons.price_annual_minor` (backfilled 10x), `addons.available_plans business_plan[]` (null = every plan); launch prices (Solo 1500/15000, Team 3900/39000, Business 7900/79000 per branch; add-ons 900/900/900/1200/1200/1000, annual 10x; custom_roles Team only); `get_public_pricing()` (anon, DEFINER, STABLE, active rows, public fields only); `set_plan_prices(+p_priced_per_branch)` and `set_addon_prices(+p_annual_minor, p_available_plans)` (dropped + recreated, old positional calls still work, null = keep); reserved slugs `pricing`, `features`, `refund`. Suite `36_public_pricing.sql` (42). See landing.md.

## Reserved app-route slugs (2026-10-10)
`20261021100000_reserve_app_route_slugs`: data-only, reserves `today`, `commission`, `inventory`, `members`, `more`, `packages`, `schedule`, `website`, `accept-invite`, `invoice-print`, `report-print`, `icons` (single origin: a slug must never shadow an app route). No dev business used any of them. `reservedSlugs.test.ts` derives every top-level path from `app/`, `public/` and the landing build.

## Known limits / TODO
- **`supabase test db` needs Docker**, which is not installed on this machine. The CLI is linked and `db push` / `gen types` work; the pgTAP files in `supabase/tests/` have been verified by running their assertions through the connector instead. Install Docker (or share the DB password for `psql`) to run them as a suite.
- **Leaked-password protection is OFF** (security advisor). It is a dashboard setting: Authentication → Policies → enable "Check against HaveIBeenPwned". Worth turning on before real users.
- Plan/add-on gating: enforced in the DB since Phase 8A for staff cap, branches, custom roles, widget; `permissions.min_plan/addon` themselves are still not consulted by `can()`.
- **Group capacity has no DB guarantee.** `people_per_slot > 1` and
  `resources.capacity > 1` need a counted check under
  `pg_advisory_xact_lock(branch, service, staff, starts_at)` inside
  `create_booking`, which **does not exist yet** (Phase 3 step 5). See the
  "weaker guarantee" section above. 1:1 booking IS fully guaranteed.
- **Changing `people_per_slot` with existing bookings is not guarded.** 3 → 1
  leaves several non-exclusive rows in one slot that the constraint will not
  retroactively refuse. Open question for the user when the settings UI lands.
- **No Edge Functions exist yet.** `get_free_slots` is `service_role`-only, so
  until `get_slots` / `create_booking` are deployed nothing can reach it — by
  design, not an oversight.

## Changelog
- 2026-10-18: `20261025140000_no_show_not_before_start` — `mark_no_show` refuses before `starts_at` (`not_started`), before any write. Pushed to dev. Suite 47; suite 12 fixture adjusted.
- 2026-10-18: `20261025130000_portal_packages_balance_and_timezone` — `portal_packages` counts usages inline (no member-gated helper) and returns `timezone`. Pushed to dev. Suite 26 111/111.
- 2026-10-18: `20261025120000_create_appointment_validate_before_client` — `create_appointment` writes the client together with the appointment (validate first, write last). Pushed to dev. Suite 46.
- 2026-10-18: `20261025110000_rate_limit_one_ip_row_per_attempt` — `check_rate_limit` business row has `ip_hash = null`; no all-null row. Pushed to dev (version = filename). Suite 45.
- 2026-10-18: `20261025100000_pick_staff_respects_schedule` — `pick_staff_for_slot` gains `p_allow_off_schedule boolean default false` (old 4-arg overload dropped, grants re-applied: service_role only) and only returns staff for whom `get_free_slots` (notice ignored) offers that start; `create_appointment` re-created unchanged except passing `true`. Applied to dev with `supabase db push --linked` (version = filename). Suite 44 new; 06 updated for the new signature.
- 2026-10-17: **Dev migration history repaired** (user-approved, history table only): the 9 drifted versions (`20261013083426/083516`, `20261014104921/140132/143620`, `20261015175756/181336/185038/185044`) marked reverted, their filename versions (`20261024100000..160100`) marked applied. `migration list --linked` 159/159 matched, `db push --dry-run` up to date, schema fingerprint unchanged (22/22 categories). Prod untouched.
- 2026-10-16: **Renamed (content unchanged)** `20261014104921_list_businesses_search_owner_email` -> `20261024160000_list_businesses_search_owner_email` and `20261014140132_enforce_current_period_end` -> `20261024160100_enforce_current_period_end`, so both sort after prod's latest (`20261024100500`) and after `20261020110000_suspended_login_block`, which also defines `set_business_status` and, in filename order, used to overwrite the period-end version on any from-empty replay (silent: `check:migrations` only catches failures). `check:migrations` 159/159; replayed `set_business_status` has the stale-period fix + session revoke, `business_is_active` checks `current_period_end`, `list_businesses` matches owner email. No new migration this round (the answers RLS was proven correct as is: suite 43). **Dev's `schema_migrations` still holds 9 versions that differ from their filenames** (the 2 above + `20261024100000/100500` + `20261024110000..150000`); the repair list is in _handoff.md, waiting for the user's approval.
- 2026-10-14: `20261014140132_enforce_current_period_end` — mirrors `business_subscriptions.current_period_end` into `businesses` (same pattern as plan/status/trial_ends_at/plan_activated_at); `business_is_active()` now locks a `status='active'` business whose period has elapsed; `set_business_status('active')` clears a stale PAST period end on reactivation only. Also `20261014104921_list_businesses_search_owner_email` (Feature 6 round). Both older than `20261024100500`; `npm run check:migrations` confirms 154/154 from empty, correct filename order.
- 2026-10-20: `20261020130000_message_retry` (`get_appointment_messages` + error/outbox_id/can_retry, `retry_message`).
- 2026-10-07: **Phase 10B** — add-ons Files & Photos and Forms & Consent (4 migrations `20261014090000`..`120000`, 8 tables, private bucket, 15 RPCs, 2 Edge Functions `client_files` + `sign_form`).
- 2026-10-07: **Phase 10A** — add-ons Packages & Sessions and Inventory (6 migrations `20261013090000`..`140000`, 9 tables, 13 RPCs, invoice integration, low-stock alert); `list_business_member_names` for the Team list.
- 2026-10-09: Phase 6B backend + project-wide least-privilege revoke (see Phase 6A section).
- 2026-10-08: **Phase 6A** — notifications backend: outbox, messages log, SMS credits/rates, push tokens, suppressions, reminders (pg_cron), 7 migrations, 304 assertions.
- 2026-10-07: **Phase 7A** — website, reviews, widget keys, assets bucket (5 migrations, 417 assertions).
- 2026-10-06: `p_as_of` removed from the public report RPC (internal `report_basic_at`); the two Phase 4 migration files renamed to their remote stamps (`20261004143401_is_owner_or_manager`, `20261004152214_list_appointments_client_filter`), `supabase migration list` matches 63/63. 312 assertions.
- 2026-10-06: **Phase 5A — invoices backend.** 4 tables, 10 RPCs, gapless numbering, immutability, hard currency lock, reports with DST-correct windows. 310 SQL assertions + a real 3-session concurrency test. Migrations applied with `db query --linked` + `migration repair`.
- 2026-10-05: **Phase 4 part A closure round.** `reopen_appointment` (Owner/Manager role check, `invoice_id` guard, audited), `my_staff_profile_id()` + forced Own-scope `staff_id`. **Found and fixed a real bug**: `create_appointment`/`update_appointment` never stored `resource_id`, making resource capacity a no-op from the dashboard — fixed with `check_appointment_collision_v2`. Found and fixed a second gap mid-round: `approve_appointment` had briefly become a side door into the reopen path. 141 assertions (was 103). Proved Realtime RLS with three live signed-in clients. Reconciled all migration filenames with the real remote history (56/56 matched, no `migration repair` needed).
- 2026-10-05: **Phase 4 part A — dashboard appointments backend.** `appointments.invoice_id` (Phase 5 seam), `appointment_status_transitions` + `is_allowed_appointment_transition()`, `check_appointment_collision()`, `create_appointment`, `update_appointment`, `cancel_appointment`/`mark_no_show`/`mark_completed`/`approve_appointment`, `list_appointments`, `get_calendar_appointments`, Realtime publication. 103 new assertions. No UI yet.
- 2026-10-04: `require_client_email` (the one toggleable default booking field); per-business daily cap 200 → 120. 430 assertions.
- 2026-10-04: **Step 7 (rate limiting + bot protection)** and **step 6 (guest manage link)**. Per-business hourly cap added.
- 2026-10-04: **Fixed: a failed reschedule left the booking cancelled** — a `RETURN` does not roll back. Now a permanent rule in CLAUDE.md §10a.
- 2026-10-04: `pg_cron` installed for retention; the grant assertion established that reachability is schema USAGE **and** the function grant.
- 2026-10-03: `create_booking`, `save_booking_settings` (+ people_per_slot guard), `branch_is_bookable`, `include_booked`. 287 assertions total.
- 2026-10-03: **Fixed: resource `capacity` > 1 was unusable** — the constraint had no notion of capacity. Now a generated `resource_is_exclusive` from a snapshotted capacity.
- 2026-10-03: **Fixed two cascade bugs** that made a business undeletable (form-version immutability refusing the cascade; `touch_form_version` creating a version for a deleted business). Named as a recurring family under Guard triggers.
- 2026-10-03: **Revoked anon's table privileges project-wide.** Supabase's bootstrap had granted all 31 tables to anon since Phase 1; RLS was the only thing holding the line. One exception kept: `select on reserved_slugs`.
- 2026-10-03: **Phase 3 slot engine** — `get_free_slots()` and `pick_staff_for_slot()`, service_role only, DST-correct in three timezones. 93 assertions.
- 2026-10-03: **Phase 3 bookings schema** — clients, appointments, answers, manage tokens; 2 exclusion constraints (no double-booking); `has_permission_at_branch_scope()` for Own-scope narrowing. 54 RLS assertions.
- 2026-10-03: **Phase 3 booking settings and form** — booking_settings per branch with doc §6.2 defaults, custom fields, immutable digest-deduped form versions.
- 2026-10-02: Schedule writes made transactional via three replace RPCs (11 assertions, incl. rollback-on-bad-payload).
- 2026-10-02: **Phase 2 schema** — 13 tables (catalogue, staff, schedule), 5 exclusion constraints, Own-scope RLS. 22 assertions verified against the live database; advisors clean.
- 2026-10-02: Manager seed corrected to 39 permissions (booking settings only, per doc §9).
- 2026-10-02: Added `my_grants()` for UI permission caching. Verified it agrees with `has_permission()` on all 46 permissions and leaks nothing to non-members or anon.
- 2026-10-02: **Branch now owns country, currency, timezone and tax** (decisions 23–25). Invoice numbering is per branch with a unique prefix. Business keeps `default_*` for pre-fill only. CLI linked; migration history repaired; pending performance migration applied.
- 2026-10-02: Phase 1 schema: 10 tables, 46 permissions, 4 roles, all RLS + guards, advisors clean, 21 security tests passing.
- 2026-10-07: **Phase 10C client portal** — 2 tables, 20 service-only RPCs, 5 migrations; details in `client-portal.md`.
- 2026-10-07: **Phase 11A** — contact columns locked at the database, GDPR export / erase / business erase + portal requests, security review fixes, RLS rewritten set-based (list_appointments from >25 s to < 1 s on 50k rows), 3 list indexes; 9 migrations. See `gdpr.md`, `docs/security-review.md`, `docs/performance-review.md`.
- 2026-10-07: **Phase 11B** — `clients.notes` locked behind `clients.view_contact`; `invoice_payment_state` side table for the invoice payment filter; 2 migrations.
- 2026-10-09: **Account deletion / email sync** — `account_delete_blockers`, `account_delete_commit` (service_role, one transaction, deletes the auth user), `log_account_event`, trigger `sync_profile_email`; ledger `created_by` FKs dropped (append-only tables cannot take SET NULL), `delete-account` slug reserved; 3 migrations. See `account.md`.
- 2026-10-09: **Launch default prices** — data-only migration `20261019090000_default_launch_prices.sql`: add-ons set to packages 800, inventory 800, files_photos 1000, forms_consent 1000, client_portal 1200, custom_roles 1000 (USD minor), only where still the seed value and `updated_by` is null. Plans already 1500/3900/7900. Annual = `plans.price_annual_minor` (seed 18% off; no discount % field, no add-on annual).
- 2026-10-09: **Realtime removed.** `20261019100000_remove_realtime.sql` drops `appointments` (the only published table) from `supabase_realtime`; no Realtime policy or helper existed. Suites 12 and 28 now assert the publication is empty. `[realtime] enabled = false` in `supabase/config.toml`. Project rule: no Realtime anywhere.


## Web Push (2026-10-20)
`20261020100000_web_push_subscriptions` (+ `…100100` restores the `outbox_job` idempotency key, `…100200` regex fix: Postgres regex repetition max is 255, `…100300` CHECK null trap: `jsonb_typeof(null)` is null and a CHECK returning null PASSES). `push_tokens` gains `web_keys jsonb`; CHECK `push_tokens_shape_check` per platform (ios/android = Expo token, no keys; web = https endpoint + p256dh/auth). New RPC `register_web_push_subscription(endpoint, p256dh, auth)` (authenticated); `register_push_token` now refuses `web`; `outbox_job.tokens[]` carries `platform` + `web_keys`. Suite `34_web_push.sql` (33 assertions).

## Suspended login block (2026-10-20)
`20261020110000_suspended_login_block`: `user_is_disabled(uuid)` (service_role / supabase_auth_admin), `custom_access_token_hook(jsonb)` (supabase_auth_admin only, fail-open), `revoke_sessions_of_disabled_members(uuid)` (service_role; deletes `auth.refresh_tokens` / `auth.sessions`), `my_access_state()` (authenticated), `set_business_status` redefined. Audit action `admin.sessions_revoked`. Suite `35_suspended_login_block.sql` (66). Trap: the management DB role cannot `SET ROLE supabase_auth_admin`, so the suite calls the hook as postgres and proves the grant with `has_function_privilege`.

## Branch bookable needs staff hours (2026-10-20)
`20261020120000_branch_bookable_staff_hours`: `branch_is_bookable` adds reason `no_staff_hours` (a performer of an offered service with a `staff_working_hours` row at the branch is required) and `bookable` now needs it. Suite 08 section 16.
- 2026-10-09: suite 23 reworked. Its "two sessions waited" check failed because the FIRST `supabase db query` of scenario 2 started minutes late (CLI login stall), after the winner had already released; locks themselves unchanged. Now: exactly one winner, every session that overlapped the winner must be held until its release, at least one must overlap; stored rows asserted as before.

## Staff login <-> staff profile link (2026-10-22)
`20261022090000_staff_member_link`: `link_staff_member(staff, member|null)` (authenticated, DEFINER, `staff_in_scope(... 'staff.manage')`, returns `{ok, code}`: `not_found`, `forbidden`, `member_not_found`, `member_already_linked`; audits `staff.linked` / `staff.unlinked`), `add_me_as_staff(business, branch?)` (the caller's own name + email, bookable, assigned to the branch, linked to their membership; codes `forbidden`, `branch_not_found`, `already_staff`, `staff_cap_reached`; audits `staff.self_added`), `invite_member(..., p_staff_id)` (old 4-arg overload dropped; the chosen profile is linked to the INVITED member row, which `accept_invite` later activates, so nothing else changes on accept). Trigger `staff_profiles_member_link_guard` (SECURITY INVOKER, `current_user in ('authenticated','anon')` cannot set a non-null `member_id`; null stays allowed for the FK `ON DELETE SET NULL`) and `business_members_release_staff` (soft-deleting a member sets its profile's `member_id` to null). Suite `37_staff_member_link.sql` (57). Trap: the suite's tenant delete needs `member_role_assignments_last_owner` disabled, like 16 / 24.

## Public multi-location booking (2026-10-22)
`20261022100000_public_multi_branch`: `get_bookable_branches(business)` (service_role; live branches passing `branch_is_bookable`, primary first, public fields only incl. `code` = invoice prefix), `get_booking` + `branch_address`, `portal_create_booking(..., p_branch_id)` (old 6-arg signature dropped and recreated, positional calls still work), `outbox_job` + `branch_count`. No table / policy change. Suite `38_public_multi_branch.sql` (39) and HTTP `38_multi_branch_http.mjs` (27, seed + cleanup files).

## Setup checklist dismissal (2026-10-22)
`20261022110000_setup_checklist_dismissed`: `businesses.setup_checklist_dismissed_at timestamptz` (existing businesses backfilled to now()), `dismiss_setup_checklist(business)` (authenticated, DEFINER, needs `settings.booking`, first dismissal wins, `{ok, code}`). Suite `39_setup_checklist.sql` (15).

## Single-location edit (2026-10-22)
No migration. Suite `40_single_branch_edit.sql` (30) proves `update_branch` on Solo and Team plans (stored values, forbidden roles, unsafe changes refused with nothing written, second location blocked, invoices use the edited tax rate, issued ones keep theirs).

## QA audit fixes: last-owner UPDATE guard + two cross-tenant oracle leaks (2026-10-23)
Found by a code-read security audit (`docs/qa/`), reproduced live on dev, fixed and reverified live.
- `20261023090000_fix_last_owner_update_guard`: `enforce_last_owner()` (on `member_role_assignments`) previously fired only `BEFORE DELETE`; a raw `UPDATE` of `role_id`/`member_id`/`branch_id` on a business's sole Owner assignment bypassed it entirely, via RLS (not RPC-only), proven to leave a business with **zero active Owners**. Now fires `BEFORE UPDATE OR DELETE`, blocking only when the OLD row was an active Owner assignment AND something Owner-relevant is actually changing (so a no-op update is never refused, and ownership transfer — assign a second Owner first, then demote the first — still works). New companion trigger `enforce_last_owner_on_member()` on `business_members` closes the same hole from a second angle: directly soft-deleting (`deleted_at`) or deactivating (`status`) the sole Owner's membership row is now refused too, even though it never touches `member_role_assignments`. Both share the exact exemptions the original DELETE guard already had: `wapee.erase_business` flag (`gdpr_erase_business_commit` / `account_delete_commit`, an already-deleted business), no signed-in user (service-role/bootstrap), `is_super_admin()`. Suite `41_last_owner_update_guard.sql` (18 assertions: the exploit now refused, ownership transfer allowed, founding-Owner bootstrap via `create_business_with_owner` unaffected, no-op update allowed, a trusted backend write exempt, the `business_members` companion guard, cross-business isolation unaffected, the erase-flag exemption). Regression: suites 18 (356), 21 (113), 28 (43), 29 (72), 31 (6) all still green.
- `20261023100000_fix_cross_tenant_oracle_leaks`: `client_has_live_appt(uuid)` and `client_package_used(uuid)` were SECURITY DEFINER, granted to `authenticated`, with no membership check at all — any signed-in user could call either directly (not only through the RLS policy/view/RPC meant to be their only caller) and learn, for any client or client package on the platform, whether it has a live appointment or its exact session-usage count. A plain `revoke` was tried first and proven to break `clients_select`/`list_client_packages` immediately (they call these functions under the caller's own role, not the owner's) — the fix instead keeps the grant and adds an in-body `is_member()` / `package_visible()` check, reusing the exact visibility rule each function's real caller already enforces. Verified live over real HTTP (a real cross-business Receptionist session, via the actual GoTrue + PostgREST stack) as well as in SQL: the legitimate caller still gets the true answer, a cross-tenant stranger gets a masked `false`/`0`, indistinguishable from a genuine negative.
Both migrations: no table/column/type change (confirmed: generated types diff only in an unrelated `graphql_public` section, not touched by either migration).

## Dashboard header identity (2026-10-24)
`20261024090000_my_role_labels`: `my_role_labels(business_id)` — the caller's own (role_name, branch_id, permission_count) role assignments, same shape and self-only scope as `my_grants()` (display only, not a boundary). Added so the header/avatar menu can show "Manager" (or a custom role's name) without reusing the heavier `useMembers` list. No table/column change.

## QA audit fix: anon-executable function grants (2026-10-13)
A security check of `my_role_labels` (no cross-tenant leak — every row is filtered by `auth.uid()`) found `anon` still had EXECUTE on it, even though its own migration did `revoke all on function ... from public`. **`revoke ... from public` only strips the PUBLIC pseudo-role grant; it does NOT remove a role's own direct grant from the schema's default ACL** — Supabase's default ACL grants EXECUTE on every *new* function to `anon`/`authenticated` as its own direct grant, separate from PUBLIC (documented in `docs/security-review.md` L5 as "every migration revokes explicitly", which this one hadn't). A full audit (`has_function_privilege('anon', oid, 'EXECUTE')` over every function in `public`) found 4 unintended ones total, none leaking data (anon's `auth.uid()` is null, so `my_role_labels` already returned `[]`; the other three are stateless predicates with no sensitive input) but closed anyway:
- `my_role_labels(uuid)` — had its own direct `anon` grant from the default ACL (`revoke ... from public` didn't touch it).
- `enforce_staff_member_link()`, `is_allowed_appointment_transition(status,status)`, `website_asset_path_ok(text)` — reachable through the **PUBLIC** pseudo-role grant instead (never had a `revoke ... from public` at all); a first migration's `revoke ... from anon` was a no-op for these three, caught only by re-checking `has_function_privilege` afterward — needed a SECOND migration (`revoke ... from public`, then re-grant to `authenticated` where it was already relying on it).

`20261024100000_lock_down_anon_function_grants` + `20261024100500_fix_lock_down_anon_via_public`: revoke `anon` EXECUTE on all four (second migration also strips the PUBLIC grant and restores `authenticated`'s own); `alter default privileges for role postgres in schema public revoke execute on functions from anon` so no future function gets anon by default (role `postgres` owns migration-created objects; `authenticated` keeps the default, unchanged accepted pattern). Only `get_public_pricing()` and `invite_preview(text)` remain anon-executable — both pre-existing, explicit, documented (security-review.md L7). Confirmed over real HTTP post-fix: `get_booking_page` (public booking page) and `invite_preview` with a bogus token both still answer correctly for anon; `my_role_labels` now returns `42501 permission denied` for anon instead of a silent empty `200 []`. New suite `42_my_role_labels.sql` (9 assertions: owner/receptionist/cross-tenant/no-role/anon-refused, plus "no OTHER unintended anon-executable function exists"). Regression: suites 18 (356), 21 (113), 28 (43), 29 (72), 31 (6), 41 (18) all still green. Advisors: `anon_security_definer_function_executable` down to exactly 2 (`get_public_pricing`, `invite_preview`) — `my_role_labels` no longer listed. No table/column change (types diff only in the unrelated `graphql_public` section again).
**Trap:** `revoke ... from <role>` and `revoke ... from public` are different grants — a function can be anon-reachable through either one independently, and checking only the migration text (not `has_function_privilege` against the LIVE database) will miss which one actually applies. Always verify the live grant after a revoke, not just that a `revoke` statement ran.
