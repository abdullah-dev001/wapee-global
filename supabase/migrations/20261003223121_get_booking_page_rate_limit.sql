-- `get_booking_page` (the new bootstrap endpoint for the public booking page)
-- needs a rate-limit rule, same as every other public endpoint (CLAUDE.md §11).
-- Same window as `get_slots`: it is a read, called once per page load rather
-- than once per booking, so the generous per-IP allowance is appropriate.
insert into public.rate_limit_rules (endpoint, scope, window_seconds, max_attempts, note) values
  ('get_booking_page', 'ip', 60, 60, 'Bootstraps the public booking page: branch info, services, staff, form fields. Same window as get_slots.');
