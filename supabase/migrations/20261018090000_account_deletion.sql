-- Pre-launch batch 2, task 1: delete a person's SIGN-IN account (store policy), keeping every business record.
--
-- 1. The "who did it" columns of the append-only ledgers (and commission_rules) pointed at auth.users with NO delete
--    rule, so deleting a user was impossible; "ON DELETE SET NULL" would have to UPDATE rows that triggers declare
--    permanent. The reference is therefore a plain uuid from now on: the ledger rows stay byte-identical, and the
--    uuid names nobody once the account is gone (no profile, no auth user, no email anywhere).
-- 2. Reserve the public URL /delete-account (Play Console data-deletion page).
-- 3. account_delete_blockers / account_delete_commit: the business half of the deletion. The Edge Function
--    `account` checks the password, then calls commit as service_role. Commit validates EVERYTHING before the first
--    write, then removes memberships, writes the audit rows and deletes the auth user in ONE transaction.

-- 1 ------------------------------------------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and (
        (c.confrelid = 'auth.users'::regclass and c.confdeltype = 'a'
         and c.conrelid::regclass::text in (
           'client_consents', 'client_package_cancellations', 'client_packages', 'files', 'form_requests',
           'form_template_versions', 'form_templates', 'inventory_settings', 'packages', 'products',
           'session_usages', 'signed_consent_voids', 'signed_consents', 'stock_movements'))
        or (c.confrelid = 'public.profiles'::regclass and c.conrelid::regclass::text = 'commission_rules'
            and a.attname = 'created_by')
      )
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- 2 ------------------------------------------------------------------------------------------------------------
insert into public.reserved_slugs (slug) values ('delete-account') on conflict do nothing;

-- 3 ------------------------------------------------------------------------------------------------------------
-- Businesses where this user is the only active Owner (live businesses only).
create or replace function public.account_sole_owner_businesses(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.name), '[]'::jsonb)
  from public.businesses b
  where b.deleted_at is null
    and exists (
      select 1
      from public.business_members m
      join public.member_role_assignments a on a.member_id = m.id
      join public.roles r on r.id = a.role_id and r.business_id is null and r.key = 'owner'
      where m.business_id = b.id and m.user_id = p_user_id and m.status = 'active' and m.deleted_at is null)
    and not exists (
      select 1
      from public.business_members m
      join public.member_role_assignments a on a.member_id = m.id
      join public.roles r on r.id = a.role_id and r.business_id is null and r.key = 'owner'
      where m.business_id = b.id and m.user_id <> p_user_id and m.status = 'active' and m.deleted_at is null);
$$;

-- What stops the CURRENT user from deleting the account (shown on the screen before the password is asked).
create or replace function public.account_delete_blockers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and p.is_super_admin) then
    return jsonb_build_object('ok', true, 'super_admin', true, 'businesses', '[]'::jsonb);
  end if;
  return jsonb_build_object('ok', true, 'super_admin', false,
    'businesses', public.account_sole_owner_businesses(v_uid));
end $$;

-- The deletion itself. service_role only. Idempotent: an account that is already gone answers ok + already_deleted.
create or replace function public.account_delete_commit(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blocking jsonb;
  v_m record;
  v_roles jsonb;
begin
  -- Validate everything first (no write before this block ends).
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    return jsonb_build_object('ok', true, 'already_deleted', true);
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.is_super_admin) then
    return jsonb_build_object('ok', false, 'code', 'super_admin');
  end if;
  v_blocking := public.account_sole_owner_businesses(p_user_id);
  if jsonb_array_length(v_blocking) > 0 then
    return jsonb_build_object('ok', false, 'code', 'sole_owner', 'businesses', v_blocking);
  end if;

  -- Writes. One audit row per business the person belonged to: who held which roles, no personal data.
  for v_m in
    select m.id, m.business_id from public.business_members m
    where m.user_id = p_user_id and m.deleted_at is null
  loop
    select coalesce(jsonb_agg(r.name order by r.name), '[]'::jsonb) into v_roles
    from public.member_role_assignments a join public.roles r on r.id = a.role_id
    where a.member_id = v_m.id;
    insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before, after)
    values (v_m.business_id, null, 'member.account_deleted', 'member', v_m.id::text,
            jsonb_build_object('roles', v_roles), null);
    -- Assignments first: the member row must still exist when the last-owner trigger looks it up.
    delete from public.member_role_assignments where member_id = v_m.id;
  end loop;
  -- staff_profiles.member_id goes to NULL by its own foreign key; the staff profile and appointments stay.
  delete from public.business_members where user_id = p_user_id;
  delete from public.push_tokens where user_id = p_user_id;
  delete from public.push_preferences where user_id = p_user_id;
  update public.profiles
     set email = 'deleted-' || p_user_id::text || '@deleted.invalid', full_name = null, avatar_url = null,
         default_business_id = null, deleted_at = now()
   where id = p_user_id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (null, null, 'account.deleted', 'user', p_user_id::text, null, null);
  -- Sessions, identities, MFA factors and the (anonymised) profile go with the auth user.
  delete from auth.users where id = p_user_id;
  return jsonb_build_object('ok', true, 'already_deleted', false);
end $$;

revoke all on function public.account_sole_owner_businesses(uuid) from public, anon, authenticated;
revoke all on function public.account_delete_commit(uuid) from public, anon, authenticated;
revoke all on function public.account_delete_blockers() from public, anon;
grant execute on function public.account_sole_owner_businesses(uuid) to service_role;
grant execute on function public.account_delete_commit(uuid) to service_role;
grant execute on function public.account_delete_blockers() to authenticated, service_role;
