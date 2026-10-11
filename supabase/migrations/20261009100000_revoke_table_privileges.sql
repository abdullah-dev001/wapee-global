-- Least privilege on every public table (found in the Phase 6A review).
--
-- Supabase's default privileges gave `authenticated` ALL on every new table,
-- including TRUNCATE, which Row Level Security does NOT govern; 41 of 53 tables
-- carried it. This migration:
--   1. revokes TRUNCATE, REFERENCES and TRIGGER from `authenticated` everywhere;
--   2. revokes ALL from `anon` everywhere (keeping the one deliberate read:
--      reserved_slugs, used by signup before an account exists);
--   3. revokes INSERT / UPDATE / DELETE from `authenticated` on a table when no RLS
--      policy applies to that command (RLS would refuse it anyway; the privilege
--      only widens what a future policy mistake could expose). DML that goes
--      through SECURITY DEFINER functions is unaffected;
--   4. stops new tables from receiving TRUNCATE / REFERENCES / TRIGGER by default.
-- SELECT is never touched here, and service_role keeps everything.

do $$
declare
  r record;
begin
  for r in
    select c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  loop
    execute format('revoke all on public.%I from anon', r.relname);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', r.relname);
  end loop;

  grant select on public.reserved_slugs to anon;

  for r in
    select c.relname, x.cmd, x.priv
    from pg_class c
    cross join (values ('INSERT', 'insert'), ('UPDATE', 'update'), ('DELETE', 'delete')) as x(cmd, priv)
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
          and (p.cmd = x.cmd or p.cmd = 'ALL')
          and (p.roles && array['authenticated'::name, 'public'::name]))
  loop
    execute format('revoke %s on public.%I from authenticated', r.priv, r.relname);
  end loop;
end $$;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated, anon;
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
