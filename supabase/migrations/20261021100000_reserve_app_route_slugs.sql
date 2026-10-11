-- Single domain: the dashboard, admin, landing and business pages all share https://wapee.online, so a business
-- slug must never equal a top-level app route or public file. These routes existed but were not reserved.
-- Checked on dev 2026-10-10: no live business uses any of them. Mirrors src/config/reservedSlugs.ts
-- (reservedSlugs.test.ts keeps both lists and every top-level path in step).
insert into public.reserved_slugs (slug) values
  ('today'), ('commission'), ('inventory'), ('members'), ('more'), ('packages'), ('schedule'), ('website'),
  ('accept-invite'), ('invoice-print'), ('report-print'), ('icons')
on conflict do nothing;
