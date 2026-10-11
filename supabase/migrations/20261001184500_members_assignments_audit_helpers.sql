-- Phase 1, part 3 of 4 (b): membership, role assignments, audit log, RLS helpers.

-- ---------------------------------------------------------------------------
-- business_members: a user's link to a business
-- ---------------------------------------------------------------------------

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- null until an invited person accepts and an auth user exists.
  user_id uuid references public.profiles (id) on delete cascade,
  status public.member_status not null default 'invited',
  invited_email extensions.citext,
  -- Only the hash is stored; the raw token lives in the invite link.
  invite_token_hash text,
  invite_expires_at timestamptz,
  invited_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- An active member must be a real user; an invite must carry an email.
  constraint members_active_has_user check (status <> 'active' or user_id is not null),
  constraint members_invited_has_email check (status <> 'invited' or invited_email is not null)
);

comment on table public.business_members is
  'Links a user to a business. One user may belong to several businesses.';

create unique index business_members_unique_user
  on public.business_members (business_id, user_id)
  where user_id is not null and deleted_at is null;
create unique index business_members_unique_invite
  on public.business_members (business_id, invited_email)
  where status = 'invited' and deleted_at is null;
create index business_members_user_id_idx on public.business_members (user_id) where deleted_at is null;
create index business_members_business_id_idx on public.business_members (business_id) where deleted_at is null;
create index business_members_invite_token_idx on public.business_members (invite_token_hash) where invite_token_hash is not null;

create trigger business_members_set_updated_at
  before update on public.business_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- member_role_assignments: a role per branch
-- ---------------------------------------------------------------------------

create table public.member_role_assignments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.business_members (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete restrict,
  -- null = every branch. Multi-branch (Phase 9) simply starts using real values.
  branch_id uuid references public.branches (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

comment on table public.member_role_assignments is
  'Gives a member a role, optionally limited to one branch. branch_id null = all branches.';

create unique index member_role_assignments_unique
  on public.member_role_assignments (member_id, role_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index member_role_assignments_member_idx on public.member_role_assignments (member_id);
create index member_role_assignments_role_idx on public.member_role_assignments (role_id);
create index member_role_assignments_branch_idx on public.member_role_assignments (branch_id);

-- ---------------------------------------------------------------------------
-- audit_logs: insert-only trail
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses (id) on delete cascade,
  actor_user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is
  'Append-only. Role changes, financial actions, soft deletes and super admin access.';

create index audit_logs_business_created_idx on public.audit_logs (business_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id);

-- ---------------------------------------------------------------------------
-- RLS helpers. SECURITY DEFINER so a policy can read membership without
-- recursing through the policies of the tables it reads.
-- ---------------------------------------------------------------------------

create or replace function public.is_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
  );
$$;

comment on function public.is_member is 'True when the signed-in user is an active member of the business.';

create or replace function public.business_is_active(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id
      and b.deleted_at is null
      and (
        b.status = 'active'
        -- A trial is only live until its end date: no cron job needed.
        or (b.status = 'trialing' and b.trial_ends_at > now())
      )
  );
$$;

comment on function public.business_is_active is
  'True while the business may be used: active, or trialing and not yet expired.';

create or replace function public.member_branch_ids(p_business_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct a.branch_id
  from public.business_members m
  join public.member_role_assignments a on a.member_id = m.id
  where m.business_id = p_business_id
    and m.user_id = auth.uid()
    and m.status = 'active'
    and m.deleted_at is null
    and a.branch_id is not null;
$$;

comment on function public.member_branch_ids is 'Branches the user holds a branch-scoped role in.';

create or replace function public.has_permission(
  p_business_id uuid,
  p_branch_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    join public.member_role_assignments a on a.member_id = m.id
    join public.role_permissions rp on rp.role_id = a.role_id
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
      and rp.permission = p_permission
      and (
        -- 'all' scope ignores the branch entirely.
        rp.scope = 'all'
        -- A role assigned to every branch (branch_id null) covers any branch.
        or a.branch_id is null
        -- Otherwise the assignment must match the branch being touched.
        or p_branch_id is null
        or a.branch_id = p_branch_id
      )
  );
$$;

comment on function public.has_permission is
  'Permission check honouring scope. The boundary for every policy; never trust the UI.';

create or replace function public.can(
  p_business_id uuid,
  p_branch_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- The everyday check: the business must be usable AND the permission held.
  select public.business_is_active(p_business_id)
     and public.has_permission(p_business_id, p_branch_id, p_permission);
$$;

comment on function public.can is
  'business_is_active() AND has_permission(). Use this in operational policies.';

grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.business_is_active(uuid) to authenticated;
grant execute on function public.member_branch_ids(uuid) to authenticated;
grant execute on function public.has_permission(uuid, uuid, text) to authenticated;
grant execute on function public.can(uuid, uuid, text) to authenticated;
