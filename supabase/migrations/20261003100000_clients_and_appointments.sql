-- Phase 3, part 2: clients, appointments, answers and guest manage tokens.
--
-- clients, appointments, appointment_field_values, booking_manage_tokens,
-- plus the no-double-booking exclusion constraints.
--
-- Shape decisions, and why:
--
-- * **A client belongs to the BUSINESS, not the branch.** The same person books
--   at two branches of one salon and is one client with one history (doc §6.3,
--   "visit and invoice history"). `appointments.branch_id` records where they
--   went. Uniqueness is therefore `(business_id, phone_e164)`.
--
-- * **Phone is the identity, email is optional** (doc §6.1). Stored in E.164
--   (`+447700900123`), normalised server-side, so the same person typing
--   "07700 900123" and "+44 7700 900123" is one client. The unique index covers
--   live rows only, so a soft-deleted client does not block a new booking.
--
-- * **A public booking never overwrites an existing client.** It fills empty
--   fields only (`coalesce(existing, new)`), because the owner's own correction
--   of a client's name must survive the customer's next typo. And it never
--   reveals whether the phone was already known: the booking RPC returns the
--   same shape either way.
--
-- * **appointments stores `starts_at`/`ends_at` as timestamptz (UTC)** plus the
--   branch's `timezone` snapshot is NOT stored — the branch owns it (decision
--   23) and it does not change under a business. Slot maths converts at query
--   time. `duration_minutes` and `buffer_minutes` are snapshotted, because a
--   service's duration may change tomorrow and this appointment's length is a
--   historical fact.
--
-- * **`is_exclusive`** is true when `people_per_slot` was 1 at booking time.
--   The exclusion constraints below only consider exclusive rows, so a group
--   class (people_per_slot > 1) is not refused by the DB. Group capacity is a
--   counted check inside the booking RPC under an advisory lock — a weaker
--   guarantee, documented in context/_database.md.
--
-- * **The exclusion constraints use the real `starts_at`/`ends_at`**, not
--   start..end+buffer. The buffer is a scheduling courtesy, not a physical
--   conflict: the slot engine hides buffered slots and the booking RPC
--   re-checks the buffer, but a receptionist overriding a buffer in the
--   dashboard (Phase 4) must not be blocked by a database constraint.
--
-- * **'pending' holds the slot.** With confirmation = 'owner approves', the
--   appointment exists from the moment the customer books, so two customers
--   cannot both be waiting for approval on the same slot. The partial predicate
--   excludes only 'cancelled' and 'no_show'.
--
-- * **booking_manage_tokens stores only a sha256 hash**, like
--   `business_members.invite_token_hash`. A leaked database backup must not
--   hand someone the power to cancel every appointment.

-- ---------------------------------------------------------------------------
-- Enum: the full status set (doc §6.3)
-- ---------------------------------------------------------------------------
-- Created in full now, though Phase 3 only drives pending -> confirmed and
-- -> cancelled. An enum rather than text + check: the set is closed by the
-- product doc, and `alter type ... add value` extends it in one line when a
-- real need appears (the only cost is that it cannot run inside a transaction
-- with other DDL on the same type).
create type public.appointment_status as enum (
  'pending',     -- booked, waiting for the owner to approve (confirmation = manual)
  'confirmed',   -- going ahead
  'completed',   -- happened
  'cancelled',   -- called off by anyone
  'no_show'      -- the client did not arrive
);

comment on type public.appointment_status is
  'Doc §6.3. pending is used when booking_settings.confirmation = manual and it HOLDS THE SLOT.';

-- Who made the booking. Useful for reports and for deciding whether a guest
-- manage token exists at all.
create type public.booking_source as enum (
  'online',      -- the public booking page
  'dashboard',   -- staff or receptionist (Phase 4)
  'walk_in',     -- added after the client arrived (Phase 4)
  'portal'       -- the client portal add-on (Phase 10)
);

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  full_name text not null,
  -- E.164, always. Normalised by normalise_phone_e164() before insert.
  phone_e164 text not null,
  email extensions.citext,
  -- Free notes, gated by clients.view_contact / view_sensitive in the UI.
  notes text,
  -- Which branch they first came to. Informational only: a client is
  -- business-wide and may be seen at any branch.
  first_branch_id uuid references public.branches (id) on delete set null,
  -- Where the record came from, for reports and for GDPR provenance.
  source public.booking_source not null default 'online',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,

  constraint clients_name_length check (char_length(full_name) between 1 and 160),
  -- E.164: a '+', a non-zero country digit, then 1–14 more digits.
  constraint clients_phone_e164_format check (phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  constraint clients_notes_length check (notes is null or char_length(notes) <= 5000)
);

comment on table public.clients is
  'A customer of the BUSINESS (not the branch), identified by phone in E.164. A repeat booking attaches to the existing row and never overwrites it.';
comment on column public.clients.phone_e164 is
  'E.164, normalised server-side. The identity: unique per business among live rows.';

-- The identity rule. Partial on deleted_at so a soft-deleted client does not
-- permanently block that number.
create unique index clients_unique_phone
  on public.clients (business_id, phone_e164)
  where deleted_at is null;

create index clients_business_idx
  on public.clients (business_id) where deleted_at is null;
create index clients_email_idx
  on public.clients (business_id, email) where deleted_at is null and email is not null;
-- Phase 4 client search is server-side (CLAUDE.md §6).
create index clients_name_trgm_idx
  on public.clients using gin (full_name extensions.gin_trgm_ops);
create index clients_phone_trgm_idx
  on public.clients using gin (phone_e164 extensions.gin_trgm_ops);
create index clients_first_branch_idx
  on public.clients (first_branch_id) where first_branch_id is not null;
create index clients_created_by_idx
  on public.clients (created_by) where created_by is not null;

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- --- Phone normalisation ---------------------------------------------------
-- Strips spaces, dashes, brackets and dots; turns a leading '00' into '+';
-- turns a national leading '0' into the given dialling code. Deliberately
-- simple and NOT a libphonenumber replacement: it guarantees the stored shape
-- is E.164-looking and stable, which is what the identity rule needs. Real
-- per-country validation (correct length, valid mobile prefix) belongs to the
-- client-side PhoneInput and to the zod schema in the Edge Function.
create or replace function public.normalise_phone_e164(
  p_input text,
  p_default_dial_code text default null
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_input is null then
    return null;
  end if;

  -- Keep only '+' and digits.
  v := regexp_replace(p_input, '[^0-9+]', '', 'g');
  -- A '+' is only meaningful at the front: remember whether there was one,
  -- then strip every '+' so "+44+7..." cannot survive.
  if left(v, 1) = '+' then
    v := '+' || regexp_replace(v, '\+', '', 'g');
  else
    v := regexp_replace(v, '\+', '', 'g');
  end if;

  if v = '' or v = '+' then
    return null;
  end if;

  if left(v, 1) = '+' then
    -- already international
    null;
  elsif left(v, 2) = '00' then
    -- 00 44 ... -> +44 ...
    v := '+' || substr(v, 3);
  elsif left(v, 1) = '0' and p_default_dial_code is not null then
    -- national format: drop the trunk 0, prepend the branch's dialling code.
    v := '+' || regexp_replace(p_default_dial_code, '[^0-9]', '', 'g') || substr(v, 2);
  elsif p_default_dial_code is not null then
    -- no trunk prefix at all (common in several countries)
    v := '+' || regexp_replace(p_default_dial_code, '[^0-9]', '', 'g') || v;
  else
    v := '+' || v;
  end if;

  if v !~ '^\+[1-9][0-9]{1,14}$' then
    return null;
  end if;

  return v;
end;
$$;

comment on function public.normalise_phone_e164 is
  'Best-effort E.164 normalisation so the same person is one client. NOT full per-country validation: that is the PhoneInput''s and the zod schema''s job.';

-- ---------------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  -- RESTRICT, not CASCADE: deleting a client must not silently erase their
  -- history. Clients are soft-deleted anyway.
  client_id uuid not null references public.clients (id) on delete restrict,
  service_id uuid not null references public.services (id) on delete restrict,
  -- NULL is possible only where staff_choice = 'hidden' AND the branch has no
  -- staff at all. The booking RPC always resolves an actual staff member ("Any
  -- staff" picks the least-loaded one), so in practice this is set.
  staff_id uuid references public.staff_profiles (id) on delete restrict,
  -- Set only when booking_settings.use_resources is on.
  resource_id uuid references public.resources (id) on delete restrict,

  -- UTC instants. Slot maths converts to the branch timezone at query time.
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Snapshotted from the service at booking time: this appointment's length is
  -- a historical fact and must not move when the service is edited.
  duration_minutes integer not null,
  buffer_minutes integer not null default 0,

  status public.appointment_status not null default 'confirmed',
  source public.booking_source not null default 'online',

  -- The customer's "Notes" field from the booking form (doc §6.1).
  client_notes text,
  -- Staff-only notes (Phase 4).
  internal_notes text,

  -- Which form the customer filled in. NOT NULL: every booking is answerable.
  form_version_id uuid not null references public.form_versions (id) on delete restrict,

  -- True when people_per_slot was 1 at booking time. The exclusion constraints
  -- only consider exclusive rows, so a group class is not refused by the DB.
  is_exclusive boolean not null default true,

  -- Price shown on the public page, snapshotted so a later price change does
  -- not rewrite what the customer was quoted. Currency comes from the branch.
  price_minor bigint,

  cancelled_at timestamptz,
  cancelled_by_guest boolean not null default false,
  cancellation_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,

  constraint appointments_end_after_start check (ends_at > starts_at),
  constraint appointments_duration_positive check (duration_minutes between 1 and 1440),
  constraint appointments_buffer_range check (buffer_minutes between 0 and 1440),
  constraint appointments_price_non_negative check (price_minor is null or price_minor >= 0),
  constraint appointments_client_notes_length check (client_notes is null or char_length(client_notes) <= 2000),
  constraint appointments_internal_notes_length check (internal_notes is null or char_length(internal_notes) <= 5000),
  constraint appointments_cancel_reason_length check (cancellation_reason is null or char_length(cancellation_reason) <= 500),
  -- A cancelled row carries its timestamp, and only a cancelled row does.
  constraint appointments_cancelled_consistency check (
    (status = 'cancelled') = (cancelled_at is not null)
  )
);

comment on table public.appointments is
  'A booking. UTC instants; slots computed in the branch timezone. duration/buffer/price are snapshots. No double-booking is a DB guarantee for exclusive rows.';
comment on column public.appointments.is_exclusive is
  'people_per_slot was 1 at booking time. Only exclusive rows take part in the no-double-booking exclusion constraints.';
comment on column public.appointments.buffer_minutes is
  'Snapshot of the gap after this appointment. Enforced by the slot engine and re-checked by the booking RPC, NOT by the exclusion constraint.';
comment on column public.appointments.status is
  'pending HOLDS THE SLOT (manual confirmation). Only cancelled and no_show release it.';

-- --- The guarantee: no double-booking (doc §6.2, §11) ---------------------
-- btree_gist is already installed (Phase 1).
--
-- Partial predicate, deliberately: a cancelled or no-show appointment frees its
-- slot, a soft-deleted one does not exist, and a non-exclusive (group) booking
-- is governed by the counted check in the booking RPC instead.
alter table public.appointments
  add constraint appointments_no_staff_double_booking
  exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (
    staff_id is not null
    and is_exclusive
    and deleted_at is null
    and status not in ('cancelled', 'no_show')
  );

-- The same for a room/chair/bay, when the branch uses resources.
-- A resource with capacity > 1 is NOT handled here (one row per booking would
-- block the second customer); capacity is checked in the booking RPC.
alter table public.appointments
  add constraint appointments_no_resource_double_booking
  exclude using gist (
    resource_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (
    resource_id is not null
    and is_exclusive
    and deleted_at is null
    and status not in ('cancelled', 'no_show')
  );

create index appointments_business_idx on public.appointments (business_id) where deleted_at is null;
-- The calendar's main query: a branch's day, in order.
create index appointments_branch_starts_idx
  on public.appointments (branch_id, starts_at)
  where deleted_at is null;
-- The slot engine's main query: who is busy in this window.
create index appointments_staff_range_idx
  on public.appointments using gist (tstzrange(starts_at, ends_at, '[)'))
  where deleted_at is null;
create index appointments_client_idx on public.appointments (client_id) where deleted_at is null;
create index appointments_service_idx on public.appointments (service_id);
create index appointments_staff_idx on public.appointments (staff_id) where staff_id is not null;
create index appointments_resource_idx on public.appointments (resource_id) where resource_id is not null;
create index appointments_form_version_idx on public.appointments (form_version_id);
create index appointments_created_by_idx on public.appointments (created_by) where created_by is not null;
-- "Today, pending approval" and status filters.
create index appointments_status_idx
  on public.appointments (branch_id, status, starts_at)
  where deleted_at is null;

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- --- Tenant guard ---------------------------------------------------------
-- RLS checks the caller; this checks the data. Every referenced row must belong
-- to the same business, and the branch-scoped ones to the same branch.
create or replace function public.enforce_appointment_tenant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_other uuid;
  v_branch uuid;
begin
  select business_id into v_other from public.branches where id = new.branch_id;
  if v_other is null or v_other <> new.business_id then
    raise exception 'Branch belongs to a different business' using errcode = '23514';
  end if;

  select business_id into v_other from public.clients where id = new.client_id;
  if v_other is null or v_other <> new.business_id then
    raise exception 'Client belongs to a different business' using errcode = '23514';
  end if;

  select business_id into v_other from public.services where id = new.service_id;
  if v_other is null or v_other <> new.business_id then
    raise exception 'Service belongs to a different business' using errcode = '23514';
  end if;

  if new.staff_id is not null then
    select business_id into v_other from public.staff_profiles where id = new.staff_id;
    if v_other is null or v_other <> new.business_id then
      raise exception 'Staff member belongs to a different business' using errcode = '23514';
    end if;
  end if;

  -- A resource lives at one branch, so it must be THIS branch.
  if new.resource_id is not null then
    select business_id, branch_id into v_other, v_branch
    from public.resources where id = new.resource_id;
    if v_other is null or v_other <> new.business_id or v_branch <> new.branch_id then
      raise exception 'Resource belongs to a different business or branch' using errcode = '23514';
    end if;
  end if;

  select business_id into v_other from public.form_versions where id = new.form_version_id;
  if v_other is null or v_other <> new.business_id then
    raise exception 'Form version belongs to a different business' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger appointments_tenant_guard
  before insert or update on public.appointments
  for each row execute function public.enforce_appointment_tenant();

-- ---------------------------------------------------------------------------
-- appointment_field_values: one row per answer
-- ---------------------------------------------------------------------------
-- One row per answer rather than a jsonb blob on the appointment, because a
-- sensitive answer has to be withheld per field (doc §6.1) and a column is the
-- only honest way to do that with RLS. The form version travels on each row too
-- so the labels are never ambiguous.
create table public.appointment_field_values (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  -- RESTRICT: a field definition with answers must be deactivated, not deleted.
  custom_field_id uuid not null references public.custom_fields (id) on delete restrict,
  form_version_id uuid not null references public.form_versions (id) on delete restrict,
  -- The answer, as text, validated against the snapshot before it got here.
  -- Text for every type: a yes_no is 'true'/'false', a number is its digits.
  -- One column, so the sensitive gate is one rule, and the snapshot says how to
  -- parse it back.
  value text,
  -- Copied from the field AT ANSWER TIME, and then only ever escalated: see
  -- escalate_sensitive_answers() below. The RLS gate reads this column, so the
  -- check never has to join to custom_fields.
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now(),

  -- One answer per field per appointment.
  unique (appointment_id, custom_field_id),
  constraint appointment_field_values_length check (value is null or char_length(value) <= 4000)
);

comment on table public.appointment_field_values is
  'One row per custom-field answer. is_sensitive is copied at answer time and can only escalate; the RLS gate reads it directly.';
comment on column public.appointment_field_values.value is
  'Always text. yes_no = true/false, number = digits. The form snapshot says how to parse it.';
comment on column public.appointment_field_values.is_sensitive is
  'Copied from the field. Marking a field sensitive escalates EVERY existing answer, including old ones.';

create index appointment_field_values_appointment_idx
  on public.appointment_field_values (appointment_id);
create index appointment_field_values_field_idx
  on public.appointment_field_values (custom_field_id);
create index appointment_field_values_business_idx
  on public.appointment_field_values (business_id);
create index appointment_field_values_form_version_idx
  on public.appointment_field_values (form_version_id);

-- Now that appointment_field_values exists, attach the custom_fields guard
-- (defined in part 1, which could not reference this table yet).
create trigger custom_fields_guard
  before update on public.custom_fields
  for each row execute function public.enforce_custom_field_guard();

-- --- Sensitivity only ever escalates ------------------------------------
-- Marking a field sensitive must cover the answers already captured: the
-- customer's old answer to "any allergies?" is no less sensitive than tomorrow's.
create or replace function public.escalate_sensitive_answers()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_sensitive and not old.is_sensitive then
    update public.appointment_field_values
    set is_sensitive = true
    where custom_field_id = new.id and not is_sensitive;
  end if;
  return null;
end;
$$;

comment on function public.escalate_sensitive_answers is
  'Marking a field sensitive escalates every existing answer. The flag can only go one way (enforce_custom_field_guard refuses the reverse).';

create trigger custom_fields_escalate_sensitive
  after update of is_sensitive on public.custom_fields
  for each row execute function public.escalate_sensitive_answers();

-- An answer must belong to the same business as its appointment and field.
create or replace function public.enforce_field_value_tenant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_other uuid;
begin
  select business_id into v_other from public.appointments where id = new.appointment_id;
  if v_other is null or v_other <> new.business_id then
    raise exception 'Appointment belongs to a different business' using errcode = '23514';
  end if;

  select business_id into v_other from public.custom_fields where id = new.custom_field_id;
  if v_other is null or v_other <> new.business_id then
    raise exception 'Custom field belongs to a different business' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger appointment_field_values_tenant_guard
  before insert or update on public.appointment_field_values
  for each row execute function public.enforce_field_value_tenant();

-- ---------------------------------------------------------------------------
-- booking_manage_tokens: the guest cancel/reschedule link
-- ---------------------------------------------------------------------------
-- Designed now, used by step 6. Doc §13: "unguessable, expiring and
-- single-booking scoped".
--
-- * **Only the sha256 hash is stored**, like invite_token_hash. The plaintext
--   exists once, in the response that goes into the link, and is never
--   recoverable from the database.
-- * **Scoped to one appointment.** One live token per appointment; a "resend"
--   from the dashboard issues a new one and revokes the old.
-- * **Expires at the appointment's end.** After that there is nothing to
--   cancel or reschedule.
create table public.booking_manage_tokens (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  -- sha256 of a >= 128-bit random value, hex. Never the token itself.
  token_hash text not null unique,
  -- The appointment's ends_at at issue time; a reschedule reissues the token.
  expires_at timestamptz not null,
  -- Set when the appointment is cancelled, or when a newer token replaces this
  -- one. A revoked row is kept so an abuse investigation has a trail.
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,

  constraint booking_manage_tokens_hash_format check (token_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.booking_manage_tokens is
  'Guest cancel/reschedule link. Only the sha256 hash is stored; scoped to one appointment; expires at the appointment end; revoked on cancel or on resend.';
comment on column public.booking_manage_tokens.revoked_at is
  'Set on cancellation or when a resend issues a replacement. The row is kept for the audit trail.';

-- At most one live token per appointment.
create unique index booking_manage_tokens_one_live
  on public.booking_manage_tokens (appointment_id)
  where revoked_at is null;

create index booking_manage_tokens_appointment_idx
  on public.booking_manage_tokens (appointment_id);
create index booking_manage_tokens_business_idx
  on public.booking_manage_tokens (business_id);
create index booking_manage_tokens_created_by_idx
  on public.booking_manage_tokens (created_by) where created_by is not null;

create or replace function public.enforce_manage_token_tenant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_other uuid;
begin
  select business_id into v_other from public.appointments where id = new.appointment_id;
  if v_other is null or v_other <> new.business_id then
    raise exception 'Appointment belongs to a different business' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger booking_manage_tokens_tenant_guard
  before insert or update on public.booking_manage_tokens
  for each row execute function public.enforce_manage_token_tenant();

-- ---------------------------------------------------------------------------
-- Missing FK indexes the performance advisor flagged on part 1
-- ---------------------------------------------------------------------------
create index booking_settings_created_by_idx
  on public.booking_settings (created_by) where created_by is not null;
create index custom_fields_created_by_idx
  on public.custom_fields (created_by) where created_by is not null;

-- ---------------------------------------------------------------------------
-- Scope helper: "do you hold this at branch scope or wider?"
-- ---------------------------------------------------------------------------
-- `has_permission()` deliberately ignores `own`: it answers "do you hold this
-- permission anywhere relevant to this branch", and the Own-scope row check is
-- left to the policy (this is how the Phase 2 schedule tables work, with
-- is_own_staff_profile()).
--
-- Appointments need the other half of that: a Staff member holds
-- appointments.view at `own` scope and must see only their own rows, while a
-- Receptionist holds it at `branch` and must see everyone's. So the policy
-- needs to know whether the grant is wider than `own`.
create or replace function public.has_permission_at_branch_scope(
  p_business_id uuid,
  p_branch_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    join public.member_role_assignments a on a.member_id = m.id
    join public.role_permissions rp on rp.role_id = a.role_id
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.deleted_at is null
      and rp.permission = p_permission
      -- The point of this function: `own` does not count.
      and rp.scope in ('branch', 'all')
      and (
        rp.scope = 'all'
        or a.branch_id is null
        or p_branch_id is null
        or a.branch_id = p_branch_id
      )
  );
$$;

comment on function public.has_permission_at_branch_scope is
  'True when the caller holds the permission at branch or all scope (NOT own). Lets a policy separate "sees the whole branch" from "sees only their own rows".';

revoke all on function public.has_permission_at_branch_scope(uuid, uuid, text) from public;
revoke execute on function public.has_permission_at_branch_scope(uuid, uuid, text) from anon;
grant execute on function public.has_permission_at_branch_scope(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- anon has no policy on any of these tables and never will. The public booking
-- page goes through Edge Functions with the service role.
alter table public.clients enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_field_values enable row level security;
alter table public.booking_manage_tokens enable row level security;

-- --- clients -------------------------------------------------------------
-- `clients.view` to see the list. Contact details and sensitive fields are
-- column-level concerns the UI gates with clients.view_contact /
-- clients.view_sensitive; RLS is the row boundary.
--
-- Own scope matters here: the Phase 1 seed grants Staff `clients.view` at
-- `own` scope with the stated intent "their own clients" (see the comment in
-- 20261001184000_permissions_and_roles.sql). For a client that means **a client
-- they have an appointment with** — a stylist should not be able to page
-- through the salon's whole customer list. Receptionist and above hold it at
-- `branch`/`all` and see everyone.
create policy clients_select on public.clients
  for select to authenticated
  using (
    public.is_super_admin()
    or (
      public.can(business_id, null, 'clients.view')
      and (
        public.has_permission_at_branch_scope(business_id, null, 'clients.view')
        or exists (
          select 1
          from public.appointments a
          where a.client_id = clients.id
            and a.deleted_at is null
            and a.staff_id is not null
            and public.is_own_staff_profile(a.staff_id)
        )
      )
    )
  );
create policy clients_insert on public.clients
  for insert to authenticated
  with check (public.can(business_id, null, 'clients.create'));
create policy clients_update on public.clients
  for update to authenticated
  using (public.can(business_id, null, 'clients.edit'))
  with check (public.can(business_id, null, 'clients.edit'));
-- No DELETE policy: clients are soft-deleted (set deleted_at via UPDATE).

-- --- appointments --------------------------------------------------------
-- Own scope: a Staff member holds appointments.view at `own` scope, which must
-- mean "my own appointments". has_permission() cannot express that, so the row
-- check is explicit, exactly as the schedule tables do with
-- is_own_staff_profile().
create policy appointments_select on public.appointments
  for select to authenticated
  using (
    public.is_super_admin()
    or (
      public.can(business_id, branch_id, 'appointments.view')
      and (
        -- branch / all scope: the whole branch
        public.has_permission_at_branch_scope(business_id, branch_id, 'appointments.view')
        -- own scope: only the caller's own appointments
        or (staff_id is not null and public.is_own_staff_profile(staff_id))
      )
    )
  );
create policy appointments_insert on public.appointments
  for insert to authenticated
  with check (
    public.can(business_id, branch_id, 'appointments.create')
    and (
      public.has_permission_at_branch_scope(business_id, branch_id, 'appointments.create')
      or (staff_id is not null and public.is_own_staff_profile(staff_id))
    )
  );
create policy appointments_update on public.appointments
  for update to authenticated
  using (
    public.can(business_id, branch_id, 'appointments.edit')
    and (
      public.has_permission_at_branch_scope(business_id, branch_id, 'appointments.edit')
      or (staff_id is not null and public.is_own_staff_profile(staff_id))
    )
  )
  with check (
    public.can(business_id, branch_id, 'appointments.edit')
    and (
      public.has_permission_at_branch_scope(business_id, branch_id, 'appointments.edit')
      or (staff_id is not null and public.is_own_staff_profile(staff_id))
    )
  );
-- No DELETE policy: appointments are soft-deleted or cancelled, never removed.

-- --- appointment_field_values -------------------------------------------
-- Two rules at once:
--   1. you can see the appointment (so the business and branch boundary holds), and
--   2. a sensitive answer additionally needs clients.view_sensitive (doc §6.1).
create policy appointment_field_values_select on public.appointment_field_values
  for select to authenticated
  using (
    public.is_super_admin()
    or (
      exists (
        select 1 from public.appointments a
        where a.id = appointment_id
          and public.can(a.business_id, a.branch_id, 'appointments.view')
      )
      and (
        not is_sensitive
        or public.can(business_id, null, 'clients.view_sensitive')
      )
    )
  );
create policy appointment_field_values_insert on public.appointment_field_values
  for insert to authenticated
  with check (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_id
        and public.can(a.business_id, a.branch_id, 'appointments.create')
    )
  );
create policy appointment_field_values_update on public.appointment_field_values
  for update to authenticated
  using (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_id
        and public.can(a.business_id, a.branch_id, 'appointments.edit')
    )
    and (not is_sensitive or public.can(business_id, null, 'clients.view_sensitive'))
  )
  with check (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_id
        and public.can(a.business_id, a.branch_id, 'appointments.edit')
    )
  );

-- --- booking_manage_tokens ---------------------------------------------
-- Readable so the dashboard can show "a manage link is active" and offer a
-- resend. The hash is useless on its own, so reading it reveals nothing.
-- NO write policy: tokens are issued and revoked only by SECURITY DEFINER
-- functions (step 6), like form_versions and audit_logs.
create policy booking_manage_tokens_select on public.booking_manage_tokens
  for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.appointments a
      where a.id = appointment_id
        and public.can(a.business_id, a.branch_id, 'appointments.view')
    )
  );

-- ---------------------------------------------------------------------------
-- Function grants
-- ---------------------------------------------------------------------------
revoke all on function public.normalise_phone_e164(text, text) from public;
revoke execute on function public.normalise_phone_e164(text, text) from anon;
-- `authenticated` keeps it: the dashboard's own client form needs the same
-- normalisation as the booking RPC, and the function reads no data.
grant execute on function public.normalise_phone_e164(text, text) to authenticated;

revoke all on function public.enforce_appointment_tenant() from public;
revoke execute on function public.enforce_appointment_tenant() from anon, authenticated;
revoke all on function public.enforce_field_value_tenant() from public;
revoke execute on function public.enforce_field_value_tenant() from anon, authenticated;
revoke all on function public.enforce_manage_token_tenant() from public;
revoke execute on function public.enforce_manage_token_tenant() from anon, authenticated;
revoke all on function public.escalate_sensitive_answers() from public;
revoke execute on function public.escalate_sensitive_answers() from anon, authenticated;
