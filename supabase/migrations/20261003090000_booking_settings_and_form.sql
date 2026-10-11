-- Phase 3, part 1: booking settings and the booking form.
--
-- booking_settings, custom_fields, custom_field_services, form_versions.
--
-- Shape decisions, and why:
--
-- * **booking_settings is ONE ROW PER BRANCH**, not per business. Every value in
--   product doc §6.2 is operational (slot interval, notice, window, rooms,
--   people per slot), and operations are per location: a city branch open until
--   22:00 and a suburb branch closing at 18:00 do not share a booking window.
--   This also matches decision 23 (the branch owns country, currency, timezone).
--   A row is created automatically by a trigger on `branches`, so the table can
--   be read with a plain `=` and never needs a "fall back to the business" join.
--
-- * **Defaults are written into the column DEFAULTs**, exactly as doc §6.2
--   lists them, so a new branch is bookable with sensible behaviour before
--   anyone opens the settings screen. Changing a default later is a migration,
--   which is correct: it is a product decision.
--
-- * **Custom fields are per business, not per branch.** Doc §6.1 describes one
--   booking form for the business ("shown for all services or selected
--   services"); there is no per-branch form in the doc. A branch difference
--   would also multiply form versions.
--
-- * **form_versions is an immutable jsonb snapshot of the whole field set**, and
--   a new row is created **in the database** by a trigger whenever the field set
--   changes — not one per booking. An appointment stores `form_version_id`, so
--   the answers can always be rendered with the labels, types and options that
--   the customer actually saw, even years after the owner renamed a field.
--
--   The snapshot is the contract the booking RPC validates against, so it must
--   contain everything needed to validate: id, label, type, required, options,
--   is_sensitive, sort_order and the service scope.
--
-- * **`is_sensitive` can only escalate.** Once a field has been marked
--   sensitive, its answers — including the ones captured before the flag was
--   set — are sensitive forever. Clearing the flag would retroactively expose
--   data the customer gave under a stricter promise, so a guard trigger refuses
--   it. The gate itself lives on appointment_field_values in part 2.
--
-- * **Five field types exactly** (doc §6.1): short_text, long_text, dropdown,
--   yes_no, number. An enum, because the set is closed by the product doc and a
--   typo in a `text` column would silently create a sixth type.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.custom_field_type as enum (
  'short_text', 'long_text', 'dropdown', 'yes_no', 'number'
);

comment on type public.custom_field_type is
  'Exactly the five types in product doc §6.1. Closed set.';

-- Doc §6.2: "hidden / optional with Any staff / required; default optional".
create type public.staff_choice_mode as enum ('hidden', 'optional', 'required');

-- Doc §6.2: "only available / all with booked greyed; default only available".
create type public.slot_display_mode as enum ('only_available', 'all_greyed');

-- Doc §6.2: "auto / owner approves; default auto".
create type public.booking_confirmation_mode as enum ('auto', 'manual');

-- Doc §6.2 advanced: 15 / 30 / 60 / service length.
create type public.slot_interval_mode as enum (
  'min_15', 'min_30', 'min_60', 'service_length'
);

-- ---------------------------------------------------------------------------
-- booking_settings: one row per branch
-- ---------------------------------------------------------------------------
create table public.booking_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- One row per branch. UNIQUE, not the primary key, so the row has a stable id
  -- of its own for audit rows and for `updated_at` tracking.
  branch_id uuid not null unique references public.branches (id) on delete cascade,

  -- Is this branch taking online bookings at all? Switching it off keeps every
  -- other setting intact and makes the public page refuse politely. Checked in
  -- the Edge Function before the slot engine runs.
  online_booking_enabled boolean not null default true,

  -- --- Basic (doc §6.2) ---
  staff_choice public.staff_choice_mode not null default 'optional',
  slot_display public.slot_display_mode not null default 'only_available',
  confirmation public.booking_confirmation_mode not null default 'auto',
  show_prices boolean not null default true,

  -- --- Advanced (doc §6.2, collapsed in the UI) ---
  slot_interval public.slot_interval_mode not null default 'min_15',
  -- Extra minutes blocked AFTER an appointment, on top of the service duration.
  -- `services.buffer_minutes` is the per-service override; this is the branch
  -- default used when the service has none (0).
  buffer_minutes integer not null default 0,
  -- How soon a customer may book. Doc default: 1 hour.
  minimum_notice_minutes integer not null default 60,
  -- How far ahead. Doc default: 30 days.
  booking_window_days integer not null default 30,
  -- Doc default: customers can cancel, up to 24h before.
  customer_can_cancel boolean not null default true,
  cancel_cutoff_hours integer not null default 24,
  -- Rooms/chairs/bays. Off by default: a barber has no rooms, and switching it
  -- on without `service_resources` rows would block every slot.
  use_resources boolean not null default false,
  -- Group bookings (a yoga class). 1 = one customer per slot, the doc default.
  --
  -- LIMITATION (doc §6.2 keeps this per-branch): this is a single number for the
  -- whole branch, not per service. A branch cannot have 1:1 haircuts and a
  -- 10-person class at the same time. Noted in context/booking-settings.md.
  people_per_slot integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,

  -- Bounds exist so a typo cannot create an unusable or abusive setting.
  -- 0 buffer is valid (the doc default); a day is the ceiling.
  constraint booking_settings_buffer_range check (buffer_minutes between 0 and 1440),
  -- 0 notice = "bookable right now", which some walk-in businesses want.
  -- 30 days of notice is already extreme.
  constraint booking_settings_notice_range check (minimum_notice_minutes between 0 and 43200),
  -- At least today; two years is the ceiling (keeps the slot scan bounded).
  constraint booking_settings_window_range check (booking_window_days between 1 and 730),
  constraint booking_settings_cancel_cutoff_range check (cancel_cutoff_hours between 0 and 8760),
  constraint booking_settings_people_range check (people_per_slot between 1 and 100)
);

comment on table public.booking_settings is
  'Online booking behaviour, ONE ROW PER BRANCH (doc §6.2). Created automatically by a trigger on branches. Editing needs settings.booking.';
comment on column public.booking_settings.online_booking_enabled is
  'False = this branch is not bookable online. The Edge Function refuses before running the slot engine.';
comment on column public.booking_settings.buffer_minutes is
  'Branch default gap after an appointment. services.buffer_minutes overrides it when non-zero.';
comment on column public.booking_settings.people_per_slot is
  'Group size for the whole branch (doc §6.2). >1 is guaranteed by a counted check under an advisory lock, not by the exclusion constraint. See context/_database.md.';

create index booking_settings_business_idx
  on public.booking_settings (business_id) where deleted_at is null;

create trigger booking_settings_set_updated_at
  before update on public.booking_settings
  for each row execute function public.set_updated_at();

-- A settings row's branch must belong to its business.
create or replace function public.enforce_booking_settings_tenant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_branch_business uuid;
begin
  select business_id into v_branch_business from public.branches where id = new.branch_id;
  if v_branch_business is null or v_branch_business <> new.business_id then
    raise exception 'Branch belongs to a different business' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger booking_settings_tenant_guard
  before insert or update on public.booking_settings
  for each row execute function public.enforce_booking_settings_tenant();

-- --- Auto-create one row per branch ---------------------------------------
-- A trigger rather than a line inside `create_business_with_owner`, so EVERY
-- path that creates a branch gets a settings row: the signup RPC, the Phase 9
-- "add a branch" screen, a seed script, a hand-written INSERT.
create or replace function public.create_default_booking_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.booking_settings (business_id, branch_id)
  values (new.business_id, new.id)
  on conflict (branch_id) do nothing;
  return new;
end;
$$;

comment on function public.create_default_booking_settings is
  'AFTER INSERT on branches: gives the new branch a booking_settings row with the doc §6.2 defaults.';

create trigger branches_create_booking_settings
  after insert on public.branches
  for each row execute function public.create_default_booking_settings();

-- Backfill the branches that already exist.
insert into public.booking_settings (business_id, branch_id)
select business_id, id from public.branches
on conflict (branch_id) do nothing;

-- ---------------------------------------------------------------------------
-- custom_fields: the extra questions on the booking form
-- ---------------------------------------------------------------------------
-- The fixed fields (name, phone, email, service, date/time, notes) are columns
-- on `appointments`/`clients`, not rows here. Doc §6.1 lets the owner change
-- only "required/optional where allowed", so they need no definition table.
create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  label text not null,
  field_type public.custom_field_type not null,
  -- One line of help under the field on the public page.
  help_text text,
  is_required boolean not null default false,
  -- Answers readable only with clients.view_sensitive (doc §6.1).
  -- CAN ONLY BE TURNED ON: see enforce_custom_field_guard below.
  is_sensitive boolean not null default false,
  -- True = asked for every service. False = only for the services listed in
  -- custom_field_services. Explicit rather than "no rows means all", because
  -- "all services" and "I have not picked any yet" are different intentions.
  applies_to_all_services boolean not null default true,
  -- Dropdown choices, in display order. NULL for every other type.
  options text[],
  -- Off = keeps past answers, no longer asked. Never delete a field with
  -- answers; the snapshot keeps old bookings readable either way.
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,

  constraint custom_fields_label_length check (char_length(label) between 1 and 120),
  constraint custom_fields_help_length check (help_text is null or char_length(help_text) <= 300),
  -- A dropdown needs 2–50 non-empty, unique choices; nothing else may have any.
  constraint custom_fields_options_shape check (
    case
      when field_type = 'dropdown' then
        options is not null
        and array_length(options, 1) between 2 and 50
        and array_position(options, null) is null
        and array_position(options, '') is null
      else options is null
    end
  )
);

comment on table public.custom_fields is
  'Extra booking-form questions, per business (doc §6.1). Exactly 5 types. Sensitive answers are gated by clients.view_sensitive.';
comment on column public.custom_fields.is_sensitive is
  'Can only be turned ON. Clearing it would retroactively expose answers given under a stricter promise, so a guard trigger refuses it.';
comment on column public.custom_fields.applies_to_all_services is
  'True = every service. False = only the services in custom_field_services.';

create index custom_fields_business_idx
  on public.custom_fields (business_id) where deleted_at is null;
-- The booking page asks for the active fields of a business, in order.
create index custom_fields_active_idx
  on public.custom_fields (business_id, sort_order)
  where deleted_at is null and is_active;

create trigger custom_fields_set_updated_at
  before update on public.custom_fields
  for each row execute function public.set_updated_at();

-- A dropdown's options cannot shrink or be reordered destructively once answers
-- exist... is deliberately NOT enforced here: the snapshot in form_versions
-- already preserves what the customer saw, so the owner stays free to edit.
-- What IS enforced: the type cannot change under existing answers, and
-- is_sensitive cannot be cleared.
create or replace function public.enforce_custom_field_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.is_sensitive and not new.is_sensitive then
    raise exception 'A custom field cannot stop being sensitive; its existing answers were given under that promise'
      using errcode = '42501';
  end if;

  -- Changing the type would make old answers unreadable (a "yes" in a number
  -- field). Deactivate the field and add a new one instead.
  if old.field_type <> new.field_type
     and exists (select 1 from public.appointment_field_values v where v.custom_field_id = old.id) then
    raise exception 'A custom field with answers cannot change type; deactivate it and add a new field'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_custom_field_guard is
  'is_sensitive can only escalate; the type is frozen once answers exist.';

-- The trigger references appointment_field_values, created in part 2, so it is
-- attached there. The function is defined here next to the table it guards.

-- ---------------------------------------------------------------------------
-- custom_field_services: per-service scope
-- ---------------------------------------------------------------------------
create table public.custom_field_services (
  custom_field_id uuid not null references public.custom_fields (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (custom_field_id, service_id)
);

comment on table public.custom_field_services is
  'Which services a field is asked for. Only read when applies_to_all_services is false.';

create index custom_field_services_service_idx on public.custom_field_services (service_id);
create index custom_field_services_business_idx on public.custom_field_services (business_id);

create or replace function public.enforce_custom_field_service_tenant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_field_business uuid;
  v_service_business uuid;
begin
  select business_id into v_field_business from public.custom_fields where id = new.custom_field_id;
  select business_id into v_service_business from public.services where id = new.service_id;
  if v_field_business is null or v_service_business is null
     or v_field_business <> v_service_business
     or new.business_id <> v_field_business then
    raise exception 'Custom field and service must belong to the same business'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger custom_field_services_tenant_guard
  before insert or update on public.custom_field_services
  for each row execute function public.enforce_custom_field_service_tenant();

-- ---------------------------------------------------------------------------
-- form_versions: the immutable snapshot
-- ---------------------------------------------------------------------------
create table public.form_versions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- 1, 2, 3 ... per business, so a human can say "form version 3".
  version integer not null,
  -- The whole active field set as the customer saw it. Array of objects:
  --   { id, label, field_type, help_text, is_required, is_sensitive,
  --     applies_to_all_services, options, sort_order, service_ids }
  -- Everything the booking RPC needs to validate an answer offline.
  fields jsonb not null,
  -- A digest of `fields`, so "did anything actually change?" is one comparison
  -- rather than a jsonb diff. Also stops a no-op save creating a version.
  fields_hash text not null,
  created_at timestamptz not null default now(),

  unique (business_id, version),
  unique (business_id, fields_hash),
  constraint form_versions_fields_is_array check (jsonb_typeof(fields) = 'array')
);

comment on table public.form_versions is
  'IMMUTABLE snapshot of the whole custom-field set. A new row is created by a trigger when the field set changes, not per booking. Appointments point at one so old answers keep their original labels.';
comment on column public.form_versions.fields_hash is
  'Digest of `fields`. Unique per business, so an unchanged save reuses the existing version instead of creating a duplicate.';

create index form_versions_business_idx on public.form_versions (business_id, version desc);

-- No updated_at and no deleted_at: the row never changes and never goes away.
-- Immutability is enforced, not merely intended (doc §11 for financial records;
-- the same reasoning applies to a form the customer agreed to).
create or replace function public.enforce_form_version_immutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'form_versions rows are immutable'
    using errcode = '42501';
end;
$$;

create trigger form_versions_immutable
  before update or delete on public.form_versions
  for each row execute function public.enforce_form_version_immutable();

-- --- Building a version ----------------------------------------------------
-- Pure function: the current active field set of a business as the snapshot
-- shape. Used by the trigger below and by the booking RPC's validation.
create or replace function public.build_form_fields_snapshot(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'label', f.label,
        'field_type', f.field_type,
        'help_text', f.help_text,
        'is_required', f.is_required,
        'is_sensitive', f.is_sensitive,
        'applies_to_all_services', f.applies_to_all_services,
        'options', coalesce(to_jsonb(f.options), 'null'::jsonb),
        'sort_order', f.sort_order,
        'service_ids', coalesce(
          (select jsonb_agg(cfs.service_id order by cfs.service_id)
           from public.custom_field_services cfs
           where cfs.custom_field_id = f.id),
          '[]'::jsonb
        )
      )
      -- Ordered, so the hash is stable: the same field set must always produce
      -- the same digest, whatever order Postgres happened to return the rows.
      order by f.sort_order, f.id
    ),
    '[]'::jsonb
  )
  from public.custom_fields f
  where f.business_id = p_business_id
    and f.deleted_at is null
    and f.is_active;
$$;

comment on function public.build_form_fields_snapshot is
  'The business''s active custom fields in snapshot shape, ordered so the hash is deterministic.';

-- Creates a new version when, and only when, the field set actually changed.
-- SECURITY DEFINER because the caller (a trigger on custom_fields) may not hold
-- an INSERT policy on form_versions — nobody does; versions are DB-made only.
create or replace function public.ensure_form_version(p_business_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields jsonb;
  v_hash text;
  v_id uuid;
begin
  v_fields := public.build_form_fields_snapshot(p_business_id);
  v_hash := extensions.digest(v_fields::text, 'sha256')::text;

  select id into v_id
  from public.form_versions
  where business_id = p_business_id and fields_hash = v_hash;

  if v_id is not null then
    return v_id;
  end if;

  -- Serialise version numbering per business. Two concurrent field edits would
  -- otherwise race on `max(version) + 1` and one would hit the unique index.
  perform pg_advisory_xact_lock(hashtext('form_version:' || p_business_id::text));

  -- Re-check: the other transaction may have inserted this exact set.
  select id into v_id
  from public.form_versions
  where business_id = p_business_id and fields_hash = v_hash;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.form_versions (business_id, version, fields, fields_hash)
  values (
    p_business_id,
    coalesce((select max(version) from public.form_versions where business_id = p_business_id), 0) + 1,
    v_fields,
    v_hash
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.ensure_form_version is
  'Returns the form version matching the business''s current field set, creating it if new. Called by a trigger on custom_fields and by the booking RPC.';

-- The trigger: any change to the field set bumps the version IN THE SAME
-- TRANSACTION, so a booking can never reference a stale snapshot.
create or replace function public.touch_form_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_business_id uuid;
begin
  v_business_id := coalesce(new.business_id, old.business_id);
  perform public.ensure_form_version(v_business_id);
  return null;  -- AFTER trigger
end;
$$;

comment on function public.touch_form_version is
  'AFTER trigger on custom_fields / custom_field_services: creates a form version when the field set changes.';

create trigger custom_fields_touch_form_version
  after insert or update or delete on public.custom_fields
  for each row execute function public.touch_form_version();

create trigger custom_field_services_touch_form_version
  after insert or update or delete on public.custom_field_services
  for each row execute function public.touch_form_version();

-- Every business needs a version 1 (the empty form) so a booking made before
-- anyone adds a custom field still has something to point at.
do $$
declare
  r record;
begin
  for r in select id from public.businesses loop
    perform public.ensure_form_version(r.id);
  end loop;
end;
$$;

-- ...and so does a business created from now on.
create or replace function public.create_initial_form_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.ensure_form_version(new.id);
  return null;
end;
$$;

create trigger businesses_create_initial_form_version
  after insert on public.businesses
  for each row execute function public.create_initial_form_version();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- anon gets no policy on any of these tables. The public booking page reads
-- them through an Edge Function using the service role, which bypasses RLS and
-- returns only the fields the page needs (decision: anon has no DB surface).
alter table public.booking_settings enable row level security;
alter table public.custom_fields enable row level security;
alter table public.custom_field_services enable row level security;
alter table public.form_versions enable row level security;

-- booking_settings: readable by any member (the calendar and the booking page
-- preview need it), writable with settings.booking.
-- No INSERT policy and no DELETE policy: the trigger owns the row's lifecycle,
-- one per branch, for as long as the branch exists.
create policy booking_settings_select on public.booking_settings
  for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy booking_settings_update on public.booking_settings
  for update to authenticated
  using (public.can(business_id, branch_id, 'settings.booking'))
  with check (public.can(business_id, branch_id, 'settings.booking'));

-- custom_fields: the form is part of booking settings (doc §9 gives Manager
-- "Booking settings"), so settings.booking governs it.
create policy custom_fields_select on public.custom_fields
  for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy custom_fields_insert on public.custom_fields
  for insert to authenticated
  with check (public.can(business_id, null, 'settings.booking'));
create policy custom_fields_update on public.custom_fields
  for update to authenticated
  using (public.can(business_id, null, 'settings.booking'))
  with check (public.can(business_id, null, 'settings.booking'));
create policy custom_fields_delete on public.custom_fields
  for delete to authenticated
  using (public.can(business_id, null, 'settings.booking'));

create policy custom_field_services_select on public.custom_field_services
  for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy custom_field_services_insert on public.custom_field_services
  for insert to authenticated
  with check (public.can(business_id, null, 'settings.booking'));
create policy custom_field_services_delete on public.custom_field_services
  for delete to authenticated
  using (public.can(business_id, null, 'settings.booking'));

-- form_versions: readable by members (to render an old booking's answers).
-- NO write policy of any kind — like audit_logs. Versions are created only by
-- the SECURITY DEFINER trigger, and the immutability trigger refuses the rest.
create policy form_versions_select on public.form_versions
  for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Function grants
-- ---------------------------------------------------------------------------
-- Supabase grants EXECUTE on a new public function to anon AND authenticated by
-- default, and `revoke ... from public` does not undo it. Revoke explicitly.
revoke all on function public.build_form_fields_snapshot(uuid) from public;
revoke execute on function public.build_form_fields_snapshot(uuid) from anon, authenticated;

revoke all on function public.ensure_form_version(uuid) from public;
revoke execute on function public.ensure_form_version(uuid) from anon, authenticated;

-- Trigger functions are never called directly.
revoke all on function public.enforce_booking_settings_tenant() from public;
revoke execute on function public.enforce_booking_settings_tenant() from anon, authenticated;
revoke all on function public.create_default_booking_settings() from public;
revoke execute on function public.create_default_booking_settings() from anon, authenticated;
revoke all on function public.enforce_custom_field_guard() from public;
revoke execute on function public.enforce_custom_field_guard() from anon, authenticated;
revoke all on function public.enforce_custom_field_service_tenant() from public;
revoke execute on function public.enforce_custom_field_service_tenant() from anon, authenticated;
revoke all on function public.enforce_form_version_immutable() from public;
revoke execute on function public.enforce_form_version_immutable() from anon, authenticated;
revoke all on function public.touch_form_version() from public;
revoke execute on function public.touch_form_version() from anon, authenticated;
revoke all on function public.create_initial_form_version() from public;
revoke execute on function public.create_initial_form_version() from anon, authenticated;
