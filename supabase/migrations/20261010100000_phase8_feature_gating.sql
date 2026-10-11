-- Phase 8A (2/3): feature gating, plan limits and their enforcement.
--
-- ONE source of truth: business_has_feature() and business_plan_limits().
-- Both are INTERNAL (service_role + SECURITY DEFINER callers only, no
-- membership check): triggers and RPCs call them for any business. The UI reads
-- my_features(), which is membership-checked.
--
-- Rules (decided with the user):
--   * a business that is not active (trial over, suspended, inactive) has NO feature
--   * a trial behaves as the Business plan and every add-on is ON
--   * a plan flag grants the feature; an add-on key is granted by an enabled
--     business_addons row (or the trial); anything unknown is false
--   * staff cap is PER LOCATION: active, non-deleted staff assigned to a branch
--   * branches: max_branches (solo/team 1, business unlimited)

create or replace function public.business_plan_limits(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_s record;
  v_plan text;
  v_p record;
begin
  select s.status, s.plan into v_s from public.business_subscriptions s where s.business_id = p_business_id;
  if not found then return null; end if;
  v_plan := case when v_s.status = 'trialing' then 'business' else v_s.plan::text end;
  if v_plan is null then
    return jsonb_build_object('plan', null, 'status', v_s.status, 'trial', false, 'staff_cap', null, 'max_branches', null);
  end if;
  select p.staff_cap, p.max_branches into v_p from public.plans p where p.key = v_plan::public.business_plan;
  return jsonb_build_object('plan', v_plan, 'status', v_s.status, 'trial', v_s.status = 'trialing',
                            'staff_cap', v_p.staff_cap, 'max_branches', v_p.max_branches);
end $$;
revoke all on function public.business_plan_limits(uuid) from public, anon, authenticated;
grant execute on function public.business_plan_limits(uuid) to service_role;

create or replace function public.business_has_feature(p_business_id uuid, p_key text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_s record;
  v_plan text;
begin
  if p_business_id is null or p_key is null then return false; end if;
  if not public.business_is_active(p_business_id) then return false; end if;
  select s.status, s.plan into v_s from public.business_subscriptions s where s.business_id = p_business_id;
  if not found then return false; end if;
  v_plan := case when v_s.status = 'trialing' then 'business' else v_s.plan::text end;
  if v_plan is null then return false; end if;
  if coalesce((select (p.features ->> p_key)::boolean from public.plans p where p.key = v_plan::public.business_plan), false) then
    return true;
  end if;
  if exists (select 1 from public.addons a where a.key = p_key) then
    return v_s.status = 'trialing'
        or exists (select 1 from public.business_addons ba
                   where ba.business_id = p_business_id and ba.addon_key = p_key and ba.enabled);
  end if;
  return false;
end $$;
revoke all on function public.business_has_feature(uuid, text) from public, anon, authenticated;
grant execute on function public.business_has_feature(uuid, text) to service_role;

-- For module RPCs (Phase 10): `v := feature_gate_error(biz, 'inventory'); if v is not null then return v; end if;`
-- before any write. Returns NULL when allowed.
create or replace function public.feature_gate_error(p_business_id uuid, p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.business_has_feature(p_business_id, p_key) then null
         else jsonb_build_object('ok', false, 'code', 'feature_unavailable', 'feature', p_key) end
$$;
revoke all on function public.feature_gate_error(uuid, text) from public, anon, authenticated;
grant execute on function public.feature_gate_error(uuid, text) to service_role;

-- UI read: the caller's own business only.
create or replace function public.my_features(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_keys text[];
  v_feat jsonb := '{}'::jsonb;
  k text;
begin
  if (select auth.uid()) is null or not (public.is_member(p_business_id) or public.is_super_admin()) then
    return null;
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_keys from (
    select jsonb_object_keys(p.features) x from public.plans p
    union select a.key from public.addons a) q;
  foreach k in array v_keys loop
    v_feat := v_feat || jsonb_build_object(k, public.business_has_feature(p_business_id, k));
  end loop;
  return public.business_plan_limits(p_business_id)
         || jsonb_build_object('active', public.business_is_active(p_business_id), 'features', v_feat);
end $$;
revoke all on function public.my_features(uuid) from public, anon;
grant execute on function public.my_features(uuid) to authenticated;

-- The widget seam from Phase 7A is now real (Team and Business).
create or replace function public.widget_feature_enabled(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.business_has_feature(p_business_id, 'embed_widget')
$$;
revoke all on function public.widget_feature_enabled(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Limit violations for a target plan (used by assign_plan / set_business_status)
-- ---------------------------------------------------------------------------
create or replace function public.plan_limit_violations(p_business_id uuid, p_plan public.business_plan)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_p record;
  v_staff jsonb;
  v_branches integer;
begin
  select staff_cap, max_branches into v_p from public.plans where key = p_plan;
  select coalesce(jsonb_agg(jsonb_build_object('branch_id', t.id, 'branch', t.name, 'active_staff', t.n, 'cap', v_p.staff_cap)
                            order by t.name), '[]'::jsonb)
    into v_staff
  from (select b.id, b.name, count(*) n
        from public.branches b
        join public.staff_branches sb on sb.branch_id = b.id
        join public.staff_profiles sp on sp.id = sb.staff_id and sp.is_active and sp.deleted_at is null
        where b.business_id = p_business_id and b.deleted_at is null
        group by b.id, b.name
        having v_p.staff_cap is not null and count(*) > v_p.staff_cap) t;
  select count(*) into v_branches from public.branches b where b.business_id = p_business_id and b.deleted_at is null;
  return jsonb_build_object(
    'staff_over_cap', v_staff,
    'branches_over', case when v_p.max_branches is not null and v_branches > v_p.max_branches
                          then jsonb_build_object('current', v_branches, 'max', v_p.max_branches) else null end,
    'violated', jsonb_array_length(v_staff) > 0 or (v_p.max_branches is not null and v_branches > v_p.max_branches));
end $$;
revoke all on function public.plan_limit_violations(uuid, public.business_plan) from public, anon, authenticated;
grant execute on function public.plan_limit_violations(uuid, public.business_plan) to service_role;

-- ---------------------------------------------------------------------------
-- Enforcement 1: staff cap per location. Triggers because the staff UI writes
-- the tables directly (RLS stays the permission boundary, this is the plan one).
-- A raise is right here: it refuses the write; no counter to protect.
-- ---------------------------------------------------------------------------
create or replace function public.check_staff_cap(p_business_id uuid, p_branch_id uuid, p_extra integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_cap integer;
  v_n integer;
begin
  perform pg_advisory_xact_lock(hashtext('staffcap:' || p_branch_id::text));
  v_cap := (public.business_plan_limits(p_business_id) ->> 'staff_cap')::integer;
  if v_cap is null then return; end if;
  select count(*) into v_n
  from public.staff_branches sb
  join public.staff_profiles sp on sp.id = sb.staff_id and sp.is_active and sp.deleted_at is null
  where sb.branch_id = p_branch_id;
  if v_n + p_extra > v_cap then
    raise exception 'staff_cap_reached' using errcode = 'P0001',
      detail = format('cap=%s active_staff=%s', v_cap, v_n), hint = 'upgrade_plan';
  end if;
end $$;
revoke all on function public.check_staff_cap(uuid, uuid, integer) from public, anon, authenticated;

create or replace function public.enforce_staff_cap_on_assign()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_active boolean;
begin
  select sp.is_active and sp.deleted_at is null into v_active from public.staff_profiles sp where sp.id = new.staff_id;
  if coalesce(v_active, false) then
    perform public.check_staff_cap(new.business_id, new.branch_id, 1);
  end if;
  return new;
end $$;
revoke all on function public.enforce_staff_cap_on_assign() from public, anon, authenticated;
create trigger staff_branches_enforce_cap before insert on public.staff_branches
  for each row execute function public.enforce_staff_cap_on_assign();

create or replace function public.enforce_staff_cap_on_activate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if (new.is_active and new.deleted_at is null) and (not old.is_active or old.deleted_at is not null) then
    for r in select sb.branch_id from public.staff_branches sb where sb.staff_id = new.id loop
      perform public.check_staff_cap(new.business_id, r.branch_id, 1);
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.enforce_staff_cap_on_activate() from public, anon, authenticated;
create trigger staff_profiles_enforce_cap before update of is_active, deleted_at on public.staff_profiles
  for each row execute function public.enforce_staff_cap_on_activate();

-- ---------------------------------------------------------------------------
-- Enforcement 2: multi-branch. One location unless the plan allows more.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_branch_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_max integer;
  v_n integer;
begin
  if tg_op = 'UPDATE' and not (old.deleted_at is not null and new.deleted_at is null) then return new; end if;
  if tg_op = 'INSERT' and new.deleted_at is not null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('branchlimit:' || new.business_id::text));
  v_max := (public.business_plan_limits(new.business_id) ->> 'max_branches')::integer;
  if v_max is null then return new; end if;
  select count(*) into v_n from public.branches b where b.business_id = new.business_id and b.deleted_at is null;
  if v_n >= v_max then
    raise exception 'branch_limit_reached' using errcode = 'P0001',
      detail = format('max_branches=%s current=%s', v_max, v_n), hint = 'upgrade_plan';
  end if;
  return new;
end $$;
revoke all on function public.enforce_branch_limit() from public, anon, authenticated;
create trigger branches_enforce_limit before insert or update of deleted_at on public.branches
  for each row execute function public.enforce_branch_limit();

-- ---------------------------------------------------------------------------
-- Enforcement 3: custom roles need the feature (Team add-on / Business).
-- System roles (business_id null) are unaffected.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_custom_roles_feature()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.business_id is not null and not public.business_has_feature(new.business_id, 'custom_roles') then
    raise exception 'feature_unavailable' using errcode = 'P0001', detail = 'custom_roles', hint = 'upgrade_plan';
  end if;
  return new;
end $$;
revoke all on function public.enforce_custom_roles_feature() from public, anon, authenticated;
create trigger roles_enforce_custom_roles_feature before insert on public.roles
  for each row execute function public.enforce_custom_roles_feature();
