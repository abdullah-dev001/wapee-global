-- Profile name follows the VERIFIED identity (migration 20261026113000).
--
--   supabase db query --linked -f supabase/tests/51_profile_name_from_verified_identity.sql
--
-- Plain SQL, own fixtures, ROLLS BACK. Each case asserts the STORED profiles.full_name. The auth
-- updates mirror what Supabase Auth does: a Google link to an unconfirmed user sets
-- email_confirmed_at and replaces raw_user_meta_data in one update.
begin;

create temporary table ids (k text primary key, v uuid) on commit drop;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;

create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from ids where k = $1 $$;
create or replace function pg_temp.chk(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got is not distinct from p_want, 'got ' || coalesce(p_got, '<null>') || ' want ' || coalesce(p_want, '<null>'));
end; $$;
create or replace function pg_temp.name_of(p_key text) returns text language sql as $$
  select full_name from public.profiles where id = pg_temp.id(p_key)
$$;
create or replace function pg_temp.mk(p_key text, p_confirmed boolean, p_meta jsonb) returns void language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'pn.' || p_key || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')),
          case when p_confirmed then now() end, now(), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, p_meta);
  insert into ids values (p_key, v);
end $$;

select pg_temp.mk('squat', false, '{"full_name":"Squatter Name"}');
select pg_temp.mk('plain', false, '{"full_name":"Alice Plain"}');
select pg_temp.mk('chosen', true, '{"full_name":"Original"}');
select pg_temp.mk('noname', true, '{}');
select pg_temp.mk('onlyname', true, '{}');
select pg_temp.mk('blankmeta', true, '{"full_name":"Keep Me"}');
select pg_temp.mk('long', false, '{"full_name":"Short"}');

select pg_temp.chk('fixture: the squatter chose the profile name at signup', pg_temp.name_of('squat'), 'Squatter Name');

-- 1. Google links to an UNCONFIRMED account: the profile takes Google's name.
update auth.users set email_confirmed_at = now(),
  raw_user_meta_data = '{"full_name":"Real Owner","name":"Real Owner","email_verified":true}'::jsonb
where id = pg_temp.id('squat');
select pg_temp.chk('first confirmation via Google: squatter name replaced', pg_temp.name_of('squat'), 'Real Owner');

-- 2. A plain email confirmation (metadata unchanged): name unchanged.
update auth.users set email_confirmed_at = now() where id = pg_temp.id('plain');
select pg_temp.chk('plain email confirmation: name unchanged', pg_temp.name_of('plain'), 'Alice Plain');

-- 3. A confirmed owner renamed themselves; Google later links: the chosen name is KEPT.
update public.profiles set full_name = 'My Chosen Name' where id = pg_temp.id('chosen');
update auth.users set raw_user_meta_data = '{"full_name":"Google Name","name":"Google Name"}'::jsonb
where id = pg_temp.id('chosen');
select pg_temp.chk('confirmed owner''s chosen name is never overwritten', pg_temp.name_of('chosen'), 'My Chosen Name');

-- 4. Confirmed account with NO name: filled from the metadata.
update auth.users set raw_user_meta_data = '{"full_name":"Filled From Google"}'::jsonb where id = pg_temp.id('noname');
select pg_temp.chk('empty profile name is filled from the metadata', pg_temp.name_of('noname'), 'Filled From Google');

-- 5. Only the `name` key (some providers): used.
update auth.users set raw_user_meta_data = '{"name":"Name Key Only"}'::jsonb where id = pg_temp.id('onlyname');
select pg_temp.chk('the `name` key is used when full_name is absent', pg_temp.name_of('onlyname'), 'Name Key Only');

-- 6. Metadata with a blank name changes nothing.
update auth.users set raw_user_meta_data = '{"full_name":"   "}'::jsonb where id = pg_temp.id('blankmeta');
select pg_temp.chk('blank metadata name: profile unchanged', pg_temp.name_of('blankmeta'), 'Keep Me');

-- 7. An over-long provider name is cut to the profile limit (120), never failing the auth update.
update auth.users set email_confirmed_at = now(),
  raw_user_meta_data = jsonb_build_object('full_name', repeat('x', 200))
where id = pg_temp.id('long');
select pg_temp.chk('over-long name cut to 120', char_length(pg_temp.name_of('long'))::text, '120');
select pg_temp.chk('...and the auth update itself went through',
  (select (email_confirmed_at is not null)::text from auth.users where id = pg_temp.id('long')), 'true');

-- 8. A broken profile write never blocks the auth update (warning only).
alter table public.profiles add constraint zz_test_no_names check (full_name is null or full_name <> 'Blocked Name') not valid;
select pg_temp.mk('blocked', true, '{}');
update auth.users set raw_user_meta_data = '{"full_name":"Blocked Name"}'::jsonb where id = pg_temp.id('blocked');
select pg_temp.chk('a failing profile write does not block the auth update',
  (select raw_user_meta_data->>'full_name' from auth.users where id = pg_temp.id('blocked')), 'Blocked Name');
select pg_temp.chk('...and the profile was left as it was', pg_temp.name_of('blocked'), null);

select
  count(*) filter (where pass) as passed,
  count(*) filter (where not pass) as failed,
  count(*) as total,
  coalesce(string_agg(n || ' ' || name || ': ' || detail, E'\n' order by n) filter (where not pass), '') as failures
from res;

rollback;
