-- Corrects 20261020100000: outbox_job must keep the idem_suffix idempotency key from 20261009090000 (and add platform + web_keys).
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
    select jsonb_agg(jsonb_build_object('id', t.id, 'token', t.token, 'platform', t.platform, 'web_keys', t.web_keys))
    from public.message_outbox o2 join public.push_tokens t on t.user_id = o2.user_id
    where o2.id = p_id and o2.channel = 'push'), '[]'::jsonb));
  return j;
end $$;
revoke all on function public.outbox_job(uuid) from public, anon, authenticated;
