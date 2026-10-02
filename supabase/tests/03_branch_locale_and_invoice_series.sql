-- Branch-owned locale and the per-branch invoice series (decisions 23–25).
--
-- The point of this change: one business may trade in several countries at
-- once. These tests prove that holds, and that invoice numbering cannot
-- collide between branches.
--
-- Run with:  supabase test db        (needs Docker)
-- or paste into the SQL editor; everything rolls back.

begin;
select plan(11);

create extension if not exists pgtap with schema extensions;

insert into auth.users (id, email)
values ('99990000-0000-0000-0000-000000000099', 'multibranch@test.local');

set local role authenticated;
set local request.jwt.claims = '{"sub":"99990000-0000-0000-0000-000000000099","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- Signup writes locale to the branch, defaults to the business
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.create_business_with_owner(
       'Clinica BA', 'clinica-ba', 'AR', 'ARS',
       'America/Argentina/Buenos_Aires', 'en', 'clinic', 'Palermo') $$,
  'signup creates a business whose branch owns the locale'
);

select results_eq(
  $$ select b.country_code, b.currency, b.timezone
     from public.branches b
     join public.businesses biz on biz.id = b.business_id
     where biz.slug = 'clinica-ba' $$,
  $$ values ('AR'::text, 'ARS'::text, 'America/Argentina/Buenos_Aires'::text) $$,
  'the BRANCH holds country, currency and timezone'
);

select results_eq(
  $$ select default_country_code, default_currency
     from public.businesses where slug = 'clinica-ba' $$,
  $$ values ('AR'::text, 'ARS'::text) $$,
  'the business keeps default_* for pre-filling the next branch'
);

select is(
  (select invoice_prefix from public.branches b
   join public.businesses biz on biz.id = b.business_id
   where biz.slug = 'clinica-ba'),
  'PAL',
  'the invoice prefix comes from the location name'
);

select is(
  (select invoice_next_no from public.branches b
   join public.businesses biz on biz.id = b.business_id
   where biz.slug = 'clinica-ba'),
  1::bigint,
  'invoice numbering starts at 1'
);

-- ---------------------------------------------------------------------------
-- The whole point: branches in different countries, side by side
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.branches
       (business_id, name, country_code, currency, timezone, invoice_prefix)
     select id, 'London', 'GB', 'GBP', 'Europe/London', 'LDN'
     from public.businesses where slug = 'clinica-ba' $$,
  'a second branch may use a different country and currency'
);

select is(
  (select count(distinct currency)::int from public.branches b
   join public.businesses biz on biz.id = b.business_id
   where biz.slug = 'clinica-ba'),
  2,
  'one business now trades in two currencies'
);

-- ---------------------------------------------------------------------------
-- Invoice prefixes cannot collide inside a business
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.branches
       (business_id, name, country_code, currency, timezone, invoice_prefix)
     select id, 'Duplicate', 'AR', 'ARS', 'America/Argentina/Buenos_Aires', 'PAL'
     from public.businesses where slug = 'clinica-ba' $$,
  '23505',
  null,
  'two branches cannot share an invoice prefix'
);

select is(
  public.suggest_invoice_prefix(
    (select id from public.businesses where slug = 'clinica-ba'), 'Palermo Two'),
  'PAL2',
  'a colliding suggestion gets a numeric suffix'
);

select is(
  public.suggest_invoice_prefix(
    (select id from public.businesses where slug = 'clinica-ba'), '123 !!'),
  'BR',
  'a name with no letters falls back to BR'
);

-- ---------------------------------------------------------------------------
-- The prefix is locked once numbering has started
-- ---------------------------------------------------------------------------

-- Simulate an issued invoice by advancing the counter.
update public.branches b
set invoice_next_no = 2
from public.businesses biz
where biz.id = b.business_id and biz.slug = 'clinica-ba' and b.invoice_prefix = 'PAL';

select throws_ok(
  $$ update public.branches b
     set invoice_prefix = 'XXX'
     from public.businesses biz
     where biz.id = b.business_id and biz.slug = 'clinica-ba'
       and b.invoice_prefix = 'PAL' $$,
  '23514',
  null,
  'the prefix cannot change once invoices have been issued'
);

select * from finish();
rollback;
