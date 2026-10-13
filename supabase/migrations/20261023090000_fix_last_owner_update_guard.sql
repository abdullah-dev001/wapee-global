-- Fix (QA audit F2-01): enforce_last_owner only fired on DELETE of member_role_assignments. That table is
-- directly writable via RLS (gated on roles.manage, not RPC-only), so a raw UPDATE of role_id/member_id/branch_id
-- on a business's only Owner assignment bypassed the guard entirely and left the business with zero active
-- Owners -- reproduced live on dev in the QA audit (docs/qa/phase-2-roles-permissions.md), rolled back.
--
-- A second, same-class gap: business_members itself is directly UPDATE-able (RLS: `roles.manage`), and
-- soft-deleting or deactivating the sole Owner's membership row removes them from enforce_last_owner's count
-- (`m.status = 'active' and m.deleted_at is null`) without ever touching member_role_assignments. Both are
-- fixed here with the SAME exemptions the existing DELETE trigger already honours:
--   * wapee.erase_business flag (gdpr_erase_business_commit / account_delete_commit, the ALREADY-soft-deleted
--     business case) -- set, used, cleared exactly as the DELETE path already does
--   * no signed-in user (service_role / the signup RPC / a trusted backend path)
--   * is_super_admin()
-- Ownership transfer continues to work: assigning a NEW Owner first (member_role_assignments INSERT, already
-- unguarded by this trigger) means the subsequent removal/demotion of the old Owner no longer leaves the count
-- at zero, so it is allowed exactly as before.

-- ---------------------------------------------------------------------------
-- 1. member_role_assignments: also fire on UPDATE of the columns that can change who holds Owner.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_last_owner() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_old_business_id uuid;
  v_new_business_id uuid;
  v_flag text := coalesce(current_setting('wapee.erase_business', true), '');
  v_old_was_active_owner boolean;
  v_owner_count integer;
begin
  -- Trusted callers (service role / signup bootstrap, or a flagged in-progress erase) are never checked.
  if (select auth.uid()) is null or public.is_super_admin() then
    return coalesce(new, old);
  end if;

  select m.business_id into v_old_business_id
  from public.business_members m where m.id = old.member_id;

  if v_flag <> '' and (v_old_business_id is null or v_old_business_id::text = v_flag) then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    select m.business_id into v_new_business_id from public.business_members m where m.id = new.member_id;
    -- Only block when the OLD row was an active Owner assignment and something about it is actually changing
    -- (role, member, or branch) -- an unrelated no-op update must never be refused.
    select exists (
      select 1
      from public.business_members m
      join public.roles r on r.id = old.role_id
      where m.id = old.member_id and m.status = 'active' and m.deleted_at is null
        and r.key = 'owner' and r.business_id is null
    ) into v_old_was_active_owner;

    if not v_old_was_active_owner
       or (new.role_id = old.role_id and new.member_id = old.member_id
           and coalesce(new.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
             = coalesce(old.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) then
      return new; -- nothing Owner-relevant is changing
    end if;
  end if;

  select count(*) into v_owner_count
  from public.member_role_assignments a
  join public.business_members m on m.id = a.member_id
  join public.roles r on r.id = a.role_id
  where m.business_id = v_old_business_id
    and m.status = 'active'
    and m.deleted_at is null
    and r.key = 'owner'
    and r.business_id is null
    and a.id is distinct from old.id;

  if v_owner_count = 0 then
    raise exception 'A business must always have at least one active Owner'
      using errcode = '23514';
  end if;

  return coalesce(new, old);
end;
$$;
revoke all on function public.enforce_last_owner() from public, anon, authenticated;

drop trigger if exists member_role_assignments_last_owner on public.member_role_assignments;
create trigger member_role_assignments_last_owner
  before update or delete on public.member_role_assignments
  for each row execute function public.enforce_last_owner();

-- ---------------------------------------------------------------------------
-- 2. business_members: soft-deleting or deactivating the sole Owner's membership row must be refused the
--    same way, even though it never touches member_role_assignments directly.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_last_owner_on_member() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_flag text := coalesce(current_setting('wapee.erase_business', true), '');
  v_was_active_owner boolean;
  v_owner_count integer;
begin
  if (select auth.uid()) is null or public.is_super_admin() then
    return new;
  end if;
  if v_flag <> '' and (old.business_id is null or old.business_id::text = v_flag) then
    return new;
  end if;
  -- Only relevant when the row is LEAVING the active state (becoming inactive/invited/removed or soft-deleted).
  if old.status = 'active' and old.deleted_at is null
     and not (new.status = 'active' and new.deleted_at is null) then
    select exists (
      select 1 from public.member_role_assignments a
      join public.roles r on r.id = a.role_id
      where a.member_id = old.id and r.key = 'owner' and r.business_id is null
    ) into v_was_active_owner;

    if v_was_active_owner then
      select count(*) into v_owner_count
      from public.member_role_assignments a
      join public.business_members m on m.id = a.member_id
      join public.roles r on r.id = a.role_id
      where m.business_id = old.business_id
        and m.status = 'active'
        and m.deleted_at is null
        and r.key = 'owner'
        and r.business_id is null
        and m.id <> old.id;

      if v_owner_count = 0 then
        raise exception 'A business must always have at least one active Owner'
          using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_last_owner_on_member() from public, anon, authenticated;

create trigger business_members_last_owner
  before update on public.business_members
  for each row execute function public.enforce_last_owner_on_member();

comment on function public.enforce_last_owner is
  'Blocks a DELETE, or an Owner-changing UPDATE (role_id/member_id/branch_id), that would leave a business with zero active Owners. Exempts service-role/bootstrap, is_super_admin(), and the wapee.erase_business flag set by gdpr_erase_business_commit/account_delete_commit for an already-deleted business.';
comment on function public.enforce_last_owner_on_member is
  'Companion guard on business_members: refuses soft-deleting or deactivating the sole active Owner''s membership row directly, with the same exemptions as enforce_last_owner.';
