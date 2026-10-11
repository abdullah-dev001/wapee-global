-- Phase 8A follow-up: the super admin powers need a TOTP-verified (aal2) session
-- EVERYWHERE, not just in the admin RPCs. is_super_admin() is used by ~55 RLS
-- policies and guards, so changing it covers every tenant-table read.
--
-- platform_flag() is the bare flag (internal): admin_gate() uses it to tell
-- 'forbidden' (not a super admin) from 'mfa_required' (flag set, session aal1).
--
-- NOTE: a super admin reading tenant tables directly (policies) is NOT audited;
-- the audited path is support_view_business / get_business_detail.

create or replace function public.platform_flag()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_super_admin from public.profiles p where p.id = (select auth.uid())), false)
$$;
revoke all on function public.platform_flag() from public, anon, authenticated;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.platform_flag()
     and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;
comment on function public.is_super_admin is
  'Platform super admin flag AND a TOTP-verified (aal2) session. Unaudited when used by RLS: the audited read path is support_view_business.';

create or replace function public.admin_gate()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when (select auth.uid()) is null or not public.platform_flag() then 'forbidden'
    when coalesce((select auth.jwt()) ->> 'aal', '') <> 'aal2' then 'mfa_required'
  end
$$;
revoke all on function public.admin_gate() from public, anon, authenticated;
