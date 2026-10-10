-- `get_booking_page` (the new bootstrap endpoint for the public booking page)
-- needs a rate-limit rule, same as every other public endpoint (CLAUDE.md §11).
-- Same window as `get_slots`: it is a read, called once per page load rather
-- than once per booking, so the generous per-IP allowance is appropriate.
--
-- REPLAY NOTE: on a database that already had `rate_limit_rules` (dev) this inserts
-- the rule. `rate_limit_rules` is created later by 20261004090000, so on an EMPTY
-- database the table is not there yet: skip here, and that file seeds the same row.
do $$
begin
  if to_regclass('public.rate_limit_rules') is not null then
    insert into public.rate_limit_rules (endpoint, scope, window_seconds, max_attempts, note) values
      ('get_booking_page', 'ip', 60, 60, 'Bootstraps the public booking page: branch info, services, staff, form fields. Same window as get_slots.')
    on conflict (endpoint, scope) do nothing;
  end if;
end $$;
