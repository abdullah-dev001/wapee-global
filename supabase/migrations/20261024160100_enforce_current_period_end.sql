-- Feature 7/8 audit: current_period_end existed on business_subscriptions
-- but was never enforced anywhere (known gap). This mirrors it into
-- businesses (same pattern as plan/status/trial_ends_at/plan_activated_at)
-- and makes business_is_active() treat a PAID period that has ended, with an
-- explicit end date, the same way an expired trial is treated: inactive. A
-- null current_period_end (manual billing, no expiry) never locks anything.
--
-- set_business_status('active') lets the super admin reactivate independently
-- of assign_plan (a real UI path: the status dialog). If current_period_end
-- is already in the past, business_is_active() would otherwise re-lock the
-- business the instant it is "reactivated" — contradicting the admin's
-- explicit choice. Clear a PAST period end only on this one transition
-- (assign_plan remains the only way to set a real period end); a future one
-- (reactivating ahead of its own expiry) is left alone.

alter table public.businesses add column if not exists current_period_end timestamptz;

create or replace function public.sync_business_from_subscription()
returns trigger language plpgsql security definer set search_path = '' as $sync$
begin
  perform set_config('wapee.plan_sync', 'on', true);
  update public.businesses b
     set plan = new.plan,
         status = new.status,
         trial_ends_at = new.trial_ends_at,
         current_period_end = new.current_period_end,
         plan_activated_at = case when new.status = 'active' then new.current_period_start else b.plan_activated_at end
   where b.id = new.business_id
     and (b.plan is distinct from new.plan
          or b.status is distinct from new.status
          or b.trial_ends_at is distinct from new.trial_ends_at
          or b.current_period_end is distinct from new.current_period_end
          or (new.status = 'active' and b.plan_activated_at is distinct from new.current_period_start));
  perform set_config('wapee.plan_sync', 'off', true);
  return new;
end $sync$;

create or replace function public.enforce_business_guard()
returns trigger language plpgsql set search_path = '' as $guard$
begin
  if auth.uid() is not null and coalesce(current_setting('wapee.plan_sync', true), 'off') <> 'on' then
    if new.plan is distinct from old.plan
       or new.status is distinct from old.status
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.current_period_end is distinct from old.current_period_end
       or new.plan_activated_at is distinct from old.plan_activated_at then
      raise exception 'plan, status and trial dates are managed by Wapee'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$guard$;

create or replace function public.set_business_status(p_business_id uuid, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $setstatus$
declare
  v_code text := public.admin_gate();
  v_s record;
  v_viol jsonb;
  v_revoked integer := 0;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if p_status is null or p_status not in ('active', 'inactive', 'suspended') then
    return jsonb_build_object('ok', false, 'code', 'invalid_status');
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_notes');
  end if;
  select s.* into v_s from public.business_subscriptions s
  join public.businesses b on b.id = s.business_id and b.deleted_at is null
  where s.business_id = p_business_id for update of s;
  if v_s.business_id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if p_status = 'active' then
    if v_s.plan is null then return jsonb_build_object('ok', false, 'code', 'plan_required'); end if;
    v_viol := public.plan_limit_violations(p_business_id, v_s.plan);
    if (v_viol ->> 'violated')::boolean then
      return jsonb_build_object('ok', false, 'code', 'over_limit',
        'staff_over_cap', v_viol -> 'staff_over_cap', 'branches_over', v_viol -> 'branches_over');
    end if;
  end if;

  update public.business_subscriptions
     set status = p_status::public.business_status,
         current_period_end = case
           when p_status = 'active' and current_period_end <= now() then null
           else current_period_end
         end,
         assigned_by = (select auth.uid()), notes = coalesce(p_note, notes)
   where business_id = p_business_id;

  perform public.write_audit_log(p_business_id, 'admin.set_status', 'business', p_business_id::text,
    jsonb_build_object('status', v_s.status), jsonb_build_object('status', p_status));

  if p_status = 'suspended' then
    v_revoked := public.revoke_sessions_of_disabled_members(p_business_id);
    perform public.write_audit_log(p_business_id, 'admin.sessions_revoked', 'business', p_business_id::text,
      null, jsonb_build_object('users', v_revoked));
  end if;
  return jsonb_build_object('ok', true, 'status', p_status, 'sessions_revoked_users', v_revoked);
end $setstatus$;

create or replace function public.business_is_active(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $active$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id
      and b.deleted_at is null
      and (
        (b.status = 'active' and (b.current_period_end is null or b.current_period_end > now()))
        or (b.status = 'trialing' and b.trial_ends_at > now())
      )
  );
$active$;

-- Backfill: copy the existing current_period_end for every business that
-- already has a subscription row (predates the new column; not covered by
-- the trigger's own "only on change" diffing).
update public.businesses b
   set current_period_end = s.current_period_end
  from public.business_subscriptions s
 where s.business_id = b.id
   and b.current_period_end is distinct from s.current_period_end;
