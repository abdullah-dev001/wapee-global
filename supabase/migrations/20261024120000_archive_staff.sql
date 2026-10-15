-- Feature 10 audit: archiving a staff member (the Staff screen's "Remove"
-- dialog) was a bare `update staff_profiles set deleted_at = now()`, with RLS
-- as the only boundary and no RPC at all. Unlike archiving a branch
-- (`archive_branch` / `branch_archive_blockers`, migration
-- 20261011110000_phase9_multi_branch.sql), it never checked for future
-- appointments — so a staff member with confirmed bookings next week could be
-- archived with zero warning, and (a separate, now-fixed client bug) their
-- future appointment then vanished from the Calendar's Day/Week grid because
-- that view excluded every inactive staff member outright.
--
-- Same shape as `branch_archive_blockers` / `archive_branch`: one blockers
-- function returning null (ok to archive) or {code, count}, one RPC that
-- checks the permission, calls the blocker, and only then mutates. Archiving
-- does NOT need a plan-feature gate (staff has none) or `can_grant_at` (not a
-- role grant), so this is simpler than `branch_admin_gate`.
create or replace function public.staff_archive_blockers(p_staff_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.appointments a
  where a.staff_id = p_staff_id and a.deleted_at is null
    and a.status in ('pending', 'confirmed') and a.ends_at > now();
  if v_n > 0 then
    return jsonb_build_object('code', 'future_appointments', 'count', v_n);
  end if;
  return null;
end $$;
revoke all on function public.staff_archive_blockers(uuid) from public, anon, authenticated;

create or replace function public.archive_staff(p_staff_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_s record;
  v_block jsonb;
begin
  select s.id, s.business_id, s.display_name, s.deleted_at into v_s
  from public.staff_profiles s where s.id = p_staff_id;
  if v_s.id is null or v_s.deleted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if (select auth.uid()) is null or not public.can(v_s.business_id, null, 'staff.manage') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  v_block := public.staff_archive_blockers(p_staff_id);
  if v_block is not null then
    return jsonb_build_object('ok', false) || v_block;
  end if;

  update public.staff_profiles set deleted_at = now() where id = p_staff_id;
  perform public.write_audit_log(v_s.business_id, 'staff.archived', 'staff_profile', p_staff_id::text,
    jsonb_build_object('display_name', v_s.display_name), jsonb_build_object('archived', true));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.archive_staff(uuid) from public, anon;
grant execute on function public.archive_staff(uuid) to authenticated;

comment on function public.staff_archive_blockers(uuid) is
  'Archive rules in ONE place: null = may archive, else {code, count}. Mirrors branch_archive_blockers.';
comment on function public.archive_staff(uuid) is
  'Soft-deletes a staff profile. Refuses while they have a future pending/confirmed appointment (never silently orphans a booking); the Calendar Day/Week grid separately still shows an archived staff member on any day they keep an appointment, as a second line of defence.';
