-- Phase 10C (2/3): what a signed-in customer can READ and DO. Every function takes the raw session
-- token, resolves it with portal_ctx() (generic refusal when it is not valid, the add-on is off, the
-- business is inactive or nobody is linked any more), and then touches ONLY rows of the clients linked
-- to that verified email in that business. service_role only; none is callable by anon/authenticated.
--
-- Cancel / reschedule / book REUSE the guest-manage and booking engines (cancel_booking,
-- reschedule_booking, get_booking_reschedule_slots, create_booking) through a short-lived manage token
-- minted here for an appointment the session OWNS, so the cancel window, the slot engine, the collision
-- rules and "the original survives every failure" are the existing, tested ones.

-- A short-lived guest-manage token for an appointment (internal). Revoked by the caller after use.
create or replace function public.portal_mint_manage_token(p_business_id uuid, p_appointment_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_ends timestamptz;
begin
  select a.ends_at into v_ends from public.appointments a where a.id = p_appointment_id;
  insert into public.booking_manage_tokens (business_id, appointment_id, token_hash, expires_at)
  values (p_business_id, p_appointment_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), greatest(v_ends, now() + interval '5 minutes'));
  return v_token;
end $$;
revoke all on function public.portal_mint_manage_token(uuid, uuid) from public, anon, authenticated;

create or replace function public.portal_revoke_manage_token(p_token text)
returns void language sql security definer set search_path = '' as $$
  update public.booking_manage_tokens set revoked_at = now()
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and revoked_at is null
$$;
revoke all on function public.portal_revoke_manage_token(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------
create or replace function public.portal_overview(p_session text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ctx jsonb := public.portal_ctx(p_session);
  v_biz uuid;
begin
  if v_ctx is null then return jsonb_build_object('ok', false, 'code', 'invalid_session'); end if;
  v_biz := (v_ctx ->> 'business_id')::uuid;
  return jsonb_build_object('ok', true,
    'business_name', (select b.name from public.businesses b where b.id = v_biz),
    'slug', (select b.slug from public.businesses b where b.id = v_biz),
    'clients', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'first_name', split_part(c.full_name, ' ', 1)) order by c.created_at, c.id), '[]'::jsonb)
                from public.clients c where c.id in (select value::uuid from jsonb_array_elements_text(v_ctx -> 'client_ids'))),
    'features', jsonb_build_object('packages', public.business_has_feature(v_biz, 'packages'),
                                   'files', public.business_has_feature(v_biz, 'files_photos'),
                                   'forms', public.business_has_feature(v_biz, 'forms_consent')));
end $$;

-- Bookings: 'upcoming' (pending / confirmed and not over) or 'past' (everything else). INTERNAL NOTES NEVER LEAVE.
create or replace function public.portal_bookings(p_session text, p_scope text default 'upcoming', p_limit integer default 20, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ctx jsonb := public.portal_ctx(p_session);
  v_ids uuid[];
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_rows jsonb;
  v_n integer;
begin
  if v_ctx is null then return jsonb_build_object('ok', false, 'code', 'invalid_session'); end if;
  if p_scope not in ('upcoming', 'past') then return jsonb_build_object('ok', false, 'code', 'bad_request'); end if;
  select array_agg(value::uuid) into v_ids from jsonb_array_elements_text(v_ctx -> 'client_ids');
  select coalesce(jsonb_agg(t.j order by t.sort_key), '[]'::jsonb), count(*) into v_rows, v_n from (
    select jsonb_build_object(
        'id', a.id, 'status', a.status, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'timezone', br.timezone,
        'service_name', s.name, 'staff_name', sp.display_name, 'branch_name', br.name,
        'price_minor', a.price_minor, 'currency', br.currency, 'client_notes', a.client_notes,
        'client_first_name', split_part(c.full_name, ' ', 1),
        'can_cancel', (bs.customer_can_cancel and a.status in ('pending', 'confirmed') and now() < a.starts_at - make_interval(hours => bs.cancel_cutoff_hours)),
        'cancel_cutoff_hours', bs.cancel_cutoff_hours) as j,
      case when p_scope = 'upcoming' then extract(epoch from a.starts_at) else -extract(epoch from a.starts_at) end as sort_key
    from public.appointments a
    join public.clients c on c.id = a.client_id
    join public.branches br on br.id = a.branch_id
    join public.services s on s.id = a.service_id
    left join public.staff_profiles sp on sp.id = a.staff_id
    left join public.booking_settings bs on bs.branch_id = a.branch_id
    where a.client_id = any (v_ids) and a.business_id = (v_ctx ->> 'business_id')::uuid and a.deleted_at is null
      and ((p_scope = 'upcoming' and a.status in ('pending', 'confirmed') and a.ends_at > now())
        or (p_scope = 'past' and not (a.status in ('pending', 'confirmed') and a.ends_at > now())))
    order by sort_key
    offset greatest(coalesce(p_offset, 0), 0) limit v_limit + 1) t;
  return jsonb_build_object('ok', true,
    'rows', (select coalesce(jsonb_agg(e.x order by e.n), '[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality as e(x, n) where e.n <= v_limit),
    'has_more', v_n > v_limit);
end $$;

-- Package balances and the session history (when the Packages add-on is on).
create or replace function public.portal_packages(p_session text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ctx jsonb := public.portal_ctx(p_session);
  v_ids uuid[];
  v_biz uuid;
begin
  if v_ctx is null then return jsonb_build_object('ok', false, 'code', 'invalid_session'); end if;
  v_biz := (v_ctx ->> 'business_id')::uuid;
  if not public.business_has_feature(v_biz, 'packages') then return jsonb_build_object('ok', true, 'available', false, 'rows', '[]'::jsonb); end if;
  select array_agg(value::uuid) into v_ids from jsonb_array_elements_text(v_ctx -> 'client_ids');
  return jsonb_build_object('ok', true, 'available', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', cp.id, 'name', cp.name, 'sessions_purchased', cp.sessions_purchased, 'sessions_bonus', cp.sessions_bonus,
        'used', public.client_package_used(cp.id),
        'remaining', cp.sessions_purchased + cp.sessions_bonus - public.client_package_used(cp.id),
        'sold_at', cp.sold_at, 'expires_at', cp.expires_at,
        'is_expired', cp.expires_at is not null and cp.expires_at <= now(),
        'is_cancelled', exists (select 1 from public.client_package_cancellations x where x.client_package_id = cp.id),
        'history', coalesce((select jsonb_agg(jsonb_build_object('kind', u.kind, 'at', u.created_at, 'service_name', s.name) order by u.created_at desc)
                             from public.session_usages u left join public.services s on s.id = u.service_id
                             where u.client_package_id = cp.id), '[]'::jsonb)) order by cp.sold_at desc)
    from public.client_packages cp where cp.client_id = any (v_ids) and cp.business_id = v_biz), '[]'::jsonb));
end $$;

-- Issued invoices only (never a draft), newest first.
create or replace function public.portal_invoices(p_session text, p_limit integer default 20, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ctx jsonb := public.portal_ctx(p_session);
  v_ids uuid[];
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_rows jsonb;
  v_n integer;
begin
  if v_ctx is null then return jsonb_build_object('ok', false, 'code', 'invalid_session'); end if;
  select array_agg(value::uuid) into v_ids from jsonb_array_elements_text(v_ctx -> 'client_ids');
  select coalesce(jsonb_agg(t.j order by t.ord), '[]'::jsonb), count(*) into v_rows, v_n from (
    select (jsonb_build_object('id', i.id, 'number', i.number, 'issued_at', i.issued_at, 'currency', i.currency, 'total_minor', i.total_minor)
            || public.invoice_money(i.id)) as j, row_number() over (order by i.issued_at desc, i.id desc) as ord
    from public.invoices i
    where i.client_id = any (v_ids) and i.business_id = (v_ctx ->> 'business_id')::uuid and i.status = 'issued' and i.deleted_at is null
    order by i.issued_at desc, i.id desc offset greatest(coalesce(p_offset, 0), 0) limit v_limit + 1) t;
  return jsonb_build_object('ok', true,
    'rows', (select coalesce(jsonb_agg(e.x order by e.n), '[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality as e(x, n) where e.n <= v_limit),
    'has_more', v_n > v_limit);
end $$;

-- One issued invoice for the print view: lines, payments, credit notes, seller. No internal reasons or notes
-- (discount reasons, payment notes and reasons, credit-note reasons), no ids of catalogue items, no contact details.
create or replace function public.portal_invoice(p_session text, p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ctx jsonb := public.portal_ctx(p_session);
  v_ids uuid[];
  v_inv public.invoices%rowtype;
  v_branch record;
begin
  if v_ctx is null then return jsonb_build_object('ok', false, 'code', 'invalid_session'); end if;
  select array_agg(value::uuid) into v_ids from jsonb_array_elements_text(v_ctx -> 'client_ids');
  select * into v_inv from public.invoices i
  where i.id = p_invoice_id and i.client_id = any (v_ids) and i.business_id = (v_ctx ->> 'business_id')::uuid and i.status = 'issued' and i.deleted_at is null;
  if v_inv.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  select b.name, b.address, b.phone, b.timezone, b.currency into v_branch from public.branches b where b.id = v_inv.branch_id;
  return jsonb_build_object('ok', true,
    'invoice', jsonb_build_object('id', v_inv.id, 'number', v_inv.number, 'currency', v_inv.currency, 'issued_at', v_inv.issued_at, 'notes', v_inv.notes,
        'bill_to_name', v_inv.bill_to_name, 'tax_rate_bp', v_inv.tax_rate_bp, 'tax_number', v_inv.tax_number,
        'subtotal_minor', v_inv.subtotal_minor, 'discount_minor', v_inv.discount_minor, 'net_minor', v_inv.net_minor,
        'tax_minor', v_inv.tax_minor, 'total_minor', v_inv.total_minor) || public.invoice_money(v_inv.id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('description', it.description, 'quantity', it.quantity, 'unit_price_minor', it.unit_price_minor,
        'discount_minor', it.discount_minor, 'line_net_minor', it.line_net_minor) order by it.sort_order)
        from public.invoice_items it where it.invoice_id = v_inv.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('kind', p.kind, 'method', p.method, 'amount_minor', p.amount_minor, 'paid_at', p.paid_at) order by p.paid_at, p.created_at)
        from public.invoice_payments p where p.invoice_id = v_inv.id), '[]'::jsonb),
    'credit_notes', coalesce((select jsonb_agg(jsonb_build_object('number', cn.number, 'issued_at', cn.issued_at, 'net_minor', cn.net_minor,
        'tax_minor', cn.tax_minor, 'total_minor', cn.total_minor) order by cn.number_seq)
        from public.credit_notes cn where cn.invoice_id = v_inv.id), '[]'::jsonb),
    'branch', jsonb_build_object('name', v_branch.name, 'address', v_branch.address, 'phone', v_branch.phone, 'timezone', v_branch.timezone, 'currency', v_branch.currency),
    'business', jsonb_build_object('name', (select b.name from public.businesses b where b.id = v_inv.business_id)));
end $$;

-- Photos: ONLY with the Files add-on on AND the client's photo consent currently on; photos only (no documents).
create or replace function public.portal_photos(p_session text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ctx jsonb := public.portal_ctx(p_session);
  v_ids uuid[];
  v_biz uuid;
begin
  if v_ctx is null then return jsonb_build_object('ok', false, 'code', 'invalid_session'); end if;
  v_biz := (v_ctx ->> 'business_id')::uuid;
  if not public.business_has_feature(v_biz, 'files_photos') then return jsonb_build_object('ok', true, 'available', false, 'rows', '[]'::jsonb); end if;
  select array_agg(value::uuid) into v_ids from jsonb_array_elements_text(v_ctx -> 'client_ids');
  return jsonb_build_object('ok', true, 'available', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('id', f.id, 'category', f.category, 'created_at', f.created_at) order by f.created_at desc, f.id desc)
    from (select f.* from public.files f
          join public.client_consents cc on cc.client_id = f.client_id and cc.photo_consent
          where f.client_id = any (v_ids) and f.business_id = v_biz and f.kind = 'photo' and f.status = 'ready' and f.deleted_at is null
          order by f.created_at desc, f.id desc limit 100) f), '[]'::jsonb));
end $$;

-- The storage paths of those photos, for the Edge Function to sign (5 minutes). Same filter as above.
create or replace function public.portal_photo_paths(p_session text, p_file_ids uuid[])
returns table (file_id uuid, path text)
language plpgsql security definer set search_path = '' as $$
declare
  v_ctx jsonb := public.portal_ctx(p_session);
  v_ids uuid[];
  v_biz uuid;
begin
  if v_ctx is null then return; end if;
  v_biz := (v_ctx ->> 'business_id')::uuid;
  if not public.business_has_feature(v_biz, 'files_photos') then return; end if;
  select array_agg(value::uuid) into v_ids from jsonb_array_elements_text(v_ctx -> 'client_ids');
  return query
    select f.id, f.storage_path from public.files f
    join public.client_consents cc on cc.client_id = f.client_id and cc.photo_consent
    where f.id = any (p_file_ids[1:50]) and f.client_id = any (v_ids) and f.business_id = v_biz
      and f.kind = 'photo' and f.status = 'ready' and f.deleted_at is null;
end $$;

-- Signed forms: title, date, signer, status. READ ONLY, never the answers or the signature.
create or replace function public.portal_forms(p_session text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ctx jsonb := public.portal_ctx(p_session);
  v_ids uuid[];
  v_biz uuid;
begin
  if v_ctx is null then return jsonb_build_object('ok', false, 'code', 'invalid_session'); end if;
  v_biz := (v_ctx ->> 'business_id')::uuid;
  if not public.business_has_feature(v_biz, 'forms_consent') then return jsonb_build_object('ok', true, 'available', false, 'rows', '[]'::jsonb); end if;
  select array_agg(value::uuid) into v_ids from jsonb_array_elements_text(v_ctx -> 'client_ids');
  return jsonb_build_object('ok', true, 'available', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'title', v.title, 'kind', v.kind, 'signed_at', s.signed_at, 'signer_name', s.signer_name,
        'voided', x.signed_consent_id is not null) order by s.signed_at desc, s.id desc)
    from public.signed_consents s
    join public.form_template_versions v on v.id = s.template_version_id
    left join public.signed_consent_voids x on x.signed_consent_id = s.id
    where s.client_id = any (v_ids) and s.business_id = v_biz), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Actions (reuse the guest-manage / booking engines)
-- ---------------------------------------------------------------------------
-- One of the session's OWN appointments, or null.
create or replace function public.portal_own_appointment(p_ctx jsonb, p_appointment_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select a.id from public.appointments a
  where a.id = p_appointment_id and a.business_id = (p_ctx ->> 'business_id')::uuid and a.deleted_at is null
    and a.client_id in (select value::uuid from jsonb_array_elements_text(p_ctx -> 'client_ids'))
$$;
revoke all on function public.portal_own_appointment(jsonb, uuid) from public, anon, authenticated;

create or replace function public.portal_cancel_booking(p_session text, p_appointment_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ctx jsonb := public.portal_ctx(p_session);
  v_biz uuid;
  v_token text;
  r jsonb;
begin
  if v_ctx is null then return jsonb_build_object('ok', false, 'code', 'invalid_session'); end if;
  v_biz := (v_ctx ->> 'business_id')::uuid;
  if public.portal_own_appointment(v_ctx, p_appointment_id) is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  v_token := public.portal_mint_manage_token(v_biz, p_appointment_id);
  r := public.cancel_booking(v_token, p_reason);
  perform public.portal_revoke_manage_token(v_token);
  if (r ->> 'ok')::boolean then
    perform public.portal_audit(v_biz, 'portal.booking_cancelled', 'appointment', p_appointment_id::text, jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), '')));
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'code', case r ->> 'code' when 'invalid_token' then 'not_found' else coalesce(r ->> 'code', 'server_error') end);
end $$;

create or replace function public.portal_reschedule_slots(p_session text, p_appointment_id uuid, p_from date default null, p_to date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ctx jsonb := public.portal_ctx(p_session);
  v_token text;
  r jsonb;
begin
  if v_ctx is null then return jsonb_build_object('ok', false, 'code', 'invalid_session'); end if;
  if public.portal_own_appointment(v_ctx, p_appointment_id) is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  v_token := public.portal_mint_manage_token((v_ctx ->> 'business_id')::uuid, p_appointment_id);
  r := public.get_booking_reschedule_slots(v_token, p_from, p_to);
  perform public.portal_revoke_manage_token(v_token);
  return r;
end $$;

create or replace function public.portal_reschedule_booking(p_session text, p_appointment_id uuid, p_starts_at timestamptz, p_staff_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ctx jsonb := public.portal_ctx(p_session);
  v_biz uuid;
  v_token text;
  r jsonb;
begin
  if v_ctx is null then return jsonb_build_object('ok', false, 'code', 'invalid_session'); end if;
  v_biz := (v_ctx ->> 'business_id')::uuid;
  if public.portal_own_appointment(v_ctx, p_appointment_id) is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  v_token := public.portal_mint_manage_token(v_biz, p_appointment_id);
  r := public.reschedule_booking(v_token, p_starts_at, p_staff_id);
  perform public.portal_revoke_manage_token(v_token);
  if (r ->> 'ok')::boolean then
    perform public.portal_audit(v_biz, 'portal.booking_rescheduled', 'appointment', p_appointment_id::text, jsonb_build_object('starts_at', p_starts_at));
    -- the reschedule issues a NEW guest manage token for the booking; it is emailed, never returned here
    return jsonb_build_object('ok', true, 'starts_at', r -> 'starts_at', 'ends_at', r -> 'ends_at');
  end if;
  return jsonb_build_object('ok', false, 'code', case r ->> 'code' when 'invalid_token' then 'not_found' else coalesce(r ->> 'code', 'server_error') end);
end $$;

-- Book a new appointment for one of the session's own clients. The client is NOT created or edited
-- (create_booking is given that client's own name / phone / email, so it resolves to the same person).
create or replace function public.portal_create_booking(p_session text, p_client_id uuid, p_service_id uuid, p_starts_at timestamptz, p_staff_id uuid default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ctx jsonb := public.portal_ctx(p_session);
  v_biz uuid;
  v_client record;
  v_branch uuid;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  r jsonb;
  v_owner uuid;
begin
  if v_ctx is null then return jsonb_build_object('ok', false, 'code', 'invalid_session'); end if;
  v_biz := (v_ctx ->> 'business_id')::uuid;
  if p_client_id is null or not (v_ctx -> 'client_ids') ? p_client_id::text then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  select c.id, c.full_name, c.phone_e164, c.email::text as email into v_client from public.clients c where c.id = p_client_id and c.business_id = v_biz and c.deleted_at is null;
  if v_client.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  select b.id into v_branch from public.branches b where b.business_id = v_biz and b.is_primary and b.deleted_at is null limit 1;
  if v_branch is null then return jsonb_build_object('ok', false, 'code', 'not_bookable'); end if;
  r := public.create_booking(v_branch, p_service_id, p_starts_at, p_staff_id, v_client.full_name, v_client.phone_e164, v_client.email,
                             nullif(btrim(coalesce(p_notes, '')), ''), '[]'::jsonb, v_token);
  if not (r ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'code', case r ->> 'code' when 'missing_answer' then 'needs_details' when 'invalid_answer' then 'needs_details' else coalesce(r ->> 'code', 'server_error') end);
  end if;
  select a.client_id into v_owner from public.appointments a where a.id = (r ->> 'appointment_id')::uuid;
  perform public.portal_audit(v_biz, 'portal.booking_created', 'appointment', r ->> 'appointment_id',
    jsonb_build_object('client_id', p_client_id, 'service_id', p_service_id, 'starts_at', p_starts_at, 'same_client', v_owner = p_client_id));
  return jsonb_build_object('ok', true, 'appointment_id', r -> 'appointment_id', 'status', r -> 'status', 'starts_at', r -> 'starts_at',
                            'ends_at', r -> 'ends_at', 'service_name', r -> 'service_name');
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'portal_overview(text)', 'portal_bookings(text,text,integer,integer)', 'portal_packages(text)', 'portal_invoices(text,integer,integer)',
    'portal_invoice(text,uuid)', 'portal_photos(text)', 'portal_photo_paths(text,uuid[])', 'portal_forms(text)',
    'portal_cancel_booking(text,uuid,text)', 'portal_reschedule_slots(text,uuid,date,date)',
    'portal_reschedule_booking(text,uuid,timestamptz,uuid)', 'portal_create_booking(text,uuid,uuid,timestamptz,uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
