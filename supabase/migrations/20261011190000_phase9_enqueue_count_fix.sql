-- Phase 9A fix: enqueue_due_report_summaries_at counted every recipient it tried,
-- including rows that already existed (ON CONFLICT DO NOTHING). It now returns
-- the number of rows actually queued. (20261011130000 is applied, not edited.)

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
  v_new uuid;
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
      on conflict (idempotency_key) do nothing
      returning id into v_new;
      if v_new is not null then v_n := v_n + 1; end if;
      v_new := null;
    end loop;
  end loop;
  return v_n;
end $$;
revoke all on function public.enqueue_due_report_summaries_at(timestamptz) from public, anon, authenticated;
