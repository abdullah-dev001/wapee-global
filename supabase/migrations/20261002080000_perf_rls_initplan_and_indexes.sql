-- Performance advisor fixes (part 1 of 2).
-- auth.uid() was re-evaluated once per row; a scalar subquery makes Postgres
-- evaluate it once per statement (initplan). ALTER POLICY edits the expression
-- in place: nothing is dropped, so no table is ever left unprotected.

alter policy profiles_select_own on public.profiles
  using (id = (select auth.uid()) or public.is_super_admin());

alter policy profiles_update_own on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy business_members_select on public.business_members
  using (
    user_id = (select auth.uid())
    or public.is_member(business_id)
    or public.is_super_admin()
  );

alter policy business_members_update on public.business_members
  using (user_id = (select auth.uid()) or public.can(business_id, null, 'roles.manage'))
  with check (user_id = (select auth.uid()) or public.can(business_id, null, 'roles.manage'));

alter policy member_role_assignments_select on public.member_role_assignments
  using (exists (
    select 1 from public.business_members m
    where m.id = member_id
      and (m.user_id = (select auth.uid()) or public.is_member(m.business_id))
  ));

-- Foreign keys the advisor flagged as unindexed.
create index if not exists business_members_invited_by_idx
  on public.business_members (invited_by);
create index if not exists member_role_assignments_created_by_idx
  on public.member_role_assignments (created_by);
