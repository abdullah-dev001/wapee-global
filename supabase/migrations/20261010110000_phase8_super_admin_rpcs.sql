-- Phase 8A (3/3): super admin RPCs.
--
-- Every function: SECURITY DEFINER, EXECUTE for `authenticated` only (anon has
-- none, so it is refused at the door), and the FIRST statement is admin_gate():
--   not the platform flag            -> {ok:false, code:'forbidden'}
--   flag but session is not aal2     -> {ok:false, code:'mfa_required'}   (TOTP-verified JWT)
-- They RETURN failures (never raise) and validate everything before the one write.
-- Every call writes an audit_logs row (action 'admin.*'), reads included.
--
-- CREATING THE SUPER ADMIN stays manual (see context/super-admin.md).

create or replace function public.admin_gate()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when (select auth.uid()) is null or not public.is_super_admin() then 'forbidden'
    when coalesce((select auth.jwt()) ->> 'aal', '') <> 'aal2' then 'mfa_required'
  end
$$;
revoke all on function public.admin_gate() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- list_businesses: keyset (created_at desc, id desc), filters, search >= 2 chars.
-- ---------------------------------------------------------------------------
create or replace function public.list_businesses(
  p_search text default null, p_status text default null, p_plan text default null,
  p_limit integer default 20, p_cursor_created_at timestamptz default null, p_cursor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_n integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_search text := nullif(btrim(p_search), '');
  v_items jsonb;
  v_more boolean;
  v_next jsonb;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if v_search is not null and char_length(v_search) < 2 then
    return jsonb_build_object('ok', false, 'code', 'search_too_short');
  end if;
  if p_status is not null and p_status not in ('trialing', 'active', 'inactive', 'suspended') then
    return jsonb_build_object('ok', false, 'code', 'invalid_status');
  end if;
  if p_plan is not null and p_plan not in ('solo', 'team', 'business') then
    return jsonb_build_object('ok', false, 'code', 'invalid_plan');
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    return jsonb_build_object('ok', false, 'code', 'invalid_cursor');
  end if;
  if v_search is not null then
    v_search := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with page as (
    select b.id, b.name, b.slug, b.industry, b.created_at, s.status::text as status, s.plan::text as plan,
           s.trial_ends_at, public.business_is_active(b.id) as is_active,
           (select count(*) from public.branches br where br.business_id = b.id and br.deleted_at is null) as branch_count,
           (select count(*) from public.staff_profiles sp
             where sp.business_id = b.id and sp.is_active and sp.deleted_at is null) as staff_count
    from public.businesses b
    join public.business_subscriptions s on s.business_id = b.id
    where b.deleted_at is null
      and (p_status is null or s.status::text = p_status)
      and (p_plan is null or s.plan::text = p_plan)
      and (v_search is null or b.name ilike v_search or b.slug::text ilike v_search)
      and (p_cursor_id is null or (b.created_at, b.id) < (p_cursor_created_at, p_cursor_id))
    order by b.created_at desc, b.id desc
    limit v_n + 1),
  numbered as (select p.*, row_number() over (order by p.created_at desc, p.id desc) rn from page p)
  select coalesce(jsonb_agg(to_jsonb(x) - 'rn' order by x.rn) filter (where x.rn <= v_n), '[]'::jsonb),
         count(*) > v_n,
         (select jsonb_build_object('created_at', y.created_at, 'id', y.id) from numbered y where y.rn = v_n)
    into v_items, v_more, v_next
  from numbered x;

  if p_cursor_id is null then  -- log the search once, not every page
    perform public.write_audit_log(null, 'admin.list_businesses', 'business', null, null,
      jsonb_build_object('search', p_search, 'status', p_status, 'plan', p_plan));
  end if;
  return jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', case when v_more then v_next end);
end $$;

-- ---------------------------------------------------------------------------
-- get_business_detail
-- ---------------------------------------------------------------------------
create or replace function public.get_business_detail(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_b record;
  v_s record;
  v_month timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_addons jsonb;
  v_usage jsonb;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  select b.id, b.name, b.slug, b.industry, b.language, b.created_at into v_b
  from public.businesses b where b.id = p_business_id and b.deleted_at is null;
  if v_b.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  select * into v_s from public.business_subscriptions where business_id = p_business_id;

  select coalesce(jsonb_agg(jsonb_build_object('key', a.key, 'name', a.name,
           'enabled', coalesce(ba.enabled, false), 'enabled_by', ba.enabled_by,
           'price_monthly_minor', a.price_monthly_minor, 'currency', a.currency) order by a.sort_order), '[]'::jsonb)
    into v_addons
  from public.addons a
  left join public.business_addons ba on ba.addon_key = a.key and ba.business_id = p_business_id;

  v_usage := jsonb_build_object(
    'staff_active', (select count(*) from public.staff_profiles sp
                      where sp.business_id = p_business_id and sp.is_active and sp.deleted_at is null),
    'branches', (select count(*) from public.branches br where br.business_id = p_business_id and br.deleted_at is null),
    'appointments_this_month_utc', (select count(*) from public.appointments a
                      where a.business_id = p_business_id and a.deleted_at is null
                        and a.status <> 'cancelled' and a.starts_at >= v_month),
    'invoices_issued', (select count(*) from public.invoices i
                      where i.business_id = p_business_id and i.status = 'issued' and i.deleted_at is null),
    'sms_balance', coalesce((select c.balance from public.sms_credit_accounts c where c.business_id = p_business_id), 0));

  perform public.write_audit_log(p_business_id, 'admin.view_business', 'business', p_business_id::text, null, null);
  return jsonb_build_object('ok', true,
    'business', to_jsonb(v_b),
    'subscription', jsonb_build_object('plan', v_s.plan, 'status', v_s.status, 'trial_ends_at', v_s.trial_ends_at,
        'current_period_start', v_s.current_period_start, 'current_period_end', v_s.current_period_end,
        'assigned_by', v_s.assigned_by, 'notes', v_s.notes),
    'is_active', public.business_is_active(p_business_id),
    'limits', public.business_plan_limits(p_business_id),
    'addons', v_addons,
    'usage', v_usage);
end $$;

-- ---------------------------------------------------------------------------
-- assign_plan: assigns AND activates (a suspended business stays suspended).
-- Refuses when the business is over the new plan's limits; nothing changes.
-- ---------------------------------------------------------------------------
create or replace function public.assign_plan(
  p_business_id uuid, p_plan text, p_period_end timestamptz default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_s record;
  v_viol jsonb;
  v_status public.business_status;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if p_plan is null or not exists (select 1 from public.plans p where p.key::text = p_plan and p.active) then
    return jsonb_build_object('ok', false, 'code', 'invalid_plan');
  end if;
  if p_period_end is not null and p_period_end <= now() then
    return jsonb_build_object('ok', false, 'code', 'invalid_period');
  end if;
  if p_notes is not null and char_length(p_notes) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_notes');
  end if;
  select s.* into v_s from public.business_subscriptions s
  join public.businesses b on b.id = s.business_id and b.deleted_at is null
  where s.business_id = p_business_id for update of s;
  if v_s.business_id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  v_viol := public.plan_limit_violations(p_business_id, p_plan::public.business_plan);
  if (v_viol ->> 'violated')::boolean then
    return jsonb_build_object('ok', false, 'code', 'over_limit',
      'staff_over_cap', v_viol -> 'staff_over_cap', 'branches_over', v_viol -> 'branches_over');
  end if;
  v_status := case when v_s.status = 'suspended' then 'suspended' else 'active' end;

  update public.business_subscriptions
     set plan = p_plan::public.business_plan, status = v_status,
         current_period_start = now(), current_period_end = p_period_end,
         assigned_by = (select auth.uid()), notes = coalesce(p_notes, notes)
   where business_id = p_business_id;

  perform public.write_audit_log(p_business_id, 'admin.assign_plan', 'business', p_business_id::text,
    jsonb_build_object('plan', v_s.plan, 'status', v_s.status),
    jsonb_build_object('plan', p_plan, 'status', v_status, 'period_end', p_period_end));
  return jsonb_build_object('ok', true, 'plan', p_plan, 'status', v_status);
end $$;

-- ---------------------------------------------------------------------------
-- set_business_status: active | inactive | suspended (trial: use extend_trial)
-- ---------------------------------------------------------------------------
create or replace function public.set_business_status(p_business_id uuid, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_s record;
  v_viol jsonb;
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
         assigned_by = (select auth.uid()), notes = coalesce(p_note, notes)
   where business_id = p_business_id;

  perform public.write_audit_log(p_business_id, 'admin.set_status', 'business', p_business_id::text,
    jsonb_build_object('status', v_s.status), jsonb_build_object('status', p_status));
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

-- ---------------------------------------------------------------------------
-- set_addon
-- ---------------------------------------------------------------------------
create or replace function public.set_addon(p_business_id uuid, p_addon text, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_was boolean;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if p_enabled is null then return jsonb_build_object('ok', false, 'code', 'invalid_input'); end if;
  if not exists (select 1 from public.addons a where a.key = p_addon) then
    return jsonb_build_object('ok', false, 'code', 'unknown_addon');
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.deleted_at is null) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  select ba.enabled into v_was from public.business_addons ba
   where ba.business_id = p_business_id and ba.addon_key = p_addon;

  insert into public.business_addons (business_id, addon_key, enabled, enabled_by)
  values (p_business_id, p_addon, p_enabled, (select auth.uid()))
  on conflict (business_id, addon_key) do update
    set enabled = excluded.enabled, enabled_by = excluded.enabled_by;

  perform public.write_audit_log(p_business_id, 'admin.set_addon', 'addon', p_addon,
    jsonb_build_object('enabled', coalesce(v_was, false)), jsonb_build_object('enabled', p_enabled));
  return jsonb_build_object('ok', true, 'addon', p_addon, 'enabled', p_enabled);
end $$;

-- ---------------------------------------------------------------------------
-- extend_trial: from trialing (or an inactive business) to trialing again.
-- ---------------------------------------------------------------------------
create or replace function public.extend_trial(p_business_id uuid, p_days integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_s record;
  v_end timestamptz;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if p_days is null or p_days < 1 or p_days > 90 then
    return jsonb_build_object('ok', false, 'code', 'invalid_days');
  end if;
  select s.* into v_s from public.business_subscriptions s
  join public.businesses b on b.id = s.business_id and b.deleted_at is null
  where s.business_id = p_business_id for update of s;
  if v_s.business_id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_s.status not in ('trialing', 'inactive') then
    return jsonb_build_object('ok', false, 'code', 'not_extendable');
  end if;
  v_end := greatest(now(), coalesce(v_s.trial_ends_at, now())) + make_interval(days => p_days);

  update public.business_subscriptions
     set status = 'trialing', trial_ends_at = v_end, assigned_by = (select auth.uid())
   where business_id = p_business_id;

  perform public.write_audit_log(p_business_id, 'admin.extend_trial', 'business', p_business_id::text,
    jsonb_build_object('status', v_s.status, 'trial_ends_at', v_s.trial_ends_at),
    jsonb_build_object('status', 'trialing', 'trial_ends_at', v_end, 'days', p_days));
  return jsonb_build_object('ok', true, 'trial_ends_at', v_end);
end $$;

-- ---------------------------------------------------------------------------
-- SMS: the two Phase 6A functions, now behind admin_gate (2FA). Same signatures.
-- ---------------------------------------------------------------------------
create or replace function public.admin_add_sms_credits(p_business uuid, p_credits bigint, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_post jsonb;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if p_credits is null or p_credits = 0 or abs(p_credits) > 100000000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_amount');
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business and b.deleted_at is null) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  v_post := public.sms_ledger_post(p_business, case when p_credits > 0 then 'purchase' else 'adjustment' end,
    p_credits, null, null, null, null, null, null, left(p_note, 300), (select auth.uid()));
  if not (v_post ->> 'ok')::boolean then return jsonb_build_object('ok', false, 'code', 'insufficient'); end if;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (p_business, (select auth.uid()), 'sms.credits_changed', 'business', p_business::text, null,
          jsonb_build_object('credits', p_credits, 'balance_after', v_post -> 'balance'));
  return jsonb_build_object('ok', true, 'balance', (v_post ->> 'balance')::bigint);
end $$;

create or replace function public.admin_set_sms_rate(p_dial text, p_country text, p_credits integer, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_code text := public.admin_gate();
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if p_dial is null or p_dial !~ '^[1-9][0-9]{0,3}$' or p_country is null or p_country !~ '^[A-Z]{2}$'
     or p_credits is null or p_credits <= 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  insert into public.sms_country_rates (dial_code, country_code, credits_per_segment, note, updated_by)
  values (p_dial, p_country, p_credits, left(p_note, 300), (select auth.uid()))
  on conflict (dial_code) do update
    set country_code = excluded.country_code, credits_per_segment = excluded.credits_per_segment,
        note = excluded.note, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (null, (select auth.uid()), 'sms.rate_changed', 'sms_country_rate', p_dial, null,
          jsonb_build_object('country', p_country, 'credits_per_segment', p_credits));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Prices (structure of plans/add-ons is migration-owned; prices/name/active are not)
-- ---------------------------------------------------------------------------
create or replace function public.set_plan_prices(
  p_key text, p_monthly_minor bigint, p_annual_minor bigint, p_currency text,
  p_name text default null, p_active boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_old record;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if p_monthly_minor is null or p_annual_minor is null or p_monthly_minor < 0 or p_annual_minor < 0
     or p_monthly_minor > 100000000 or p_annual_minor > 1000000000
     or p_currency is null or p_currency !~ '^[A-Z]{3}$'
     or (p_name is not null and char_length(btrim(p_name)) not between 1 and 60) then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  select * into v_old from public.plans where key::text = p_key for update;
  if v_old.key is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;

  update public.plans
     set price_monthly_minor = p_monthly_minor, price_annual_minor = p_annual_minor, currency = p_currency,
         name = coalesce(btrim(p_name), name), active = coalesce(p_active, active), updated_by = (select auth.uid())
   where key = v_old.key;

  perform public.write_audit_log(null, 'admin.set_plan_prices', 'plan', p_key,
    jsonb_build_object('monthly', v_old.price_monthly_minor, 'annual', v_old.price_annual_minor,
                       'currency', v_old.currency, 'active', v_old.active),
    jsonb_build_object('monthly', p_monthly_minor, 'annual', p_annual_minor, 'currency', p_currency,
                       'active', coalesce(p_active, v_old.active)));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.set_addon_prices(
  p_key text, p_monthly_minor bigint, p_currency text, p_name text default null, p_active boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_old record;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if p_monthly_minor is null or p_monthly_minor < 0 or p_monthly_minor > 100000000
     or p_currency is null or p_currency !~ '^[A-Z]{3}$'
     or (p_name is not null and char_length(btrim(p_name)) not between 1 and 60) then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  select * into v_old from public.addons where key = p_key for update;
  if v_old.key is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;

  update public.addons
     set price_monthly_minor = p_monthly_minor, currency = p_currency,
         name = coalesce(btrim(p_name), name), active = coalesce(p_active, active), updated_by = (select auth.uid())
   where key = p_key;

  perform public.write_audit_log(null, 'admin.set_addon_prices', 'addon', p_key,
    jsonb_build_object('monthly', v_old.price_monthly_minor, 'currency', v_old.currency, 'active', v_old.active),
    jsonb_build_object('monthly', p_monthly_minor, 'currency', p_currency, 'active', coalesce(p_active, v_old.active)));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Industry presets
-- ---------------------------------------------------------------------------
create or replace function public.upsert_industry_preset(
  p_key text, p_name text, p_terminology jsonb, p_starter_fields jsonb, p_template_key text,
  p_active boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_f jsonb;
  v_t record;
  v_o jsonb;
  v_n integer := 0;
  v_existed boolean;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if p_key is null or p_key !~ '^[a-z][a-z0-9_]{1,40}$'
     or p_name is null or char_length(btrim(p_name)) not between 1 and 80
     or p_template_key is null or p_template_key !~ '^[a-z0-9_]{1,40}$'
     or p_active is null
     or p_terminology is null or jsonb_typeof(p_terminology) <> 'object'
     or p_starter_fields is null or jsonb_typeof(p_starter_fields) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  -- terminology: {"client": "Patient", ...}, at most 50 short strings
  if (select count(*) from jsonb_object_keys(p_terminology)) > 50 then
    return jsonb_build_object('ok', false, 'code', 'invalid_terminology');
  end if;
  for v_t in select key, value from jsonb_each(p_terminology) loop
    if v_t.key !~ '^[a-z][a-z0-9_.]{0,40}$' or jsonb_typeof(v_t.value) <> 'string'
       or char_length(v_t.value #>> '{}') not between 1 and 80 then
      return jsonb_build_object('ok', false, 'code', 'invalid_terminology');
    end if;
  end loop;
  -- starter custom fields mirror the custom_fields columns they will seed
  if jsonb_array_length(p_starter_fields) > 30 then
    return jsonb_build_object('ok', false, 'code', 'invalid_fields');
  end if;
  for v_f in select value from jsonb_array_elements(p_starter_fields) loop
    if jsonb_typeof(v_f) <> 'object'
       or exists (select 1 from jsonb_object_keys(v_f) k
                  where k not in ('label', 'field_type', 'help_text', 'is_required', 'is_sensitive', 'options'))
       or jsonb_typeof(v_f -> 'label') is distinct from 'string'
       or char_length(v_f ->> 'label') not between 1 and 120
       or (v_f ->> 'field_type') is null
       or (v_f ->> 'field_type') not in ('short_text', 'long_text', 'dropdown', 'yes_no', 'number')
       or (v_f ? 'help_text' and (jsonb_typeof(v_f -> 'help_text') <> 'string' or char_length(v_f ->> 'help_text') > 300))
       or (v_f ? 'is_required' and jsonb_typeof(v_f -> 'is_required') <> 'boolean')
       or (v_f ? 'is_sensitive' and jsonb_typeof(v_f -> 'is_sensitive') <> 'boolean') then
      return jsonb_build_object('ok', false, 'code', 'invalid_fields');
    end if;
    if (v_f ->> 'field_type') = 'dropdown' then
      if jsonb_typeof(v_f -> 'options') is distinct from 'array' or jsonb_array_length(v_f -> 'options') < 2
         or jsonb_array_length(v_f -> 'options') > 30 then
        return jsonb_build_object('ok', false, 'code', 'invalid_fields');
      end if;
      for v_o in select value from jsonb_array_elements(v_f -> 'options') loop
        if jsonb_typeof(v_o) <> 'string' or char_length(v_o #>> '{}') not between 1 and 80 then
          return jsonb_build_object('ok', false, 'code', 'invalid_fields');
        end if;
      end loop;
    elsif v_f ? 'options' then
      return jsonb_build_object('ok', false, 'code', 'invalid_fields');
    end if;
    v_n := v_n + 1;
  end loop;

  select exists (select 1 from public.industry_presets where key = p_key) into v_existed;
  insert into public.industry_presets (key, name, terminology, starter_custom_fields, template_key, active, updated_by)
  values (p_key, btrim(p_name), p_terminology, p_starter_fields, p_template_key, p_active, (select auth.uid()))
  on conflict (key) do update
    set name = excluded.name, terminology = excluded.terminology,
        starter_custom_fields = excluded.starter_custom_fields, template_key = excluded.template_key,
        active = excluded.active, updated_by = excluded.updated_by;

  perform public.write_audit_log(null, 'admin.upsert_industry_preset', 'industry_preset', p_key, null,
    jsonb_build_object('created', not v_existed, 'fields', v_n, 'template_key', p_template_key, 'active', p_active));
  return jsonb_build_object('ok', true, 'created', not v_existed);
end $$;

-- ---------------------------------------------------------------------------
-- remove_review: the super-admin takedown. The customer's words stay stored
-- (status only); the review leaves every public surface and cannot be featured.
-- ---------------------------------------------------------------------------
create or replace function public.remove_review(p_review_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_r record;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 500 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;
  select r.id, r.business_id, r.status, r.featured_on_website into v_r
  from public.reviews r where r.id = p_review_id and r.deleted_at is null for update;
  if v_r.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_r.status = 'removed' then return jsonb_build_object('ok', false, 'code', 'already_removed'); end if;

  update public.reviews
     set status = 'removed', featured_on_website = false, featured_at = null
   where id = p_review_id;

  perform public.write_audit_log(v_r.business_id, 'admin.remove_review', 'review', p_review_id::text,
    jsonb_build_object('status', v_r.status, 'featured', v_r.featured_on_website),
    jsonb_build_object('status', 'removed', 'reason', btrim(p_reason)));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- support_view_business: READ-ONLY summary for support. No client names, phones,
-- emails or notes. Every call is audited.
-- ---------------------------------------------------------------------------
create or replace function public.support_view_business(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_b record;
  v_s record;
  v_out jsonb;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  select b.id, b.name, b.slug, b.industry, b.language, b.created_at into v_b
  from public.businesses b where b.id = p_business_id and b.deleted_at is null;
  if v_b.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  select s.plan, s.status, s.trial_ends_at into v_s from public.business_subscriptions s where s.business_id = p_business_id;

  v_out := jsonb_build_object(
    'ok', true,
    'business', to_jsonb(v_b),
    'plan', v_s.plan, 'status', v_s.status, 'trial_ends_at', v_s.trial_ends_at,
    'is_active', public.business_is_active(p_business_id),
    'branches', (select coalesce(jsonb_agg(jsonb_build_object('id', br.id, 'name', br.name, 'is_primary', br.is_primary,
                   'country_code', br.country_code, 'currency', br.currency, 'timezone', br.timezone)
                   order by br.is_primary desc, br.name), '[]'::jsonb)
                 from public.branches br where br.business_id = p_business_id and br.deleted_at is null),
    'members_by_status', (select coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb)
                 from (select m.status::text status, count(*) n from public.business_members m
                       where m.business_id = p_business_id and m.deleted_at is null group by m.status) x),
    'staff_active', (select count(*) from public.staff_profiles sp
                 where sp.business_id = p_business_id and sp.is_active and sp.deleted_at is null),
    'appointments_last_30d_by_status', (select coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb)
                 from (select a.status::text status, count(*) n from public.appointments a
                       where a.business_id = p_business_id and a.deleted_at is null
                         and a.starts_at >= now() - interval '30 days' group by a.status) x),
    'addons_enabled', (select coalesce(jsonb_agg(ba.addon_key order by ba.addon_key), '[]'::jsonb)
                 from public.business_addons ba where ba.business_id = p_business_id and ba.enabled),
    'recent_activity', (select coalesce(jsonb_agg(jsonb_build_object('action', l.action, 'at', l.created_at)
                 order by l.created_at desc), '[]'::jsonb)
                 from (select al.action, al.created_at from public.audit_logs al
                       where al.business_id = p_business_id order by al.created_at desc, al.id desc limit 10) l));

  perform public.write_audit_log(p_business_id, 'admin.support_view', 'business', p_business_id::text, null, null);
  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated may call (the flag + aal2 check inside is the boundary);
-- anon and PUBLIC may not.
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'list_businesses(text,text,text,integer,timestamptz,uuid)',
    'get_business_detail(uuid)',
    'assign_plan(uuid,text,timestamptz,text)',
    'set_business_status(uuid,text,text)',
    'set_addon(uuid,text,boolean)',
    'extend_trial(uuid,integer)',
    'admin_add_sms_credits(uuid,bigint,text)',
    'admin_set_sms_rate(text,text,integer,text)',
    'set_plan_prices(text,bigint,bigint,text,text,boolean)',
    'set_addon_prices(text,bigint,text,text,boolean)',
    'upsert_industry_preset(text,text,jsonb,jsonb,text,boolean)',
    'remove_review(uuid,text)',
    'support_view_business(uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
