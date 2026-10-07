-- Throwaway fixture for the GDPR HTTP proof (30_gdpr_http.mjs). Slugs p11shot-*, users p11shot.*@example.com.
-- Removed afterwards by 30_cleanup_gdpr.sql. Prints the ids as JSON.
--   supabase db query --linked -f supabase/tests/30_seed_gdpr.sql
do $$
declare
  v_pw text := extensions.crypt('Test-Pass-11a!', extensions.gen_salt('bf'));
  v_owner uuid := gen_random_uuid(); v_staff uuid := gen_random_uuid(); v_mgr uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_biz uuid; v_biz2 uuid; v_br uuid; v_svc uuid; v_ann uuid; v_fv uuid; v_erin uuid; v_gina uuid; v_m uuid; v_role uuid; k text; u uuid;
  v_ap uuid; v_inv jsonb;
begin
  foreach k in array array['owner','staff','mgr','other'] loop
    u := case k when 'owner' then v_owner when 'staff' then v_staff when 'mgr' then v_mgr else v_other end;
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p11shot.' || k || '@example.com', v_pw, now(), now(), now(),
      '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u, u::text, 'email', jsonb_build_object('sub', u::text, 'email', 'p11shot.' || k || '@example.com'), now(), now(), now());
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_biz := public.create_business_with_owner('Shot GDPR Studio', 'p11shot-gdpr', 'GB', 'GBP', 'Europe/London', 'en', null, 'Main');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_biz2 := public.create_business_with_owner('Shot Other Studio', 'p11shot-other', 'GB', 'GBP', 'Europe/London', 'en', null, 'Main');
  reset role;
  select id into v_br from public.branches where business_id = v_biz;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  insert into public.business_members (business_id, user_id, status, joined_at) values (v_biz, v_staff, 'active', now()) returning id into v_m;
  select id into v_role from public.roles where business_id is null and key = 'staff';
  insert into public.member_role_assignments (member_id, role_id, branch_id) values (v_m, v_role, v_br);
  insert into public.business_members (business_id, user_id, status, joined_at) values (v_biz, v_mgr, 'active', now()) returning id into v_m;
  select id into v_role from public.roles where business_id is null and key = 'manager';
  insert into public.member_role_assignments (member_id, role_id, branch_id) values (v_m, v_role, v_br);
  perform set_config('request.jwt.claims', '', true);

  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (v_biz, 'Cut', 60, 0) returning id into v_svc;
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) values (v_svc, v_br, v_biz, 4000, true);
  insert into public.staff_profiles (business_id, display_name, sort_order, member_id)
    select v_biz, 'Sam', 1, id from public.business_members where business_id = v_biz and user_id = v_staff returning id into v_ann;
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_ann, v_br, v_biz);
  insert into public.service_staff (service_id, staff_id, business_id) values (v_svc, v_ann, v_biz);
  select id into v_fv from public.form_versions where business_id = v_biz order by version desc limit 1;
  insert into public.clients (business_id, full_name, phone_e164, email, notes, first_branch_id) values (v_biz, 'Erin Eraseme', '+447700930001', 'erin.eraseme@example.com', 'allergic to nuts', v_br) returning id into v_erin;
  insert into public.clients (business_id, full_name, phone_e164, email, first_branch_id) values (v_biz, 'Gina Keepme', '+447700930002', 'gina.keepme@example.com', v_br) returning id into v_gina;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor, client_notes)
    values (v_biz, v_br, v_erin, v_svc, v_ann, now() - interval '10 days', now() - interval '10 days' + interval '1 hour', 60, 0, 'completed', 'dashboard', v_fv, 4000, 'Erin prefers mornings') returning id into v_ap;
  insert into public.files (business_id, client_id, kind, category, storage_path, original_name, mime_type, size_bytes, status)
    values (v_biz, v_erin, 'photo', 'before', v_biz || '/' || v_erin || '/a.png', 'erin-a.png', 'image/png', 70, 'ready'),
           (v_biz, v_erin, 'photo', 'after', v_biz || '/' || v_erin || '/b.png', 'erin-b.png', 'image/png', 70, 'ready'),
           (v_biz, v_gina, 'photo', 'before', v_biz || '/' || v_gina || '/g.png', 'gina-g.png', 'image/png', 70, 'ready');
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_inv := (select public.create_invoice_draft(v_br, null, v_erin, '[{"description":"Cut","unit_price_minor":4000}]'::jsonb));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.issue_invoice((v_inv ->> 'invoice_id')::uuid);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  create temporary table seed_out on commit drop as select jsonb_build_object('biz', v_biz, 'biz2', v_biz2, 'erin', v_erin, 'gina', v_gina,
    'invoice', v_inv ->> 'invoice_id') as j;
  perform set_config('wapee.seed_out', (select j::text from seed_out), false);
end $$;
select current_setting('wapee.seed_out') as ids;
