-- Phase 6A follow-ups (part 1 of the 2026-10-09 round):
--   * 'unsubscribe' becomes a reserved slug: /unsubscribe is now an app route (the
--     confirm page; only a POST from it unsubscribes).
--   * Resend idempotency: a retry after a DEFINITE failure (the provider answered
--     with a 4xx, so no email exists) uses a fresh key (idem_suffix + 1); an
--     ambiguous outcome (timeout, network error, stale lock) keeps the same key so
--     a duplicate is impossible. outbox_job hands the worker the effective key.

insert into public.reserved_slugs (slug) values ('unsubscribe') on conflict do nothing;

alter table public.message_outbox add column if not exists idem_suffix integer not null default 0;

create or replace function public.outbox_job(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  j jsonb;
  v_r jsonb;
begin
  select jsonb_build_object(
    'id', o.id, 'channel', o.channel, 'event', o.event, 'attempt', o.attempts,
    'idempotency_key', case when o.idem_suffix = 0 then o.idempotency_key else o.idempotency_key || ':' || o.idem_suffix end,
    'business_id', o.business_id, 'branch_id', o.branch_id,
    'business_name', b.name, 'language', b.language, 'slug', b.slug,
    'branch_name', br.name, 'branch_address', br.address, 'branch_phone', br.phone, 'timezone', br.timezone,
    'starts_at', a.starts_at, 'appointment_status', a.status,
    'service_name', s.name, 'staff_name', sp.display_name,
    'client_first_name', split_part(coalesce(c.full_name, ''), ' ', 1),
    'client_name', c.full_name,
    'payload', o.payload,
    'token', public.outbox_unseal(o.sealed)
  ) into j
  from public.message_outbox o
  join public.businesses b on b.id = o.business_id
  join public.branches br on br.id = o.branch_id
  left join public.appointments a on a.id = o.appointment_id
  left join public.services s on s.id = a.service_id
  left join public.staff_profiles sp on sp.id = a.staff_id
  left join public.clients c on c.id = o.client_id
  where o.id = p_id;

  v_r := public.outbox_recipient(p_id);
  j := j || jsonb_build_object('to', v_r->'address', 'recipient_hash', v_r->'hash');
  j := j || jsonb_build_object('tokens', coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'token', t.token))
    from public.message_outbox o2 join public.push_tokens t on t.user_id = o2.user_id
    where o2.id = p_id and o2.channel = 'push'), '[]'::jsonb));
  return j;
end $$;

drop function if exists public.outbox_fail(uuid, text, boolean);

create or replace function public.outbox_fail(p_id uuid, p_error text, p_retryable boolean default true, p_definite boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.message_outbox;
  l record;
  v_dead boolean;
begin
  select * into o from public.message_outbox where id = p_id for update;
  if o.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if o.status <> 'sending' then return jsonb_build_object('ok', false, 'code', 'not_sending'); end if;

  if o.channel = 'sms' then
    select id, business_id, amount, dial_code, segments, encoding into l
    from public.sms_credit_ledger x where x.outbox_id = o.id and x.attempt = o.attempts and x.kind = 'debit';
    if l.id is not null and not exists (select 1 from public.sms_credit_ledger r where r.ref_ledger_id = l.id and r.kind = 'refund') then
      perform public.sms_ledger_post(l.business_id, 'refund', -l.amount, o.id, o.attempts, l.id,
        l.dial_code, l.segments, l.encoding, 'provider failure', null);
    end if;
  end if;

  v_dead := (not p_retryable) or o.attempts >= o.max_attempts;
  if v_dead then
    perform public.outbox_finish(o.id, 'dead', case when p_retryable then 'max_attempts' else 'rejected' end, p_error);
    return jsonb_build_object('ok', true, 'status', 'dead');
  end if;

  update public.message_outbox
  set status = 'retry', locked_until = null, provider_call_at = null,
      idem_suffix = idem_suffix + case when p_definite then 1 else 0 end,
      last_error = public.outbox_clean_error(p_error),
      deliver_after = now() + make_interval(mins => power(4, o.attempts - 1)::integer)
  where id = o.id;
  return jsonb_build_object('ok', true, 'status', 'retry');
end $$;
revoke all on function public.outbox_fail(uuid, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.outbox_fail(uuid, text, boolean, boolean) to service_role;
