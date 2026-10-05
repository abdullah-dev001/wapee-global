-- Phase 6A, part 2: internal helpers (no API grants on any of them).
--   internal_secret / outbox_seal / outbox_unseal   Vault-backed token sealing
--   message_recipient_hash / mask_email / mask_phone
--   sms_segments        GSM-7 / UCS-2 counting (160|153 and 70|67)
--   sms_rate_for        longest dial-code prefix
--   sms_ledger_post     the ONLY writer of the credit ledger + balance
--   notification_next_allowed   quiet hours, DST-correct
--   push_recipient_users

-- ---------------------------------------------------------------------------
-- Vault
-- ---------------------------------------------------------------------------
create or replace function public.internal_secret(p_name text)
returns text language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from vault.decrypted_secrets s where s.name = p_name;
$$;
revoke all on function public.internal_secret(text) from public, anon, authenticated;

create or replace function public.outbox_seal(p_token text)
returns bytea language sql security definer set search_path = '' as $$
  select extensions.pgp_sym_encrypt(p_token, public.internal_secret('outbox_seal_key'));
$$;
revoke all on function public.outbox_seal(text) from public, anon, authenticated;

create or replace function public.outbox_unseal(p_sealed bytea)
returns text language sql security definer set search_path = '' as $$
  select case when p_sealed is null then null
         else extensions.pgp_sym_decrypt(p_sealed, public.internal_secret('outbox_seal_key')) end;
$$;
revoke all on function public.outbox_unseal(bytea) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Recipient hash + masks (the log never holds an address)
-- ---------------------------------------------------------------------------
create or replace function public.message_recipient_hash(p_address text)
returns text language sql stable security definer set search_path = '' as $$
  select case when p_address is null then null
    else pg_catalog.encode(
      extensions.hmac(pg_catalog.lower(pg_catalog.btrim(p_address)), public.internal_secret('message_hash_key'), 'sha256'),
      'hex') end;
$$;
revoke all on function public.message_recipient_hash(text) from public, anon, authenticated;

create or replace function public.mask_email(p_email text)
returns text language sql immutable set search_path = '' as $$
  select case when p_email is null or position('@' in p_email) < 2 then null
    else left(p_email, 1) || '***@' || split_part(p_email, '@', 2) end;
$$;
revoke all on function public.mask_email(text) from public, anon, authenticated;

create or replace function public.mask_phone(p_phone text)
returns text language sql immutable set search_path = '' as $$
  select case when p_phone is null or char_length(p_phone) < 8 then null
    else left(p_phone, 4) || repeat('*', char_length(p_phone) - 6) || right(p_phone, 2) end;
$$;
revoke all on function public.mask_phone(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- sms_segments: encoding + segment count.
--   GSM-7: basic set = 1 unit, extension set (^ { } \ [ ~ ] | € form-feed) = 2
--          units; <=160 units = 1 segment, otherwise ceil(units/153).
--   Anything outside GSM-7 (Arabic, Urdu, emoji, curly quotes...) = UCS-2:
--          counted in UTF-16 code units (an emoji is 2); <=70 = 1 segment,
--          otherwise ceil(units/67).
-- Known simplification: an extension character is not kept whole across a
-- segment boundary (real carriers may add one unit of padding). Rounded the
-- way that cannot undercharge by more than one segment on a >160-char message.
-- ---------------------------------------------------------------------------
create or replace function public.sms_segments(p_text text)
returns table (out_encoding text, out_units integer, out_segments integer)
language plpgsql immutable set search_path = '' as $$
declare
  v_basic constant text := E'@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&''()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  v_ext constant text := E'^{}\\[~]|€\f';
  v_len integer := coalesce(char_length(p_text), 0);
  v_gsm boolean := true;
  v_gsm_units integer := 0;
  v_ucs_units integer := 0;
  c text;
  i integer;
begin
  for i in 1 .. v_len loop
    c := substr(p_text, i, 1);
    v_ucs_units := v_ucs_units + case when ascii(c) > 65535 then 2 else 1 end;
    if v_gsm then
      if strpos(v_basic, c) > 0 then
        v_gsm_units := v_gsm_units + 1;
      elsif strpos(v_ext, c) > 0 then
        v_gsm_units := v_gsm_units + 2;
      else
        v_gsm := false;
      end if;
    end if;
  end loop;

  if v_gsm then
    return query select 'gsm7'::text, v_gsm_units,
      case when v_gsm_units = 0 then 0 when v_gsm_units <= 160 then 1 else ceil(v_gsm_units / 153.0)::integer end;
  else
    return query select 'ucs2'::text, v_ucs_units,
      case when v_ucs_units <= 70 then 1 else ceil(v_ucs_units / 67.0)::integer end;
  end if;
end $$;
revoke all on function public.sms_segments(text) from public, anon, authenticated;

create or replace function public.sms_rate_for(p_phone text)
returns public.sms_country_rates language sql stable set search_path = '' as $$
  select r.* from public.sms_country_rates r
  where p_phone ~ '^\+[1-9][0-9]{6,14}$'
    and substr(p_phone, 2) like r.dial_code || '%'
  order by char_length(r.dial_code) desc
  limit 1;
$$;
revoke all on function public.sms_rate_for(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- sms_ledger_post: the only writer of sms_credit_ledger and the balance.
-- Row-locks the account, refuses to go below zero (returns, never raises).
-- ---------------------------------------------------------------------------
create or replace function public.sms_ledger_post(
  p_business uuid, p_kind text, p_amount bigint,
  p_outbox uuid default null, p_attempt integer default null, p_ref bigint default null,
  p_dial text default null, p_segments integer default null, p_encoding text default null,
  p_note text default null, p_by uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_balance bigint;
  v_id bigint;
begin
  insert into public.sms_credit_accounts (business_id) values (p_business) on conflict do nothing;
  select balance into v_balance from public.sms_credit_accounts where business_id = p_business for update;
  if v_balance + p_amount < 0 then
    return jsonb_build_object('ok', false, 'code', 'insufficient', 'balance', v_balance);
  end if;
  update public.sms_credit_accounts set balance = v_balance + p_amount, updated_at = now()
  where business_id = p_business;
  insert into public.sms_credit_ledger
    (business_id, kind, amount, balance_after, outbox_id, attempt, ref_ledger_id, dial_code, segments, encoding, note, created_by)
  values (p_business, p_kind, p_amount, v_balance + p_amount, p_outbox, p_attempt, p_ref, p_dial, p_segments, p_encoding, p_note, p_by)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'ledger_id', v_id, 'balance', v_balance + p_amount);
end $$;
revoke all on function public.sms_ledger_post(uuid, text, bigint, uuid, integer, bigint, text, integer, text, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- notification_next_allowed: when may an SMS reminder / review request go?
--   Inside the branch's quiet window -> the window's end (08:00 local by default),
--   but never later than 2 h before the appointment; if that is not in the future,
--   now. DST-safe: the window end is built as a LOCAL wall-clock time.
-- ---------------------------------------------------------------------------
create or replace function public.notification_next_allowed(
  p_branch uuid, p_at timestamptz, p_appointment_start timestamptz default null
) returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare
  s record;
  v_local timestamp;
  v_min integer;
  v_quiet boolean;
  v_date date;
  v_end timestamptz;
  v_target timestamptz;
begin
  select ns.quiet_start_minute qs, ns.quiet_end_minute qe, b.timezone tz into s
  from public.notification_settings ns join public.branches b on b.id = ns.branch_id
  where ns.branch_id = p_branch;
  if s.tz is null or s.qs = s.qe then return p_at; end if;

  v_local := p_at at time zone s.tz;
  v_min := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;
  if s.qs > s.qe then v_quiet := (v_min >= s.qs or v_min < s.qe);
  else v_quiet := (v_min >= s.qs and v_min < s.qe);
  end if;
  if not v_quiet then return p_at; end if;

  v_date := v_local::date;
  if s.qs > s.qe and v_min >= s.qs then v_date := v_date + 1; end if;
  v_end := (v_date::timestamp + make_interval(mins => s.qe)) at time zone s.tz;

  v_target := v_end;
  if p_appointment_start is not null then
    v_target := least(v_end, p_appointment_start - interval '2 hours');
  end if;
  if v_target <= p_at then return p_at; end if;
  return v_target;
end $$;
revoke all on function public.notification_next_allowed(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- push_recipient_users: active members holding `p_permission` for the branch who
-- have at least one push token. Own scope counts only for the assigned staff
-- member. The actor (whoever just did the action) is excluded.
-- ---------------------------------------------------------------------------
create or replace function public.push_recipient_users(
  p_business uuid, p_branch uuid, p_staff uuid, p_permission text, p_exclude uuid default null
) returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct m.user_id
  from public.business_members m
  join public.member_role_assignments a on a.member_id = m.id
  join public.role_permissions rp on rp.role_id = a.role_id
  where m.business_id = p_business
    and m.status = 'active' and m.deleted_at is null and m.user_id is not null
    and rp.permission = p_permission
    and (rp.scope = 'all' or a.branch_id is null or a.branch_id = p_branch)
    and (rp.scope in ('branch', 'all')
         or exists (select 1 from public.staff_profiles sp
                    where sp.id = p_staff and sp.member_id = m.id and sp.deleted_at is null))
    and (p_exclude is null or m.user_id <> p_exclude)
    and exists (select 1 from public.push_tokens t where t.user_id = m.user_id);
$$;
revoke all on function public.push_recipient_users(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
