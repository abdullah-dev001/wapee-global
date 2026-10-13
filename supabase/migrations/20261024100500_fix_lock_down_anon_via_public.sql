-- Follow-up to 20261024100000: that migration's `revoke execute ... from anon` was a no-op for
-- enforce_staff_member_link, is_allowed_appointment_transition and website_asset_path_ok, because those
-- three never had a direct anon grant in the first place -- anon was reaching them through the PUBLIC
-- pseudo-role grant (`=X/postgres` in pg_proc.proacl), which only `revoke ... from public` removes.
-- my_role_labels and get_public_pricing/invite_preview were already `revoke all from public` in their own
-- migrations, which is why only those three were left reachable after the first attempt (confirmed via
-- has_function_privilege('anon', oid, 'EXECUTE') still true for all three post-migration).

revoke execute on function public.enforce_staff_member_link() from public;
revoke execute on function public.is_allowed_appointment_transition(public.appointment_status, public.appointment_status) from public;
revoke execute on function public.website_asset_path_ok(text) from public;

grant execute on function public.is_allowed_appointment_transition(public.appointment_status, public.appointment_status) to authenticated;
grant execute on function public.website_asset_path_ok(text) to authenticated;
-- enforce_staff_member_link is a trigger function only (staff_profiles_member_link_guard); no API role
-- needs to call it directly, so it gets no grant back at all, same posture as any other trigger function.
