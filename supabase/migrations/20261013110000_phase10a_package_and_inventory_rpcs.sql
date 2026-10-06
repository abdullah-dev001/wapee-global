-- Phase 10A (2/4): RPCs for package definitions, session deduction/reversal, products and stock.
--
-- Same posture as the invoice RPCs: SECURITY DEFINER, explicit permission + branch-scope check as the
-- real boundary, add-on gate (feature_gate_error), VALIDATE EVERYTHING, THEN WRITE ONCE; an expected
-- failure is `{ok:false, code}` and never a raise. The invoice integration (sale at issue, credit
-- note restore) is in migration 3.

-- Does the caller hold the permission at the BRANCH scope (Branch or All)? (Own does not count.)
create or replace function public.addon_access(p_business_id uuid, p_branch_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can(p_business_id, p_branch_id, p_permission)
     and public.has_permission_at_branch_scope(p_business_id, p_branch_id, p_permission);
$$;
revoke all on function public.addon_access(uuid, uuid, text) from public, anon, authenticated;

-- Sessions already used on a client package: deductions minus reversals.
create or replace function public.client_package_used(p_client_package_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select (count(*) filter (where kind = 'deduct') - count(*) filter (where kind = 'reversal'))::integer
  from public.session_usages where client_package_id = p_client_package_id;
$$;
revoke all on function public.client_package_used(uuid) from public, anon, authenticated;

-- Backstop for the RPC's own check: a deduction can never overspend or touch a cancelled package,
-- whatever path inserts it. Takes the package row lock, so two parallel deductions serialise here too.
create or replace function public.session_usage_backstop()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_cp record;
begin
  if new.kind <> 'deduct' then return new; end if;
  select c.id, c.business_id, c.sessions_purchased, c.sessions_bonus into v_cp
  from public.client_packages c where c.id = new.client_package_id for update;
  if v_cp.id is null or v_cp.business_id <> new.business_id then
    raise exception 'Session usage does not match its package' using errcode = '23514';
  end if;
  if exists (select 1 from public.client_package_cancellations x where x.client_package_id = v_cp.id) then
    raise exception 'package_cancelled' using errcode = 'P0001';
  end if;
  if v_cp.sessions_purchased + v_cp.sessions_bonus - public.client_package_used(v_cp.id) <= 0 then
    raise exception 'no_sessions_left' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.session_usage_backstop() from public, anon, authenticated;
create trigger session_usages_backstop before insert on public.session_usages
  for each row execute function public.session_usage_backstop();

-- ---------------------------------------------------------------------------
-- Package definitions
-- ---------------------------------------------------------------------------
create or replace function public.save_package(
  p_branch_id uuid, p_package_id uuid, p_name text, p_description text,
  p_sessions integer, p_bonus_sessions integer, p_price_minor bigint, p_expiry_days integer,
  p_service_ids uuid[], p_is_active boolean default true
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_pkg record;
  v_branch record;
  v_biz uuid;
  v_branch_id uuid := p_branch_id;
  v_name text := btrim(coalesce(p_name, ''));
  v_ids uuid[];
  v_gate jsonb;
  v_id uuid;
  v_before jsonb;
  v_cur_currency text;
begin
  if (select auth.uid()) is null then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  if p_package_id is not null then
    select p.id, p.business_id, p.branch_id, p.currency, p.deleted_at, p.name, p.sessions, p.bonus_sessions, p.price_minor, p.expiry_days, p.is_active
      into v_pkg from public.packages p where p.id = p_package_id for update;
    if v_pkg.id is null or v_pkg.deleted_at is not null then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    v_branch_id := v_pkg.branch_id; v_biz := v_pkg.business_id; v_cur_currency := v_pkg.currency;
  end if;
  select b.id, b.business_id, b.currency into v_branch from public.branches b where b.id = v_branch_id and b.deleted_at is null;
  if v_branch.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  v_biz := v_branch.business_id;
  if not public.addon_access(v_biz, v_branch_id, 'services.manage') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  v_gate := public.feature_gate_error(v_biz, 'packages');
  if v_gate is not null then return v_gate; end if;

  if char_length(v_name) not between 1 and 120 then return jsonb_build_object('ok', false, 'code', 'invalid_name'); end if;
  if p_description is not null and char_length(p_description) > 1000 then return jsonb_build_object('ok', false, 'code', 'invalid_description'); end if;
  if p_sessions is null or p_sessions not between 1 and 999 then return jsonb_build_object('ok', false, 'code', 'invalid_sessions'); end if;
  if coalesce(p_bonus_sessions, 0) not between 0 and 999 then return jsonb_build_object('ok', false, 'code', 'invalid_bonus'); end if;
  if p_price_minor is null or p_price_minor not between 0 and 100000000000 then return jsonb_build_object('ok', false, 'code', 'invalid_price'); end if;
  if p_expiry_days is not null and p_expiry_days not between 1 and 3650 then return jsonb_build_object('ok', false, 'code', 'invalid_expiry'); end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_service_ids, '{}')) x;
  if coalesce(array_length(v_ids, 1), 0) = 0 then return jsonb_build_object('ok', false, 'code', 'services_required'); end if;
  if (select count(*) from public.services s where s.id = any (v_ids) and s.business_id = v_biz and s.deleted_at is null)
     <> array_length(v_ids, 1) then
    return jsonb_build_object('ok', false, 'code', 'unknown_service');
  end if;
  if v_cur_currency is not null and v_cur_currency <> v_branch.currency then
    return jsonb_build_object('ok', false, 'code', 'currency_changed');
  end if;
  if exists (select 1 from public.packages p where p.branch_id = v_branch_id and p.deleted_at is null
             and lower(btrim(p.name)) = lower(v_name) and p.id is distinct from p_package_id) then
    return jsonb_build_object('ok', false, 'code', 'duplicate_name');
  end if;

  -- All validation done. Write.
  if p_package_id is null then
    insert into public.packages (business_id, branch_id, name, description, sessions, bonus_sessions, price_minor, currency, expiry_days, is_active, created_by)
    values (v_biz, v_branch_id, v_name, nullif(btrim(coalesce(p_description, '')), ''), p_sessions, coalesce(p_bonus_sessions, 0),
            p_price_minor, v_branch.currency, p_expiry_days, coalesce(p_is_active, true), auth.uid())
    returning id into v_id;
    perform public.write_audit_log(v_biz, 'package.created', 'package', v_id::text, null,
      jsonb_build_object('name', v_name, 'sessions', p_sessions, 'bonus_sessions', coalesce(p_bonus_sessions, 0), 'price_minor', p_price_minor, 'currency', v_branch.currency));
  else
    v_id := p_package_id;
    v_before := jsonb_build_object('name', v_pkg.name, 'sessions', v_pkg.sessions, 'bonus_sessions', v_pkg.bonus_sessions,
                                   'price_minor', v_pkg.price_minor, 'expiry_days', v_pkg.expiry_days, 'is_active', v_pkg.is_active);
    update public.packages set name = v_name, description = nullif(btrim(coalesce(p_description, '')), ''), sessions = p_sessions,
      bonus_sessions = coalesce(p_bonus_sessions, 0), price_minor = p_price_minor, expiry_days = p_expiry_days,
      is_active = coalesce(p_is_active, true)
    where id = v_id;
    delete from public.package_services where package_id = v_id;
    perform public.write_audit_log(v_biz, 'package.updated', 'package', v_id::text, v_before,
      jsonb_build_object('name', v_name, 'sessions', p_sessions, 'bonus_sessions', coalesce(p_bonus_sessions, 0),
                         'price_minor', p_price_minor, 'expiry_days', p_expiry_days, 'is_active', coalesce(p_is_active, true)));
  end if;
  insert into public.package_services (package_id, service_id, business_id)
  select v_id, x, v_biz from unnest(v_ids) x;
  return jsonb_build_object('ok', true, 'package_id', v_id);
end $$;

create or replace function public.delete_package(p_package_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_pkg record;
  v_gate jsonb;
begin
  select p.id, p.business_id, p.branch_id, p.name, p.deleted_at into v_pkg from public.packages p where p.id = p_package_id for update;
  if v_pkg.id is null or v_pkg.deleted_at is not null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.addon_access(v_pkg.business_id, v_pkg.branch_id, 'services.manage') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  v_gate := public.feature_gate_error(v_pkg.business_id, 'packages');
  if v_gate is not null then return v_gate; end if;
  update public.packages set deleted_at = now(), is_active = false where id = p_package_id;
  perform public.write_audit_log(v_pkg.business_id, 'package.deleted', 'package', p_package_id::text,
    jsonb_build_object('name', v_pkg.name), null);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Deduct / reverse a session. The `_at` variants take the clock so the expiry and the
-- 10-minute undo boundaries can be tested exactly; they are INTERNAL (no API grant).
-- ---------------------------------------------------------------------------
create or replace function public.deduct_session_at(p_appointment_id uuid, p_client_package_id uuid, p_now timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_a record;
  v_cp record;
  v_gate jsonb;
  v_remaining integer;
  v_usage uuid;
begin
  if (select auth.uid()) is null then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select a.id, a.business_id, a.branch_id, a.client_id, a.service_id, a.staff_id, a.status, a.deleted_at
    into v_a from public.appointments a where a.id = p_appointment_id;
  if v_a.id is null or v_a.deleted_at is not null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not (public.can(v_a.business_id, v_a.branch_id, 'packages.deduct_session')
          and (public.has_permission_at_branch_scope(v_a.business_id, v_a.branch_id, 'packages.deduct_session')
               or (v_a.staff_id is not null and public.is_own_staff_profile(v_a.staff_id)))) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  v_gate := public.feature_gate_error(v_a.business_id, 'packages');
  if v_gate is not null then return v_gate; end if;
  if v_a.status not in ('confirmed', 'completed') then
    return jsonb_build_object('ok', false, 'code', 'appointment_not_eligible');
  end if;

  select c.id, c.business_id, c.client_id, c.sessions_purchased, c.sessions_bonus, c.expires_at into v_cp
  from public.client_packages c where c.id = p_client_package_id for update;
  if v_cp.id is null or v_cp.business_id <> v_a.business_id then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_cp.client_id is distinct from v_a.client_id then return jsonb_build_object('ok', false, 'code', 'client_mismatch'); end if;
  if exists (select 1 from public.client_package_cancellations x where x.client_package_id = v_cp.id) then
    return jsonb_build_object('ok', false, 'code', 'package_cancelled');
  end if;
  if v_cp.expires_at is not null and p_now >= v_cp.expires_at then
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;
  if not exists (select 1 from public.client_package_services s where s.client_package_id = v_cp.id and s.service_id = v_a.service_id) then
    return jsonb_build_object('ok', false, 'code', 'service_not_covered');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('session_usage:' || p_appointment_id::text, 0));
  if exists (select 1 from public.session_usages u
             where u.appointment_id = p_appointment_id and u.kind = 'deduct'
               and not exists (select 1 from public.session_usages r where r.reverses_usage_id = u.id)) then
    return jsonb_build_object('ok', false, 'code', 'already_deducted');
  end if;
  v_remaining := v_cp.sessions_purchased + v_cp.sessions_bonus - public.client_package_used(v_cp.id);
  if v_remaining <= 0 then return jsonb_build_object('ok', false, 'code', 'no_sessions_left'); end if;

  -- All validation done. Write once.
  insert into public.session_usages (business_id, branch_id, client_package_id, kind, appointment_id, service_id, created_at, created_by)
  values (v_a.business_id, v_a.branch_id, v_cp.id, 'deduct', p_appointment_id, v_a.service_id, p_now, auth.uid())
  returning id into v_usage;
  perform public.write_audit_log(v_a.business_id, 'package.session_deducted', 'client_package', v_cp.id::text, null,
    jsonb_build_object('usage_id', v_usage, 'appointment_id', p_appointment_id, 'remaining', v_remaining - 1));
  return jsonb_build_object('ok', true, 'usage_id', v_usage, 'remaining', v_remaining - 1);
end $$;
revoke all on function public.deduct_session_at(uuid, uuid, timestamptz) from public, anon, authenticated;

create or replace function public.deduct_session(p_appointment_id uuid, p_client_package_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select public.deduct_session_at(p_appointment_id, p_client_package_id, now())
$$;

create or replace function public.reverse_session_at(p_usage_id uuid, p_reason text, p_now timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_u record;
  v_gate jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_creator boolean;
  v_can_reverse boolean;
  v_within boolean;
  v_rev uuid;
begin
  if (select auth.uid()) is null then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select u.id, u.business_id, u.branch_id, u.client_package_id, u.kind, u.appointment_id, u.service_id, u.created_at, u.created_by
    into v_u from public.session_usages u where u.id = p_usage_id;
  if v_u.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  -- serialise with deductions on the same package
  perform 1 from public.client_packages c where c.id = v_u.client_package_id for update;

  v_creator := v_u.created_by is not distinct from auth.uid();
  v_can_reverse := public.addon_access(v_u.business_id, v_u.branch_id, 'packages.reverse_session');
  v_within := p_now >= v_u.created_at and p_now - v_u.created_at <= interval '10 minutes';
  if not (v_can_reverse or (v_creator and public.can(v_u.business_id, v_u.branch_id, 'packages.deduct_session'))) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  v_gate := public.feature_gate_error(v_u.business_id, 'packages');
  if v_gate is not null then return v_gate; end if;
  if v_u.kind <> 'deduct' then return jsonb_build_object('ok', false, 'code', 'not_a_usage'); end if;
  if exists (select 1 from public.session_usages r where r.reverses_usage_id = v_u.id) then
    return jsonb_build_object('ok', false, 'code', 'already_reversed');
  end if;
  -- The creator may undo within 10 minutes; a reverse_session holder may reverse at any time (reason required).
  if not (v_creator and v_within) then
    if not v_can_reverse then return jsonb_build_object('ok', false, 'code', 'undo_window_passed'); end if;
    if v_reason is null or char_length(v_reason) < 3 then return jsonb_build_object('ok', false, 'code', 'reason_required'); end if;
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then return jsonb_build_object('ok', false, 'code', 'reason_required'); end if;

  -- All validation done. Write once (a NEW row; the deduction stays).
  insert into public.session_usages (business_id, branch_id, client_package_id, kind, appointment_id, service_id, reverses_usage_id, reason, created_at, created_by)
  values (v_u.business_id, v_u.branch_id, v_u.client_package_id, 'reversal', v_u.appointment_id, v_u.service_id, v_u.id, v_reason, p_now, auth.uid())
  returning id into v_rev;
  perform public.write_audit_log(v_u.business_id, 'package.session_reversed', 'client_package', v_u.client_package_id::text, null,
    jsonb_build_object('reversal_id', v_rev, 'reverses_usage_id', v_u.id, 'by_creator_undo', (v_creator and v_within), 'reason', v_reason));
  return jsonb_build_object('ok', true, 'reversal_id', v_rev);
end $$;
revoke all on function public.reverse_session_at(uuid, text, timestamptz) from public, anon, authenticated;

create or replace function public.reverse_session(p_usage_id uuid, p_reason text default null)
returns jsonb language sql security definer set search_path = '' as $$
  select public.reverse_session_at(p_usage_id, p_reason, now())
$$;

-- A client's packages with the computed balance. SECURITY INVOKER: RLS decides what the caller sees
-- (add-on on + a packages permission). `p_service_id` keeps only packages usable for that service;
-- `p_usable_only` hides cancelled / expired / used-up ones.
create or replace function public.list_client_packages(
  p_client_id uuid, p_service_id uuid default null, p_usable_only boolean default false
) returns table (
  id uuid, branch_id uuid, name text, sessions_purchased integer, sessions_bonus integer, used integer,
  remaining integer, sold_at timestamptz, expires_at timestamptz, is_cancelled boolean, is_expired boolean,
  price_minor bigint, currency text, invoice_id uuid, service_ids uuid[]
) language sql stable security invoker set search_path = '' as $$
  select * from (
    select c.id, c.branch_id, c.name, c.sessions_purchased, c.sessions_bonus,
           public.client_package_used(c.id) as used,
           c.sessions_purchased + c.sessions_bonus - public.client_package_used(c.id) as remaining,
           c.sold_at, c.expires_at,
           exists (select 1 from public.client_package_cancellations x where x.client_package_id = c.id) as is_cancelled,
           (c.expires_at is not null and c.expires_at <= now()) as is_expired,
           c.price_minor, c.currency, c.invoice_id,
           coalesce((select array_agg(s.service_id) from public.client_package_services s where s.client_package_id = c.id), '{}') as service_ids
    from public.client_packages c
    where c.client_id = p_client_id
  ) t
  where (p_service_id is null or p_service_id = any (t.service_ids))
    and (not p_usable_only or (not t.is_cancelled and not t.is_expired and t.remaining > 0))
  order by t.sold_at desc
$$;
revoke all on function public.list_client_packages(uuid, uuid, boolean) from public, anon;
grant execute on function public.list_client_packages(uuid, uuid, boolean) to authenticated;
grant execute on function public.client_package_used(uuid) to authenticated;

revoke all on function public.save_package(uuid, uuid, text, text, integer, integer, bigint, integer, uuid[], boolean) from public, anon;
revoke all on function public.delete_package(uuid) from public, anon;
revoke all on function public.deduct_session(uuid, uuid) from public, anon;
revoke all on function public.reverse_session(uuid, text) from public, anon;
grant execute on function public.save_package(uuid, uuid, text, text, integer, integer, bigint, integer, uuid[], boolean) to authenticated;
grant execute on function public.delete_package(uuid) to authenticated;
grant execute on function public.deduct_session(uuid, uuid) to authenticated;
grant execute on function public.reverse_session(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
create or replace function public.save_product(
  p_branch_id uuid, p_product_id uuid, p_name text, p_sku text, p_unit text, p_price_minor bigint,
  p_low_stock_threshold integer, p_is_active boolean default true, p_opening_stock integer default 0
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_p record;
  v_branch record;
  v_branch_id uuid := p_branch_id;
  v_name text := btrim(coalesce(p_name, ''));
  v_sku text := nullif(btrim(coalesce(p_sku, '')), '');
  v_unit text := btrim(coalesce(nullif(p_unit, ''), 'piece'));
  v_gate jsonb;
  v_id uuid;
begin
  if (select auth.uid()) is null then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  if p_product_id is not null then
    select p.id, p.business_id, p.branch_id, p.deleted_at, p.name, p.sku, p.unit, p.price_minor, p.low_stock_threshold, p.is_active
      into v_p from public.products p where p.id = p_product_id for update;
    if v_p.id is null or v_p.deleted_at is not null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
    v_branch_id := v_p.branch_id;
  end if;
  select b.id, b.business_id, b.currency into v_branch from public.branches b where b.id = v_branch_id and b.deleted_at is null;
  if v_branch.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.addon_access(v_branch.business_id, v_branch_id, 'inventory.adjust') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  v_gate := public.feature_gate_error(v_branch.business_id, 'inventory');
  if v_gate is not null then return v_gate; end if;

  if char_length(v_name) not between 1 and 120 then return jsonb_build_object('ok', false, 'code', 'invalid_name'); end if;
  if v_sku is not null and char_length(v_sku) > 60 then return jsonb_build_object('ok', false, 'code', 'invalid_sku'); end if;
  if char_length(v_unit) not between 1 and 20 then return jsonb_build_object('ok', false, 'code', 'invalid_unit'); end if;
  if p_price_minor is null or p_price_minor not between 0 and 100000000000 then return jsonb_build_object('ok', false, 'code', 'invalid_price'); end if;
  if p_low_stock_threshold is not null and p_low_stock_threshold not between 0 and 1000000 then return jsonb_build_object('ok', false, 'code', 'invalid_threshold'); end if;
  if p_product_id is null and coalesce(p_opening_stock, 0) not between 0 and 1000000 then return jsonb_build_object('ok', false, 'code', 'invalid_quantity'); end if;
  if v_sku is not null and exists (select 1 from public.products p where p.branch_id = v_branch_id and p.deleted_at is null
                                   and lower(btrim(p.sku)) = lower(v_sku) and p.id is distinct from p_product_id) then
    return jsonb_build_object('ok', false, 'code', 'duplicate_sku');
  end if;

  -- All validation done. Write.
  if p_product_id is null then
    insert into public.products (business_id, branch_id, name, sku, unit, price_minor, currency, low_stock_threshold, is_active, created_by)
    values (v_branch.business_id, v_branch_id, v_name, v_sku, v_unit, p_price_minor, v_branch.currency, p_low_stock_threshold, coalesce(p_is_active, true), auth.uid())
    returning id into v_id;
    if coalesce(p_opening_stock, 0) > 0 then
      insert into public.stock_movements (business_id, branch_id, product_id, kind, quantity, stock_after, reason, created_by)
      values (v_branch.business_id, v_branch_id, v_id, 'adjustment', p_opening_stock, 0, 'Opening stock', auth.uid());
    end if;
    perform public.write_audit_log(v_branch.business_id, 'product.created', 'product', v_id::text, null,
      jsonb_build_object('name', v_name, 'sku', v_sku, 'price_minor', p_price_minor, 'currency', v_branch.currency, 'opening_stock', coalesce(p_opening_stock, 0)));
  else
    v_id := p_product_id;
    update public.products set name = v_name, sku = v_sku, unit = v_unit, price_minor = p_price_minor,
      low_stock_threshold = p_low_stock_threshold, is_active = coalesce(p_is_active, true)
    where id = v_id;
    perform public.write_audit_log(v_branch.business_id, 'product.updated', 'product', v_id::text,
      jsonb_build_object('name', v_p.name, 'sku', v_p.sku, 'unit', v_p.unit, 'price_minor', v_p.price_minor,
                         'low_stock_threshold', v_p.low_stock_threshold, 'is_active', v_p.is_active),
      jsonb_build_object('name', v_name, 'sku', v_sku, 'unit', v_unit, 'price_minor', p_price_minor,
                         'low_stock_threshold', p_low_stock_threshold, 'is_active', coalesce(p_is_active, true)));
  end if;
  return jsonb_build_object('ok', true, 'product_id', v_id);
end $$;

create or replace function public.delete_product(p_product_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_p record;
  v_gate jsonb;
begin
  select p.id, p.business_id, p.branch_id, p.name, p.stock_qty, p.deleted_at into v_p from public.products p where p.id = p_product_id for update;
  if v_p.id is null or v_p.deleted_at is not null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.addon_access(v_p.business_id, v_p.branch_id, 'inventory.adjust') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  v_gate := public.feature_gate_error(v_p.business_id, 'inventory');
  if v_gate is not null then return v_gate; end if;
  update public.products set deleted_at = now(), is_active = false where id = p_product_id;
  perform public.write_audit_log(v_p.business_id, 'product.deleted', 'product', p_product_id::text,
    jsonb_build_object('name', v_p.name, 'stock_qty', v_p.stock_qty), null);
  return jsonb_build_object('ok', true);
end $$;

-- A manual movement: purchase (stock in), adjustment (signed count correction, reason required) or
-- return (stock back, reason required). Sales and invoice returns are written only by the invoice RPCs.
create or replace function public.adjust_stock(p_product_id uuid, p_kind text, p_quantity integer, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_p record;
  v_gate jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_allow boolean;
  v_id uuid;
  v_after integer;
begin
  if (select auth.uid()) is null then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select p.id, p.business_id, p.branch_id, p.stock_qty, p.deleted_at, p.is_active into v_p
  from public.products p where p.id = p_product_id for update;
  if v_p.id is null or v_p.deleted_at is not null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.addon_access(v_p.business_id, v_p.branch_id, 'inventory.adjust') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  v_gate := public.feature_gate_error(v_p.business_id, 'inventory');
  if v_gate is not null then return v_gate; end if;
  if p_kind not in ('purchase', 'adjustment', 'return') then return jsonb_build_object('ok', false, 'code', 'invalid_kind'); end if;
  if p_quantity is null or p_quantity = 0 or p_quantity not between -1000000 and 1000000
     or (p_kind in ('purchase', 'return') and p_quantity < 0) then
    return jsonb_build_object('ok', false, 'code', 'invalid_quantity');
  end if;
  if p_kind in ('adjustment', 'return') and (v_reason is null or char_length(v_reason) < 3) then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then return jsonb_build_object('ok', false, 'code', 'reason_required'); end if;
  select coalesce((select s.allow_negative_stock from public.inventory_settings s where s.branch_id = v_p.branch_id), false) into v_allow;
  if p_quantity < 0 and v_p.stock_qty + p_quantity < 0 and not v_allow then
    return jsonb_build_object('ok', false, 'code', 'insufficient_stock', 'stock', v_p.stock_qty);
  end if;

  -- All validation done. Write once (the trigger applies it to the product).
  insert into public.stock_movements (business_id, branch_id, product_id, kind, quantity, stock_after, reason, created_by)
  values (v_p.business_id, v_p.branch_id, p_product_id, p_kind::public.stock_movement_kind, p_quantity, 0, v_reason, auth.uid())
  returning id, stock_after into v_id, v_after;
  perform public.write_audit_log(v_p.business_id, 'inventory.stock_moved', 'product', p_product_id::text,
    jsonb_build_object('stock', v_p.stock_qty),
    jsonb_build_object('movement_id', v_id, 'kind', p_kind, 'quantity', p_quantity, 'stock', v_after, 'reason', v_reason));
  return jsonb_build_object('ok', true, 'movement_id', v_id, 'stock', v_after);
end $$;

create or replace function public.set_inventory_settings(p_branch_id uuid, p_allow_negative_stock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_b record;
  v_gate jsonb;
  v_old boolean;
begin
  select b.id, b.business_id into v_b from public.branches b where b.id = p_branch_id and b.deleted_at is null;
  if v_b.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if p_allow_negative_stock is null or not public.addon_access(v_b.business_id, p_branch_id, 'inventory.adjust') then
    return jsonb_build_object('ok', false, 'code', case when p_allow_negative_stock is null then 'invalid_value' else 'forbidden' end);
  end if;
  v_gate := public.feature_gate_error(v_b.business_id, 'inventory');
  if v_gate is not null then return v_gate; end if;
  select s.allow_negative_stock into v_old from public.inventory_settings s where s.branch_id = p_branch_id;
  insert into public.inventory_settings (branch_id, business_id, allow_negative_stock, updated_by)
  values (p_branch_id, v_b.business_id, p_allow_negative_stock, auth.uid())
  on conflict (branch_id) do update set allow_negative_stock = excluded.allow_negative_stock, updated_at = now(), updated_by = auth.uid();
  perform public.write_audit_log(v_b.business_id, 'inventory.settings_changed', 'branch', p_branch_id::text,
    jsonb_build_object('allow_negative_stock', coalesce(v_old, false)), jsonb_build_object('allow_negative_stock', p_allow_negative_stock));
  return jsonb_build_object('ok', true);
end $$;

-- Low-stock count for the dashboard badge. INVOKER: RLS gives add-on off / no permission => 0.
create or replace function public.low_stock_count(p_business_id uuid, p_branch_id uuid default null)
returns integer language sql stable security invoker set search_path = '' as $$
  select count(*)::integer from public.products p
  where p.business_id = p_business_id and (p_branch_id is null or p.branch_id = p_branch_id)
    and p.deleted_at is null and p.is_active
    and p.low_stock_threshold is not null and p.stock_qty <= p.low_stock_threshold
$$;

revoke all on function public.save_product(uuid, uuid, text, text, text, bigint, integer, boolean, integer) from public, anon;
revoke all on function public.delete_product(uuid) from public, anon;
revoke all on function public.adjust_stock(uuid, text, integer, text) from public, anon;
revoke all on function public.set_inventory_settings(uuid, boolean) from public, anon;
revoke all on function public.low_stock_count(uuid, uuid) from public, anon;
grant execute on function public.save_product(uuid, uuid, text, text, text, bigint, integer, boolean, integer) to authenticated;
grant execute on function public.delete_product(uuid) to authenticated;
grant execute on function public.adjust_stock(uuid, text, integer, text) to authenticated;
grant execute on function public.set_inventory_settings(uuid, boolean) to authenticated;
grant execute on function public.low_stock_count(uuid, uuid) to authenticated;
