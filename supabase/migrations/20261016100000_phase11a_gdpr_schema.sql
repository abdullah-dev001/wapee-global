-- Phase 11A: GDPR. Schema, guards, permission.
--
--  * permission `clients.erase` (Owner by default),
--  * `clients.erased_at`,
--  * `storage_cleanup_queue` (bucket objects that must be removed through the Storage API; SQL cannot do it),
--  * `data_requests` (customer self-export / erase REQUESTS from the portal; a row only, staff act on it),
--  * `erasure_log` (one row per business erase, survives the business, holds no personal data),
--  * the immutable-table guards learn ONE narrow exemption: while a transaction-local flag set only inside the
--    erase RPCs is on, personal TEXT fields may be blanked. Amounts, dates, numbers stay locked.

-- ---------------------------------------------------------------------------
-- permission
-- ---------------------------------------------------------------------------
insert into public.permissions (key, area, min_plan, addon) values ('clients.erase', 'clients', null, null)
on conflict do nothing;

insert into public.role_permissions (role_id, permission, scope)
select r.id, 'clients.erase', 'all'::public.permission_scope
from public.roles r where r.business_id is null and r.key = 'owner'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- clients.erased_at
-- ---------------------------------------------------------------------------
alter table public.clients add column erased_at timestamptz;
grant select (erased_at) on public.clients to authenticated;

create or replace view public.clients_v with (security_invoker = true) as
select
  c.id, c.business_id, c.full_name,
  case when c.business_id in (select unnest(public.contact_business_ids())) then public.client_phone(c.id) end as phone_e164,
  case when c.business_id in (select unnest(public.contact_business_ids())) then public.client_email(c.id) end as email,
  c.notes, c.first_branch_id, c.source, c.created_at, c.updated_at, c.deleted_at, c.created_by,
  c.erased_at
from public.clients c;

-- ---------------------------------------------------------------------------
-- storage cleanup queue (no FK: it must outlive the business it belongs to)
-- ---------------------------------------------------------------------------
create table public.storage_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  client_id uuid,
  bucket text not null,
  path text not null,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  constraint storage_cleanup_queue_unique unique (bucket, path)
);
create index storage_cleanup_queue_open_idx on public.storage_cleanup_queue (business_id) where done_at is null;
alter table public.storage_cleanup_queue enable row level security;
revoke all on public.storage_cleanup_queue from public, anon, authenticated;
comment on table public.storage_cleanup_queue is
  'Bucket objects to remove with the Storage API after a GDPR erase. Written by the erase RPCs, drained by the gdpr Edge Function (service role). No policy: not readable by API roles.';

-- ---------------------------------------------------------------------------
-- erasure log: one row per business erase, no personal data
-- ---------------------------------------------------------------------------
create table public.erasure_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  requested_by uuid,
  erased_at timestamptz not null default now(),
  counts jsonb not null default '{}'::jsonb
);
alter table public.erasure_log enable row level security;
revoke all on public.erasure_log from public, anon, authenticated;
comment on table public.erasure_log is
  'One row per business erase (the business, and its audit_logs, are gone). Ids and counts only; no names, emails or phone numbers.';

-- ---------------------------------------------------------------------------
-- data requests (portal seam)
-- ---------------------------------------------------------------------------
create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('export', 'erase')),
  source text not null default 'portal' check (source in ('portal')),
  requester_email text,
  status text not null default 'open' check (status in ('open', 'done', 'declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  constraint data_requests_email_len check (requester_email is null or char_length(requester_email) between 3 and 254),
  constraint data_requests_resolved_shape check ((status = 'open') = (resolved_at is null))
);
create unique index data_requests_one_open on public.data_requests (business_id, requester_email, kind) where status = 'open';
create index data_requests_business_status_idx on public.data_requests (business_id, status, created_at desc);
create index data_requests_resolved_by_idx on public.data_requests (resolved_by) where resolved_by is not null;
alter table public.data_requests enable row level security;
revoke all on public.data_requests from public, anon, authenticated;
grant select on public.data_requests to authenticated;
create policy data_requests_select on public.data_requests for select to authenticated
  using (public.can(business_id, null, 'clients.export'));

-- ---------------------------------------------------------------------------
-- guards: the narrow erase exemption
-- ---------------------------------------------------------------------------
create or replace function public.gdpr_erasing() returns boolean
language sql stable set search_path = ''
as $$ select coalesce(current_setting('wapee.gdpr_erase', true), 'off') = 'on' $$;
revoke all on function public.gdpr_erasing() from public, anon, authenticated;

create or replace function public.enforce_invoice_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.businesses b where b.id = old.business_id) then
      return old;
    end if;
    raise exception 'Invoices are never deleted; discard a draft instead'
      using errcode = '23514';
  end if;

  if old.status = 'issued' then
    -- GDPR erase: ONLY the two personal text fields may change; every amount, date and number stays locked.
    if public.gdpr_erasing()
       and (to_jsonb(new) - 'bill_to_name' - 'notes' - 'updated_at') = (to_jsonb(old) - 'bill_to_name' - 'notes' - 'updated_at') then
      return new;
    end if;
    raise exception 'An issued invoice is immutable; fix it with a credit note or a payment reversal'
      using errcode = '23514';
  end if;

  if new.business_id is distinct from old.business_id
     or new.branch_id is distinct from old.branch_id then
    raise exception 'An invoice cannot move between businesses or branches' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_addon_ledger_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.businesses b where b.id = old.business_id) then
      return old;
    end if;
    raise exception '% rows are append-only and cannot be deleted', tg_table_name using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    -- GDPR erase: a signed consent keeps WHEN, WHAT form version and WHICH client; the person's own words
    -- (answers, name, drawn signature, IP hash) are blanked.
    if tg_table_name = 'signed_consents' and public.gdpr_erasing()
       and (to_jsonb(new) - 'answers' - 'signer_name' - 'signature' - 'ip_hash') = (to_jsonb(old) - 'answers' - 'signer_name' - 'signature' - 'ip_hash') then
      return new;
    end if;
    raise exception '% rows are append-only and cannot be changed', tg_table_name using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_review_guard() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_erase boolean := public.gdpr_erasing();
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.businesses b where b.id = old.business_id) then
      raise exception 'reviews cannot be deleted' using errcode = '23514';
    end if;
    return old;
  end if;
  if new.business_id <> old.business_id or new.branch_id <> old.branch_id
     or new.appointment_id <> old.appointment_id or new.review_request_id <> old.review_request_id
     or new.rating <> old.rating or new.created_at <> old.created_at
     or (not v_erase and (new.comment is distinct from old.comment or new.reviewer_first_name <> old.reviewer_first_name)) then
    raise exception 'a submitted review cannot be edited' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_portal_session_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if public.gdpr_erasing() or not exists (select 1 from public.businesses b where b.id = old.business_id) then return old; end if;
    raise exception 'Portal sessions are kept; they expire' using errcode = '23514';
  end if;
  if new.token_hash is distinct from old.token_hash or new.business_id is distinct from old.business_id
     or new.email is distinct from old.email or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'A portal session cannot be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_portal_token_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if public.gdpr_erasing() or not exists (select 1 from public.businesses b where b.id = old.business_id) then return old; end if;
    raise exception 'Portal tokens are kept; they expire' using errcode = '23514';
  end if;
  if new.token_hash is distinct from old.token_hash or new.business_id is distinct from old.business_id
     or new.email is distinct from old.email or new.expires_at is distinct from old.expires_at
     or (old.used_at is not null and new.used_at is distinct from old.used_at)
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'A portal token cannot be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- A business erase deletes every Owner with the business; the guard steps aside for THAT business only
-- (flag value = the business id, set inside gdpr_erase_business_commit and nowhere else).
create or replace function public.enforce_last_owner() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_business_id uuid;
  v_owner_count integer;
begin
  select m.business_id into v_business_id
  from public.business_members m
  where m.id = coalesce(old.member_id, new.member_id);

  if v_business_id is not null and coalesce(current_setting('wapee.erase_business', true), '') = v_business_id::text then
    return old;
  end if;

  select count(*) into v_owner_count
  from public.member_role_assignments a
  join public.business_members m on m.id = a.member_id
  join public.roles r on r.id = a.role_id
  where m.business_id = v_business_id
    and m.status = 'active'
    and m.deleted_at is null
    and r.key = 'owner'
    and r.business_id is null
    and a.id is distinct from old.id;

  if v_owner_count = 0 then
    raise exception 'A business must always have at least one active Owner'
      using errcode = '23514';
  end if;

  return old;
end;
$$;

-- Trigger functions keep their privileges closed (as before).
revoke all on function public.enforce_invoice_guard() from public, anon, authenticated;
revoke all on function public.enforce_addon_ledger_guard() from public, anon, authenticated;
revoke all on function public.enforce_review_guard() from public, anon, authenticated;
revoke all on function public.enforce_portal_session_guard() from public, anon, authenticated;
revoke all on function public.enforce_portal_token_guard() from public, anon, authenticated;
revoke all on function public.enforce_last_owner() from public, anon, authenticated;

-- Data-subject rights must keep working for a business whose trial lapsed, so these checks do NOT use can()
-- (which also requires an active business). Same coverage rule as covers_every_branch().
create or replace function public.gdpr_allowed(p_business_id uuid, p_permission text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_permission(p_business_id, null, p_permission)
     and exists (select 1 from public.branches b where b.business_id = p_business_id and b.deleted_at is null)
     and not exists (
       select 1 from public.branches b
       where b.business_id = p_business_id and b.deleted_at is null
         and not public.has_permission_at_branch_scope(p_business_id, b.id, p_permission))
$$;
revoke all on function public.gdpr_allowed(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Export
-- ---------------------------------------------------------------------------
create or replace function public.gdpr_export_client(p_client_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.clients;
  v_sensitive boolean;
  v_email text;
  v_appts uuid[];
  v_out jsonb;
begin
  if (select auth.uid()) is null then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select * into v_c from public.clients c where c.id = p_client_id;
  if v_c.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not ((public.can(v_c.business_id, null, 'clients.export')
           and public.client_access(v_c.business_id, v_c.id, 'clients.export'))
          or public.gdpr_allowed(v_c.business_id, 'clients.export')) then
    -- the same answer for "no such client" and "not yours": no enumeration
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  v_sensitive := public.can(v_c.business_id, null, 'clients.view_sensitive');
  v_email := case when v_c.email is null then null else lower(v_c.email::text) end;
  select coalesce(array_agg(a.id), '{}') into v_appts from public.appointments a where a.client_id = v_c.id;

  v_out := jsonb_build_object(
    'ok', true,
    'format_version', 1,
    'exported_at', now(),
    'business_id', v_c.business_id,
    'client', jsonb_build_object(
      'id', v_c.id, 'full_name', v_c.full_name, 'phone', v_c.phone_e164, 'email', v_c.email::text,
      'notes', v_c.notes, 'source', v_c.source, 'first_branch_id', v_c.first_branch_id,
      'created_at', v_c.created_at, 'archived_at', v_c.deleted_at, 'erased_at', v_c.erased_at),
    'photo_consent', (select to_jsonb(cc) - 'business_id' - 'recorded_by' from public.client_consents cc where cc.client_id = v_c.id),
    'appointments', coalesce((select jsonb_agg(to_jsonb(a) - 'business_id' - 'created_by' order by a.starts_at) from public.appointments a where a.client_id = v_c.id), '[]'::jsonb),
    'appointment_answers', coalesce((
      select jsonb_agg(jsonb_build_object('appointment_id', v.appointment_id, 'custom_field_id', v.custom_field_id,
               'form_version_id', v.form_version_id, 'is_sensitive', v.is_sensitive,
               'value', case when v.is_sensitive and not v_sensitive then null else v.value end,
               'redacted', v.is_sensitive and not v_sensitive, 'created_at', v.created_at))
      from public.appointment_field_values v where v.appointment_id = any (v_appts)), '[]'::jsonb),
    'invoices', coalesce((
      select jsonb_agg((to_jsonb(i) - 'business_id' - 'issued_by' - 'created_by') || jsonb_build_object(
        'items', coalesce((select jsonb_agg(to_jsonb(it) - 'business_id' - 'branch_id' order by it.sort_order) from public.invoice_items it where it.invoice_id = i.id), '[]'::jsonb),
        'payments', coalesce((select jsonb_agg(to_jsonb(p) - 'business_id' - 'branch_id' - 'created_by' order by p.created_at) from public.invoice_payments p where p.invoice_id = i.id), '[]'::jsonb),
        'credit_notes', coalesce((select jsonb_agg(to_jsonb(n) - 'business_id' - 'branch_id' - 'created_by' order by n.created_at) from public.credit_notes n where n.invoice_id = i.id), '[]'::jsonb))
        order by i.created_at)
      from public.invoices i where i.client_id = v_c.id), '[]'::jsonb),
    'packages', coalesce((
      select jsonb_agg((to_jsonb(cp) - 'business_id' - 'created_by') || jsonb_build_object(
        'usages', coalesce((select jsonb_agg(to_jsonb(u) - 'business_id' - 'created_by' order by u.created_at) from public.session_usages u where u.client_package_id = cp.id), '[]'::jsonb))
        order by cp.sold_at)
      from public.client_packages cp where cp.client_id = v_c.id), '[]'::jsonb),
    -- Metadata only: the storage path is never exported (the bytes are fetched with a signed URL).
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'category', f.category, 'name', f.original_name,
               'mime_type', f.mime_type, 'size_bytes', f.size_bytes, 'appointment_id', f.appointment_id,
               'created_at', f.created_at, 'deleted_at', f.deleted_at) order by f.created_at)
      from public.files f where f.client_id = v_c.id), '[]'::jsonb),
    'signed_forms', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'template_version_id', s.template_version_id,
               'answers', s.answers, 'signer_name', s.signer_name, 'signature_strokes', s.signature, 'signed_via', s.signed_via,
               'signed_at', s.signed_at, 'appointment_id', s.appointment_id,
               'voided', exists (select 1 from public.signed_consent_voids x where x.signed_consent_id = s.id)) order by s.signed_at)
      from public.signed_consents s where s.client_id = v_c.id), '[]'::jsonb),
    'form_requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'created_at', r.created_at, 'expires_at', r.expires_at,
               'used_at', r.used_at, 'revoked_at', r.revoked_at) order by r.created_at)
      from public.form_requests r where r.client_id = v_c.id), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('id', rv.id, 'appointment_id', rv.appointment_id, 'rating', rv.rating,
               'comment', rv.comment, 'reviewer_first_name', rv.reviewer_first_name, 'owner_reply', rv.owner_reply,
               'status', rv.status, 'created_at', rv.created_at) order by rv.created_at)
      from public.reviews rv where rv.client_id = v_c.id or rv.appointment_id = any (v_appts)), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'channel', m.channel, 'event', m.event, 'status', m.status,
               'recipient', m.recipient_masked, 'appointment_id', m.appointment_id, 'created_at', m.created_at) order by m.created_at)
      from public.messages m where m.appointment_id = any (v_appts)), '[]'::jsonb),
    'portal', case when v_email is null then jsonb_build_object('email', null, 'sessions', '[]'::jsonb, 'sign_in_links', '[]'::jsonb, 'requests', '[]'::jsonb)
      else jsonb_build_object(
        'email', v_email,
        'sessions', coalesce((select jsonb_agg(jsonb_build_object('created_at', s.created_at, 'last_seen_at', s.last_seen_at, 'expires_at', s.expires_at, 'revoked_at', s.revoked_at) order by s.created_at)
                              from public.portal_sessions s where s.business_id = v_c.business_id and s.email = v_email), '[]'::jsonb),
        'sign_in_links', coalesce((select jsonb_agg(jsonb_build_object('created_at', t.created_at, 'expires_at', t.expires_at, 'used_at', t.used_at, 'revoked_at', t.revoked_at) order by t.created_at)
                                   from public.portal_login_tokens t where t.business_id = v_c.business_id and t.email = v_email), '[]'::jsonb),
        'requests', coalesce((select jsonb_agg(jsonb_build_object('kind', d.kind, 'status', d.status, 'created_at', d.created_at, 'resolved_at', d.resolved_at) order by d.created_at)
                              from public.data_requests d where d.business_id = v_c.business_id and d.requester_email = v_email), '[]'::jsonb))
      end);

  perform public.write_audit_log(v_c.business_id, 'client.exported', 'client', v_c.id::text, null,
    jsonb_build_object('appointments', cardinality(v_appts), 'sensitive_included', v_sensitive));
  return v_out;
end;
$$;
revoke all on function public.gdpr_export_client(uuid) from public, anon;
grant execute on function public.gdpr_export_client(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Erase one client
--
-- Rule (decided with the product owner): every financial row is KEPT (amounts, dates, numbers, currency,
-- credit notes, payments); everything that is the PERSON is blanked or removed. The row stays, anonymised, so
-- invoices and appointments keep pointing at something. Refused (before any write) while the client has an
-- upcoming live appointment or an unpaid draft invoice. Idempotent: a second call finds nothing left to blank
-- and returns the storage objects still waiting for removal.
-- ---------------------------------------------------------------------------
create or replace function public.gdpr_erase_client(p_client_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.clients;
  v_email text;
  v_first boolean;
  v_appts uuid[];
  v_n_appt int := 0; v_n_ans int := 0; v_n_inv int := 0; v_n_sig int := 0; v_n_rev int := 0;
  v_n_msg int := 0; v_n_out int := 0; v_n_portal int := 0; v_n_files int := 0; v_n_req int := 0;
  v_n int;
  v_pending jsonb;
begin
  -- 1. validate everything first (CLAUDE.md section 5: a RETURN does not roll anything back)
  if (select auth.uid()) is null then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select * into v_c from public.clients c where c.id = p_client_id;
  if v_c.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.gdpr_allowed(v_c.business_id, 'clients.erase') then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  v_first := v_c.erased_at is null;
  if v_first then
    if exists (select 1 from public.appointments a where a.client_id = v_c.id and a.deleted_at is null
               and a.status in ('pending', 'confirmed') and a.ends_at > now()) then
      return jsonb_build_object('ok', false, 'code', 'has_future_appointment');
    end if;
    if exists (select 1 from public.invoices i where i.client_id = v_c.id and i.status = 'draft' and i.deleted_at is null) then
      return jsonb_build_object('ok', false, 'code', 'has_draft_invoice');
    end if;
  end if;

  -- 2. mutate (one transaction: an exception anywhere undoes all of it)
  perform set_config('wapee.gdpr_erase', 'on', true);
  v_email := case when v_c.email is null then null else lower(v_c.email::text) end;
  select coalesce(array_agg(a.id), '{}') into v_appts from public.appointments a where a.client_id = v_c.id;

  update public.appointments set client_notes = null, internal_notes = null, cancellation_reason = null
   where client_id = v_c.id and (client_notes is not null or internal_notes is not null or cancellation_reason is not null);
  get diagnostics v_n_appt = row_count;

  update public.appointment_field_values set value = null where appointment_id = any (v_appts) and value is not null;
  get diagnostics v_n_ans = row_count;

  update public.invoices set bill_to_name = 'Erased client', notes = null
   where client_id = v_c.id and (bill_to_name is distinct from 'Erased client' or notes is not null);
  get diagnostics v_n_inv = row_count;

  update public.signed_consents set answers = '{}'::jsonb, signer_name = 'Erased', signature = null, ip_hash = null
   where client_id = v_c.id and (answers <> '{}'::jsonb or signer_name <> 'Erased' or signature is not null or ip_hash is not null);
  get diagnostics v_n_sig = row_count;

  update public.reviews set comment = null, reviewer_first_name = 'Erased', owner_reply = null,
         featured_on_website = false, featured_at = null
   where (client_id = v_c.id or appointment_id = any (v_appts))
     and (comment is not null or reviewer_first_name <> 'Erased' or owner_reply is not null or featured_on_website);
  get diagnostics v_n_rev = row_count;

  update public.review_requests set deleted_at = coalesce(deleted_at, now()) where client_id = v_c.id and deleted_at is null;
  update public.form_requests set revoked_at = now() where client_id = v_c.id and used_at is null and revoked_at is null;
  update public.booking_manage_tokens set revoked_at = now() where appointment_id = any (v_appts) and revoked_at is null;

  update public.messages set recipient_masked = null, recipient_hash = null, error = null
   where appointment_id = any (v_appts) and (recipient_masked is not null or recipient_hash is not null or error is not null);
  get diagnostics v_n_msg = row_count;

  delete from public.message_outbox where client_id = v_c.id;
  get diagnostics v_n_out = row_count;

  if v_email is not null then
    delete from public.portal_sessions where business_id = v_c.business_id and email = v_email;
    get diagnostics v_n_portal = row_count;
    delete from public.portal_login_tokens where business_id = v_c.business_id and email = v_email;
    get diagnostics v_n = row_count;
    v_n_portal := v_n_portal + v_n;
    update public.data_requests set status = 'done', resolved_at = now(), resolved_by = (select auth.uid()), requester_email = null
     where business_id = v_c.business_id and requester_email = v_email;
    get diagnostics v_n_req = row_count;
  end if;

  insert into public.storage_cleanup_queue (business_id, client_id, bucket, path)
  select f.business_id, f.client_id, 'client-files', f.storage_path from public.files f where f.client_id = v_c.id
  on conflict (bucket, path) do nothing;
  update public.files set original_name = 'erased', deleted_at = coalesce(deleted_at, now())
   where client_id = v_c.id and (original_name <> 'erased' or deleted_at is null);
  get diagnostics v_n_files = row_count;

  update public.clients
     set full_name = 'Erased client', phone_e164 = '+10000000000', email = null, notes = null,
         deleted_at = coalesce(deleted_at, now()), erased_at = coalesce(erased_at, now())
   where id = v_c.id;

  perform set_config('wapee.gdpr_erase', 'off', true);

  if v_first then
    perform public.write_audit_log(v_c.business_id, 'client.erased', 'client', v_c.id::text, null,
      jsonb_build_object('appointments', v_n_appt, 'answers', v_n_ans, 'invoices', v_n_inv, 'signed_forms', v_n_sig,
                         'reviews', v_n_rev, 'messages', v_n_msg, 'outbox', v_n_out, 'portal_rows', v_n_portal,
                         'files', v_n_files, 'requests', v_n_req));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'bucket', q.bucket, 'path', q.path) order by q.created_at), '[]'::jsonb)
    into v_pending from public.storage_cleanup_queue q where q.client_id = v_c.id and q.done_at is null;
  return jsonb_build_object('ok', true, 'already_erased', not v_first, 'storage_pending', v_pending);
end;
$$;
revoke all on function public.gdpr_erase_client(uuid) from public, anon;
grant execute on function public.gdpr_erase_client(uuid) to authenticated;

-- The Edge Function (service role) tells the database which objects it removed.
create or replace function public.gdpr_storage_done(p_ids uuid[])
returns integer
language sql security definer set search_path = ''
as $$
  with u as (update public.storage_cleanup_queue set done_at = now() where id = any (p_ids) and done_at is null returning 1)
  select count(*)::integer from u
$$;
revoke all on function public.gdpr_storage_done(uuid[]) from public, anon, authenticated;
grant execute on function public.gdpr_storage_done(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- Erase a whole business (Owner only, type the name, storage first)
-- ---------------------------------------------------------------------------
create or replace function public.gdpr_business_erase_check(p_business_id uuid, p_confirm_name text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_name text;
begin
  if (select auth.uid()) is null then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select b.name into v_name from public.businesses b where b.id = p_business_id and b.deleted_at is null;
  if v_name is null
     or not exists (
       select 1 from public.business_members m
       join public.member_role_assignments a on a.member_id = m.id
       join public.roles r on r.id = a.role_id
       where m.business_id = p_business_id and m.user_id = (select auth.uid())
         and m.status = 'active' and m.deleted_at is null and r.key = 'owner' and r.business_id is null) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_confirm_name is null or btrim(p_confirm_name) <> v_name then
    return jsonb_build_object('ok', false, 'code', 'name_mismatch');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.gdpr_business_erase_check(uuid, text) from public, anon;
grant execute on function public.gdpr_business_erase_check(uuid, text) to authenticated;

create or replace function public.gdpr_erase_business_commit(p_business_id uuid, p_confirm_name text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_check jsonb;
  v_counts jsonb;
begin
  v_check := public.gdpr_business_erase_check(p_business_id, p_confirm_name);
  if not coalesce((v_check ->> 'ok')::boolean, false) then return v_check; end if;
  -- Storage was to be emptied first. If anything is still there, refuse (nothing has been touched yet).
  if exists (select 1 from storage.objects o
             where o.bucket_id in ('client-files', 'website-assets') and o.name like p_business_id::text || '/%') then
    return jsonb_build_object('ok', false, 'code', 'storage_not_clean');
  end if;

  v_counts := jsonb_build_object(
    'branches', (select count(*) from public.branches where business_id = p_business_id),
    'members', (select count(*) from public.business_members where business_id = p_business_id),
    'clients', (select count(*) from public.clients where business_id = p_business_id),
    'appointments', (select count(*) from public.appointments where business_id = p_business_id),
    'invoices', (select count(*) from public.invoices where business_id = p_business_id),
    'files', (select count(*) from public.files where business_id = p_business_id));

  insert into public.erasure_log (business_id, requested_by, counts) values (p_business_id, (select auth.uid()), v_counts);
  insert into public.storage_cleanup_queue (business_id, bucket, path, done_at)
  select p_business_id, 'client-files', f.storage_path, now() from public.files f where f.business_id = p_business_id
  on conflict (bucket, path) do update set done_at = coalesce(public.storage_cleanup_queue.done_at, now());

  perform set_config('wapee.erase_business', p_business_id::text, true);
  delete from public.businesses where id = p_business_id;
  perform set_config('wapee.erase_business', '', true);
  return jsonb_build_object('ok', true, 'counts', v_counts);
end;
$$;
revoke all on function public.gdpr_erase_business_commit(uuid, text) from public, anon;
grant execute on function public.gdpr_erase_business_commit(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Portal seam: a customer asks; a person with the permission acts
-- ---------------------------------------------------------------------------
create or replace function public.portal_create_data_request(p_session text, p_kind text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ctx jsonb;
  v_biz uuid;
  v_email text;
  v_id uuid;
begin
  if p_kind is null or p_kind not in ('export', 'erase') then return jsonb_build_object('ok', false, 'code', 'bad_request'); end if;
  v_ctx := public.portal_ctx(p_session);
  if v_ctx is null then return jsonb_build_object('ok', false, 'code', 'invalid_session'); end if;
  v_biz := (v_ctx ->> 'business_id')::uuid;
  v_email := v_ctx ->> 'email';
  -- backstop behind the Edge Function's per-IP limit: 5 requests per customer per day (returns, never raises)
  if (select count(*) from public.data_requests d where d.business_id = v_biz and d.requester_email = v_email
        and d.created_at > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  insert into public.data_requests (business_id, kind, requester_email) values (v_biz, p_kind, v_email)
  on conflict (business_id, requester_email, kind) where status = 'open' do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  perform public.portal_audit(v_biz, 'portal.data_request', 'data_request', v_id::text, jsonb_build_object('kind', p_kind));
  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;
revoke all on function public.portal_create_data_request(text, text) from public, anon, authenticated;
grant execute on function public.portal_create_data_request(text, text) to service_role;

create or replace function public.list_data_requests(p_business_id uuid, p_status text default 'open')
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.can(p_business_id, null, 'clients.export') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_status is not null and p_status not in ('open', 'done', 'declined') then
    return jsonb_build_object('ok', false, 'code', 'invalid_filter');
  end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'status', d.status, 'email', d.requester_email,
             'created_at', d.created_at, 'resolved_at', d.resolved_at,
             'clients', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'full_name', c.full_name)), '[]'::jsonb)
                         from public.clients c where c.id = any (public.portal_client_ids(d.business_id, d.requester_email))))
           order by d.created_at desc)
    from (select * from public.data_requests x where x.business_id = p_business_id and (p_status is null or x.status = p_status)
          order by x.created_at desc limit 100) d), '[]'::jsonb));
end;
$$;
revoke all on function public.list_data_requests(uuid, text) from public, anon;
grant execute on function public.list_data_requests(uuid, text) to authenticated;

create or replace function public.resolve_data_request(p_id uuid, p_outcome text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_d public.data_requests;
begin
  if (select auth.uid()) is null then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  if p_outcome is null or p_outcome not in ('done', 'declined') then return jsonb_build_object('ok', false, 'code', 'invalid_outcome'); end if;
  select * into v_d from public.data_requests d where d.id = p_id for update;
  if v_d.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.can(v_d.business_id, null, case when v_d.kind = 'erase' then 'clients.erase' else 'clients.export' end) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_d.status <> 'open' then return jsonb_build_object('ok', false, 'code', 'already_resolved'); end if;
  update public.data_requests set status = p_outcome, resolved_at = now(), resolved_by = (select auth.uid()), requester_email = null
   where id = p_id;
  perform public.write_audit_log(v_d.business_id, 'data_request.' || p_outcome, 'data_request', p_id::text, null,
    jsonb_build_object('kind', v_d.kind));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.resolve_data_request(uuid, text) from public, anon;
grant execute on function public.resolve_data_request(uuid, text) to authenticated;

insert into public.rate_limit_rules (endpoint, scope, window_seconds, max_attempts, note) values
  ('portal_data_request', 'ip', 3600, 5, 'A customer asking for their data export / erasure: 5 an hour from one address.')
on conflict do nothing;
