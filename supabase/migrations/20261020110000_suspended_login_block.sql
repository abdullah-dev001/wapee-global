-- Suspended business: every user whose businesses are ALL suspended cannot sign in and loses their sessions.
--   user_is_disabled(uid)                    pure rule (internal)
--   custom_access_token_hook(event)          Supabase Auth hook, FAIL-OPEN, refuses sign-in AND token refresh
--   revoke_sessions_of_disabled_members(b)   deletes auth sessions / refresh tokens of the members of business b
--   my_access_state()                        client check on focus / refetch
--   set_business_status                      redefined to call the revoke + audit
-- The hook must be switched on in the dashboard (Auth > Hooks) for the hosted project; see docs/go-live checklist.

-- Rule: not a super admin, has at least one ACTIVE membership in a non-deleted business, and every such business
-- is suspended. Zero businesses (new signup, invitee) = not disabled. A business without a subscription row = usable.
create or replace function public.user_is_disabled(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user is not null
    and not coalesce((select p.is_super_admin from public.profiles p where p.id = p_user), false)
    and exists (
      select 1 from public.business_members m
      join public.businesses b on b.id = m.business_id and b.deleted_at is null
      where m.user_id = p_user and m.status = 'active' and m.deleted_at is null)
    and not exists (
      select 1 from public.business_members m
      join public.businesses b on b.id = m.business_id and b.deleted_at is null
      left join public.business_subscriptions s on s.business_id = b.id
      where m.user_id = p_user and m.status = 'active' and m.deleted_at is null
        and s.status is distinct from 'suspended');
$$;
revoke all on function public.user_is_disabled(uuid) from public, anon, authenticated;
grant execute on function public.user_is_disabled(uuid) to service_role, supabase_auth_admin;

-- Auth hook. Any error inside = issue the token normally (a bug here must never lock everyone out).
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if public.user_is_disabled((event ->> 'user_id')::uuid) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'This account is disabled. Contact support@wapee.online'));
  end if;
  return event;
exception when others then
  return event;
end $$;
revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Deletes the sessions (refresh tokens cascade) of this business's members that are now disabled.
create or replace function public.revoke_sessions_of_disabled_members(p_business_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_users uuid[];
begin
  select coalesce(array_agg(distinct m.user_id), '{}') into v_users
  from public.business_members m
  where m.business_id = p_business_id and m.user_id is not null
    and m.status = 'active' and m.deleted_at is null
    and public.user_is_disabled(m.user_id);
  if coalesce(array_length(v_users, 1), 0) = 0 then return 0; end if;
  delete from auth.refresh_tokens where user_id::uuid = any (v_users);
  delete from auth.sessions where user_id = any (v_users);
  return array_length(v_users, 1);
end $$;
revoke all on function public.revoke_sessions_of_disabled_members(uuid) from public, anon, authenticated;
grant execute on function public.revoke_sessions_of_disabled_members(uuid) to service_role;

-- The signed-in client asks on focus / refetch: "am I disabled?"
create or replace function public.my_access_state()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('disabled', coalesce(public.user_is_disabled((select auth.uid())), false));
$$;
revoke all on function public.my_access_state() from public, anon;
grant execute on function public.my_access_state() to authenticated;

create or replace function public.set_business_status(p_business_id uuid, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_s record;
  v_viol jsonb;
  v_revoked integer := 0;
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

  -- Suspended: members left with no usable business lose their sessions (the access-token hook keeps them out).
  if p_status = 'suspended' then
    v_revoked := public.revoke_sessions_of_disabled_members(p_business_id);
    perform public.write_audit_log(p_business_id, 'admin.sessions_revoked', 'business', p_business_id::text,
      null, jsonb_build_object('users', v_revoked));
  end if;
  return jsonb_build_object('ok', true, 'status', p_status, 'sessions_revoked_users', v_revoked);
end $$;

