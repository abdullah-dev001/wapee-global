-- One row per schema category: count + md5 of its canonical text. Read-only.
-- Run it on two projects (e.g. dev and production) and compare the rows:
--   supabase db query --linked -f scripts/schema-fingerprint.sql
-- Functions are compared without SQL comments / whitespace (a hosted project stores bodies
-- without comments). Seed tables are limited to ones that hold fixed reference data.
with items as (
  select 'columns' c, format('%s.%s %s %s %s %s', table_name, column_name, data_type, udt_name, is_nullable, coalesce(column_default, '')) v
    from information_schema.columns where table_schema = 'public'
  union all select 'tables', format('%s rls=%s force=%s', c.relname, c.relrowsecurity, c.relforcerowsecurity)
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  union all select 'views', c.relname || ' ' || coalesce(array_to_string(c.reloptions, ','), '') || ' ' || md5(pg_get_viewdef(c.oid))
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
  union all select 'constraints', conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid)
    from pg_constraint where connamespace = 'public'::regnamespace
  union all select 'indexes', indexdef from pg_indexes where schemaname = 'public'
  union all select 'policies', format('%s %s %s %s %s %s %s', tablename, policyname, permissive, roles, cmd, qual, with_check)
    from pg_policies where schemaname = 'public'
  union all select 'triggers', pg_get_triggerdef(t.oid) || ' en=' || t.tgenabled::text
    from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
  union all select 'table_grants', format('%s %s %s', table_name, grantee, string_agg(privilege_type, ',' order by privilege_type))
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role') group by table_name, grantee
  union all select 'enum_types', t.typname || ' ' || coalesce((select string_agg(enumlabel, ',' order by enumsortorder) from pg_enum e where e.enumtypid = t.oid), '')
    from pg_type t where t.typnamespace = 'public'::regnamespace and t.typtype = 'e'
  union all select 'functions', format('%s(%s) %s secdef=%s vol=%s cfg=%s src=%s', p.proname, pg_get_function_identity_arguments(p.oid),
      pg_get_function_result(p.oid), p.prosecdef, p.provolatile, p.proconfig,
      md5(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^\n]*|\s+', '', 'g')))
    from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all select 'function_acl', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || coalesce(p.proacl::text, '')
    from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all select 'comments', 'f:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || d.description
    from pg_description d join pg_proc p on p.oid = d.objoid and d.classoid = 'pg_proc'::regclass where p.pronamespace = 'public'::regnamespace
  union all select 'comments', 't:' || c.relname || '.' || d.objsubid || ' ' || d.description
    from pg_description d join pg_class c on c.oid = d.objoid and d.classoid = 'pg_class'::regclass where c.relnamespace = 'public'::regnamespace
  union all select 'cron_jobs', jobname || ' | ' || schedule || ' | ' || command || ' | active=' || active from cron.job
  union all select 'storage_buckets', id || ' public=' || public || ' limit=' || coalesce(file_size_limit::text, '') || ' mimes=' || coalesce(allowed_mime_types::text, '')
    from storage.buckets
  union all select 'storage_policies', policyname || ' ' || tablename from pg_policies where schemaname = 'storage'
  union all select 'realtime_publication_tables', pubname || ' ' || schemaname || '.' || tablename from pg_publication_tables where pubname = 'supabase_realtime'
  union all select 'vault_secret_names', name from vault.secrets
  union all select 'seed_rate_limit_rules', endpoint || scope || window_seconds || max_attempts from public.rate_limit_rules
  union all select 'seed_permissions', key from public.permissions
  union all select 'seed_role_permissions', r.key || rp.permission || rp.scope from public.role_permissions rp join public.roles r on r.id = rp.role_id
  union all select 'seed_status_transitions', to_jsonb(t)::text from public.appointment_status_transitions t
  union all select 'seed_messaging_limits', to_jsonb(m)::text from public.messaging_limits m
  union all select 'seed_reserved_slugs', slug from public.reserved_slugs
)
select c as category, count(*) as n, md5(string_agg(v, E'\n' order by v)) as hash from items group by c order by c;
