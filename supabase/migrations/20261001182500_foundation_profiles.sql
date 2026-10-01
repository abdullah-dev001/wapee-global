-- Foundation: extensions, shared helpers, profiles.
-- Phase 1, part 1 of 4. Every tenant table that follows builds on the helpers here.

create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared trigger helpers
-- ---------------------------------------------------------------------------

-- Keeps updated_at honest: the client can never set it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'BEFORE UPDATE trigger: stamps updated_at with now().';

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email extensions.citext not null,
  full_name text,
  avatar_url text,
  -- Platform-level flag, never a business role. Set ONLY by hand in SQL;
  -- enforce_profile_guard() below blocks any change from the app.
  is_super_admin boolean not null default false,
  -- Business opened on next sign-in (the "remember last used" switcher).
  default_business_id uuid,
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint profiles_full_name_length check (full_name is null or char_length(full_name) <= 120),
  constraint profiles_locale_format check (locale ~ '^[a-z]{2}(-[A-Za-z0-9]{2,8})*$')
);

comment on table public.profiles is
  'Public mirror of auth.users. is_super_admin is set manually in SQL only.';

create index profiles_default_business_id_idx
  on public.profiles (default_business_id)
  where default_business_id is not null;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Guard: a user may edit their own profile, but never their privileges
-- ---------------------------------------------------------------------------

create or replace function public.enforce_profile_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Only a superuser/service role connection (no auth.uid()) may flip the flag.
  if new.is_super_admin is distinct from old.is_super_admin
     and auth.uid() is not null then
    raise exception 'is_super_admin cannot be changed from the application'
      using errcode = '42501';
  end if;

  -- id and email follow auth.users; the app must not rewrite them.
  if new.id is distinct from old.id then
    raise exception 'profile id is immutable' using errcode = '42501';
  end if;
  if new.email is distinct from old.email and auth.uid() is not null then
    raise exception 'email is managed by auth; change it through Supabase auth'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_profile_guard is
  'Blocks privilege escalation: is_super_admin, id and email cannot be changed from the app.';

create trigger profiles_enforce_guard
  before update on public.profiles
  for each row execute function public.enforce_profile_guard();

-- ---------------------------------------------------------------------------
-- New auth user -> profile row
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user is
  'AFTER INSERT on auth.users: creates the matching public.profiles row.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Core identity helpers (used by every policy from part 2 on)
-- ---------------------------------------------------------------------------

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_super_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

comment on function public.is_super_admin is
  'True when the signed-in user carries the platform super admin flag.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

-- Read: your own row. Super admin reads every row (access is audit-logged).
create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_super_admin());

-- Update: your own row only; the guard trigger protects the sensitive columns.
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No INSERT policy: rows come from the handle_new_user() trigger.
-- No DELETE policy: removing a user happens in auth.users (cascades here).

grant select, update on public.profiles to authenticated;
