-- Feature 11 audit: archiving a resource (room/chair/bay) was a bare
-- `update resources set deleted_at = now()`, RLS as the only boundary, no RPC
-- at all — same gap `archive_staff` (migration 20261024120000) already fixed
-- for staff profiles. `use_resources` IS reachable and toggleable in Booking
-- Settings today (not a "Phase 3, not built yet" stub any more), so a future
-- appointment can genuinely carry a real `resource_id`. Archiving with no
-- check would leave that appointment pointing at a resource nobody can see
-- any more in the UI. Same "archive X with future appointments" class as
-- archive_branch/archive_staff (hard refuse, not the warn-and-proceed class
-- used for an hours/time-off/closure EDIT, which doesn't remove anything).
create or replace function public.resource_archive_blockers(p_resource_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.appointments a
  where a.resource_id = p_resource_id and a.deleted_at is null
    and a.status in ('pending', 'confirmed') and a.ends_at > now();
  if v_n > 0 then
    return jsonb_build_object('code', 'future_appointments', 'count', v_n);
  end if;
  return null;
end $$;
revoke all on function public.resource_archive_blockers(uuid) from public, anon, authenticated;

create or replace function public.archive_resource(p_resource_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_r record;
  v_block jsonb;
begin
  select r.id, r.business_id, r.branch_id, r.name, r.deleted_at into v_r
  from public.resources r where r.id = p_resource_id;
  if v_r.id is null or v_r.deleted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- Same permission as the resources list policies: services.manage at this branch.
  if (select auth.uid()) is null or not public.can(v_r.business_id, v_r.branch_id, 'services.manage') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  v_block := public.resource_archive_blockers(p_resource_id);
  if v_block is not null then
    return jsonb_build_object('ok', false) || v_block;
  end if;

  update public.resources set deleted_at = now() where id = p_resource_id;
  perform public.write_audit_log(v_r.business_id, 'resource.archived', 'resource', p_resource_id::text,
    jsonb_build_object('name', v_r.name), jsonb_build_object('archived', true));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.archive_resource(uuid) from public, anon;
grant execute on function public.archive_resource(uuid) to authenticated;

comment on function public.resource_archive_blockers(uuid) is
  'Archive rules in ONE place: null = may archive, else {code, count}. Mirrors staff_archive_blockers/branch_archive_blockers.';
comment on function public.archive_resource(uuid) is
  'Soft-deletes a resource. Refuses while it has a future pending/confirmed appointment assigned to it (never silently orphans a booking''s resource link).';
