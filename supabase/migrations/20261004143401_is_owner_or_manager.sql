-- Phase 4 part B1 fix: the dashboard Calendar UI showed the "Reopen" button
-- using `usePermission('staff.manage')` as a stand-in for "Owner or
-- Manager" — a correct-by-coincidence approximation (that permission
-- happens to be held by exactly Owner+Manager in the seeded roles), not a
-- real check. `reopen_appointment` already has the REAL check inline. This
-- extracts it into one function both call, so there is exactly one place
-- that answers "is this caller Owner or Manager" and the UI's button and
-- the RPC's own gate can never drift apart.
--
-- Same role-key semantics `reopen_appointment` already used: a role
-- assignment with `branch_id is null` covers every branch; a branch-scoped
-- assignment must match `p_branch_id` (or `p_branch_id` is null, meaning
-- "anywhere", which is what the UI's button check wants — it does not know
-- a specific appointment's branch when deciding whether to show the button
-- at all, only when deciding for ONE row).
create or replace function public.is_owner_or_manager(
  p_business_id uuid,
  p_branch_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_super_admin() or exists (
    select 1
    from public.business_members bm
    join public.member_role_assignments mra on mra.member_id = bm.id
    join public.roles r on r.id = mra.role_id
    where bm.business_id = p_business_id
      and bm.user_id = (select auth.uid())
      and bm.status = 'active'
      and bm.deleted_at is null
      and r.key in ('owner', 'manager')
      and (
        p_branch_id is null
        or mra.branch_id is null
        or mra.branch_id = p_branch_id
      )
  );
$$;

comment on function public.is_owner_or_manager is
  'Is the caller an Owner or Manager of this business (optionally scoped to one branch)? The single source of truth for this role check -- reopen_appointment calls it internally, and the UI calls it directly to decide whether to show the Reopen button. UI-only use never bypasses the RPC''s own check.';

revoke all on function public.is_owner_or_manager(uuid, uuid) from public;
revoke execute on function public.is_owner_or_manager(uuid, uuid) from anon;
grant execute on function public.is_owner_or_manager(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- reopen_appointment: use the extracted helper instead of its own inline
-- query. Behaviour is unchanged (same role-key semantics, same super-admin
-- bypass) -- this is a dedup, not a rule change.
-- ---------------------------------------------------------------------------
create or replace function public.reopen_appointment(p_appointment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  select a.id, a.business_id, a.branch_id, a.status, a.invoice_id
  into v_row
  from public.appointments a
  where a.id = p_appointment_id and a.deleted_at is null
  for update of a;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- Must still be a member of an ACTIVE business — same floor every other
  -- RPC here applies via can(), even though this check is role-based, not
  -- permission-based.
  if not public.business_is_active(v_row.business_id) and not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if not public.is_owner_or_manager(v_row.business_id, v_row.branch_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if not public.is_allowed_appointment_transition(v_row.status, 'confirmed') then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition', 'status', v_row.status);
  end if;

  -- An invoiced appointment is a financial record now; reopening it would
  -- let the underlying service/time disagree with what was billed. Phase 5
  -- owns correcting an invoiced appointment (credit note / reversal), not a
  -- reopen here.
  if v_row.invoice_id is not null then
    return jsonb_build_object('ok', false, 'code', 'invoiced');
  end if;

  update public.appointments set status = 'confirmed' where id = p_appointment_id;

  perform public.write_audit_log(
    v_row.business_id, 'appointment.reopened', 'appointment', p_appointment_id::text,
    jsonb_build_object('status', v_row.status), jsonb_build_object('status', 'confirmed')
  );

  return jsonb_build_object('ok', true, 'status', 'confirmed');
end;
$$;

comment on function public.reopen_appointment is
  'no_show/completed -> confirmed. Owner/Manager ONLY, via is_owner_or_manager() (literal role check, not has_permission -- appointments.edit is also Receptionist''s at Branch scope and the user''s decision excludes them). Refused when invoice_id is set. Audit-logged. Decided 2026-10-05.';

revoke all on function public.reopen_appointment(uuid) from public;
revoke execute on function public.reopen_appointment(uuid) from anon;
grant execute on function public.reopen_appointment(uuid) to authenticated;
