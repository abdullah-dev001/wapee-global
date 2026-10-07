-- Throwaway fixture for the Files & Forms HTTP test and the screenshots. Slugs start with p10bshot-,
-- users are p10bshot.*@example.com (password below). Deleted afterwards by the recorded ids
-- (25_cleanup_files_forms.sql). Run: supabase db query --linked -f supabase/tests/25_seed_files_forms.sql
do $$
declare
  v_pw text := extensions.crypt('Test-Pass-10b!', extensions.gen_salt('bf'));
  v_owner uuid := gen_random_uuid(); v_staff uuid := gen_random_uuid(); v_off uuid := gen_random_uuid();
  v_biz uuid; v_bizoff uuid; v_br uuid; v_svc uuid; v_svc2 uuid; v_alex uuid; v_bea uuid; v_fv uuid; v_sp uuid; v_sp2 uuid;
  v_m uuid; v_role uuid; k text; r jsonb; v_tpl uuid; v_ap uuid;
  v_today date := (now() at time zone 'Europe/London')::date;
begin
  foreach k in array array['owner','staff','off'] loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
    values (case k when 'owner' then v_owner when 'staff' then v_staff else v_off end, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'p10bshot.' || k || '@example.com', v_pw, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), case k when 'owner' then v_owner when 'staff' then v_staff else v_off end,
      case k when 'owner' then v_owner when 'staff' then v_staff else v_off end::text, 'email',
      jsonb_build_object('sub', case k when 'owner' then v_owner when 'staff' then v_staff else v_off end::text, 'email', 'p10bshot.' || k || '@example.com'), now(), now(), now());
  end loop;
  update public.profiles set full_name = 'Olivia Owner' where id = v_owner;
  update public.profiles set full_name = 'Sam Staff' where id = v_staff;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_biz := public.create_business_with_owner('Ink Studio', 'p10bshot-ink', 'GB', 'GBP', 'Europe/London', 'en', null, 'Main');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_off, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_bizoff := public.create_business_with_owner('Plain Studio', 'p10bshot-plain', 'GB', 'GBP', 'Europe/London', 'en', null, 'Main');
  reset role;
  update public.business_subscriptions set status = 'active', plan = 'team', trial_ends_at = null where business_id = v_bizoff;

  select id into v_br from public.branches where business_id = v_biz;
  insert into public.business_members (business_id, user_id, status, joined_at) values (v_biz, v_staff, 'active', now()) returning id into v_m;
  select id into v_role from public.roles where business_id is null and key = 'staff';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  insert into public.member_role_assignments (member_id, role_id, branch_id) values (v_m, v_role, v_br);

  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (v_biz, 'Tattoo session', 90, 0) returning id into v_svc;
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (v_biz, 'Piercing', 30, 0) returning id into v_svc2;
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) select id, v_br, v_biz, 9000, true from public.services where business_id = v_biz;
  insert into public.staff_profiles (business_id, display_name, is_active, member_id) values (v_biz, 'Sam Staff', true, v_m) returning id into v_sp;
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_sp, v_br, v_biz);
  insert into public.staff_profiles (business_id, display_name, is_active) values (v_biz, 'Other Artist', true) returning id into v_sp2;
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_sp2, v_br, v_biz);
  insert into public.clients (business_id, full_name, phone_e164, first_branch_id) values (v_biz, 'Alex Rivera', '+447700900201', v_br) returning id into v_alex;
  insert into public.clients (business_id, full_name, phone_e164, first_branch_id) values (v_biz, 'Bea Okafor', '+447700900202', v_br) returning id into v_bea;
  select id into v_fv from public.form_versions where business_id = v_biz order by version desc limit 1;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
  values (v_biz, v_br, v_alex, v_svc, v_sp, (v_today::timestamp + interval '15 hours') at time zone 'Europe/London', (v_today::timestamp + interval '16 hours 30 minutes') at time zone 'Europe/London', 90, 0, 'confirmed', 'dashboard', v_fv, 9000),
         (v_biz, v_br, v_bea, v_svc, v_sp2, (v_today::timestamp + interval '12 hours') at time zone 'Europe/London', (v_today::timestamp + interval '13 hours 30 minutes') at time zone 'Europe/London', 90, 0, 'confirmed', 'dashboard', v_fv, 9000);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  r := public.save_form_template(v_biz, null, 'consent', 'Tattoo consent',
    '[{"id":"over18","type":"yes_no","label":"I am over 18","required":true},{"id":"skin","type":"dropdown","label":"Skin type","options":["Dry","Normal","Oily"]},{"id":"allergy","type":"long_text","label":"Allergies or medical conditions","sensitive":true,"help":"Only visible to people allowed to see sensitive details."},{"id":"weight","type":"number","label":"Weight (kg)"}]'::jsonb,
    '[{"type":"heading","text":"Consent to tattoo"},{"type":"paragraph","text":"I understand the procedure is permanent and I have been told how to look after it."},{"type":"bullet","text":"I have disclosed any allergies"},{"type":"bullet","text":"I am not under the influence of alcohol"}]'::jsonb,
    true, array[v_svc], true);
  v_tpl := (r->>'template_id')::uuid;
  r := public.save_form_template(v_biz, null, 'intake', 'Piercing intake', '[{"id":"why","type":"short_text","label":"What would you like pierced?","required":true}]'::jsonb, '[]'::jsonb, false, array[v_svc2], true);
  r := public.set_photo_consent(v_alex, true);
  reset role;
end $$;
select jsonb_build_object(
  'biz', (select id from public.businesses where slug = 'p10bshot-ink'), 'bizoff', (select id from public.businesses where slug = 'p10bshot-plain'),
  'users', (select jsonb_agg(id) from auth.users where email like 'p10bshot.%@example.com'),
  'alex', (select id from public.clients where full_name = 'Alex Rivera' and business_id = (select id from public.businesses where slug = 'p10bshot-ink')),
  'bea', (select id from public.clients where full_name = 'Bea Okafor' and business_id = (select id from public.businesses where slug = 'p10bshot-ink')),
  'appt_alex', (select a.id from public.appointments a join public.clients c on c.id = a.client_id where c.full_name = 'Alex Rivera' and a.business_id = (select id from public.businesses where slug = 'p10bshot-ink')),
  'tpl', (select id from public.form_templates where title = 'Tattoo consent' and business_id = (select id from public.businesses where slug = 'p10bshot-ink'))) as out;
