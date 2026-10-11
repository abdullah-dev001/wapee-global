-- Phase 6A, part 5: reminders, maintenance and the schedule.
--
--   enqueue_due_reminders_at(now)   clock-injectable body (INTERNAL, no API grant,
--                                   so tests can prove DST behaviour)
--   enqueue_due_reminders()         what pg_cron calls (every 5 minutes)
--   outbox_maintenance()            hourly: 48 h expiry of open rows (which nulls
--                                   any sealed token), 30-day purge of finished rows
--   invoke_outbox_worker()          every minute, only when something is due: POSTs
--                                   to the send_outbox Edge Function with the Vault
--                                   token. The ONLY function that touches net.*.
--
-- REMINDER TIME: N hours before the appointment on the BRANCH'S WALL CLOCK, not N
-- elapsed hours. A 10:00 appointment with a 24 h reminder is reminded at 10:00 the
-- day before even across a DST change (elapsed time would give 09:00 or 11:00).

create or replace function public.enqueue_due_reminders_at(p_now timestamptz)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_send timestamptz;
  v_n integer := 0;
  v_u uuid;
  v_epoch bigint;
begin
  for r in
    select a.id, a.business_id, a.branch_id, a.client_id, a.staff_id, a.starts_at, a.scheduled_at,
           ns.reminder_hours_before as hrs, br.timezone as tz
    from public.appointments a
    join public.branches br on br.id = a.branch_id
    join public.notification_settings ns on ns.branch_id = a.branch_id
    where a.status = 'confirmed' and a.deleted_at is null and a.source <> 'walk_in'
      and ns.reminders_enabled
      and a.starts_at > p_now and a.starts_at <= p_now + interval '75 hours'
      and not exists (select 1 from public.message_outbox o
                      where o.idempotency_key = 'reminder:' || a.id || ':' || extract(epoch from a.starts_at)::bigint)
    order by a.starts_at
    limit 1000
  loop
    v_send := ((r.starts_at at time zone r.tz) - make_interval(hours => r.hrs)) at time zone r.tz;
    -- Not due yet, or the slot was chosen after the reminder time (a booking made
    -- 3 h ahead must not get its reminder right after its confirmation).
    continue when v_send > p_now or r.scheduled_at > v_send;
    continue when not public.business_is_active(r.business_id);

    v_epoch := extract(epoch from r.starts_at)::bigint;
    if public.outbox_enqueue(r.business_id, r.branch_id, 'reminder', 'reminder:' || r.id || ':' || v_epoch,
         r.id, r.client_id, null, null, p_now) is not null then
      v_n := v_n + 1;
    end if;

    -- Business-user push: the assigned staff member's login, if any.
    for v_u in
      select m.user_id from public.staff_profiles sp
      join public.business_members m on m.id = sp.member_id
      where sp.id = r.staff_id and sp.deleted_at is null and m.status = 'active' and m.deleted_at is null
        and m.user_id is not null and exists (select 1 from public.push_tokens t where t.user_id = m.user_id)
    loop
      perform public.outbox_enqueue(r.business_id, r.branch_id, 'staff_reminder',
        'staff_reminder:' || r.id || ':' || v_epoch || ':' || v_u, r.id, null, v_u, null, p_now);
    end loop;
  end loop;
  return v_n;
end $$;
revoke all on function public.enqueue_due_reminders_at(timestamptz) from public, anon, authenticated;

create or replace function public.enqueue_due_reminders()
returns integer language sql security definer set search_path = '' as $$
  select public.enqueue_due_reminders_at(now());
$$;
revoke all on function public.enqueue_due_reminders() from public, anon, authenticated;

create or replace function public.outbox_maintenance(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_expired integer := 0;
  v_purged integer;
begin
  -- Anything still open after 48 h is finished: this is what guarantees a sealed
  -- token never outlives 48 h (outbox_finish nulls it and the CHECK enforces it).
  for r in
    select id from public.message_outbox
    where status in ('pending', 'retry', 'sending') and created_at < p_now - interval '48 hours'
    for update skip locked
  loop
    perform public.outbox_finish(r.id, 'dead', 'expired', null);
    v_expired := v_expired + 1;
  end loop;

  delete from public.message_outbox
  where status in ('sent', 'dead', 'skipped', 'cancelled') and finished_at < p_now - interval '30 days';
  get diagnostics v_purged = row_count;
  return jsonb_build_object('expired', v_expired, 'purged', v_purged);
end $$;
revoke all on function public.outbox_maintenance(timestamptz) from public, anon, authenticated;

create or replace function public.invoke_outbox_worker()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_url text := public.internal_secret('outbox_worker_url');
  v_token text := public.internal_secret('outbox_worker_token');
begin
  if v_url is null or v_token is null then return null; end if;
  if not exists (select 1 from public.message_outbox
                 where (status in ('pending', 'retry') and deliver_after <= now())
                    or (status = 'sending' and locked_until < now())) then
    return null;
  end if;
  return net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-token', v_token),
    timeout_milliseconds := 20000);
end $$;
revoke all on function public.invoke_outbox_worker() from public, anon, authenticated;

select cron.schedule('outbox-worker', '* * * * *', $$select public.invoke_outbox_worker()$$);
select cron.schedule('outbox-reminders', '*/5 * * * *', $$select public.enqueue_due_reminders()$$);
select cron.schedule('outbox-maintenance', '17 * * * *', $$select public.outbox_maintenance()$$);
