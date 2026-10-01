-- Signup: create a business, its first branch and the Owner membership
-- in one transaction, and start the 14-day trial.
-- Phase 1. Applied through the Supabase connector.

-- ---------------------------------------------------------------------------
-- Audit helper: the only way rows reach audit_logs (the table has no write policy).
-- ---------------------------------------------------------------------------

create or replace function public.write_audit_log(
  p_business_id uuid,
  p_action text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_before jsonb default null,
  p_after jsonb default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs
    (business_id, actor_user_id, action, entity_type, entity_id, before, after)
  values
    (p_business_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after);
$$;

comment on function public.write_audit_log is
  'Appends an audit row. SECURITY DEFINER because audit_logs has no INSERT policy.';

revoke all on function public.write_audit_log(uuid, text, text, text, jsonb, jsonb)
  from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Slug availability, for the live check in the onboarding form
-- ---------------------------------------------------------------------------

create or replace function public.is_slug_available(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- Same rules the businesses table enforces, so the form cannot promise
    -- something the insert would then reject.
    p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and char_length(p_slug) between 3 and 40
    and not exists (select 1 from public.reserved_slugs r where r.slug = p_slug)
    and not exists (
      select 1 from public.businesses b
      where b.slug = p_slug::extensions.citext and b.deleted_at is null
    );
$$;

comment on function public.is_slug_available is
  'True when a slug is well-formed, not reserved and not taken. Used by the signup form.';

grant execute on function public.is_slug_available(text) to authenticated;

-- ---------------------------------------------------------------------------
-- create_business_with_owner
-- ---------------------------------------------------------------------------

create or replace function public.create_business_with_owner(
  p_name text,
  p_slug text,
  p_country_code text,
  p_currency text,
  p_timezone text,
  p_language text default 'en',
  p_industry text default null,
  p_branch_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_branch_id uuid;
  v_member_id uuid;
  v_owner_role_id uuid;
  v_trial_days constant integer := 14;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a business'
      using errcode = '42501';
  end if;

  -- One trial per person keeps the free period honest. Owning a business
  -- elsewhere is fine; this only blocks a second self-serve signup.
  if exists (
    select 1 from public.businesses b
    where b.created_by = v_user_id and b.deleted_at is null
  ) then
    raise exception 'You have already created a business'
      using errcode = '23505';
  end if;

  if not public.is_slug_available(lower(trim(p_slug))) then
    raise exception 'That address is not available'
      using errcode = '23514';
  end if;

  insert into public.businesses (
    name, slug, industry, country_code, currency, timezone, language,
    status, trial_ends_at, created_by
  )
  values (
    trim(p_name),
    lower(trim(p_slug))::extensions.citext,
    nullif(trim(coalesce(p_industry, '')), ''),
    upper(trim(p_country_code)),
    upper(trim(p_currency)),
    trim(p_timezone),
    coalesce(nullif(trim(p_language), ''), 'en'),
    'trialing',
    now() + make_interval(days => v_trial_days),
    v_user_id
  )
  returning id into v_business_id;

  -- First branch inherits the business settings; Phase 9 may override them.
  insert into public.branches (business_id, name, is_primary, timezone, currency)
  values (
    v_business_id,
    coalesce(nullif(trim(coalesce(p_branch_name, '')), ''), trim(p_name)),
    true,
    trim(p_timezone),
    upper(trim(p_currency))
  )
  returning id into v_branch_id;

  insert into public.business_members (business_id, user_id, status, joined_at)
  values (v_business_id, v_user_id, 'active', now())
  returning id into v_member_id;

  select id into v_owner_role_id
  from public.roles
  where key = 'owner' and business_id is null;

  if v_owner_role_id is null then
    raise exception 'System Owner role is missing; the seed migration did not run';
  end if;

  -- branch_id null = every branch, now and in the future.
  insert into public.member_role_assignments (member_id, role_id, branch_id, created_by)
  values (v_member_id, v_owner_role_id, null, v_user_id);

  -- Open this business on next sign-in.
  update public.profiles
  set default_business_id = v_business_id
  where id = v_user_id;

  perform public.write_audit_log(
    v_business_id,
    'business.created',
    'business',
    v_business_id::text,
    null,
    jsonb_build_object('name', trim(p_name), 'slug', lower(trim(p_slug)), 'trial_days', v_trial_days)
  );

  return v_business_id;
end;
$$;

comment on function public.create_business_with_owner is
  'Signup transaction: business + first branch + Owner membership + 14-day trial. All or nothing.';

revoke all on function public.create_business_with_owner(text, text, text, text, text, text, text, text)
  from anon, public;
grant execute on function public.create_business_with_owner(text, text, text, text, text, text, text, text)
  to authenticated;
