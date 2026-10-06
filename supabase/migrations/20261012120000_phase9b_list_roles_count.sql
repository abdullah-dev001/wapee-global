-- 9B fix: list_roles counted a DEFAULT role's assignments across EVERY business
-- (Owner showed "5 people" for a business with one owner, and leaked a platform-wide
-- number). The count is now this business's members only. (Found on the first
-- screenshot of the roles screen.)

-- Roles with their permissions and how many assignments use them (for the UI).
create or replace function public.list_roles(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null
     or not (public.can(p_business_id, null, 'roles.manage') or public.can(p_business_id, null, 'users.invite')) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  return jsonb_build_object('ok', true, 'roles', (
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'key', r.key, 'name', r.name, 'is_system', r.business_id is null or r.is_system,
        'permissions', public.role_permission_set(r.id),
        'member_count', (select count(*) from public.member_role_assignments a
                         join public.business_members m on m.id = a.member_id
                         where a.role_id = r.id and m.business_id = p_business_id and m.deleted_at is null))
      order by (r.business_id is null) desc, r.name), '[]'::jsonb)
    from public.roles r
    where r.deleted_at is null and (r.business_id is null or r.business_id = p_business_id)));
end $$;
revoke all on function public.list_roles(uuid) from public, anon;
grant execute on function public.list_roles(uuid) to authenticated;
