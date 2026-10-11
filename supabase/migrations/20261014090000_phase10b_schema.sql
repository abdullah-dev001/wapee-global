-- Phase 10B (1/3): schema for the add-ons "Files & Photos" (feature files_photos) and
-- "Forms & Consent" (feature forms_consent).
--
-- Decided with the user (2026-10-07):
--   * files: jpeg/png/webp/pdf only (no HEIC), 10 MB, 5,000 live files per business, PRIVATE
--     bucket, no storage policy at all (so nothing can list, read or write through the API); every
--     read is a short-lived signed URL minted by an Edge Function AFTER an RPC checked permission
--     and client scope; type is checked on the object's first bytes by the Edge Function
--   * photo consent per client (date + who, audited); an IMAGE upload is refused without it,
--     documents (PDF) stay allowed
--   * forms attach to services but never block a booking or a visit
--   * the signature is stored as vector strokes in the immutable signed row (no bucket file)
--   * Staff get files.upload at OWN scope (their own clients only)
--
-- Everything is written ONLY by SECURITY DEFINER RPCs (migrations 2-3). `authenticated` gets no
-- table privileges on sensitive tables; the few readable tables get column-level SELECT.

-- ---------------------------------------------------------------------------
-- The private bucket. No policies on storage.objects for this bucket: RLS denies everything for
-- anon/authenticated; the Edge Function uses the service role.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-files', 'client-files', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Client scope for files / forms. Mirrors the clients SELECT policy: a client is in scope when the
-- caller holds the permission at a covered branch, OR (Own scope) the client has an appointment
-- with the caller's own staff profile.
-- ---------------------------------------------------------------------------
create or replace function public.client_access(p_business_id uuid, p_client_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clients c
    where c.id = p_client_id and c.business_id = p_business_id
      and (
        public.client_in_scope(p_business_id, c.id, c.first_branch_id, p_permission)
        or (public.can(p_business_id, null, p_permission)
            and exists (select 1 from public.appointments a
                        where a.client_id = c.id and a.deleted_at is null and a.staff_id is not null
                          and public.is_own_staff_profile(a.staff_id)))))
$$;
revoke all on function public.client_access(uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Photo consent (one row per client; history is the audit log)
-- ---------------------------------------------------------------------------
create table public.client_consents (
  client_id     uuid primary key references public.clients (id) on delete cascade,
  business_id   uuid not null references public.businesses (id) on delete cascade,
  photo_consent boolean not null default false,
  recorded_at   timestamptz not null default now(),
  recorded_by   uuid references auth.users (id)
);
create index client_consents_business_idx on public.client_consents (business_id);
create index client_consents_recorded_by_idx on public.client_consents (recorded_by) where recorded_by is not null;

-- ---------------------------------------------------------------------------
-- files (metadata). The object itself lives in the private bucket under
-- <business_id>/<client_id>/<file uuid>.<ext>. Soft delete only.
-- ---------------------------------------------------------------------------
create table public.files (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  client_id      uuid not null references public.clients (id),
  appointment_id uuid references public.appointments (id),
  kind           text not null,
  category       text not null,
  storage_path   text not null,
  original_name  text not null,
  mime_type      text not null,
  size_bytes     bigint not null,
  status         text not null default 'pending',
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  ready_at       timestamptz,
  deleted_at     timestamptz,
  deleted_by     uuid references auth.users (id),
  constraint files_kind check (kind in ('photo', 'document')),
  constraint files_category check (category in ('before', 'after', 'damage', 'document', 'other')),
  constraint files_status check (status in ('pending', 'ready', 'rejected')),
  constraint files_mime check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  constraint files_size check (size_bytes between 1 and 10485760),
  constraint files_name check (char_length(original_name) between 1 and 120),
  constraint files_kind_matches_mime check ((kind = 'document') = (mime_type = 'application/pdf')),
  constraint files_path_unique unique (storage_path)
);
create index files_business_idx on public.files (business_id) where deleted_at is null;
create index files_client_idx on public.files (client_id, created_at desc, id desc) where deleted_at is null;
create index files_appointment_idx on public.files (appointment_id) where appointment_id is not null;
create index files_created_by_idx on public.files (created_by) where created_by is not null;
create index files_deleted_by_idx on public.files (deleted_by) where deleted_by is not null;

-- ---------------------------------------------------------------------------
-- Forms: templates (mutable shell) + immutable versions + service attachments
-- ---------------------------------------------------------------------------
create table public.form_templates (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind        text not null,
  title       text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  created_by  uuid references auth.users (id),
  constraint form_templates_kind check (kind in ('intake', 'consent')),
  constraint form_templates_title check (char_length(btrim(title)) between 1 and 120)
);
create index form_templates_business_idx on public.form_templates (business_id) where deleted_at is null;
create index form_templates_created_by_idx on public.form_templates (created_by) where created_by is not null;
create trigger form_templates_set_updated_at before update on public.form_templates
  for each row execute function public.set_updated_at();

-- A signed form points at ONE version, which never changes (like form_versions for bookings).
create table public.form_template_versions (
  id                 uuid primary key default gen_random_uuid(),
  template_id        uuid not null references public.form_templates (id),
  business_id        uuid not null references public.businesses (id) on delete cascade,
  version            integer not null,
  kind               text not null,
  title              text not null,
  fields             jsonb not null default '[]'::jsonb,
  body               jsonb not null default '[]'::jsonb,
  requires_signature boolean not null default true,
  digest             text not null,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id),
  constraint form_template_versions_unique unique (template_id, version)
);
create index form_template_versions_business_idx on public.form_template_versions (business_id);
create index form_template_versions_created_by_idx on public.form_template_versions (created_by) where created_by is not null;

create table public.form_template_services (
  template_id uuid not null references public.form_templates (id) on delete cascade,
  service_id  uuid not null references public.services (id),
  business_id uuid not null references public.businesses (id) on delete cascade,
  primary key (template_id, service_id)
);
create index form_template_services_service_idx on public.form_template_services (service_id);
create index form_template_services_business_idx on public.form_template_services (business_id);

-- ---------------------------------------------------------------------------
-- form_requests: the tokenised public signing link (same pattern as the manage link: sha256 of a
-- 256-bit random value, expiry, single use, revocable, generic failure).
-- ---------------------------------------------------------------------------
create table public.form_requests (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses (id) on delete cascade,
  branch_id           uuid not null references public.branches (id),
  client_id           uuid not null references public.clients (id),
  appointment_id      uuid references public.appointments (id),
  template_version_id uuid not null references public.form_template_versions (id),
  token_hash          text not null unique,
  expires_at          timestamptz not null,
  used_at             timestamptz,
  revoked_at          timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id),
  constraint form_requests_hash_format check (token_hash ~ '^[0-9a-f]{64}$')
);
create index form_requests_business_idx on public.form_requests (business_id);
create index form_requests_branch_idx on public.form_requests (branch_id);
create index form_requests_client_idx on public.form_requests (client_id);
create index form_requests_appointment_idx on public.form_requests (appointment_id) where appointment_id is not null;
create index form_requests_version_idx on public.form_requests (template_version_id);
create index form_requests_created_by_idx on public.form_requests (created_by) where created_by is not null;

-- ---------------------------------------------------------------------------
-- signed_consents: immutable. Never edited, never deleted; a void is a NEW row.
-- ---------------------------------------------------------------------------
create table public.signed_consents (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses (id) on delete cascade,
  branch_id           uuid not null references public.branches (id),
  client_id           uuid not null references public.clients (id),
  appointment_id      uuid references public.appointments (id),
  template_id         uuid not null references public.form_templates (id),
  template_version_id uuid not null references public.form_template_versions (id),
  request_id          uuid references public.form_requests (id),
  answers             jsonb not null default '{}'::jsonb,
  signer_name         text not null,
  signature           jsonb,
  signed_via          text not null,
  signed_at           timestamptz not null default now(),
  ip_hash             text,
  captured_by         uuid references auth.users (id),
  constraint signed_consents_via check (signed_via in ('dashboard', 'link')),
  constraint signed_consents_name check (char_length(btrim(signer_name)) between 2 and 120),
  constraint signed_consents_request_unique unique (request_id)
);
create index signed_consents_business_idx on public.signed_consents (business_id);
create index signed_consents_branch_idx on public.signed_consents (branch_id);
create index signed_consents_client_idx on public.signed_consents (client_id, signed_at desc);
create index signed_consents_appointment_idx on public.signed_consents (appointment_id) where appointment_id is not null;
create index signed_consents_template_idx on public.signed_consents (template_id);
create index signed_consents_version_idx on public.signed_consents (template_version_id);
create index signed_consents_captured_by_idx on public.signed_consents (captured_by) where captured_by is not null;

create table public.signed_consent_voids (
  signed_consent_id uuid primary key references public.signed_consents (id),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  reason            text not null,
  voided_at         timestamptz not null default now(),
  voided_by         uuid references auth.users (id),
  constraint signed_consent_voids_reason check (char_length(btrim(reason)) between 3 and 500)
);
create index signed_consent_voids_business_idx on public.signed_consent_voids (business_id);
create index signed_consent_voids_by_idx on public.signed_consent_voids (voided_by) where voided_by is not null;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
create trigger form_template_versions_guard before update or delete on public.form_template_versions
  for each row execute function public.enforce_addon_ledger_guard();
create trigger signed_consents_guard before update or delete on public.signed_consents
  for each row execute function public.enforce_addon_ledger_guard();
create trigger signed_consent_voids_guard before update or delete on public.signed_consent_voids
  for each row execute function public.enforce_addon_ledger_guard();

-- A request may only be USED or REVOKED (once); identity never changes; never deleted by hand.
create or replace function public.enforce_form_request_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.businesses b where b.id = old.business_id) then return old; end if;
    raise exception 'Form requests are kept; revoke instead' using errcode = '23514';
  end if;
  if new.token_hash is distinct from old.token_hash or new.business_id is distinct from old.business_id
     or new.client_id is distinct from old.client_id or new.template_version_id is distinct from old.template_version_id
     or new.expires_at is distinct from old.expires_at or new.created_at is distinct from old.created_at then
    raise exception 'A form request cannot be changed' using errcode = '23514';
  end if;
  if (old.used_at is not null and new.used_at is distinct from old.used_at)
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'A form request is used or revoked only once' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.enforce_form_request_guard() from public, anon, authenticated;
create trigger form_requests_guard before update or delete on public.form_requests
  for each row execute function public.enforce_form_request_guard();

-- ---------------------------------------------------------------------------
-- RLS. Sensitive tables have NO policy and NO grant for API roles (reads go through RPCs that
-- redact). Templates / versions / service links are readable by whoever builds or signs forms.
-- ---------------------------------------------------------------------------
alter table public.client_consents enable row level security;
alter table public.files enable row level security;
alter table public.form_templates enable row level security;
alter table public.form_template_versions enable row level security;
alter table public.form_template_services enable row level security;
alter table public.form_requests enable row level security;
alter table public.signed_consents enable row level security;
alter table public.signed_consent_voids enable row level security;

create or replace function public.forms_read_access(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.business_has_feature(p_business_id, 'forms_consent')
     and (public.can(p_business_id, null, 'forms.manage')
          or public.can(p_business_id, null, 'appointments.edit')
          or public.can(p_business_id, null, 'files.view'))
$$;
revoke all on function public.forms_read_access(uuid) from public, anon;
grant execute on function public.forms_read_access(uuid) to authenticated;

create policy form_templates_select on public.form_templates for select to authenticated
  using (public.is_super_admin() or public.forms_read_access(business_id));
create policy form_template_versions_select on public.form_template_versions for select to authenticated
  using (public.is_super_admin() or public.forms_read_access(business_id));
create policy form_template_services_select on public.form_template_services for select to authenticated
  using (public.is_super_admin() or public.forms_read_access(business_id));

-- File metadata: add-on on + files.view on the client in scope. The storage path is NOT readable
-- (column grant below); the bytes are reachable only through a signed URL.
create or replace function public.file_visible(p_business_id uuid, p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.business_has_feature(p_business_id, 'files_photos')
     and public.client_access(p_business_id, p_client_id, 'files.view')
$$;
revoke all on function public.file_visible(uuid, uuid) from public, anon;
grant execute on function public.file_visible(uuid, uuid) to authenticated;

create policy files_select on public.files for select to authenticated
  using (public.is_super_admin() or (status = 'ready' and deleted_at is null and public.file_visible(business_id, client_id)));

revoke all on public.client_consents, public.files, public.form_templates, public.form_template_versions,
  public.form_template_services, public.form_requests, public.signed_consents, public.signed_consent_voids
  from anon, authenticated;
grant select (id, business_id, client_id, appointment_id, kind, category, original_name, mime_type, size_bytes,
              status, created_by, created_at, ready_at, deleted_at)
  on public.files to authenticated;
grant select on public.form_templates, public.form_template_versions, public.form_template_services to authenticated;

-- Staff may upload files for THEIR OWN clients (decided with the user).
insert into public.role_permissions (role_id, permission, scope)
select r.id, 'files.upload', 'own'::public.permission_scope
from public.roles r where r.business_id is null and r.key = 'staff'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Public endpoints: rate-limit rules (per IP, like the review page) and the new outbox event.
-- ---------------------------------------------------------------------------
insert into public.rate_limit_rules (endpoint, scope, window_seconds, max_attempts, note) values
  ('get_form_request', 'ip', 3600, 60, 'Reading a signing link. Generous: a person reloads the page.'),
  ('submit_form_request', 'ip', 3600, 10, 'Signing writes. 10 an hour from one address is already abnormal.')
on conflict do nothing;

alter table public.message_outbox drop constraint message_outbox_event_check;
alter table public.message_outbox add constraint message_outbox_event_check check (event in (
  'booking_confirmed', 'pending_received', 'reminder', 'rescheduled', 'cancelled',
  'manage_link', 'review_request',
  'staff_new_booking', 'staff_pending_approval', 'staff_cancelled', 'staff_reminder',
  'report_summary', 'staff_low_stock', 'low_stock', 'form_request'));
