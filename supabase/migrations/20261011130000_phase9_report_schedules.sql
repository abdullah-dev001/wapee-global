-- Phase 9A (5/5): scheduled weekly / monthly report emails.
--
--   report_schedules            one row per (business, branch-or-all, frequency)
--   set_report_schedule()       create / change / re-enable (RPC only)
--   delete_report_schedule()    soft delete
--   enqueue_due_report_summaries_at(now)   INTERNAL, clock-injectable; pg_cron calls
--                                          the wrapper every 15 minutes
--   outbox event `report_summary`           a small summary email through the
--                                          existing outbox + send_outbox worker
--
-- Decided with the user: the recipients are the ACTIVE members who hold
-- reports.view_advanced at ALL scope, re-checked when the email is sent (the
-- guard), so a removed member stops receiving it. Revenue figures are included
-- only for a recipient who also holds reports.view_revenue at all scope.
--
-- Timing: weekly = the previous complete Monday..Sunday, sent from Monday
-- `send_hour` (local); monthly = the previous complete calendar month, sent from
-- the 1st at `send_hour`. "Local" is the schedule branch's timezone (or the
-- primary branch's for an all-branches schedule). A missed run is caught up on
-- the next tick; a period is never sent twice (last_period_end claimed in the
-- same statement that decides to send). A new schedule starts with the NEXT
-- period, not a backlog.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table public.report_schedules (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  -- null = every branch of the business
  branch_id       uuid references public.branches (id) on delete cascade,
  frequency       text not null check (frequency in ('weekly', 'monthly')),
  send_hour       integer not null default 8 check (send_hour between 0 and 23),
  is_enabled      boolean not null default true,
  last_period_end date,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create unique index report_schedules_unique
  on public.report_schedules (business_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), frequency)
  where deleted_at is null;
create index report_schedules_branch_idx on public.report_schedules (branch_id) where branch_id is not null;
create index report_schedules_due_idx on public.report_schedules (business_id) where is_enabled and deleted_at is null;
create trigger report_schedules_set_updated_at before update on public.report_schedules
  for each row execute function public.set_updated_at();

alter table public.report_schedules enable row level security;
create policy report_schedules_select on public.report_schedules for select to authenticated
  using (deleted_at is null and public.can(business_id, null, 'reports.view_advanced')
         and public.can_grant_at(business_id, null, 'reports.view_advanced', 'all'));
revoke all on public.report_schedules from anon, authenticated;
grant select on public.report_schedules to authenticated;

-- ---------------------------------------------------------------------------
-- Period helpers (internal)
-- ---------------------------------------------------------------------------
-- The end date of the most recent COMPLETE period as of a local date.
create or replace function public.report_last_complete_end(p_frequency text, p_local_date date)
returns date language sql immutable set search_path = '' as $$
  select case p_frequency
    when 'weekly' then p_local_date - extract(isodow from p_local_date)::int
    else (date_trunc('month', p_local_date)::date - 1)
  end
$$;
revoke all on function public.report_last_complete_end(text, date) from public, anon, authenticated;

create or replace function public.report_period_for_end(p_frequency text, p_end date)
returns jsonb language sql immutable set search_path = '' as $$
  select case p_frequency
    when 'weekly' then jsonb_build_object('from', p_end - 6, 'to', p_end, 'prev_from', p_end - 13, 'prev_to', p_end - 7)
    else jsonb_build_object('from', date_trunc('month', p_end)::date, 'to', p_end,
           'prev_from', (date_trunc('month', p_end) - interval '1 month')::date,
           'prev_to', date_trunc('month', p_end)::date - 1)
  end
$$;
revoke all on function public.report_period_for_end(text, date) from public, anon, authenticated;

-- Which timezone a schedule runs in.
create or replace function public.report_schedule_zone(p_business_id uuid, p_branch_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select b.timezone from public.branches b where b.id = p_branch_id),
    (select b.timezone from public.branches b where b.business_id = p_business_id and b.deleted_at is null
     order by b.is_primary desc, b.created_at limit 1))
$$;
revoke all on function public.report_schedule_zone(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.report_schedule_gate(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.can(p_business_id, null, 'reports.view_advanced')
     or not public.can_grant_at(p_business_id, null, 'reports.view_advanced', 'all') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  return public.feature_gate_error(p_business_id, 'advanced_reports');
end $$;
revoke all on function public.report_schedule_gate(uuid) from public, anon, authenticated;

create or replace function public.set_report_schedule(
  p_business_id uuid,
  p_frequency text,
  p_branch_id uuid default null,
  p_enabled boolean default true,
  p_send_hour integer default 8
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_gate jsonb;
  v_tz text;
  v_end date;
  v_row public.report_schedules;
  v_before jsonb;
begin
  v_gate := public.report_schedule_gate(p_business_id);
  if v_gate is not null then return v_gate; end if;
  if p_frequency is null or p_frequency not in ('weekly', 'monthly') then
    return jsonb_build_object('ok', false, 'code', 'invalid_frequency');
  end if;
  if p_send_hour is null or p_send_hour not between 0 and 23 then
    return jsonb_build_object('ok', false, 'code', 'invalid_hour');
  end if;
  if p_branch_id is not null and not exists (
       select 1 from public.branches b where b.id = p_branch_id and b.business_id = p_business_id and b.deleted_at is null) then
    return jsonb_build_object('ok', false, 'code', 'invalid_branch');
  end if;

  v_tz := public.report_schedule_zone(p_business_id, p_branch_id);
  v_end := public.report_last_complete_end(p_frequency, (now() at time zone v_tz)::date);

  select * into v_row from public.report_schedules s
  where s.business_id = p_business_id and s.frequency = p_frequency and s.deleted_at is null
    and coalesce(s.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(p_branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
  for update;

  -- All validation done. Write.
  if v_row.id is null then
    insert into public.report_schedules (business_id, branch_id, frequency, send_hour, is_enabled, last_period_end, created_by)
    values (p_business_id, p_branch_id, p_frequency, p_send_hour, coalesce(p_enabled, true), v_end, auth.uid())
    returning * into v_row;
    perform public.write_audit_log(p_business_id, 'report_schedule.created', 'report_schedule', v_row.id::text, null,
      jsonb_build_object('frequency', p_frequency, 'branch_id', p_branch_id, 'send_hour', p_send_hour,
                         'is_enabled', coalesce(p_enabled, true)));
  else
    v_before := jsonb_build_object('send_hour', v_row.send_hour, 'is_enabled', v_row.is_enabled);
    update public.report_schedules s
    set send_hour = p_send_hour, is_enabled = coalesce(p_enabled, true),
        -- re-enabling must not flood the periods missed while it was off
        last_period_end = case when not v_row.is_enabled and coalesce(p_enabled, true) then v_end else s.last_period_end end
    where s.id = v_row.id returning * into v_row;
    perform public.write_audit_log(p_business_id, 'report_schedule.updated', 'report_schedule', v_row.id::text, v_before,
      jsonb_build_object('send_hour', p_send_hour, 'is_enabled', coalesce(p_enabled, true)));
  end if;
  return jsonb_build_object('ok', true, 'schedule_id', v_row.id, 'is_enabled', v_row.is_enabled,
                            'last_period_end', v_row.last_period_end);
end $$;

create or replace function public.delete_report_schedule(p_schedule_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row public.report_schedules;
  v_gate jsonb;
begin
  select * into v_row from public.report_schedules s where s.id = p_schedule_id and s.deleted_at is null for update;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  v_gate := public.report_schedule_gate(v_row.business_id);
  if v_gate is not null then return v_gate; end if;
  update public.report_schedules set deleted_at = now(), is_enabled = false where id = p_schedule_id;
  perform public.write_audit_log(v_row.business_id, 'report_schedule.deleted', 'report_schedule', p_schedule_id::text,
    jsonb_build_object('frequency', v_row.frequency, 'branch_id', v_row.branch_id), null);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.set_report_schedule(uuid, text, uuid, boolean, integer) from public, anon;
revoke all on function public.delete_report_schedule(uuid) from public, anon;
grant execute on function public.set_report_schedule(uuid, text, uuid, boolean, integer) to authenticated;
grant execute on function public.delete_report_schedule(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The outbox: allow the new event, and email rows addressed to a USER.
-- ---------------------------------------------------------------------------
alter table public.message_outbox drop constraint message_outbox_event_check;
alter table public.message_outbox add constraint message_outbox_event_check check (event in (
  'booking_confirmed', 'pending_received', 'reminder', 'rescheduled', 'cancelled',
  'manage_link', 'review_request',
  'staff_new_booking', 'staff_pending_approval', 'staff_cancelled', 'staff_reminder',
  'report_summary'));
alter table public.message_outbox drop constraint message_outbox_push_shape;
alter table public.message_outbox add constraint message_outbox_push_shape check (
  (event = 'report_summary' and channel = 'email' and user_id is not null and client_id is null
     and appointment_id is null)
  or (event <> 'report_summary'
      and (channel = 'push') = (user_id is not null)
      and (channel = 'push') = (event like 'staff\_%')
      and (channel <> 'push') = (client_id is not null)));

-- Recipient of a report_summary row = the member's own login email.
create or replace function public.outbox_recipient(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  o record;
  v_addr text;
begin
  select ob.channel, ob.client_id, ob.business_id, ob.user_id, ob.event into o
  from public.message_outbox ob where ob.id = p_id;
  if o.channel is null or o.channel = 'push' then
    return jsonb_build_object('address', null, 'hash', null, 'masked', case when o.channel = 'push' then 'push' else null end);
  end if;
  if o.event = 'report_summary' then
    select p.email::text into v_addr
    from public.profiles p
    join public.business_members m on m.user_id = p.id and m.business_id = o.business_id
         and m.status = 'active' and m.deleted_at is null
    where p.id = o.user_id limit 1;
  else
    select case when o.channel = 'email' then c.email::text else c.phone_e164 end into v_addr
    from public.clients c where c.id = o.client_id and c.business_id = o.business_id and c.deleted_at is null;
  end if;
  if v_addr is null then
    return jsonb_build_object('address', null, 'hash', null, 'masked', null);
  end if;
  return jsonb_build_object(
    'address', v_addr,
    'hash', public.message_recipient_hash(v_addr),
    'masked', case when o.channel = 'email' then public.mask_email(v_addr) else public.mask_phone(v_addr) end);
end $$;
revoke all on function public.outbox_recipient(uuid) from public, anon, authenticated;

-- Does this user hold the permission at ALL scope in this business (no caller needed)?
create or replace function public.user_holds_all_scope(p_business_id uuid, p_user_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m
    join public.member_role_assignments a on a.member_id = m.id
    join public.roles r on r.id = a.role_id and r.deleted_at is null
    join public.role_permissions rp on rp.role_id = a.role_id
    where m.business_id = p_business_id and m.user_id = p_user_id and m.status = 'active' and m.deleted_at is null
      and rp.permission = p_permission and rp.scope = 'all')
$$;
revoke all on function public.user_holds_all_scope(uuid, uuid, text) from public, anon, authenticated;

-- outbox_guard + the report_summary re-check (copy of the 6A function with one
-- early block; every other branch is unchanged).
do $migrate$
declare
  v_src text;
  v_marker text := E'  if not public.business_is_active(o.business_id) then return ''business_inactive''; end if;\n';
  v_block text := E'\n  -- report_summary: the recipient must STILL be an active member holding\n  -- reports.view_advanced at all scope, and the plan must still have the feature.\n  if o.event = ''report_summary'' then\n    if not public.business_has_feature(o.business_id, ''advanced_reports'')\n       or not public.user_holds_all_scope(o.business_id, o.user_id, ''reports.view_advanced'') then\n      return ''stale'';\n    end if;\n  end if;\n';
begin
  select pg_get_functiondef('public.outbox_guard(uuid)'::regprocedure) into v_src;
  if position(v_marker in v_src) = 0 then
    raise exception 'outbox_guard marker not found';
  end if;
  v_src := replace(v_src, v_marker, v_marker || v_block);
  execute v_src;
end
$migrate$;
revoke all on function public.outbox_guard(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The summary data (no caller: service mode) and the enqueue tick
-- ---------------------------------------------------------------------------
create or replace function public.report_summary_data(
  p_business_id uuid, p_branch_id uuid, p_from date, p_to date, p_pf date, p_pt date
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_cur jsonb := public.adv_revenue(p_business_id, p_branch_id, p_from, p_to, true) -> 'currencies';
  v_prev jsonb := public.adv_revenue(p_business_id, p_branch_id, p_pf, p_pt, true) -> 'currencies';
  v_rev jsonb;
  v_ac jsonb := public.adv_appointments(p_business_id, p_branch_id, p_from, p_to, true);
  v_ap jsonb := public.adv_appointments(p_business_id, p_branch_id, p_pf, p_pt, true);
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'currency', x.cur,
      'net_revenue_minor', coalesce((c.e ->> 'net_revenue_minor')::bigint, 0),
      'collected_minor', coalesce((c.e ->> 'collected_minor')::bigint, 0),
      'invoice_count', coalesce((c.e ->> 'invoice_count')::int, 0),
      'discounts_minor', coalesce((c.e ->> 'discounts_minor')::bigint, 0),
      'prev_net_revenue_minor', coalesce((p.e ->> 'net_revenue_minor')::bigint, 0),
      'prev_collected_minor', coalesce((p.e ->> 'collected_minor')::bigint, 0)) order by x.cur), '[]'::jsonb)
  into v_rev
  from (select distinct u.e ->> 'currency' cur
        from (select jsonb_array_elements(v_cur) e union all select jsonb_array_elements(v_prev)) u) x
  left join lateral (select e from jsonb_array_elements(v_cur) e where e ->> 'currency' = x.cur) c on true
  left join lateral (select e from jsonb_array_elements(v_prev) e where e ->> 'currency' = x.cur) p on true;
  return jsonb_build_object(
    'revenue', v_rev,
    'appointments', jsonb_build_object('total', v_ac -> 'total', 'completed', v_ac -> 'completed',
      'cancelled', v_ac -> 'cancelled', 'no_show', v_ac -> 'no_show', 'completed_bp', v_ac -> 'completed_bp',
      'cancelled_bp', v_ac -> 'cancelled_bp', 'no_show_bp', v_ac -> 'no_show_bp',
      'prev_total', v_ap -> 'total', 'prev_completed', v_ap -> 'completed'));
end $$;
revoke all on function public.report_summary_data(uuid, uuid, date, date, date, date) from public, anon, authenticated;

create or replace function public.enqueue_due_report_summaries_at(p_now timestamptz)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  s record;
  v_tz text;
  v_local timestamp;
  v_end date;
  v_claimed uuid;
  v_per jsonb;
  v_data jsonb;
  v_branch uuid;
  v_bname text;
  u record;
  v_payload jsonb;
  v_n integer := 0;
begin
  for s in
    select rs.id, rs.business_id, rs.branch_id, rs.frequency, rs.send_hour, rs.last_period_end
    from public.report_schedules rs
    where rs.is_enabled and rs.deleted_at is null
    order by rs.created_at
    limit 500
  loop
    continue when not public.business_is_active(s.business_id)
               or not public.business_has_feature(s.business_id, 'advanced_reports');
    if s.branch_id is not null and not exists (
         select 1 from public.branches b where b.id = s.branch_id and b.deleted_at is null) then
      continue;
    end if;
    v_tz := public.report_schedule_zone(s.business_id, s.branch_id);
    continue when v_tz is null;
    v_local := p_now at time zone v_tz;
    v_end := public.report_last_complete_end(s.frequency, v_local::date);
    continue when s.last_period_end is not null and s.last_period_end >= v_end;
    continue when v_local < (v_end + 1)::timestamp + make_interval(hours => s.send_hour);

    -- claim the period; a concurrent tick that loses the race sends nothing
    update public.report_schedules set last_period_end = v_end
    where id = s.id and (last_period_end is null or last_period_end < v_end)
    returning id into v_claimed;
    continue when v_claimed is null;

    v_per := public.report_period_for_end(s.frequency, v_end);
    v_data := public.report_summary_data(s.business_id, s.branch_id, (v_per ->> 'from')::date, (v_per ->> 'to')::date,
                                         (v_per ->> 'prev_from')::date, (v_per ->> 'prev_to')::date);
    select b.id, b.name into v_branch, v_bname from public.branches b
    where b.id = coalesce(s.branch_id, (select x.id from public.branches x where x.business_id = s.business_id
                          and x.deleted_at is null order by x.is_primary desc, x.created_at limit 1));

    for u in
      select m.user_id,
             public.user_holds_all_scope(s.business_id, m.user_id, 'reports.view_revenue') as rev
      from public.business_members m
      where m.business_id = s.business_id and m.status = 'active' and m.deleted_at is null and m.user_id is not null
        and public.user_holds_all_scope(s.business_id, m.user_id, 'reports.view_advanced')
    loop
      v_payload := jsonb_build_object(
        'frequency', s.frequency, 'from', v_per -> 'from', 'to', v_per -> 'to',
        'prev_from', v_per -> 'prev_from', 'prev_to', v_per -> 'prev_to',
        'scope_branch', case when s.branch_id is null then null else v_bname end,
        'appointments', v_data -> 'appointments',
        'revenue', case when u.rev then v_data -> 'revenue' else null end);
      insert into public.message_outbox
        (business_id, branch_id, user_id, channel, event, idempotency_key, deliver_after, payload, max_attempts)
      values (s.business_id, v_branch, u.user_id, 'email', 'report_summary',
              'report_summary:' || s.id || ':' || v_end || ':' || u.user_id, p_now, v_payload,
              coalesce((select value from public.messaging_limits where key = 'max_attempts'), 5))
      on conflict (idempotency_key) do nothing;
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_n;
end $$;
revoke all on function public.enqueue_due_report_summaries_at(timestamptz) from public, anon, authenticated;

create or replace function public.enqueue_due_report_summaries()
returns integer language sql security definer set search_path = '' as $$
  select public.enqueue_due_report_summaries_at(now())
$$;
revoke all on function public.enqueue_due_report_summaries() from public, anon, authenticated;

select cron.schedule('report-schedules', '*/15 * * * *', $$select public.enqueue_due_report_summaries()$$);
