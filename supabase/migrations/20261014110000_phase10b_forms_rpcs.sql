-- Phase 10B (3/3): Forms & Consent RPCs.
--
--   templates   save_form_template (a changed template becomes a NEW immutable version; the same
--               content is a no-op), delete_form_template (soft)
--   signing     record_signed_consent (dashboard, on the device), create_form_request (tokenised
--               link: copy it and/or email it through the outbox), then the PUBLIC pair
--               get_form_request / submit_form_request (service_role only, via the `sign_form` Edge
--               Function: rate limited, honeypot, generic invalid_token)
--   reading     list_signed_consents / get_signed_consent (sensitive answers redacted unless the
--               caller holds clients.view_sensitive), appointment_forms (pending / signed)
--   void        void_signed_consent (a NEW row; the signed copy itself is never touched)
-- Every RPC validates everything first and then writes once; an expected failure is returned as
-- {ok:false,code}, never raised (a public RPC behind a rate limiter must not raise).

-- ---------------------------------------------------------------------------
-- Validation helpers (internal)
-- ---------------------------------------------------------------------------
create or replace function public.validate_form_fields(p_fields jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_e jsonb;
  v_out jsonb := '[]'::jsonb;
  v_ids text[] := '{}';
  v_id text;
  v_type text;
  v_label text;
  v_help text;
  v_opts jsonb;
  v_n integer;
  v_distinct integer;
begin
  if p_fields is null then p_fields := '[]'::jsonb; end if;
  if jsonb_typeof(p_fields) <> 'array' or jsonb_array_length(p_fields) > 40 then
    return jsonb_build_object('ok', false, 'code', 'invalid_fields');
  end if;
  for v_e in select value from jsonb_array_elements(p_fields) loop
    if jsonb_typeof(v_e) <> 'object' then return jsonb_build_object('ok', false, 'code', 'invalid_fields'); end if;
    v_type := v_e ->> 'type';
    if v_type is null or v_type not in ('short_text', 'long_text', 'dropdown', 'yes_no', 'number') then
      return jsonb_build_object('ok', false, 'code', 'invalid_field_type');
    end if;
    v_label := btrim(coalesce(v_e ->> 'label', ''));
    if char_length(v_label) not between 1 and 200 then return jsonb_build_object('ok', false, 'code', 'invalid_field_label'); end if;
    v_help := nullif(btrim(coalesce(v_e ->> 'help', '')), '');
    if v_help is not null and char_length(v_help) > 300 then return jsonb_build_object('ok', false, 'code', 'invalid_field_label'); end if;
    v_id := coalesce(nullif(v_e ->> 'id', ''), gen_random_uuid()::text);
    if v_id !~ '^[A-Za-z0-9_-]{1,40}$' or v_id = any (v_ids) then return jsonb_build_object('ok', false, 'code', 'invalid_field_id'); end if;
    v_ids := v_ids || v_id;
    v_opts := null;
    if v_type = 'dropdown' then
      v_opts := v_e -> 'options';
      if v_opts is null or jsonb_typeof(v_opts) <> 'array' then return jsonb_build_object('ok', false, 'code', 'invalid_options'); end if;
      select count(*), count(distinct btrim(x)) into v_n, v_distinct from jsonb_array_elements_text(v_opts) x;
      if v_n not between 2 and 50 or v_n <> v_distinct
         or exists (select 1 from jsonb_array_elements_text(v_opts) x where char_length(btrim(x)) not between 1 and 100) then
        return jsonb_build_object('ok', false, 'code', 'invalid_options');
      end if;
      v_opts := (select jsonb_agg(btrim(x)) from jsonb_array_elements_text(v_opts) x);
    end if;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', v_id, 'type', v_type, 'label', v_label, 'help', v_help, 'options', v_opts,
      'required', coalesce((v_e ->> 'required')::boolean, false),
      'sensitive', coalesce((v_e ->> 'sensitive')::boolean, false))));
  end loop;
  return jsonb_build_object('ok', true, 'fields', v_out);
exception when invalid_text_representation then
  return jsonb_build_object('ok', false, 'code', 'invalid_fields');
end $$;
revoke all on function public.validate_form_fields(jsonb) from public, anon, authenticated;

-- The consent text: a list of plain blocks (never HTML), so nothing rendered can carry script.
create or replace function public.validate_form_body(p_body jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_e jsonb;
  v_out jsonb := '[]'::jsonb;
  v_text text;
  v_total integer := 0;
begin
  if p_body is null then p_body := '[]'::jsonb; end if;
  if jsonb_typeof(p_body) <> 'array' or jsonb_array_length(p_body) > 100 then
    return jsonb_build_object('ok', false, 'code', 'invalid_body');
  end if;
  for v_e in select value from jsonb_array_elements(p_body) loop
    if jsonb_typeof(v_e) <> 'object' or (v_e ->> 'type') not in ('heading', 'paragraph', 'bullet') then
      return jsonb_build_object('ok', false, 'code', 'invalid_body');
    end if;
    v_text := btrim(coalesce(v_e ->> 'text', ''));
    if char_length(v_text) not between 1 and 2000 then return jsonb_build_object('ok', false, 'code', 'invalid_body'); end if;
    v_total := v_total + char_length(v_text);
    v_out := v_out || jsonb_build_array(jsonb_build_object('type', v_e ->> 'type', 'text', v_text));
  end loop;
  if v_total > 20000 then return jsonb_build_object('ok', false, 'code', 'invalid_body'); end if;
  return jsonb_build_object('ok', true, 'body', v_out);
end $$;
revoke all on function public.validate_form_body(jsonb) from public, anon, authenticated;

-- Answers vs the version's fields -> normalised {field_id: value}.
create or replace function public.validate_form_answers(p_fields jsonb, p_answers jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_f jsonb;
  v_id text;
  v_type text;
  v_val jsonb;
  v_out jsonb := '{}'::jsonb;
  v_text text;
  v_max integer;
begin
  if p_answers is null then p_answers := '{}'::jsonb; end if;
  if jsonb_typeof(p_answers) <> 'object' then return jsonb_build_object('ok', false, 'code', 'invalid_answer'); end if;
  if exists (select 1 from jsonb_object_keys(p_answers) k
             where k not in (select e ->> 'id' from jsonb_array_elements(p_fields) e)) then
    return jsonb_build_object('ok', false, 'code', 'invalid_answer');
  end if;
  for v_f in select value from jsonb_array_elements(p_fields) loop
    v_id := v_f ->> 'id'; v_type := v_f ->> 'type';
    v_val := p_answers -> v_id;
    if v_val is null or v_val = 'null'::jsonb or (jsonb_typeof(v_val) = 'string' and btrim(v_val #>> '{}') = '') then
      if coalesce((v_f ->> 'required')::boolean, false) then
        return jsonb_build_object('ok', false, 'code', 'missing_answer', 'field_id', v_id);
      end if;
      continue;
    end if;
    if v_type = 'yes_no' then
      if jsonb_typeof(v_val) <> 'boolean' then return jsonb_build_object('ok', false, 'code', 'invalid_answer', 'field_id', v_id); end if;
      v_out := v_out || jsonb_build_object(v_id, v_val);
    elsif v_type = 'number' then
      if jsonb_typeof(v_val) <> 'number' or abs((v_val #>> '{}')::numeric) > 1000000000000 then
        return jsonb_build_object('ok', false, 'code', 'invalid_answer', 'field_id', v_id);
      end if;
      v_out := v_out || jsonb_build_object(v_id, v_val);
    else
      if jsonb_typeof(v_val) <> 'string' then return jsonb_build_object('ok', false, 'code', 'invalid_answer', 'field_id', v_id); end if;
      v_text := btrim(v_val #>> '{}');
      v_max := case when v_type = 'long_text' then 5000 else 500 end;
      if char_length(v_text) > v_max
         or (v_type = 'dropdown' and not (v_f -> 'options') @> to_jsonb(v_text)) then
        return jsonb_build_object('ok', false, 'code', 'invalid_answer', 'field_id', v_id);
      end if;
      v_out := v_out || jsonb_build_object(v_id, v_text);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'answers', v_out);
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('ok', false, 'code', 'invalid_answer');
end $$;
revoke all on function public.validate_form_answers(jsonb, jsonb) from public, anon, authenticated;

-- A signature = strokes of [x,y] points in 0..1 (the pad's own coordinate space). Bounded.
create or replace function public.validate_signature(p_sig jsonb, p_required boolean)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_stroke jsonb;
  v_pt jsonb;
  v_points integer := 0;
  v_out jsonb := '[]'::jsonb;
  v_s jsonb;
begin
  if p_sig is null or p_sig = 'null'::jsonb or (jsonb_typeof(p_sig) = 'array' and jsonb_array_length(p_sig) = 0) then
    if p_required then return jsonb_build_object('ok', false, 'code', 'signature_required'); end if;
    return jsonb_build_object('ok', true, 'signature', null);
  end if;
  if jsonb_typeof(p_sig) <> 'array' or jsonb_array_length(p_sig) > 50 then
    return jsonb_build_object('ok', false, 'code', 'invalid_signature');
  end if;
  for v_stroke in select value from jsonb_array_elements(p_sig) loop
    if jsonb_typeof(v_stroke) <> 'array' or jsonb_array_length(v_stroke) not between 1 and 1000 then
      return jsonb_build_object('ok', false, 'code', 'invalid_signature');
    end if;
    v_s := '[]'::jsonb;
    for v_pt in select value from jsonb_array_elements(v_stroke) loop
      if jsonb_typeof(v_pt) <> 'array' or jsonb_array_length(v_pt) <> 2
         or jsonb_typeof(v_pt -> 0) <> 'number' or jsonb_typeof(v_pt -> 1) <> 'number'
         or (v_pt ->> 0)::numeric not between 0 and 1 or (v_pt ->> 1)::numeric not between 0 and 1 then
        return jsonb_build_object('ok', false, 'code', 'invalid_signature');
      end if;
      v_s := v_s || jsonb_build_array(jsonb_build_array(round((v_pt ->> 0)::numeric, 4), round((v_pt ->> 1)::numeric, 4)));
      v_points := v_points + 1;
    end loop;
    if v_points > 5000 then return jsonb_build_object('ok', false, 'code', 'invalid_signature'); end if;
    v_out := v_out || jsonb_build_array(v_s);
  end loop;
  return jsonb_build_object('ok', true, 'signature', v_out);
exception when invalid_text_representation then
  return jsonb_build_object('ok', false, 'code', 'invalid_signature');
end $$;
revoke all on function public.validate_signature(jsonb, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------
create or replace function public.save_form_template(
  p_business_id uuid, p_template_id uuid, p_kind text, p_title text, p_fields jsonb, p_body jsonb,
  p_requires_signature boolean, p_service_ids uuid[], p_is_active boolean default true
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_t record;
  v_biz uuid := p_business_id;
  v_gate jsonb;
  v_title text := btrim(coalesce(p_title, ''));
  v_kind text := p_kind;
  v_f jsonb;
  v_b jsonb;
  v_ids uuid[];
  v_digest text;
  v_last record;
  v_tid uuid := p_template_id;
  v_vid uuid;
  v_ver integer;
  v_changed boolean := true;
begin
  if (select auth.uid()) is null then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  if p_template_id is not null then
    select t.id, t.business_id, t.kind, t.deleted_at into v_t from public.form_templates t where t.id = p_template_id for update;
    if v_t.id is null or v_t.deleted_at is not null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
    v_biz := v_t.business_id; v_kind := v_t.kind;
  end if;
  if v_biz is null or not public.covers_every_branch(v_biz, 'forms.manage') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  v_gate := public.feature_gate_error(v_biz, 'forms_consent');
  if v_gate is not null then return v_gate; end if;
  if v_kind is null or v_kind not in ('intake', 'consent') then return jsonb_build_object('ok', false, 'code', 'invalid_kind'); end if;
  if char_length(v_title) not between 1 and 120 then return jsonb_build_object('ok', false, 'code', 'invalid_title'); end if;
  v_f := public.validate_form_fields(p_fields);
  if not (v_f ->> 'ok')::boolean then return v_f; end if;
  v_b := public.validate_form_body(p_body);
  if not (v_b ->> 'ok')::boolean then return v_b; end if;
  if p_requires_signature is null then return jsonb_build_object('ok', false, 'code', 'invalid_signature'); end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_service_ids, '{}')) x;
  if (select count(*) from public.services s where s.id = any (v_ids) and s.business_id = v_biz and s.deleted_at is null)
     <> coalesce(array_length(v_ids, 1), 0) then
    return jsonb_build_object('ok', false, 'code', 'unknown_service');
  end if;
  v_digest := encode(extensions.digest(jsonb_build_object('t', v_title, 'f', v_f -> 'fields', 'b', v_b -> 'body', 's', p_requires_signature)::text, 'sha256'), 'hex');

  -- All validation done. Write.
  if v_tid is null then
    insert into public.form_templates (business_id, kind, title, is_active, created_by)
    values (v_biz, v_kind, v_title, coalesce(p_is_active, true), auth.uid()) returning id into v_tid;
    v_ver := 0;
  else
    update public.form_templates set title = v_title, is_active = coalesce(p_is_active, true) where id = v_tid;
    select v.id, v.version, v.digest into v_last from public.form_template_versions v where v.template_id = v_tid order by v.version desc limit 1;
    v_ver := coalesce(v_last.version, 0);
    if v_last.id is not null and v_last.digest = v_digest then v_changed := false; v_vid := v_last.id; end if;
  end if;
  if v_changed then
    insert into public.form_template_versions (template_id, business_id, version, kind, title, fields, body, requires_signature, digest, created_by)
    values (v_tid, v_biz, v_ver + 1, v_kind, v_title, v_f -> 'fields', v_b -> 'body', p_requires_signature, v_digest, auth.uid())
    returning id, version into v_vid, v_ver;
  end if;
  delete from public.form_template_services where template_id = v_tid;
  insert into public.form_template_services (template_id, service_id, business_id) select v_tid, x, v_biz from unnest(v_ids) x;
  perform public.write_audit_log(v_biz, case when p_template_id is null then 'form.created' else 'form.updated' end, 'form_template', v_tid::text, null,
    jsonb_build_object('title', v_title, 'kind', v_kind, 'version', v_ver, 'new_version', v_changed, 'is_active', coalesce(p_is_active, true)));
  return jsonb_build_object('ok', true, 'template_id', v_tid, 'version_id', v_vid, 'version', v_ver, 'new_version', v_changed);
end $$;

create or replace function public.delete_form_template(p_template_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_t record;
  v_gate jsonb;
begin
  select t.id, t.business_id, t.title, t.deleted_at into v_t from public.form_templates t where t.id = p_template_id for update;
  if v_t.id is null or v_t.deleted_at is not null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if (select auth.uid()) is null or not public.covers_every_branch(v_t.business_id, 'forms.manage') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  v_gate := public.feature_gate_error(v_t.business_id, 'forms_consent');
  if v_gate is not null then return v_gate; end if;
  update public.form_templates set deleted_at = now(), is_active = false where id = p_template_id;
  update public.form_requests set revoked_at = now()
  where revoked_at is null and used_at is null
    and template_version_id in (select v.id from public.form_template_versions v where v.template_id = p_template_id);
  perform public.write_audit_log(v_t.business_id, 'form.deleted', 'form_template', p_template_id::text, jsonb_build_object('title', v_t.title), null);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Signing
-- ---------------------------------------------------------------------------
-- The one place a signed copy is written (dashboard and link). Validates everything, inserts once.
create or replace function public.create_signed_consent(
  p_version_id uuid, p_client_id uuid, p_appointment_id uuid, p_request_id uuid, p_answers jsonb,
  p_signer_name text, p_signature jsonb, p_via text, p_ip_hash text, p_by uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_v record;
  v_c record;
  v_branch uuid;
  v_ans jsonb;
  v_sig jsonb;
  v_name text := btrim(coalesce(p_signer_name, ''));
  v_id uuid;
begin
  select v.id, v.template_id, v.business_id, v.fields, v.requires_signature into v_v from public.form_template_versions v where v.id = p_version_id;
  select c.id, c.business_id, c.first_branch_id into v_c from public.clients c where c.id = p_client_id and c.deleted_at is null;
  if v_v.id is null or v_c.id is null or v_c.business_id <> v_v.business_id then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if char_length(v_name) not between 2 and 120 then return jsonb_build_object('ok', false, 'code', 'invalid_name'); end if;
  v_ans := public.validate_form_answers(v_v.fields, p_answers);
  if not (v_ans ->> 'ok')::boolean then return v_ans; end if;
  v_sig := public.validate_signature(p_signature, v_v.requires_signature);
  if not (v_sig ->> 'ok')::boolean then return v_sig; end if;
  if p_appointment_id is not null then
    select a.branch_id into v_branch from public.appointments a
    where a.id = p_appointment_id and a.client_id = v_c.id and a.business_id = v_c.business_id and a.deleted_at is null;
    if v_branch is null then return jsonb_build_object('ok', false, 'code', 'appointment_mismatch'); end if;
  else
    v_branch := coalesce(v_c.first_branch_id, (select b.id from public.branches b where b.business_id = v_c.business_id and b.is_primary and b.deleted_at is null limit 1),
                         (select b.id from public.branches b where b.business_id = v_c.business_id and b.deleted_at is null order by b.created_at limit 1));
  end if;
  insert into public.signed_consents (business_id, branch_id, client_id, appointment_id, template_id, template_version_id, request_id,
                                      answers, signer_name, signature, signed_via, ip_hash, captured_by)
  values (v_c.business_id, v_branch, v_c.id, p_appointment_id, v_v.template_id, v_v.id, p_request_id,
          v_ans -> 'answers', v_name, v_sig -> 'signature', p_via, p_ip_hash, p_by)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'signed_consent_id', v_id, 'business_id', v_c.business_id);
end $$;
revoke all on function public.create_signed_consent(uuid, uuid, uuid, uuid, jsonb, text, jsonb, text, text, uuid) from public, anon, authenticated;

-- May the caller capture a signature / send a link for this client? Handling the visit (appointments.edit),
-- on a client in scope (Own scope: their own appointment's client).
create or replace function public.forms_can_sign(p_business_id uuid, p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and public.client_access(p_business_id, p_client_id, 'appointments.edit')
$$;
revoke all on function public.forms_can_sign(uuid, uuid) from public, anon, authenticated;

create or replace function public.record_signed_consent(
  p_client_id uuid, p_appointment_id uuid, p_template_id uuid, p_answers jsonb, p_signer_name text, p_signature jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_c record;
  v_t record;
  v_ver uuid;
  v_gate jsonb;
  r jsonb;
begin
  select c.id, c.business_id into v_c from public.clients c where c.id = p_client_id and c.deleted_at is null;
  if v_c.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.forms_can_sign(v_c.business_id, v_c.id) then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  v_gate := public.feature_gate_error(v_c.business_id, 'forms_consent');
  if v_gate is not null then return v_gate; end if;
  select t.id, t.title into v_t from public.form_templates t
  where t.id = p_template_id and t.business_id = v_c.business_id and t.deleted_at is null and t.is_active;
  if v_t.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  select v.id into v_ver from public.form_template_versions v where v.template_id = v_t.id order by v.version desc limit 1;
  r := public.create_signed_consent(v_ver, v_c.id, p_appointment_id, null, p_answers, p_signer_name, p_signature, 'dashboard', null, auth.uid());
  if not (r ->> 'ok')::boolean then return r; end if;
  perform public.write_audit_log(v_c.business_id, 'form.signed', 'signed_consent', r ->> 'signed_consent_id', null,
    jsonb_build_object('client_id', v_c.id, 'template', v_t.title, 'via', 'dashboard', 'appointment_id', p_appointment_id));
  return jsonb_build_object('ok', true, 'signed_consent_id', r ->> 'signed_consent_id');
end $$;

-- The tokenised link. The raw token is returned ONCE (the database keeps only its sha256) and, when
-- asked, sealed into an outbox email for the client.
create or replace function public.create_form_request(
  p_client_id uuid, p_appointment_id uuid, p_template_id uuid, p_send boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_c record;
  v_t record;
  v_ver uuid;
  v_gate jsonb;
  v_branch uuid;
  v_token text;
  v_id uuid;
  v_exp timestamptz := now() + interval '14 days';
  v_outbox uuid;
begin
  select c.id, c.business_id, c.first_branch_id into v_c from public.clients c where c.id = p_client_id and c.deleted_at is null;
  if v_c.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.forms_can_sign(v_c.business_id, v_c.id) then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  v_gate := public.feature_gate_error(v_c.business_id, 'forms_consent');
  if v_gate is not null then return v_gate; end if;
  select t.id into v_t from public.form_templates t
  where t.id = p_template_id and t.business_id = v_c.business_id and t.deleted_at is null and t.is_active;
  if v_t.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if p_appointment_id is not null then
    select a.branch_id into v_branch from public.appointments a
    where a.id = p_appointment_id and a.client_id = v_c.id and a.business_id = v_c.business_id and a.deleted_at is null;
    if v_branch is null then return jsonb_build_object('ok', false, 'code', 'appointment_mismatch'); end if;
  else
    v_branch := coalesce(v_c.first_branch_id, (select b.id from public.branches b where b.business_id = v_c.business_id and b.is_primary and b.deleted_at is null limit 1));
  end if;
  select v.id into v_ver from public.form_template_versions v where v.template_id = v_t.id order by v.version desc limit 1;

  -- All validation done. Write: retire the open links for this client + template, then issue one.
  update public.form_requests set revoked_at = now()
  where client_id = v_c.id and revoked_at is null and used_at is null
    and template_version_id in (select x.id from public.form_template_versions x where x.template_id = v_t.id);
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.form_requests (business_id, branch_id, client_id, appointment_id, template_version_id, token_hash, expires_at, created_by)
  values (v_c.business_id, v_branch, v_c.id, p_appointment_id, v_ver, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_exp, auth.uid())
  returning id into v_id;
  if coalesce(p_send, false) then
    v_outbox := public.outbox_enqueue(v_c.business_id, v_branch, 'form_request', 'form_request:' || v_id, p_appointment_id, v_c.id, null, null, null,
                                      jsonb_build_object('request_id', v_id), v_token);
  end if;
  perform public.write_audit_log(v_c.business_id, 'form.request_created', 'form_request', v_id::text, null,
    jsonb_build_object('client_id', v_c.id, 'template_id', v_t.id, 'emailed', v_outbox is not null));
  return jsonb_build_object('ok', true, 'request_id', v_id, 'token', v_token, 'expires_at', v_exp, 'queued', v_outbox is not null);
end $$;

-- PUBLIC (service_role): read the form behind a link. Sensitive flags are NOT sent.
create or replace function public.get_form_request(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_r record;
begin
  select r.id, r.business_id, r.client_id, r.expires_at, r.used_at, r.revoked_at, r.template_version_id,
         v.title, v.kind, v.body, v.fields, v.requires_signature, t.deleted_at as t_deleted, t.is_active,
         b.name as business_name, b.slug, c.full_name
    into v_r
  from public.form_requests r
  join public.form_template_versions v on v.id = r.template_version_id
  join public.form_templates t on t.id = v.template_id
  join public.businesses b on b.id = r.business_id
  join public.clients c on c.id = r.client_id
  where r.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if v_r.id is null or v_r.used_at is not null or v_r.revoked_at is not null or v_r.expires_at <= now()
     or v_r.t_deleted is not null or not v_r.is_active
     or not public.business_is_active(v_r.business_id) or not public.business_has_feature(v_r.business_id, 'forms_consent') then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;
  return jsonb_build_object('ok', true, 'business_name', v_r.business_name, 'client_first_name', split_part(v_r.full_name, ' ', 1),
    'title', v_r.title, 'kind', v_r.kind, 'body', v_r.body, 'requires_signature', v_r.requires_signature,
    'fields', (select coalesce(jsonb_agg(f - 'sensitive'), '[]'::jsonb) from jsonb_array_elements(v_r.fields) f),
    'expires_at', v_r.expires_at);
end $$;

-- PUBLIC (service_role): sign. Single use: the request row is locked, validated, then used and the
-- signed copy written in one transaction. NEVER raises for an expected failure (a rate-limit counter
-- incremented before this call must survive).
create or replace function public.submit_form_request(
  p_token text, p_answers jsonb, p_signer_name text, p_signature jsonb, p_ip_hash text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_r record;
  r jsonb;
begin
  select r.id, r.business_id, r.client_id, r.appointment_id, r.template_version_id, r.expires_at, r.used_at, r.revoked_at, t.deleted_at as t_deleted, t.is_active, t.title
    into v_r
  from public.form_requests r
  join public.form_template_versions v on v.id = r.template_version_id
  join public.form_templates t on t.id = v.template_id
  where r.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update of r;
  if v_r.id is null or v_r.used_at is not null or v_r.revoked_at is not null or v_r.expires_at <= now()
     or v_r.t_deleted is not null or not v_r.is_active
     or not public.business_is_active(v_r.business_id) or not public.business_has_feature(v_r.business_id, 'forms_consent') then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;
  r := public.create_signed_consent(v_r.template_version_id, v_r.client_id, v_r.appointment_id, v_r.id, p_answers,
                                    p_signer_name, p_signature, 'link', p_ip_hash, null);
  if not (r ->> 'ok')::boolean then return r; end if;
  update public.form_requests set used_at = now() where id = v_r.id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (v_r.business_id, null, 'form.signed', 'signed_consent', r ->> 'signed_consent_id', null,
          jsonb_build_object('client_id', v_r.client_id, 'template', v_r.title, 'via', 'link', 'appointment_id', v_r.appointment_id));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.get_form_request(text) from public, anon, authenticated;
revoke all on function public.submit_form_request(text, jsonb, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.get_form_request(text) to service_role;
grant execute on function public.submit_form_request(text, jsonb, text, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- Reading signed copies (never the table: the answers can be sensitive)
-- ---------------------------------------------------------------------------
create or replace function public.list_signed_consents(p_client_id uuid, p_appointment_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_biz uuid;
begin
  select c.business_id into v_biz from public.clients c where c.id = p_client_id;
  if v_biz is null or (select auth.uid()) is null or not public.client_access(v_biz, p_client_id, 'files.view') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if not public.business_has_feature(v_biz, 'forms_consent') then return jsonb_build_object('ok', false, 'code', 'feature_unavailable'); end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'title', v.title, 'kind', v.kind, 'version', v.version, 'template_id', s.template_id,
        'signer_name', s.signer_name, 'signed_at', s.signed_at, 'signed_via', s.signed_via, 'appointment_id', s.appointment_id,
        'has_signature', s.signature is not null, 'voided_at', x.voided_at, 'void_reason', x.reason) order by s.signed_at desc, s.id desc)
    from public.signed_consents s
    join public.form_template_versions v on v.id = s.template_version_id
    left join public.signed_consent_voids x on x.signed_consent_id = s.id
    where s.client_id = p_client_id and (p_appointment_id is null or s.appointment_id = p_appointment_id)), '[]'::jsonb));
end $$;

create or replace function public.get_signed_consent(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_s record;
  v_sens boolean;
begin
  select s.id, s.business_id, s.client_id, s.answers, s.signer_name, s.signature, s.signed_at, s.signed_via, s.appointment_id,
         v.title, v.kind, v.version, v.fields, v.body, x.voided_at, x.reason as void_reason
    into v_s
  from public.signed_consents s join public.form_template_versions v on v.id = s.template_version_id
  left join public.signed_consent_voids x on x.signed_consent_id = s.id
  where s.id = p_id;
  if v_s.id is null or (select auth.uid()) is null or not public.client_access(v_s.business_id, v_s.client_id, 'files.view') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if not public.business_has_feature(v_s.business_id, 'forms_consent') then return jsonb_build_object('ok', false, 'code', 'feature_unavailable'); end if;
  v_sens := public.client_access(v_s.business_id, v_s.client_id, 'clients.view_sensitive');
  return jsonb_build_object('ok', true, 'id', v_s.id, 'title', v_s.title, 'kind', v_s.kind, 'version', v_s.version, 'body', v_s.body,
    'signer_name', v_s.signer_name, 'signed_at', v_s.signed_at, 'signed_via', v_s.signed_via, 'signature', v_s.signature,
    'voided_at', v_s.voided_at, 'void_reason', v_s.void_reason,
    'answers', (select coalesce(jsonb_agg(jsonb_build_object('field_id', f ->> 'id', 'label', f ->> 'label', 'type', f ->> 'type',
        'sensitive', coalesce((f ->> 'sensitive')::boolean, false),
        'value', case when coalesce((f ->> 'sensitive')::boolean, false) and not v_sens then null else v_s.answers -> (f ->> 'id') end,
        'redacted', coalesce((f ->> 'sensitive')::boolean, false) and not v_sens) order by ord), '[]'::jsonb)
      from jsonb_array_elements(v_s.fields) with ordinality as e(f, ord)));
end $$;

-- Forms attached to the appointment's service, each pending or signed (a non-void signed copy of the
-- template's CURRENT version for this client).
create or replace function public.appointment_forms(p_appointment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_a record;
begin
  select a.id, a.business_id, a.client_id, a.service_id into v_a from public.appointments a where a.id = p_appointment_id and a.deleted_at is null;
  if v_a.id is null or (select auth.uid()) is null
     or not (public.client_access(v_a.business_id, v_a.client_id, 'files.view') or public.client_access(v_a.business_id, v_a.client_id, 'appointments.edit')) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if not public.business_has_feature(v_a.business_id, 'forms_consent') then return jsonb_build_object('ok', false, 'code', 'feature_unavailable'); end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('template_id', t.id, 'title', t.title, 'kind', t.kind, 'requires_signature', lv.requires_signature,
        'status', case when sc.id is null then 'pending' else 'signed' end, 'signed_consent_id', sc.id) order by t.title)
    from public.form_template_services ts
    join public.form_templates t on t.id = ts.template_id and t.deleted_at is null and t.is_active
    join lateral (select v.id, v.requires_signature from public.form_template_versions v where v.template_id = t.id order by v.version desc limit 1) lv on true
    left join lateral (select s.id from public.signed_consents s
                       where s.client_id = v_a.client_id and s.template_version_id = lv.id
                         and not exists (select 1 from public.signed_consent_voids x where x.signed_consent_id = s.id)
                       order by s.signed_at desc limit 1) sc on true
    where ts.service_id = v_a.service_id), '[]'::jsonb));
end $$;

create or replace function public.void_signed_consent(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_s record;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_gate jsonb;
begin
  select s.id, s.business_id, s.branch_id, s.client_id into v_s from public.signed_consents s where s.id = p_id for update;
  if v_s.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if (select auth.uid()) is null or not public.addon_access(v_s.business_id, v_s.branch_id, 'forms.manage') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  v_gate := public.feature_gate_error(v_s.business_id, 'forms_consent');
  if v_gate is not null then return v_gate; end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then return jsonb_build_object('ok', false, 'code', 'reason_required'); end if;
  if exists (select 1 from public.signed_consent_voids x where x.signed_consent_id = p_id) then
    return jsonb_build_object('ok', false, 'code', 'already_voided');
  end if;
  insert into public.signed_consent_voids (signed_consent_id, business_id, reason, voided_by) values (p_id, v_s.business_id, v_reason, auth.uid());
  perform public.write_audit_log(v_s.business_id, 'form.voided', 'signed_consent', p_id::text, null,
    jsonb_build_object('client_id', v_s.client_id, 'reason', v_reason));
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.save_form_template(uuid, uuid, text, text, jsonb, jsonb, boolean, uuid[], boolean) from public, anon;
revoke all on function public.delete_form_template(uuid) from public, anon;
revoke all on function public.record_signed_consent(uuid, uuid, uuid, jsonb, text, jsonb) from public, anon;
revoke all on function public.create_form_request(uuid, uuid, uuid, boolean) from public, anon;
revoke all on function public.list_signed_consents(uuid, uuid) from public, anon;
revoke all on function public.get_signed_consent(uuid) from public, anon;
revoke all on function public.appointment_forms(uuid) from public, anon;
revoke all on function public.void_signed_consent(uuid, text) from public, anon;
grant execute on function public.save_form_template(uuid, uuid, text, text, jsonb, jsonb, boolean, uuid[], boolean) to authenticated;
grant execute on function public.delete_form_template(uuid) to authenticated;
grant execute on function public.record_signed_consent(uuid, uuid, uuid, jsonb, text, jsonb) to authenticated;
grant execute on function public.create_form_request(uuid, uuid, uuid, boolean) to authenticated;
grant execute on function public.list_signed_consents(uuid, uuid) to authenticated;
grant execute on function public.get_signed_consent(uuid) to authenticated;
grant execute on function public.appointment_forms(uuid) to authenticated;
grant execute on function public.void_signed_consent(uuid, text) to authenticated;
