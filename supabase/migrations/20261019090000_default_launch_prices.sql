-- Launch default prices (USD, minor units, monthly). Data only.
-- A row is changed ONLY while it still holds the old seed placeholder and the super admin
-- never edited it (updated_by is null). Anything the super admin set is left alone.
-- Plans (Solo 1500, Team 3900, Business 7900) already equal the seed values: nothing to change there.

update public.addons set price_monthly_minor = 800,  currency = 'USD' where key = 'packages'     and price_monthly_minor = 1200 and updated_by is null;
update public.addons set price_monthly_minor = 800,  currency = 'USD' where key = 'inventory'    and price_monthly_minor = 1000 and updated_by is null;
update public.addons set price_monthly_minor = 1000, currency = 'USD' where key = 'files_photos' and price_monthly_minor = 800  and updated_by is null;
update public.addons set price_monthly_minor = 1200, currency = 'USD' where key = 'client_portal' and price_monthly_minor = 1500 and updated_by is null;
update public.addons set price_monthly_minor = 1000, currency = 'USD' where key = 'custom_roles'  and price_monthly_minor = 1200 and updated_by is null;
-- forms_consent stays 1000.
