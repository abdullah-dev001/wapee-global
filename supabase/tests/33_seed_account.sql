-- Throwaway fixture for the account-deletion HTTP proof (33_account_http.mjs). Users p12ashot.*@example.com, slug p12ashot-acc.
-- Removed afterwards by 33_cleanup_account.sql. Prints the ids as JSON.
--   supabase db query --linked -f supabase/tests/33_seed_account.sql
do $$
declare
  v_pw text := extensions.crypt('Test-Pass-12a!', extensions.gen_salt('bf'));
  v_owner uuid := gen_random_uuid(); v_del uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_biz uuid; v_br uuid; v_m uuid; v_role uuid; v_staff uuid; k text; u uuid;
begin
  foreach k in array array['owner','del','other'] loop
    u := case k when 'owner' then v_owner when 'del' then v_del else v_other end;
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12ashot.' || k || '@example.com', v_pw, now(), now(), now(),
      '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u, u::text, 'email', jsonb_build_object('sub', u::text, 'email', 'p12ashot.' || k || '@example.com'), now(), now(), now());
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_biz := public.create_business_with_owner('Acc Shot Studio', 'p12ashot-acc', 'GB', 'GBP', 'Europe/London', 'en', null, 'Main');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select id into v_br from public.branches where business_id = v_biz;
  insert into public.business_members (business_id, user_id, status, joined_at) values (v_biz, v_del, 'active', now()) returning id into v_m;
  select id into v_role from public.roles where business_id is null and key = 'manager';
  insert into public.member_role_assignments (member_id, role_id, branch_id) values (v_m, v_role, v_br);
  insert into public.staff_profiles (business_id, display_name, sort_order, member_id) values (v_biz, 'Del Staff', 1, v_m) returning id into v_staff;
  insert into public.push_tokens (user_id, token, platform) values (v_del, 'ExponentPushToken[p12ashotdelete]', 'ios');
  raise notice 'IDS %', json_build_object('owner', v_owner, 'del', v_del, 'other', v_other, 'biz', v_biz, 'staff', v_staff);
end $$;
select json_build_object(
  'owner', (select id from auth.users where email = 'p12ashot.owner@example.com'),
  'del', (select id from auth.users where email = 'p12ashot.del@example.com'),
  'other', (select id from auth.users where email = 'p12ashot.other@example.com'),
  'biz', (select id from public.businesses where slug = 'p12ashot-acc'),
  'staff', (select id from public.staff_profiles where display_name = 'Del Staff' and business_id = (select id from public.businesses where slug = 'p12ashot-acc'))) as ids;
