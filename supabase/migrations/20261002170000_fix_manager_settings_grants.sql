-- Manager must hold booking settings ONLY, not business settings or website editing.
--
-- Product doc §9, default roles matrix, row "Website and settings":
--   Owner = Yes, **Manager = "Booking settings"**, Receptionist = No, Staff = No.
--
-- The seed built Manager as "every permission except a deny-list"
-- (20261001184000) and that list named only `website.publish`, so Manager also
-- picked up `settings.business` and `website.edit`. The doc grants neither:
-- "Booking settings" is `settings.booking`, which Manager keeps.
--
-- Effect: a Manager can no longer open the Settings screen or edit the public
-- website. `settings.booking` has no screen yet (Phase 6), so until then Manager
-- simply loses Settings from the menu — which is what the doc intends.
--
-- Only the system Manager role is touched (`business_id is null`); a tenant's
-- custom roles (Phase 9) are their own business and are left alone.

delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id
  and r.business_id is null
  and r.key = 'manager'
  and rp.permission in ('settings.business', 'website.edit');
