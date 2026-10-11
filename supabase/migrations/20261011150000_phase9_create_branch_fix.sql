-- Phase 9A fix: create_branch read fields of an unassigned record variable
-- when no copy source was given ("record v_src is not assigned yet", 55000).
-- Scalar variables instead. (20261011110000 is applied and is not edited.)

create or replace function public.create_branch(
  p_business_id uuid,
  p_name text,
  p_country_code text,
  p_currency text,
  p_timezone text,
  p_address text default null,
  p_phone text default null,
  p_tax_number text default null,
  p_tax_rate_bp integer default 0,
  p_invoice_prefix text default null,
  p_copy_from_branch uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_gate jsonb;
  v_name text := btrim(coalesce(p_name, ''));
  v_prefix text;
  v_src_id uuid;
  v_src_currency text;
  v_id uuid;
  v_hours integer := 0;
  v_services integer := 0;
  v_skipped integer := 0;
begin
  v_gate := public.branch_admin_gate(p_business_id);
  if v_gate is not null then return v_gate; end if;

  if char_length(v_name) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'code', 'invalid_name');
  end if;
  if p_country_code is null or p_country_code !~ '^[A-Z]{2}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_country');
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_currency');
  end if;
  if p_timezone is null or not exists (select 1 from pg_timezone_names z where z.name = p_timezone) then
    return jsonb_build_object('ok', false, 'code', 'invalid_timezone');
  end if;
  if p_tax_rate_bp is null or p_tax_rate_bp not between 0 and 10000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_tax_rate');
  end if;
  if exists (select 1 from public.branches b where b.business_id = p_business_id
             and b.deleted_at is null and lower(b.name) = lower(v_name)) then
    return jsonb_build_object('ok', false, 'code', 'name_taken');
  end if;
  v_prefix := upper(coalesce(nullif(btrim(p_invoice_prefix), ''), public.suggest_invoice_prefix(p_business_id, v_name)));
  if v_prefix !~ '^[A-Z0-9][A-Z0-9-]{0,9}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_prefix');
  end if;
  if exists (select 1 from public.branches b where b.business_id = p_business_id and b.invoice_prefix = v_prefix
             and (b.deleted_at is null or b.invoice_next_no > 1 or b.credit_note_next_no > 1)) then
    return jsonb_build_object('ok', false, 'code', 'prefix_taken');
  end if;
  if p_copy_from_branch is not null then
    select b.id, b.currency into v_src_id, v_src_currency from public.branches b
    where b.id = p_copy_from_branch and b.business_id = p_business_id and b.deleted_at is null;
    if v_src_id is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_branch');
    end if;
  end if;

  -- All validation done. Write. (The limit trigger can still refuse: caught.)
  begin
    insert into public.branches (business_id, name, is_primary, country_code, currency, timezone, address, phone,
                                 tax_number, tax_rate_bp, invoice_prefix)
    values (p_business_id, v_name, false, p_country_code, p_currency, p_timezone, nullif(btrim(p_address), ''),
            nullif(btrim(p_phone), ''), nullif(btrim(p_tax_number), ''), p_tax_rate_bp, v_prefix)
    returning id into v_id;
  exception
    when sqlstate 'P0001' then
      return jsonb_build_object('ok', false, 'code', 'branch_limit_reached');
    when unique_violation then
      return jsonb_build_object('ok', false, 'code', 'prefix_taken');
  end;

  if v_src_id is not null then
    insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute)
    select v_id, p_business_id, h.day_of_week, h.start_minute, h.end_minute
    from public.branch_hours h where h.branch_id = v_src_id;
    get diagnostics v_hours = row_count;
    -- prices are in the SOURCE branch's currency: copied only when it matches
    if v_src_currency = p_currency then
      insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
      select sb.service_id, v_id, p_business_id, sb.price_minor, sb.enabled
      from public.service_branches sb where sb.branch_id = v_src_id;
      get diagnostics v_services = row_count;
    else
      select count(*) into v_skipped from public.service_branches sb where sb.branch_id = v_src_id;
    end if;
  end if;

  perform public.write_audit_log(p_business_id, 'branch.created', 'branch', v_id::text, null,
    jsonb_build_object('name', v_name, 'country_code', p_country_code, 'currency', p_currency,
                       'timezone', p_timezone, 'invoice_prefix', v_prefix, 'copied_from', p_copy_from_branch));
  return jsonb_build_object('ok', true, 'branch_id', v_id, 'invoice_prefix', v_prefix,
                            'hours_copied', v_hours, 'services_copied', v_services,
                            'services_skipped_currency', v_skipped);
end $$;

revoke all on function public.create_branch(uuid, text, text, text, text, text, text, text, integer, text, uuid) from public, anon;
grant execute on function public.create_branch(uuid, text, text, text, text, text, text, text, integer, text, uuid) to authenticated;
