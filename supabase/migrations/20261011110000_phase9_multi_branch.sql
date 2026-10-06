-- Phase 9A (3/4): multi-branch backend (feature `multi_branch`).
--
-- A branch owns its country, currency, timezone, address, tax, invoice prefix,
-- hours, staff and service prices (service_branches). Phase 1-8 already store
-- all of that per branch; this adds the lifecycle RPCs, closes the holes the
-- single-branch assumption left, and adds the combined (owner) views.
--
-- Decisions made here (small technical, listed in the report):
--   * creating / archiving / restoring a branch is a BUSINESS-level action: the
--     caller must hold settings.business for every branch (not just one)
--   * a branch with issued numbers keeps its invoice prefix for ever: an
--     archived branch's prefix can never be reused (invoice numbers are unique
--     per business, so reuse would make `issue_invoice` fail)
--   * timezone cannot change while the branch has upcoming appointments, and the
--     currency cannot change once it has appointments, service prices or
--     invoices (re-denominating prices silently would be a money bug)
--   * archive is soft; refused for the primary branch, the last live branch,
--     upcoming appointments, open invoice drafts, or the branch the website uses
--   * combined views group by currency and never add different currencies

-- ---------------------------------------------------------------------------
-- Holes in the existing branch policies (see context/plans-super-admin.md /
-- multi-branch.md "single-branch assumptions"):
--   UPDATE used can(business, NULL, ...) so a holder of settings.business at ONE
--   branch could edit EVERY branch; INSERT likewise. Now: update needs the
--   permission for THAT branch, insert needs it for every branch.
-- ---------------------------------------------------------------------------
drop policy if exists branches_update_settings on public.branches;
create policy branches_update_settings on public.branches for update to authenticated
  using (public.can(business_id, id, 'settings.business'))
  with check (public.can(business_id, id, 'settings.business'));

drop policy if exists branches_insert_settings on public.branches;
create policy branches_insert_settings on public.branches for insert to authenticated
  with check (public.can(business_id, null, 'settings.business')
              and public.can_grant_at(business_id, null, 'settings.business', 'branch'));

create unique index branches_name_unique on public.branches (business_id, lower(name)) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- A retired prefix can never be reused (see header). Also fires for direct writes.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_branch_prefix_retired()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT'
     or new.invoice_prefix is distinct from old.invoice_prefix
     or (old.deleted_at is not null and new.deleted_at is null) then
    if exists (select 1 from public.branches x
               where x.business_id = new.business_id and x.id <> new.id
                 and x.invoice_prefix = new.invoice_prefix and x.deleted_at is not null
                 and (x.invoice_next_no > 1 or x.credit_note_next_no > 1)) then
      raise exception 'prefix_retired: that invoice prefix was used by an archived branch' using errcode = '23505';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.enforce_branch_prefix_retired() from public, anon, authenticated;
create trigger branches_prefix_retired before insert or update of invoice_prefix, deleted_at on public.branches
  for each row execute function public.enforce_branch_prefix_retired();

-- ---------------------------------------------------------------------------
-- Archive rules in ONE place: null = may archive, else {code, ...}.
-- ---------------------------------------------------------------------------
create or replace function public.branch_archive_blockers(p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_b record;
  v_n integer;
begin
  select b.id, b.business_id, b.is_primary into v_b from public.branches b where b.id = p_branch_id;
  if v_b.is_primary then
    return jsonb_build_object('code', 'primary_branch');
  end if;
  select count(*) into v_n from public.branches b where b.business_id = v_b.business_id and b.deleted_at is null;
  if v_n <= 1 then
    return jsonb_build_object('code', 'last_branch');
  end if;
  select count(*) into v_n from public.appointments a
  where a.branch_id = p_branch_id and a.deleted_at is null and a.status in ('pending', 'confirmed') and a.ends_at > now();
  if v_n > 0 then
    return jsonb_build_object('code', 'future_appointments', 'count', v_n);
  end if;
  select count(*) into v_n from public.invoices i
  where i.branch_id = p_branch_id and i.status = 'draft' and i.deleted_at is null;
  if v_n > 0 then
    return jsonb_build_object('code', 'open_drafts', 'count', v_n);
  end if;
  if exists (select 1 from public.websites w where w.branch_id = p_branch_id and w.deleted_at is null) then
    return jsonb_build_object('code', 'website_uses_branch');
  end if;
  return null;
end $$;
revoke all on function public.branch_archive_blockers(uuid) from public, anon, authenticated;

-- Direct `update branches set deleted_at` (policy allows it) obeys the same rules.
create or replace function public.enforce_branch_archive_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_block jsonb;
begin
  if old.deleted_at is null and new.deleted_at is not null and (select auth.uid()) is not null then
    v_block := public.branch_archive_blockers(old.id);
    if v_block is not null then
      raise exception 'cannot_archive_branch: %', v_block ->> 'code' using errcode = 'P0001', detail = v_block::text;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.enforce_branch_archive_rules() from public, anon, authenticated;
create trigger branches_archive_rules before update of deleted_at on public.branches
  for each row execute function public.enforce_branch_archive_rules();

-- ---------------------------------------------------------------------------
-- Shared gate: signed in, business-level settings permission, feature on.
-- ---------------------------------------------------------------------------
create or replace function public.branch_admin_gate(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null
     or not public.can(p_business_id, null, 'settings.business')
     or not public.can_grant_at(p_business_id, null, 'settings.business', 'branch') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  return public.feature_gate_error(p_business_id, 'multi_branch');
end $$;
revoke all on function public.branch_admin_gate(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_branch (+ optional copy of hours and same-currency service prices)
-- ---------------------------------------------------------------------------
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
  v_src record;
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
    select b.id, b.currency into v_src from public.branches b
    where b.id = p_copy_from_branch and b.business_id = p_business_id and b.deleted_at is null;
    if v_src.id is null then
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

  if v_src.id is not null then
    insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute)
    select v_id, p_business_id, h.day_of_week, h.start_minute, h.end_minute
    from public.branch_hours h where h.branch_id = v_src.id;
    get diagnostics v_hours = row_count;
    -- prices are in the SOURCE branch's currency: copied only when it matches
    if v_src.currency = p_currency then
      insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
      select sb.service_id, v_id, p_business_id, sb.price_minor, sb.enabled
      from public.service_branches sb where sb.branch_id = v_src.id;
      get diagnostics v_services = row_count;
    else
      select count(*) into v_skipped from public.service_branches sb where sb.branch_id = v_src.id;
    end if;
  end if;

  perform public.write_audit_log(p_business_id, 'branch.created', 'branch', v_id::text, null,
    jsonb_build_object('name', v_name, 'country_code', p_country_code, 'currency', p_currency,
                       'timezone', p_timezone, 'invoice_prefix', v_prefix, 'copied_from', p_copy_from_branch));
  return jsonb_build_object('ok', true, 'branch_id', v_id, 'invoice_prefix', v_prefix,
                            'hours_copied', v_hours, 'services_copied', v_services,
                            'services_skipped_currency', v_skipped);
end $$;

-- ---------------------------------------------------------------------------
-- update_branch: only the keys present in p_patch change; ONE update.
-- ---------------------------------------------------------------------------
create or replace function public.update_branch(p_branch_id uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_b record;
  v_k text;
  v_new jsonb := '{}';
  v_val text;
  v_old jsonb;
  v_invoiced boolean;
begin
  select b.* into v_b from public.branches b where b.id = p_branch_id;
  if v_b.id is null or v_b.deleted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if (select auth.uid()) is null
     or not public.invoice_access(v_b.business_id, p_branch_id, 'settings.business') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'code', 'nothing_to_change');
  end if;

  for v_k in select jsonb_object_keys(p_patch) loop
    if v_k not in ('name', 'address', 'phone', 'tax_number', 'tax_rate_bp', 'country_code', 'currency',
                   'timezone', 'invoice_prefix', 'google_review_url') then
      return jsonb_build_object('ok', false, 'code', 'unknown_field', 'field', v_k);
    end if;
  end loop;

  if p_patch ? 'name' then
    v_val := btrim(coalesce(p_patch ->> 'name', ''));
    if char_length(v_val) not between 1 and 120 then return jsonb_build_object('ok', false, 'code', 'invalid_name'); end if;
    if exists (select 1 from public.branches b where b.business_id = v_b.business_id and b.id <> p_branch_id
               and b.deleted_at is null and lower(b.name) = lower(v_val)) then
      return jsonb_build_object('ok', false, 'code', 'name_taken');
    end if;
    v_new := v_new || jsonb_build_object('name', v_val);
  end if;
  if p_patch ? 'country_code' then
    v_val := p_patch ->> 'country_code';
    if v_val is null or v_val !~ '^[A-Z]{2}$' then return jsonb_build_object('ok', false, 'code', 'invalid_country'); end if;
    v_new := v_new || jsonb_build_object('country_code', v_val);
  end if;
  if p_patch ? 'tax_rate_bp' then
    if jsonb_typeof(p_patch -> 'tax_rate_bp') <> 'number' or (p_patch ->> 'tax_rate_bp') !~ '^[0-9]{1,5}$'
       or (p_patch ->> 'tax_rate_bp')::integer > 10000 then
      return jsonb_build_object('ok', false, 'code', 'invalid_tax_rate');
    end if;
    v_new := v_new || jsonb_build_object('tax_rate_bp', (p_patch ->> 'tax_rate_bp')::integer);
  end if;
  if p_patch ? 'timezone' then
    v_val := p_patch ->> 'timezone';
    if v_val is null or not exists (select 1 from pg_timezone_names z where z.name = v_val) then
      return jsonb_build_object('ok', false, 'code', 'invalid_timezone');
    end if;
    if v_val <> v_b.timezone and exists (
         select 1 from public.appointments a where a.branch_id = p_branch_id and a.deleted_at is null
         and a.status in ('pending', 'confirmed') and a.ends_at > now()) then
      return jsonb_build_object('ok', false, 'code', 'timezone_in_use');
    end if;
    v_new := v_new || jsonb_build_object('timezone', v_val);
  end if;
  if p_patch ? 'currency' then
    v_val := p_patch ->> 'currency';
    if v_val is null or v_val !~ '^[A-Z]{3}$' then return jsonb_build_object('ok', false, 'code', 'invalid_currency'); end if;
    if v_val <> v_b.currency then
      select exists (select 1 from public.invoices i where i.branch_id = p_branch_id and i.deleted_at is null) into v_invoiced;
      if v_invoiced then return jsonb_build_object('ok', false, 'code', 'currency_locked'); end if;
      if exists (select 1 from public.appointments a where a.branch_id = p_branch_id and a.deleted_at is null)
         or exists (select 1 from public.service_branches sb where sb.branch_id = p_branch_id) then
        return jsonb_build_object('ok', false, 'code', 'currency_in_use');
      end if;
    end if;
    v_new := v_new || jsonb_build_object('currency', v_val);
  end if;
  if p_patch ? 'invoice_prefix' then
    v_val := upper(btrim(coalesce(p_patch ->> 'invoice_prefix', '')));
    if v_val !~ '^[A-Z0-9][A-Z0-9-]{0,9}$' then return jsonb_build_object('ok', false, 'code', 'invalid_prefix'); end if;
    if v_val <> v_b.invoice_prefix then
      if v_b.invoice_next_no > 1 then return jsonb_build_object('ok', false, 'code', 'prefix_locked'); end if;
      if exists (select 1 from public.branches x where x.business_id = v_b.business_id and x.id <> p_branch_id
                 and x.invoice_prefix = v_val and (x.deleted_at is null or x.invoice_next_no > 1 or x.credit_note_next_no > 1)) then
        return jsonb_build_object('ok', false, 'code', 'prefix_taken');
      end if;
    end if;
    v_new := v_new || jsonb_build_object('invoice_prefix', v_val);
  end if;
  foreach v_k in array array['address', 'phone', 'tax_number', 'google_review_url'] loop
    if p_patch ? v_k then
      v_val := nullif(btrim(coalesce(p_patch ->> v_k, '')), '');
      v_new := v_new || jsonb_build_object(v_k, v_val);
    end if;
  end loop;

  v_old := to_jsonb(v_b) - 'invoice_next_no' - 'credit_note_next_no';
  -- All validation done. ONE update.
  begin
    update public.branches b set
      name = coalesce(v_new ->> 'name', b.name),
      country_code = coalesce(v_new ->> 'country_code', b.country_code),
      tax_rate_bp = coalesce((v_new ->> 'tax_rate_bp')::integer, b.tax_rate_bp),
      timezone = coalesce(v_new ->> 'timezone', b.timezone),
      currency = coalesce(v_new ->> 'currency', b.currency),
      invoice_prefix = coalesce(v_new ->> 'invoice_prefix', b.invoice_prefix),
      address = case when v_new ? 'address' then v_new ->> 'address' else b.address end,
      phone = case when v_new ? 'phone' then v_new ->> 'phone' else b.phone end,
      tax_number = case when v_new ? 'tax_number' then v_new ->> 'tax_number' else b.tax_number end,
      google_review_url = case when v_new ? 'google_review_url' then v_new ->> 'google_review_url' else b.google_review_url end
    where b.id = p_branch_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'prefix_taken');
  end;
  perform public.write_audit_log(v_b.business_id, 'branch.updated', 'branch', p_branch_id::text,
    jsonb_strip_nulls(jsonb_build_object('name', v_old -> 'name', 'country_code', v_old -> 'country_code',
      'currency', v_old -> 'currency', 'timezone', v_old -> 'timezone', 'tax_rate_bp', v_old -> 'tax_rate_bp',
      'invoice_prefix', v_old -> 'invoice_prefix', 'address', v_old -> 'address', 'phone', v_old -> 'phone',
      'tax_number', v_old -> 'tax_number')), v_new);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- archive / restore / primary
-- ---------------------------------------------------------------------------
create or replace function public.archive_branch(p_branch_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_b record;
  v_gate jsonb;
  v_block jsonb;
begin
  select b.id, b.business_id, b.name, b.deleted_at into v_b from public.branches b where b.id = p_branch_id;
  if v_b.id is null or v_b.deleted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  v_gate := public.branch_admin_gate(v_b.business_id);
  if v_gate is not null then return v_gate; end if;
  v_block := public.branch_archive_blockers(p_branch_id);
  if v_block is not null then
    return jsonb_build_object('ok', false) || v_block;
  end if;
  update public.branches set deleted_at = now() where id = p_branch_id;
  perform public.write_audit_log(v_b.business_id, 'branch.archived', 'branch', p_branch_id::text,
    jsonb_build_object('name', v_b.name), jsonb_build_object('archived', true));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.restore_branch(p_branch_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_b record;
  v_gate jsonb;
  v_cap integer;
  v_staff integer;
begin
  select b.id, b.business_id, b.name, b.deleted_at into v_b from public.branches b where b.id = p_branch_id;
  if v_b.id is null or v_b.deleted_at is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  v_gate := public.branch_admin_gate(v_b.business_id);
  if v_gate is not null then return v_gate; end if;
  if exists (select 1 from public.branches x where x.business_id = v_b.business_id and x.deleted_at is null
             and lower(x.name) = lower(v_b.name)) then
    return jsonb_build_object('ok', false, 'code', 'name_taken');
  end if;
  v_cap := (public.business_plan_limits(v_b.business_id) ->> 'staff_cap')::integer;
  select count(*) into v_staff from public.staff_branches sb
  join public.staff_profiles sp on sp.id = sb.staff_id and sp.is_active and sp.deleted_at is null
  where sb.branch_id = p_branch_id;
  if v_cap is not null and v_staff > v_cap then
    return jsonb_build_object('ok', false, 'code', 'staff_cap_reached', 'active_staff', v_staff, 'cap', v_cap);
  end if;
  begin
    update public.branches set deleted_at = null where id = p_branch_id;
  exception
    when sqlstate 'P0001' then return jsonb_build_object('ok', false, 'code', 'branch_limit_reached');
    when unique_violation then return jsonb_build_object('ok', false, 'code', 'prefix_taken');
  end;
  perform public.write_audit_log(v_b.business_id, 'branch.restored', 'branch', p_branch_id::text,
    jsonb_build_object('archived', true), jsonb_build_object('name', v_b.name));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.set_primary_branch(p_branch_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_b record;
  v_gate jsonb;
  v_old uuid;
begin
  select b.id, b.business_id, b.deleted_at, b.is_primary into v_b from public.branches b where b.id = p_branch_id;
  if v_b.id is null or v_b.deleted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  v_gate := public.branch_admin_gate(v_b.business_id);
  if v_gate is not null then return v_gate; end if;
  if v_b.is_primary then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;
  select b.id into v_old from public.branches b where b.business_id = v_b.business_id and b.is_primary and b.deleted_at is null;
  update public.branches set is_primary = false where id = v_old;
  update public.branches set is_primary = true where id = p_branch_id;
  perform public.write_audit_log(v_b.business_id, 'branch.primary_changed', 'branch', p_branch_id::text,
    jsonb_build_object('primary_branch_id', v_old), jsonb_build_object('primary_branch_id', p_branch_id));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Branch switching data: the branches the CALLER can work in, with the roles
-- they hold there. branch_id null on an assignment = every branch.
-- ---------------------------------------------------------------------------
create or replace function public.list_my_branches(p_business_id uuid, p_include_archived boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_member uuid;
  v_rows jsonb;
begin
  select m.id into v_member from public.business_members m
  where m.business_id = p_business_id and m.user_id = (select auth.uid()) and m.status = 'active' and m.deleted_at is null;
  if v_member is null then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'name', b.name, 'is_primary', b.is_primary, 'archived', b.deleted_at is not null,
      'country_code', b.country_code, 'currency', b.currency, 'timezone', b.timezone, 'address', b.address,
      'roles', (select coalesce(jsonb_agg(distinct r.key), '[]'::jsonb)
                from public.member_role_assignments a join public.roles r on r.id = a.role_id
                where a.member_id = v_member and (a.branch_id is null or a.branch_id = b.id)))
      order by b.is_primary desc, b.name), '[]'::jsonb)
  into v_rows
  from public.branches b
  where b.business_id = p_business_id and (b.deleted_at is null or p_include_archived)
    and exists (select 1 from public.member_role_assignments a
                where a.member_id = v_member and (a.branch_id is null or a.branch_id = b.id));
  return jsonb_build_object('ok', true, 'branches', v_rows,
    'currencies', (select count(distinct x ->> 'currency') from jsonb_array_elements(v_rows) x));
end $$;

-- ---------------------------------------------------------------------------
-- Per-branch period metrics (internal). Local dates, inclusive, per branch
-- timezone (DST-exact windows). Revenue needs reports.view_revenue for THAT
-- branch, appointment counts reports.view_basic. Archived branches are
-- included (their history still happened); rows with nothing in the window and
-- archived are dropped by the callers.
-- ---------------------------------------------------------------------------
create or replace function public.branch_metrics(
  p_business_id uuid, p_from date, p_to date, p_branch_id uuid default null
) returns table (
  branch_id uuid, branch_name text, currency text, country_code text, tz text, archived boolean,
  can_rev boolean, can_basic boolean, w_start timestamptz, w_end timestamptz,
  invoice_count integer, invoiced_minor bigint, credited_minor bigint, tax_minor bigint,
  net_revenue_minor bigint, collected_minor bigint,
  appt_total integer, appt_pending integer, appt_confirmed integer, appt_completed integer,
  appt_cancelled integer, appt_no_show integer
) language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.currency, b.country_code, b.timezone, b.deleted_at is not null,
         b.cr, b.cb, b.ws, b.we,
         case when b.cr then inv.cnt end, case when b.cr then inv.total end,
         case when b.cr then cn.total end, case when b.cr then inv.tax - cn.tax end,
         case when b.cr then inv.net - cn.net end, case when b.cr then pay.coll end,
         case when b.cb then ap.total end, case when b.cb then ap.pending end, case when b.cb then ap.confirmed end,
         case when b.cb then ap.completed end, case when b.cb then ap.cancelled end, case when b.cb then ap.no_show end
  from (
    select x.*, public.invoice_access(x.business_id, x.id, 'reports.view_revenue') as cr,
           public.invoice_access(x.business_id, x.id, 'reports.view_basic') as cb,
           p_from::timestamp at time zone x.timezone as ws, (p_to + 1)::timestamp at time zone x.timezone as we
    from public.branches x
    where x.business_id = p_business_id and (p_branch_id is null or x.id = p_branch_id)
  ) b
  cross join lateral (
    select count(*)::int cnt, coalesce(sum(i.total_minor), 0)::bigint total, coalesce(sum(i.tax_minor), 0)::bigint tax,
           coalesce(sum(i.net_minor), 0)::bigint net
    from public.invoices i where i.branch_id = b.id and i.status = 'issued' and i.deleted_at is null
      and i.issued_at >= b.ws and i.issued_at < b.we) inv
  cross join lateral (
    select coalesce(sum(c.total_minor), 0)::bigint total, coalesce(sum(c.tax_minor), 0)::bigint tax,
           coalesce(sum(c.net_minor), 0)::bigint net
    from public.credit_notes c where c.branch_id = b.id and c.issued_at >= b.ws and c.issued_at < b.we) cn
  cross join lateral (
    select coalesce(sum(case when p.kind = 'payment' then p.amount_minor else -p.amount_minor end), 0)::bigint coll
    from public.invoice_payments p where p.branch_id = b.id and p.paid_at >= b.ws and p.paid_at < b.we) pay
  cross join lateral (
    select count(*)::int total,
           count(*) filter (where a.status = 'pending')::int pending, count(*) filter (where a.status = 'confirmed')::int confirmed,
           count(*) filter (where a.status = 'completed')::int completed, count(*) filter (where a.status = 'cancelled')::int cancelled,
           count(*) filter (where a.status = 'no_show')::int no_show
    from public.appointments a where a.branch_id = b.id and a.deleted_at is null
      and a.starts_at >= b.ws and a.starts_at < b.we) ap
  where (b.cr or b.cb)
    and (b.deleted_at is null or inv.cnt > 0 or cn.total > 0 or pay.coll <> 0 or ap.total > 0)
$$;
revoke all on function public.branch_metrics(uuid, date, date, uuid) from public, anon, authenticated;

-- Combined owner view: every branch the caller may report on, per-branch rows,
-- and totals PER CURRENCY (never summed across currencies).
create or replace function public.get_combined_overview(p_business_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_gate jsonb;
  v_rows jsonb;
begin
  if (select auth.uid()) is null or not public.is_member(p_business_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  v_gate := public.feature_gate_error(p_business_id, 'multi_branch');
  if v_gate is not null then return v_gate; end if;
  if p_from is null or p_to is null or p_from > p_to then
    return jsonb_build_object('ok', false, 'code', 'invalid_range');
  end if;
  if p_to - p_from > 366 then
    return jsonb_build_object('ok', false, 'code', 'range_too_large');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'branch_id', m.branch_id, 'name', m.branch_name, 'currency', m.currency, 'timezone', m.tz,
      'archived', m.archived, 'invoice_count', m.invoice_count, 'invoiced_minor', m.invoiced_minor,
      'credited_minor', m.credited_minor, 'tax_minor', m.tax_minor, 'net_revenue_minor', m.net_revenue_minor,
      'collected_minor', m.collected_minor, 'appointments', case when m.can_basic then jsonb_build_object(
         'total', m.appt_total, 'pending', m.appt_pending, 'confirmed', m.appt_confirmed,
         'completed', m.appt_completed, 'cancelled', m.appt_cancelled, 'no_show', m.appt_no_show) end)
      order by m.archived, m.branch_name, m.branch_id), '[]'::jsonb)
  into v_rows
  from public.branch_metrics(p_business_id, p_from, p_to, null) m;
  if v_rows = '[]'::jsonb then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  return jsonb_build_object('ok', true, 'from', p_from, 'to', p_to, 'branches', v_rows,
    'totals_by_currency', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'currency', t.currency, 'branches', t.n, 'invoice_count', t.cnt, 'invoiced_minor', t.invoiced,
          'credited_minor', t.credited, 'tax_minor', t.tax, 'net_revenue_minor', t.net, 'collected_minor', t.coll)
          order by t.currency), '[]'::jsonb)
      from (select m.currency, count(*)::int n, sum(m.invoice_count)::int cnt, sum(m.invoiced_minor)::bigint invoiced,
                   sum(m.credited_minor)::bigint credited, sum(m.tax_minor)::bigint tax,
                   sum(m.net_revenue_minor)::bigint net, sum(m.collected_minor)::bigint coll
            from public.branch_metrics(p_business_id, p_from, p_to, null) m where m.can_rev group by m.currency) t),
    'appointments', (
      select jsonb_build_object('total', coalesce(sum(m.appt_total), 0), 'completed', coalesce(sum(m.appt_completed), 0),
                                'cancelled', coalesce(sum(m.appt_cancelled), 0), 'no_show', coalesce(sum(m.appt_no_show), 0))
      from public.branch_metrics(p_business_id, p_from, p_to, null) m where m.can_basic));
end $$;

revoke all on function public.create_branch(uuid, text, text, text, text, text, text, text, integer, text, uuid) from public, anon;
revoke all on function public.update_branch(uuid, jsonb) from public, anon;
revoke all on function public.archive_branch(uuid) from public, anon;
revoke all on function public.restore_branch(uuid) from public, anon;
revoke all on function public.set_primary_branch(uuid) from public, anon;
revoke all on function public.list_my_branches(uuid, boolean) from public, anon;
revoke all on function public.get_combined_overview(uuid, date, date) from public, anon;
grant execute on function public.create_branch(uuid, text, text, text, text, text, text, text, integer, text, uuid) to authenticated;
grant execute on function public.update_branch(uuid, jsonb) to authenticated;
grant execute on function public.archive_branch(uuid) to authenticated;
grant execute on function public.restore_branch(uuid) to authenticated;
grant execute on function public.set_primary_branch(uuid) to authenticated;
grant execute on function public.list_my_branches(uuid, boolean) to authenticated;
grant execute on function public.get_combined_overview(uuid, date, date) to authenticated;
