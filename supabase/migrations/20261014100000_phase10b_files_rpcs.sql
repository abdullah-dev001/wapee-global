-- Phase 10B (2/3): Files & Photos RPCs.
--
-- The flow (the Edge Function `client_files` is the only caller that touches the bucket):
--   1. files_prepare_upload  (authenticated, checks everything, inserts a PENDING row, returns the path)
--   2. the Edge Function mints a signed UPLOAD url for that exact path; the browser PUTs the bytes
--   3. files_finalize        (service_role only): the Edge Function read the object's first bytes and
--                            size; the row becomes `ready` or `rejected`
--   4. files_access          (authenticated): which of these ids may I view? -> the Edge Function mints
--                            signed READ urls (<= 5 minutes) for exactly those paths
-- Same posture as every module RPC: explicit permission + client scope + feature gate, validate
-- everything, then ONE write, `{ok:false,code}` for an expected failure.

create or replace function public.files_prepare_upload(
  p_client_id uuid, p_appointment_id uuid, p_category text, p_original_name text, p_mime text, p_size bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_client record;
  v_appt record;
  v_gate jsonb;
  v_kind text;
  v_ext text;
  v_name text := btrim(regexp_replace(coalesce(p_original_name, ''), '[\x00-\x1f/\\]', '', 'g'));
  v_consent boolean;
  v_id uuid := gen_random_uuid();
  v_path text;
  v_live integer;
begin
  if (select auth.uid()) is null then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select c.id, c.business_id into v_client from public.clients c where c.id = p_client_id and c.deleted_at is null;
  if v_client.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.client_access(v_client.business_id, v_client.id, 'files.upload') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  v_gate := public.feature_gate_error(v_client.business_id, 'files_photos');
  if v_gate is not null then return v_gate; end if;

  if p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    return jsonb_build_object('ok', false, 'code', 'unsupported_type');
  end if;
  if p_size is null or p_size < 1 or p_size > 10485760 then
    return jsonb_build_object('ok', false, 'code', case when p_size > 10485760 then 'file_too_large' else 'invalid_size' end);
  end if;
  if char_length(v_name) < 1 then return jsonb_build_object('ok', false, 'code', 'invalid_name'); end if;
  v_name := left(v_name, 120);
  v_kind := case when p_mime = 'application/pdf' then 'document' else 'photo' end;
  v_ext := case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'pdf' end;
  if p_category is null or not (
       (v_kind = 'photo' and p_category in ('before', 'after', 'damage', 'other'))
    or (v_kind = 'document' and p_category in ('document', 'other'))) then
    return jsonb_build_object('ok', false, 'code', 'invalid_category');
  end if;
  if p_appointment_id is not null then
    select a.id into v_appt from public.appointments a
    where a.id = p_appointment_id and a.business_id = v_client.business_id and a.client_id = v_client.id and a.deleted_at is null;
    if v_appt.id is null then return jsonb_build_object('ok', false, 'code', 'appointment_mismatch'); end if;
  end if;
  -- Photo consent: a PHOTO needs it, a document does not.
  if v_kind = 'photo' then
    select cc.photo_consent into v_consent from public.client_consents cc where cc.client_id = v_client.id;
    if not coalesce(v_consent, false) then return jsonb_build_object('ok', false, 'code', 'photo_consent_required'); end if;
  end if;
  -- Per-business cap on live files (a pending row older than an hour is an abandoned upload).
  select count(*) into v_live from public.files f
  where f.business_id = v_client.business_id and f.deleted_at is null
    and (f.status = 'ready' or (f.status = 'pending' and f.created_at > now() - interval '1 hour'));
  if v_live >= 5000 then return jsonb_build_object('ok', false, 'code', 'file_cap_reached'); end if;

  -- All validation done. Write once.
  v_path := v_client.business_id::text || '/' || v_client.id::text || '/' || v_id::text || '.' || v_ext;
  insert into public.files (id, business_id, client_id, appointment_id, kind, category, storage_path, original_name,
                            mime_type, size_bytes, status, created_by)
  values (v_id, v_client.business_id, v_client.id, p_appointment_id, v_kind, p_category, v_path, v_name,
          p_mime, p_size, 'pending', auth.uid());
  return jsonb_build_object('ok', true, 'file_id', v_id, 'path', v_path, 'kind', v_kind);
end $$;

-- The Edge Function (service role) reports what it found in the object. A file whose detected type
-- is not the declared one, or whose size differs, is rejected. Only the uploader's pending row.
create or replace function public.files_finalize(p_file_id uuid, p_user_id uuid, p_detected_mime text, p_size bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_f record;
  v_ok boolean;
begin
  select f.id, f.business_id, f.client_id, f.mime_type, f.size_bytes, f.status, f.created_by, f.original_name
    into v_f from public.files f where f.id = p_file_id for update;
  if v_f.id is null or v_f.status <> 'pending' or v_f.created_by is distinct from p_user_id then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  v_ok := p_detected_mime is not distinct from v_f.mime_type and p_size is not null and p_size between 1 and 10485760;
  update public.files set status = case when v_ok then 'ready' else 'rejected' end,
         ready_at = case when v_ok then now() end,
         size_bytes = case when v_ok then p_size else size_bytes end
  where id = p_file_id;
  if v_ok then
    perform set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
    perform public.write_audit_log(v_f.business_id, 'file.uploaded', 'file', p_file_id::text, null,
      jsonb_build_object('client_id', v_f.client_id, 'name', v_f.original_name, 'mime', v_f.mime_type, 'size', p_size));
  end if;
  return jsonb_build_object('ok', v_ok, 'status', case when v_ok then 'ready' else 'rejected' end);
end $$;
revoke all on function public.files_finalize(uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.files_finalize(uuid, uuid, text, bigint) to service_role;

-- Which of these files may the caller view? (paths are returned to the Edge Function only.)
create or replace function public.files_access(p_file_ids uuid[])
returns table (file_id uuid, path text, mime text, name text)
language sql stable security definer set search_path = '' as $$
  select f.id, f.storage_path, f.mime_type, f.original_name
  from public.files f
  where f.id = any (p_file_ids[1:50])
    and f.status = 'ready' and f.deleted_at is null
    and (select auth.uid()) is not null
    and public.file_visible(f.business_id, f.client_id)
$$;

-- Metadata list for a client (optionally one appointment), newest first, keyset pages.
create or replace function public.list_client_files(
  p_client_id uuid, p_appointment_id uuid default null, p_limit integer default 20,
  p_before_at timestamptz default null, p_before_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_biz uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_rows jsonb;
  v_n integer;
begin
  select c.business_id into v_biz from public.clients c where c.id = p_client_id;
  if v_biz is null or (select auth.uid()) is null or not public.file_visible(v_biz, p_client_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc, t.id desc), '[]'::jsonb), count(*) into v_rows, v_n
  from (
    select f.id, f.kind, f.category, f.original_name as name, f.mime_type as mime, f.size_bytes as size,
           f.appointment_id, f.created_at, f.created_by
    from public.files f
    where f.client_id = p_client_id and f.status = 'ready' and f.deleted_at is null
      and (p_appointment_id is null or f.appointment_id = p_appointment_id)
      and (p_before_at is null or (f.created_at, f.id) < (p_before_at, p_before_id))
    order by f.created_at desc, f.id desc
    limit v_limit + 1
  ) t;
  return jsonb_build_object('ok', true, 'rows', (select coalesce(jsonb_agg(e.x order by e.n), '[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality as e(x, n) where e.n <= v_limit),
                            'has_more', v_n > v_limit);
end $$;

-- Soft delete (the object stays in the bucket; no URL is ever minted for a deleted file).
create or replace function public.delete_file(p_file_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_f record;
  v_gate jsonb;
begin
  select f.id, f.business_id, f.client_id, f.original_name, f.deleted_at, f.status into v_f from public.files f where f.id = p_file_id for update;
  if v_f.id is null or v_f.deleted_at is not null or v_f.status <> 'ready' then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if (select auth.uid()) is null or not public.client_access(v_f.business_id, v_f.client_id, 'files.upload') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  v_gate := public.feature_gate_error(v_f.business_id, 'files_photos');
  if v_gate is not null then return v_gate; end if;
  update public.files set deleted_at = now(), deleted_by = auth.uid() where id = p_file_id;
  perform public.write_audit_log(v_f.business_id, 'file.deleted', 'file', p_file_id::text,
    jsonb_build_object('client_id', v_f.client_id, 'name', v_f.original_name),
    jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), '')));
  return jsonb_build_object('ok', true);
end $$;

-- Photo consent (clients.edit on the client; every change audited).
create or replace function public.set_photo_consent(p_client_id uuid, p_value boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_c record;
  v_old boolean;
  v_gate jsonb;
begin
  select c.id, c.business_id into v_c from public.clients c where c.id = p_client_id and c.deleted_at is null;
  if v_c.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if (select auth.uid()) is null or p_value is null or not public.client_access(v_c.business_id, v_c.id, 'clients.edit') then
    return jsonb_build_object('ok', false, 'code', case when p_value is null then 'invalid_value' else 'forbidden' end);
  end if;
  v_gate := public.feature_gate_error(v_c.business_id, 'files_photos');
  if v_gate is not null then return v_gate; end if;
  select cc.photo_consent into v_old from public.client_consents cc where cc.client_id = v_c.id;
  if v_old is not distinct from p_value then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  insert into public.client_consents (client_id, business_id, photo_consent, recorded_at, recorded_by)
  values (v_c.id, v_c.business_id, p_value, now(), auth.uid())
  on conflict (client_id) do update set photo_consent = excluded.photo_consent, recorded_at = now(), recorded_by = auth.uid();
  perform public.write_audit_log(v_c.business_id, 'client.photo_consent_changed', 'client', v_c.id::text,
    jsonb_build_object('photo_consent', coalesce(v_old, false)), jsonb_build_object('photo_consent', p_value));
  return jsonb_build_object('ok', true, 'unchanged', false);
end $$;

-- What the Files tab needs about a client: consent (value, date, who) and what the caller may do.
create or replace function public.get_client_files_state(p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_c record;
  v_cc record;
  v_who text;
  v_view boolean;
  v_up boolean;
begin
  select c.id, c.business_id into v_c from public.clients c where c.id = p_client_id;
  if v_c.id is null or (select auth.uid()) is null then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  if not public.business_has_feature(v_c.business_id, 'files_photos') then
    return jsonb_build_object('ok', false, 'code', 'feature_unavailable');
  end if;
  v_view := public.client_access(v_c.business_id, v_c.id, 'files.view');
  v_up := public.client_access(v_c.business_id, v_c.id, 'files.upload');
  if not (v_view or v_up) then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select cc.photo_consent, cc.recorded_at, cc.recorded_by into v_cc from public.client_consents cc where cc.client_id = v_c.id;
  select p.full_name into v_who from public.profiles p where p.id = v_cc.recorded_by;
  return jsonb_build_object('ok', true,
    'photo_consent', coalesce(v_cc.photo_consent, false), 'recorded_at', v_cc.recorded_at, 'recorded_by_name', v_who,
    'can_view', v_view, 'can_upload', v_up,
    'can_edit_consent', public.client_access(v_c.business_id, v_c.id, 'clients.edit'));
end $$;

revoke all on function public.files_prepare_upload(uuid, uuid, text, text, text, bigint) from public, anon;
revoke all on function public.files_access(uuid[]) from public, anon;
revoke all on function public.list_client_files(uuid, uuid, integer, timestamptz, uuid) from public, anon;
revoke all on function public.delete_file(uuid, text) from public, anon;
revoke all on function public.set_photo_consent(uuid, boolean) from public, anon;
revoke all on function public.get_client_files_state(uuid) from public, anon;
grant execute on function public.files_prepare_upload(uuid, uuid, text, text, text, bigint) to authenticated;
grant execute on function public.files_access(uuid[]) to authenticated;
grant execute on function public.list_client_files(uuid, uuid, integer, timestamptz, uuid) to authenticated;
grant execute on function public.delete_file(uuid, text) to authenticated;
grant execute on function public.set_photo_consent(uuid, boolean) to authenticated;
grant execute on function public.get_client_files_state(uuid) to authenticated;
