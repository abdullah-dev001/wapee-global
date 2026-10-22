-- Invite flow: RETIRED by 20261026110000 (replaced by add-by-email, suite 50).
--
-- The token-in-URL functions stay in the schema (no destructive change) but nobody can call
-- them, and no live token hash is left. The full add-by-email + claim behaviour is in
-- 50_member_add_by_email.sql. The previous version of this file tested the old flow; see git
-- history before 20261026110000.
--
--   supabase db query --linked -f supabase/tests/04_invite_flow.sql
--
-- Plain SQL, read-only checks, ROLLS BACK.
begin;

create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;
create or replace function pg_temp.chk(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got is not distinct from p_want, 'got ' || coalesce(p_got, '<null>') || ' want ' || coalesce(p_want, '<null>'));
end; $$;

select pg_temp.chk('no live invite token hash is stored',
  (select count(*)::text from public.business_members where invite_token_hash is not null), '0');

select pg_temp.chk(r || ' cannot execute ' || f,
  has_function_privilege(r, f, 'EXECUTE')::text, 'false')
from (values ('anon'), ('authenticated')) as roles(r),
     (values ('public.invite_member(uuid, text, uuid, uuid, uuid)'),
             ('public.accept_invite(text)'),
             ('public.invite_preview(text)')) as fns(f);

select pg_temp.chk('authenticated CAN execute ' || f,
  has_function_privilege('authenticated', f, 'EXECUTE')::text, 'true')
from (values ('public.add_member_by_email(uuid, text, uuid, uuid, uuid)'),
             ('public.claim_pending_memberships()'),
             ('public.revoke_invite(uuid)')) as fns(f);

select pg_temp.chk('anon cannot execute ' || f,
  has_function_privilege('anon', f, 'EXECUTE')::text, 'false')
from (values ('public.add_member_by_email(uuid, text, uuid, uuid, uuid)'),
             ('public.claim_pending_memberships()')) as fns(f);

select
  count(*) filter (where pass) as passed,
  count(*) filter (where not pass) as failed,
  count(*) as total,
  coalesce(string_agg(n || ' ' || name || ': ' || detail, E'\n' order by n) filter (where not pass), '') as failures
from res;

rollback;
