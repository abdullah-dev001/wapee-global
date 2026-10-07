-- Throwaway fixture for the portal HTTP test and the screenshots. Slug p10cshot-glow, user
-- p10cshot.owner@example.com. Deleted afterwards (27_cleanup_portal.sql). Run:
--   supabase db query --linked -f supabase/tests/27_seed_portal.sql
-- Only ONE client carries a real address (wapeeglobal@gmail.com): the one real login email of the test.
-- Sessions for the screenshots are minted inside this single transaction and their outbox rows are deleted
-- before commit, so nothing is ever mailed to the example.com addresses.
do $$
declare
  v_pw text := extensions.crypt('Test-Pass-10c!', extensions.gen_salt('bf'));
  v_owner uuid := gen_random_uuid();
  v_biz uuid; v_br uuid; v_svc uuid; v_ann uuid; v_alex uuid; v_alexa uuid; v_ben uuid; v_fv uuid;
  r jsonb; v_pkg uuid; v_inv uuid; v_raw text; v_tok text[] := '{}';
  v_week timestamptz := ((date_trunc('week', (now() at time zone 'Europe/London')::date + 14))::timestamp) at time zone 'Europe/London';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
  values (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p10cshot.owner@example.com', v_pw, now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_owner, v_owner::text, 'email', jsonb_build_object('sub', v_owner::text, 'email', 'p10cshot.owner@example.com'), now(), now(), now());
  update public.profiles set full_name = 'Olivia Owner' where id = v_owner;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_biz := public.create_business_with_owner('Glow Salon', 'p10cshot-glow', 'GB', 'GBP', 'Europe/London', 'en', null, 'Main');
  reset role;
  update public.business_subscriptions set status = 'active', plan = 'team', trial_ends_at = null where business_id = v_biz;
  insert into public.business_addons (business_id, addon_key, enabled)
  select v_biz, k, true from unnest(array['client_portal', 'packages', 'files_photos', 'forms_consent']) k;
  select id into v_br from public.branches where business_id = v_biz;

  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (v_biz, 'Haircut', 60, 0) returning id into v_svc;
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) values (v_svc, v_br, v_biz, 4000, true);
  insert into public.staff_profiles (business_id, display_name, sort_order) values (v_biz, 'Ann Stylist', 1) returning id into v_ann;
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_ann, v_br, v_biz);
  insert into public.service_staff (service_id, staff_id, business_id) values (v_svc, v_ann, v_biz);
  insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute) select v_br, v_biz, d, 540, 1020 from generate_series(0, 6) d;
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute) select v_ann, v_br, v_biz, d, 540, 1020 from generate_series(0, 6) d;
  update public.booking_settings set minimum_notice_minutes = 0, booking_window_days = 90, slot_interval = 'min_60',
    customer_can_cancel = true, cancel_cutoff_hours = 24, confirmation = 'auto' where branch_id = v_br;

  insert into public.clients (business_id, full_name, phone_e164, email, first_branch_id) values (v_biz, 'Alex Rivera', '+447700900301', 'wapeeglobal@gmail.com', v_br) returning id into v_alex;
  insert into public.clients (business_id, full_name, phone_e164, email, first_branch_id) values (v_biz, 'Alexa Rivera', '+447700900302', 'wapeeglobal@gmail.com', v_br) returning id into v_alexa;
  insert into public.clients (business_id, full_name, phone_e164, email, first_branch_id) values (v_biz, 'Ben Stone', '+447700900303', 'ben.stone@example.com', v_br) returning id into v_ben;
  select id into v_fv from public.form_versions where business_id = v_biz order by version desc limit 1;

  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor, internal_notes, client_notes)
  values (v_biz, v_br, v_alex, v_svc, v_ann, v_week + interval '10 hours', v_week + interval '11 hours', 60, 0, 'confirmed', 'online', v_fv, 4000, 'INTERNAL-SECRET-NOTE', 'Please use the side door'),
         (v_biz, v_br, v_alexa, v_svc, v_ann, v_week + interval '1 day 11 hours', v_week + interval '1 day 12 hours', 60, 0, 'pending', 'online', v_fv, 4000, null, null),
         (v_biz, v_br, v_alex, v_svc, v_ann, now() + interval '5 hours', now() + interval '6 hours', 60, 0, 'confirmed', 'online', v_fv, 4000, null, null),
         (v_biz, v_br, v_alex, v_svc, v_ann, now() - interval '30 days', now() - interval '30 days' + interval '1 hour', 60, 0, 'completed', 'dashboard', v_fv, 4000, 'INTERNAL-PAST', null),
         (v_biz, v_br, v_ben, v_svc, v_ann, v_week + interval '2 days 14 hours', v_week + interval '2 days 15 hours', 60, 0, 'confirmed', 'online', v_fv, 4000, null, null);

  -- package + issued invoice with a payment; consent for photos
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.save_package(v_br, null, 'Cut 3+1', null, 3, 1, 5000, null, array[v_svc]::uuid[], true);
  v_pkg := (r->>'package_id')::uuid;
  r := public.create_invoice_draft(v_br, null, v_alex, format('[{"package_id":"%s"},{"description":"Tip","unit_price_minor":300}]', v_pkg)::jsonb);
  v_inv := (r->>'invoice_id')::uuid;
  perform public.issue_invoice(v_inv);
  perform public.add_payment(v_inv, 'cash', 2000, null, 'internal payment note');
  perform public.set_photo_consent(v_alex, true);
  reset role;

  -- sessions for the screenshots: request, unseal, exchange, then delete the outbox rows (same transaction,
  -- so the mailer never sees them)
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
  perform public.portal_request_login('p10cshot-glow', 'wapeeglobal@gmail.com', 'seed');
  perform public.portal_request_login('p10cshot-glow', 'ben.stone@example.com', 'seed');
  reset role;
  for v_raw in select public.outbox_unseal(o.sealed) from public.message_outbox o
      join public.portal_login_tokens t on t.id = (o.payload->>'token_id')::uuid where t.business_id = v_biz and o.sealed is not null order by t.email loop
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    set local role service_role;
    r := public.portal_exchange_token(v_raw, 'seed');
    reset role;
    v_tok := v_tok || array[r->>'session_token'];
  end loop;
  delete from public.message_outbox where event = 'portal_login'
    and (payload->>'token_id')::uuid in (select id from public.portal_login_tokens where business_id = v_biz);
  perform set_config('p10c.sessions', array_to_string(v_tok, ','), false);
end $$;
select jsonb_build_object(
  'biz', (select id from public.businesses where slug = 'p10cshot-glow'),
  'users', (select jsonb_agg(id) from auth.users where email like 'p10cshot.%@example.com'),
  'alex', (select id from public.clients where full_name = 'Alex Rivera' and business_id = (select id from public.businesses where slug = 'p10cshot-glow')),
  'alexa', (select id from public.clients where full_name = 'Alexa Rivera' and business_id = (select id from public.businesses where slug = 'p10cshot-glow')),
  'ben', (select id from public.clients where full_name = 'Ben Stone' and business_id = (select id from public.businesses where slug = 'p10cshot-glow')),
  'sessions', current_setting('p10c.sessions', true)) as out;
