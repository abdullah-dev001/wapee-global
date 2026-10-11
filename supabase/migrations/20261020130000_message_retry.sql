-- Appointment "Messages to the customer": show WHY a send failed and let a permitted
-- user retry a dead one.
--
-- * get_appointment_messages also returns, per item: `error` (the provider reason
--   already stored on the log row, scrubbed of addresses / urls / numbers, e.g.
--   "resend_403: validation_error"), `outbox_id` and `can_retry`. Still no recipient,
--   body or link.
-- * retry_message(outbox_id): re-queues ONE dead client message. Validation first,
--   every refusal is returned before the single UPDATE (CLAUDE.md §5).
--     - needs appointments.edit at the appointment's branch (same scope rule as reading);
--     - only status 'dead' with last_error 'rejected' (provider said no: definite, so a
--       fresh idempotency key is safe) or 'max_attempts' (same key, Resend dedups);
--       'ambiguous_send' is never retried (it may have been delivered);
--     - only events that need no one-time token, so the retry can actually be built;
--     - the appointment must still be live.
--   The raw manage token was deleted when the row went dead, so a retried confirmation
--   goes out WITHOUT the manage link; the customer can request one from the booking page.

create or replace function public.get_appointment_messages(p_appointment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_a record;
  v_items jsonb;
begin
  select a.id, a.business_id, a.branch_id into v_a
  from public.appointments a where a.id = p_appointment_id and a.deleted_at is null;
  if v_a.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.can(v_a.business_id, v_a.branch_id, 'appointments.view')
     or not public.has_permission_at_branch_scope(v_a.business_id, v_a.branch_id, 'appointments.view') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'event', x.event, 'channel', x.channel, 'status', x.status, 'code', x.code, 'at', x.at,
           'error', x.error, 'outbox_id', x.outbox_id, 'can_retry', x.can_retry)
         order by x.at desc), '[]'::jsonb)
  into v_items
  from (
    select * from (
      select m.event, m.channel, m.status, m.code, m.created_at as at,
             case when m.status = 'failed' then public.outbox_clean_error(m.error) end as error,
             m.outbox_id,
             (m.status = 'failed' and o.status = 'dead' and o.last_error in ('rejected', 'max_attempts')
              and m.event in ('booking_confirmed', 'pending_received', 'rescheduled', 'cancelled')
              and m.channel in ('email', 'sms')
              -- only the newest attempt of that outbox row is retryable
              and m.id = (select max(m2.id) from public.messages m2 where m2.outbox_id = m.outbox_id)) as can_retry
      from public.messages m
      left join public.message_outbox o on o.id = m.outbox_id
      where m.appointment_id = p_appointment_id and m.event not like 'staff\_%'
      union all
      select o.event, o.channel, 'queued', null, o.created_at, null, null::uuid, false
      from public.message_outbox o
      where o.appointment_id = p_appointment_id and o.status in ('pending', 'retry', 'sending')
        and o.event not like 'staff\_%'
    ) u order by u.at desc limit 20
  ) x;

  return jsonb_build_object('ok', true, 'items', v_items);
end $$;
revoke all on function public.get_appointment_messages(uuid) from public, anon;
grant execute on function public.get_appointment_messages(uuid) to authenticated;

create or replace function public.retry_message(p_outbox_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.message_outbox;
  v_status text;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'code', 'not_signed_in'); end if;

  select * into o from public.message_outbox where id = p_outbox_id for update;
  if o.id is null or o.appointment_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if not public.can(o.business_id, o.branch_id, 'appointments.edit')
     or not public.has_permission_at_branch_scope(o.business_id, o.branch_id, 'appointments.edit') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if o.status <> 'dead' or o.last_error is null or o.last_error not in ('rejected', 'max_attempts') then
    return jsonb_build_object('ok', false, 'code', 'not_retryable');
  end if;
  if o.channel not in ('email', 'sms')
     or o.event not in ('booking_confirmed', 'pending_received', 'rescheduled', 'cancelled') then
    return jsonb_build_object('ok', false, 'code', 'not_retryable');
  end if;

  select a.status into v_status
  from public.appointments a where a.id = o.appointment_id and a.deleted_at is null;
  if v_status is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.business_is_active(o.business_id) then
    return jsonb_build_object('ok', false, 'code', 'business_inactive');
  end if;

  -- One statement. A 'rejected' send created no email, so it gets a fresh key; a
  -- 'max_attempts' one keeps its key so a send that did go through is not duplicated.
  update public.message_outbox
  set status = 'pending', attempts = 0, last_error = null, finished_at = null,
      locked_until = null, provider_call_at = null, claimed_at = null,
      deliver_after = now(),
      idem_suffix = idem_suffix + case when o.last_error = 'rejected' then 1 else 0 end
  where id = o.id;

  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.retry_message(uuid) from public, anon;
grant execute on function public.retry_message(uuid) to authenticated;
