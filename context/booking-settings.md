# Booking settings & booking form

Status: DB + UI done · Phase: 3 · Last updated: 2026-10-04

## What it does

Holds how online booking behaves for a branch (doc §6.2) and what the booking
form asks (doc §6.1). One `booking_settings` row **per branch**, created
automatically when the branch is created. Custom fields are per business, with
an immutable snapshot (`form_versions`) so an old booking's answers always keep
the labels, types and options the customer actually saw.

**The settings UI is built** (step 4): `/settings/booking`, two tabs — Settings
and Booking form — with a live customer preview. The public booking page itself
(step 5) is still to come.

## Business rules

- **Settings are per BRANCH, not per business.** Every value in doc §6.2 is
  operational, and operations are per location (matches decision 23: the branch
  owns country/currency/timezone).
- **Defaults are exactly doc §6.2**, written as column DEFAULTs:
  staff choice `optional`, slot display `only_available`, confirmation `auto`,
  show prices on, slot interval 15 min, buffer 0, minimum notice 60 min,
  booking window 30 days, customer can cancel (24h cutoff), rooms off,
  people per slot 1. `online_booking_enabled` defaults to true.
- A new branch gets its row from an **AFTER INSERT trigger on `branches`**, so
  every path (signup RPC, a future "add branch" screen, a seed script) is
  covered. Existing branches were backfilled.
- **Editing needs `settings.booking`** (Owner and Manager hold it; doc §9).
  Every member can READ it, because the calendar and the preview need it.
- **Writes go through `save_booking_settings(branch, settings jsonb)`**, not a
  direct UPDATE. Only the keys present change, so the UI can save one section at
  a time. SECURITY INVOKER, so RLS is still the boundary.
- **Lowering `people_per_slot` is blocked when a FUTURE slot already holds more
  bookings than the new limit** (user decision, 2026-10-03). Old rows are never
  touched — a customer who has a place keeps it. Past slots never block, because
  they cannot be fixed and would freeze the setting forever. The refusal returns
  the offending slot so the UI can say which one.
- **`branch_is_bookable(branch)`** answers "may the booking link be shown as
  active?" and lists every unmet reason: `booking_disabled`, `no_branch_hours`,
  `no_bookable_service`, `no_bookable_staff`, `no_staffed_service`. The settings
  screen must show these as warnings and must not present the booking link as
  active until they clear (user decision, 2026-10-03).
- **Exactly five custom field types** (doc §6.1): short_text, long_text,
  dropdown, yes_no, number. An enum, so a sixth cannot appear by typo.
- A dropdown needs **2–50 non-empty options**; no other type may have any.
- **`is_sensitive` can only escalate.** Turning it on also marks every
  existing answer sensitive (old answers were given under the same promise);
  turning it off is refused by a trigger.
- **A field's type is frozen once answers exist.** Deactivate it and add a new
  field instead.
- **A new form version is created in the DB**, in the same transaction, whenever
  the field set changes — not one per booking. An unchanged save reuses the
  existing version (matched by a sha256 digest of the snapshot), so a no-op edit
  does not inflate the version number.
- Every business has a **version 1 (the empty form)** so a booking made before
  any custom field exists still has a snapshot to point at.
- `form_versions` rows are **immutable**: UPDATE and DELETE are refused by a
  trigger, and no write policy exists for anyone, including the Owner.

## Files

| Path | Purpose |
|---|---|
| supabase/migrations/20261003090000_booking_settings_and_form.sql | all four tables, enums, RLS, triggers, backfill |
| supabase/tests/06_booking_form_and_slot_engine.sql | form versioning, sensitivity, dropdown shape (part of 93 assertions) |
| supabase/tests/07_booking_rls_per_role.sql | who may read/write settings and fields (part of 54 assertions) |
| supabase/migrations/20261003170000_save_booking_settings.sql | `save_booking_settings()` + the people_per_slot guard + `branch_is_bookable()` |
| supabase/tests/08_create_booking.sql | the guard, `branch_is_bookable`, `require_client_email` (part of 134) |
| supabase/migrations/20261005100000_require_client_email.sql | the one toggleable default field; wired into both RPCs |
| **App** | |
| app/(app)/settings/index.tsx | settings hub (only Booking so far) |
| app/(app)/settings/booking.tsx | the screen: two tabs, responsive preview |
| src/features/booking-settings/bookingWarnings.ts | warning rules + buffer explanation + link state (**18 tests**) |
| src/features/booking-settings/previewSlots.ts | local sample slot grid (**19 tests**) |
| src/features/booking-settings/schemas/customField.schemas.ts | zod + option parsing (**17 tests**) |
| src/features/booking-settings/api/useBookingSettings.ts | settings read + save through the RPC |
| src/features/booking-settings/api/usePreviewCatalogue.ts | the branch's real services/staff/fields for the preview |
| src/features/booking-settings/api/useCustomFields.ts | list, save, archive, reorder |
| src/features/booking-settings/components/ | BookingSettingsForm, BookingWarnings, BookingLinkCard, BookingPreview, CustomFieldList, CustomFieldEditor |
| src/components/ui/{SegmentedControl,Collapsible,NumberStepper}.tsx | new primitives |

## Database

Tables:

- `booking_settings` → business_id, **branch_id (unique)**, online_booking_enabled,
  staff_choice, slot_display, confirmation, show_prices, slot_interval,
  buffer_minutes, minimum_notice_minutes, booking_window_days,
  customer_can_cancel, cancel_cutoff_hours, use_resources, people_per_slot
- `custom_fields` → business_id, label, field_type, help_text, is_required,
  is_sensitive, applies_to_all_services, options text[], is_active, sort_order
- `custom_field_services` → custom_field_id, service_id, business_id (PK of the first two)
- `form_versions` → business_id, version, **fields jsonb**, fields_hash
  (unique per business on both `version` and `fields_hash`)

Enums: `custom_field_type`, `staff_choice_mode`, `slot_display_mode`,
`booking_confirmation_mode`, `slot_interval_mode`.

RLS:

| Table | Read | Write |
|---|---|---|
| `booking_settings` | any member | UPDATE only, `settings.booking`. No INSERT/DELETE policy — the trigger owns the lifecycle. |
| `custom_fields` | any member | `settings.booking` |
| `custom_field_services` | any member | `settings.booking` |
| `form_versions` | any member | **nobody** (DB-created only, like `audit_logs`) |

`anon` has no grant and no policy on any of them.

Functions:

- `build_form_fields_snapshot(business_id) → jsonb` — the active field set in
  snapshot shape, ordered so the digest is deterministic.
- `ensure_form_version(business_id) → uuid` — returns the version matching the
  current field set, creating it if new. Serialised with
  `pg_advisory_xact_lock` so two concurrent edits cannot race on `max(version)+1`.
- `create_default_booking_settings()`, `create_initial_form_version()`,
  `touch_form_version()`, `enforce_custom_field_guard()`,
  `escalate_sensitive_answers()`, tenant guards — all triggers, no EXECUTE for
  anon or authenticated.

Migrations: `20261003090000_booking_settings_and_form.sql`,
plus the two `created_by` indexes added in `20261003100000_clients_and_appointments.sql`.

## Data & caching

Not wired yet (no UI). When built: settings are `staleTimes.static` (5–10 min)
— they change rarely and every booking screen reads them.

## Permissions & gating

- `settings.booking` to edit settings and the form. Owner + Manager (doc §9).
- Reading needs only membership.
- No plan or add-on gate: booking is core (doc §6).

## UI

`/settings/booking`, reached from the Settings hub. Two tabs: **Settings** and
**Booking form**. The warnings and the booking link stay visible on both, because
they describe the branch as a whole.

**Settings tab** — Basics visible, Advanced collapsed (doc §6.2). Each setting's
hint changes WITH the setting, so the owner reads what their own choice does
rather than a description of all three options. Saves only the changed keys.

**Booking form tab** — the fixed default fields (locked, with reasons) then the
owner's own questions: create, edit, reorder, archive, restore. Sensitive can only
be escalated, with a confirm dialog that says it also escalates existing answers.
The answer type is frozen after the first save.

**Live preview** (doc §6.2 requires it beside the settings):
- desktop ≥1024 — a second 400px column, permanently visible
- mobile/tablet — a "Show customer preview" button opening a full-screen `Drawer`,
  because a 375px column cannot show both and the preview is consulted, not edited

It renders the **real catalogue** (the owner's own service names and prices) with
**locally generated sample times**, and uses the same components step 5 will use
for the real page (`src/features/booking-public/components/`).

Mobile-first: every screen checked at 375px, then 1280px.

## i18n

`common.json`, three groups: `bookingSettings.*` (the screen), `bookingFields.*`
(the form builder), `bookingPublic.*` (the customer-facing components, reused by
step 5). **152 literal keys verified to resolve** by a script that walks the
feature and checks each against the locale file.

## Known limits / TODO

- **`people_per_slot` is per BRANCH, not per service** (doc §6.2 defines it that
  way). A branch therefore cannot have 1:1 haircuts and a 10-person class at the
  same time. Noted as a product limitation; revisit if a real customer needs it.
- **Changing `people_per_slot` downward is now guarded** (see Business rules).
  Going from 1 to 3 is always allowed. Old rows are never rewritten, so a slot
  booked under the old limit keeps its bookings and reads as over the new limit
  until those appointments pass — accepted deliberately: the alternative is
  cancelling someone's booking because a setting changed.
- `custom_fields` has no per-branch scope. Doc §6.1 describes one form per
  business; a per-branch form would also multiply versions.
- `buffer_minutes` exists on both `booking_settings` (branch default) and
  `services` (per-service). The engine uses the service value when it is > 0,
  else the branch default. Worth stating plainly in the settings UI.

## Known limits / TODO (UI)

- **`Drawer` has no `KeyboardAvoidingView`** (pre-existing, affects 4 forms:
  CustomFieldEditor plus ServiceForm, StaffForm and the schedule lists from
  earlier phases). On Android a focused input near the bottom of a drawer can sit
  under the keyboard. It does apply `insets.bottom` to the footer and
  `keyboardShouldPersistTaps`. **Not fixed here** — the fix belongs in `Drawer`
  and would change three features outside this session's scope.
- **The preview models only the interval and the service duration**, not breaks,
  time off, closures, buffers, notice or the window. Modelling those would make it
  a second engine implementation that quietly disagrees with the real one. The
  header says "sample times".
- **The honeypot's HTML is not implemented** — no public page yet. Step 5 must
  hide `company_website` with `position:absolute;left:-9999px`, **not**
  `type="hidden"` or `display:none` (better bots skip both), plus
  `autocomplete="off"` and `tabindex="-1"`.
- **`useSaveCustomField` is not atomic**: the field row and its
  `custom_field_services` rows are separate writes, the same limitation
  `useSaveService`/`useSaveStaff` have. Blast radius is a question asked on the
  wrong services, fixable by saving again.
- **Reordering is two writes**, so a failure between them leaves an unexpected but
  valid order. Order is display-only, so not worth an RPC.
- **Android never run** (no emulator). Reviewed in code at the end of the task.

## Changelog
- 2026-10-20: new warning `no_staff_hours` (branch_is_bookable), fix route /staff.
- 2026-10-07 (Phase 7B): the booking link is now `<site>/<slug>/book` (`/<slug>` is the website); the link card adds "Your website is not published yet, but your booking link works." for people who can read the website row.

- 2026-10-04: **Settings UI** (step 4): two tabs, live preview, warnings with fix
  routes, booking link gated on `branch_is_bookable`, custom fields editor.
  `require_client_email` added. 54 new unit tests.
- 2026-10-03: `save_booking_settings()` with the people_per_slot downgrade guard,
  and `branch_is_bookable()` for the "don't show the link yet" rule.
- 2026-10-03: Tables, enums, RLS, auto-create trigger, backfill, form
  versioning with digest-based dedupe and sensitivity escalation.
