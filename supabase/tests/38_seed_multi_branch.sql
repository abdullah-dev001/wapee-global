-- Throwaway fixture for the multi-location HTTP proof (38_multi_branch_http.mjs).
-- Slugs mbshot-*, users mbshot.*@example.com. Removed afterwards by 38_cleanup_multi_branch.sql.
-- Prints the ids as JSON.
--   supabase db query --linked -f supabase/tests/38_seed_multi_branch.sql
do $$
declare
  v_pw text := extensions.crypt('Test-Pass-12a!', extensions.gen_salt('bf'));
  v_owner uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_a uuid; v_s uuid; v_dt uuid; v_up uuid; v_solo uuid; v_solo2 uuid;
  v_cut uuid; v_color uuid; v_sara uuid; v_umar uuid; v_svc uuid; v_st uuid; k text; u uuid;
begin
  foreach k in array array['owner','other'] loop
    u := case k when 'owner' then v_owner else v_other end;
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mbshot.' || k || '@example.com', v_pw, now(), now(), now(),
      '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u, u::text, 'email', jsonb_build_object('sub', u::text, 'email', 'mbshot.' || k || '@example.com'), now(), now(), now());
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_a := public.create_business_with_owner('Shot Multi Salon', 'mbshot-multi', 'GB', 'GBP', 'Europe/London', 'en', null, 'Downtown');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_s := public.create_business_with_owner('Shot Solo Salon', 'mbshot-solo', 'GB', 'GBP', 'Europe/London', 'en', null, 'Solo Main');
  reset role;
  perform set_config('request.jwt.claims', '', true);

  select id into v_dt from public.branches where business_id = v_a and is_primary;
  update public.branches set address = '1 High Street, London', invoice_prefix = 'DT' where id = v_dt;
  insert into public.branches (business_id, name, is_primary, timezone, currency, country_code, invoice_prefix, address)
    values (v_a, 'Uptown', false, 'Asia/Karachi', 'PKR', 'PK', 'UP', '9 Hill Road, Karachi') returning id into v_up;
  select id into v_solo from public.branches where business_id = v_s and is_primary;
  -- a second, NOT bookable location of the solo business (no hours, no staff)
  insert into public.branches (business_id, name, is_primary, timezone, currency, country_code, invoice_prefix)
    values (v_s, 'Unready', false, 'Europe/London', 'GBP', 'GB', 'UR') returning id into v_solo2;

  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (v_a, 'Cut', 60, 0) returning id into v_cut;
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (v_a, 'Colour', 60, 0) returning id into v_color;
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) values
    (v_cut, v_dt, v_a, 3000, true), (v_cut, v_up, v_a, 4500000, true), (v_color, v_up, v_a, 9000000, true);
  insert into public.staff_profiles (business_id, display_name, sort_order) values (v_a, 'Sara', 1) returning id into v_sara;
  insert into public.staff_profiles (business_id, display_name, sort_order) values (v_a, 'Umar', 2) returning id into v_umar;
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_sara, v_dt, v_a), (v_umar, v_up, v_a);
  insert into public.service_staff (service_id, staff_id, business_id) values (v_cut, v_sara, v_a), (v_cut, v_umar, v_a), (v_color, v_umar, v_a);
  insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute)
    select v_dt, v_a, d, 540, 1020 from generate_series(0,6) d union all select v_up, v_a, d, 720, 960 from generate_series(0,6) d;
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute)
    select v_sara, v_dt, v_a, d, 540, 1020 from generate_series(0,6) d union all select v_umar, v_up, v_a, d, 720, 960 from generate_series(0,6) d;
  update public.booking_settings set booking_window_days = 90, minimum_notice_minutes = 0, slot_interval = 'min_60' where business_id = v_a;

  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (v_s, 'Solo cut', 30, 0) returning id into v_svc;
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) values (v_svc, v_solo, v_s, 2000, true);
  insert into public.staff_profiles (business_id, display_name) values (v_s, 'Solo Sam') returning id into v_st;
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_st, v_solo, v_s);
  insert into public.service_staff (service_id, staff_id, business_id) values (v_svc, v_st, v_s);
  insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute) select v_solo, v_s, d, 540, 1020 from generate_series(0,6) d;
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute) select v_st, v_solo, v_s, d, 540, 1020 from generate_series(0,6) d;
  update public.booking_settings set booking_window_days = 90, minimum_notice_minutes = 0 where business_id = v_s;

  perform set_config('wapee.seed_out', jsonb_build_object('multi', v_a, 'solo', v_s, 'dt', v_dt, 'up', v_up, 'soloBranch', v_solo,
    'soloUnready', v_solo2, 'cut', v_cut, 'color', v_color, 'sara', v_sara, 'umar', v_umar, 'soloService', v_svc)::text, false);
end $$;
select current_setting('wapee.seed_out') as ids;
