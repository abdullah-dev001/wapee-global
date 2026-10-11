-- Security advisor follow-up for the branch-locale migration.
--
-- suggest_invoice_prefix leaks branch naming inside a business, so anon must
-- not reach it. is_slug_available is deliberately public: the signup form has
-- to check an address before an account exists, and it returns only a boolean
-- about data that is public anyway (a business slug is a public URL).

revoke all on function public.suggest_invoice_prefix(uuid, text) from anon, public;
grant execute on function public.suggest_invoice_prefix(uuid, text) to authenticated;

-- Explicit, so the intent is recorded rather than inherited by accident.
revoke all on function public.is_slug_available(text) from public;
grant execute on function public.is_slug_available(text) to anon, authenticated;

comment on function public.is_slug_available is
  'True when a slug is well-formed, not reserved and not taken. Intentionally callable by anon: the signup form checks availability before an account exists. Returns only a boolean about a public URL.';
