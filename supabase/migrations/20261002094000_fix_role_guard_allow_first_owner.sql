-- Fix: the escalation guard blocked signup.
--
-- create_business_with_owner() is SECURITY DEFINER, but auth.uid() still
-- returns the signing-up user, so the guard ran and refused the very first
-- Owner assignment ("you cannot grant appointments.approve..."), which rolled
-- back the whole signup.
--
-- The exemption has to be narrow: allow an assignment only when the business
-- has no other role assignment yet, i.e. this is the founding Owner. After
-- that first row the guard applies to everyone, including the owner.
-- Verified: a receptionist still cannot promote themselves to Manager or Owner.

create or replace function public.enforce_role_assignment_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_missing text;
  v_existing_assignments integer;
begin
  select m.business_id into v_business_id
  from public.business_members m where m.id = new.member_id;

  -- Service role / SQL console (no signed-in user) and super admin are trusted.
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  -- Founding Owner: a business with no role assignments at all. The signup RPC
  -- creates exactly one, so nobody can use this to escalate later.
  select count(*) into v_existing_assignments
  from public.member_role_assignments a
  join public.business_members m on m.id = a.member_id
  where m.business_id = v_business_id;

  if v_existing_assignments = 0 then
    return new;
  end if;

  select rp.permission into v_missing
  from public.role_permissions rp
  where rp.role_id = new.role_id
    and not public.has_permission(v_business_id, new.branch_id, rp.permission)
  limit 1;

  if v_missing is not null then
    raise exception 'You cannot grant "%" because you do not have it yourself', v_missing
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_role_assignment_guard is
  'Privilege-escalation guard: you cannot grant a permission you do not hold. The founding Owner (first assignment in a business) is exempt so signup can run.';
