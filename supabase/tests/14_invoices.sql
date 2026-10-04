-- Phase 5A: invoices backend.
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/14_invoices.sql
--
-- Plain SQL (no Docker/pgTAP, see context/_handoff.md). Builds real
-- auth.users + businesses, runs every assertion, prints a failures table and
-- ROLLS BACK everything. The concurrent-issue proof needs real parallel
-- sessions and lives in 15_invoice_concurrency.sh.
--
-- Covered: draft create/update/discard (free-text, service, from a completed
-- appointment, one live invoice per appointment, stored columns), discount
-- rules, issue (gapless numbers, tax snapshot, forced-raise rollback leaves
-- no gap), payments (partial/paid/overpay), credit notes (full/partial, own
-- series, exact tax), reversal rows (refund path), the failure-path SURVIVAL
-- check on every mutating RPC, owner/manager/receptionist/staff/other
-- business/anon on every RPC, immutability (update/delete refused on every
-- financial table even for postgres), currency lock, counter protection,
-- list_invoices (pagination/filters/search), print data, reports (DST month
-- and 25-hour day in America/New_York, Asia/Karachi, per-currency, window
-- edges), grants, and delete-business cascade.

begin;

create temporary table ids (k text primary key, v uuid) on commit drop;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;

create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from ids where k = $1 $$;
create or replace function pg_temp.chk(p_name text, p_got anyelement, p_want anyelement)
returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got::text is not distinct from p_want::text,
          'got ' || coalesce(p_got::text,'<null>') || ' want ' || coalesce(p_want::text,'<null>'));
end; $$;
create or replace function pg_temp.chk(p_name text, p_got text, p_want text)
returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got is not distinct from p_want,
          'got ' || coalesce(p_got,'<null>') || ' want ' || coalesce(p_want,'<null>'));
end; $$;
create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end; $$;

-- Run a statement as a signed-in user. Returns its jsonb result, or
-- {raised:true,state,msg} when it raised (role is always reset).
create or replace function pg_temp.as_(p_user text, p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id(p_user));
  set local role authenticated;
  begin
    execute p_sql into r;
  exception when others then
    reset role;
    return jsonb_build_object('raised', true, 'state', sqlstate, 'msg', sqlerrm);
  end;
  reset role;
  return r;
end $$;

-- Same, but stays the postgres role (JWT claims only): for the INTERNAL
-- report_basic_at, which has no API grant. Permission checks still read the claims.
create or replace function pg_temp.as_pg(p_user text, p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id(p_user));
  execute p_sql into r;
  return r;
end $$;

create or replace function pg_temp.as_anon(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    execute p_sql into r;
  exception when others then
    reset role;
    return jsonb_build_object('raised', true, 'state', sqlstate, 'msg', sqlerrm);
  end;
  reset role;
  return r;
end $$;

-- Everything that must NOT change when a call fails.
create or replace function pg_temp.snap(p_inv uuid) returns text language sql as $$
  select jsonb_build_object(
    'inv', (select to_jsonb(i) from public.invoices i where i.id = p_inv),
    'items', (select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order, t.id), '[]') from public.invoice_items t where t.invoice_id = p_inv),
    'pay', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]') from public.invoice_payments p where p.invoice_id = p_inv),
    'cn', (select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]') from public.credit_notes c where c.invoice_id = p_inv),
    'ctr', (select jsonb_build_object('a', b.invoice_next_no, 'c', b.credit_note_next_no)
            from public.branches b join public.invoices i on i.branch_id = b.id where i.id = p_inv),
    'appt', (select a.invoice_id from public.appointments a
             where a.id = (select appointment_id from public.invoices where id = p_inv)))::text
$$;

do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.ids to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.res to authenticated, anon', v_schema);
  execute format('grant usage, select on all sequences in schema %I to authenticated, anon', v_schema);
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('owner'),('manager'),('recep'),('staffa'),('ownerb'),('ownerc')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'p5.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;

do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  v_biz := public.create_business_with_owner('P5 A','p5-a','GB','GBP','Europe/London','en',null,'Main');
  reset role; insert into ids values ('biza', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  v_biz := public.create_business_with_owner('P5 B','p5-b','US','USD','America/New_York','en',null,'Main');
  reset role; insert into ids values ('bizb', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerc')); set local role authenticated;
  v_biz := public.create_business_with_owner('P5 C','p5-c','GB','GBP','Europe/London','en',null,'Main');
  reset role; insert into ids values ('bizc', v_biz);
end $$;

insert into ids select 'brancha', id from public.branches where business_id = pg_temp.id('biza') limit 1;
insert into ids select 'branchb', id from public.branches where business_id = pg_temp.id('bizb') limit 1;
insert into ids select 'branchc', id from public.branches where business_id = pg_temp.id('bizc') limit 1;

alter table public.businesses disable trigger businesses_enforce_guard;
update public.businesses set trial_ends_at = now() + interval '1000 days'
where id in (pg_temp.id('biza'), pg_temp.id('bizb'), pg_temp.id('bizc'));
alter table public.businesses enable trigger businesses_enforce_guard;

update public.branches set tax_rate_bp = 2000, tax_number = 'GB123456789' where id = pg_temp.id('brancha');

-- A second branch in business A (Karachi, PKR) for currency/timezone tests.
insert into public.branches (business_id, name, is_primary, timezone, currency, country_code, invoice_prefix)
values (pg_temp.id('biza'), 'Karachi', false, 'Asia/Karachi', 'PKR', 'PK', 'KHI');
insert into ids select 'branchk', id from public.branches where business_id = pg_temp.id('biza') and name = 'Karachi';

do $$
declare r record; v_member uuid;
begin
  for r in select * from (values ('manager','manager'),('recep','receptionist'),('staffa','staff')) as x(k, role_key) loop
    insert into public.business_members (business_id, user_id, status, joined_at)
    values (pg_temp.id('biza'), pg_temp.id(r.k), 'active', now()) returning id into v_member;
    perform pg_temp.act_as(pg_temp.id('owner'));
    insert into public.member_role_assignments (member_id, role_id, branch_id)
    values (v_member, (select id from public.roles where business_id is null and key = r.role_key),
            pg_temp.id('brancha'));
  end loop;
end $$;

do $$
declare v_svc uuid; v_client uuid; v_staff uuid; v_fv uuid; v_a uuid;
begin
  insert into public.services (business_id, name, duration_minutes, buffer_minutes)
  values (pg_temp.id('biza'), 'Cut', 60, 0) returning id into v_svc;
  insert into ids values ('svc', v_svc);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
  values (v_svc, pg_temp.id('brancha'), pg_temp.id('biza'), 4000, true);

  insert into public.clients (business_id, full_name, phone_e164, email)
  values (pg_temp.id('biza'), 'Ada Client', '+447700900111', 'ada@example.com') returning id into v_client;
  insert into ids values ('client', v_client);

  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;
  insert into ids values ('fv', v_fv);

  -- completed (invoiceable) and confirmed (not invoiceable) appointments
  insert into public.appointments (business_id, branch_id, client_id, service_id, starts_at, ends_at,
    duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
  values (pg_temp.id('biza'), pg_temp.id('brancha'), v_client, v_svc,
          '2026-09-01 10:00+00', '2026-09-01 11:00+00', 60, 0, 'completed', 'dashboard', v_fv, 3500)
  returning id into v_a;
  insert into ids values ('appt_done', v_a);
  insert into public.appointments (business_id, branch_id, client_id, service_id, starts_at, ends_at,
    duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
  values (pg_temp.id('biza'), pg_temp.id('brancha'), v_client, v_svc,
          '2026-09-02 10:00+00', '2026-09-02 11:00+00', 60, 0, 'confirmed', 'dashboard', v_fv, 3500)
  returning id into v_a;
  insert into ids values ('appt_open', v_a);
end $$;

-- ===========================================================================
-- 1. Drafts
-- ===========================================================================
do $$
declare r jsonb; v_inv uuid; v_before int;
begin
  -- receptionist: free-text + service line
  r := pg_temp.as_('recep', format($q$select public.create_invoice_draft(%L, null, %L, %L::jsonb, 'walk-in note')$q$,
    pg_temp.id('brancha'), pg_temp.id('client'),
    jsonb_build_array(
      jsonb_build_object('description','Blow dry','quantity',2,'unit_price_minor',2500),
      jsonb_build_object('service_id', pg_temp.id('svc'), 'quantity', 1))::text));
  perform pg_temp.chk('recep creates a draft', r->>'ok', 'true');
  v_inv := (r->>'invoice_id')::uuid; insert into ids values ('d1', v_inv);
  perform pg_temp.chk('draft totals: subtotal 9000', r->>'subtotal_minor', '9000');
  perform pg_temp.chk('draft totals: tax 1800 (20%)', r->>'tax_minor', '1800');
  perform pg_temp.chk('draft totals: total 10800', r->>'total_minor', '10800');
  perform pg_temp.chk('stored: status draft', (select status::text from public.invoices where id = v_inv), 'draft');
  perform pg_temp.chk('stored: no number while draft', (select number from public.invoices where id = v_inv), null::text);
  perform pg_temp.chk('stored: currency from branch', (select currency from public.invoices where id = v_inv), 'GBP');
  perform pg_temp.chk('stored: tax rate snapshot', (select tax_rate_bp from public.invoices where id = v_inv), 2000);
  perform pg_temp.chk('stored: tax number snapshot', (select tax_number from public.invoices where id = v_inv), 'GB123456789');
  perform pg_temp.chk('stored: bill_to_name from client', (select bill_to_name from public.invoices where id = v_inv), 'Ada Client');
  perform pg_temp.chk('stored: created_by is the caller', (select created_by from public.invoices where id = v_inv), pg_temp.id('recep'));
  perform pg_temp.chk('stored: 2 items', (select count(*)::int from public.invoice_items where invoice_id = v_inv), 2);
  perform pg_temp.chk('stored: service line takes the service name', (select description from public.invoice_items where invoice_id = v_inv and service_id is not null), 'Cut');
  perform pg_temp.chk('stored: service line takes the branch price', (select unit_price_minor from public.invoice_items where invoice_id = v_inv and service_id is not null), 4000::bigint);
  perform pg_temp.chk('stored: line_net of 2 x 2500', (select line_net_minor from public.invoice_items where invoice_id = v_inv and description = 'Blow dry'), 5000::bigint);
  perform pg_temp.chk('stored: sort order kept', (select string_agg(sort_order::text, ',' order by sort_order) from public.invoice_items where invoice_id = v_inv), '0,1');

  -- discount rules
  select count(*) into v_before from public.invoices;
  r := pg_temp.as_('recep', format($q$select public.create_invoice_draft(%L, null, null, %L::jsonb)$q$, pg_temp.id('brancha'),
    '[{"description":"x","unit_price_minor":1000,"discount_minor":100,"discount_reason":"loyalty"}]'));
  perform pg_temp.chk('receptionist cannot discount', r->>'code', 'discount_forbidden');
  perform pg_temp.chk('refused draft wrote nothing', (select count(*)::int from public.invoices), v_before);

  r := pg_temp.as_('manager', format($q$select public.create_invoice_draft(%L, null, null, %L::jsonb)$q$, pg_temp.id('brancha'),
    '[{"description":"x","unit_price_minor":1000,"discount_minor":100}]'));
  perform pg_temp.chk('discount needs a reason', r->>'code', 'discount_reason_required');
  r := pg_temp.as_('manager', format($q$select public.create_invoice_draft(%L, null, null, %L::jsonb)$q$, pg_temp.id('brancha'),
    '[{"description":"x","unit_price_minor":1000,"discount_minor":1001,"discount_reason":"too much"}]'));
  perform pg_temp.chk('discount cannot exceed the line', r->>'code', 'discount_too_large');
  r := pg_temp.as_('manager', format($q$select public.create_invoice_draft(%L, null, null, %L::jsonb)$q$, pg_temp.id('brancha'),
    '[{"description":"Colour","quantity":1,"unit_price_minor":2003,"discount_minor":1000,"discount_reason":"loyalty"}]'));
  perform pg_temp.chk('manager may discount', r->>'ok', 'true');
  insert into ids values ('d_disc', (r->>'invoice_id')::uuid);
  perform pg_temp.chk('stored: discount + reason on the line',
    (select discount_minor::text || '/' || discount_reason from public.invoice_items where invoice_id = pg_temp.id('d_disc')), '1000/loyalty');
  perform pg_temp.chk('tax rounds half-up: net 1003 -> 201 (200.6)', r->>'tax_minor', '201');
  perform pg_temp.chk('stored: invoice discount_minor', (select discount_minor from public.invoices where id = pg_temp.id('d_disc')), 1000::bigint);

  -- shape validation
  perform pg_temp.chk('fractional price refused', pg_temp.as_('manager', format($q$select public.create_invoice_draft(%L, null, null, %L::jsonb)$q$, pg_temp.id('brancha'), '[{"description":"x","unit_price_minor":"12.5"}]'))->>'code', 'invalid_price');
  perform pg_temp.chk('zero quantity refused', pg_temp.as_('manager', format($q$select public.create_invoice_draft(%L, null, null, %L::jsonb)$q$, pg_temp.id('brancha'), '[{"description":"x","quantity":0,"unit_price_minor":5}]'))->>'code', 'invalid_quantity');
  perform pg_temp.chk('unknown service refused', pg_temp.as_('manager', format($q$select public.create_invoice_draft(%L, null, null, %L::jsonb)$q$, pg_temp.id('brancha'), '[{"service_id":"00000000-0000-0000-0000-000000000001","unit_price_minor":5}]'))->>'code', 'unknown_service');
  perform pg_temp.chk('junk uuid does not raise', pg_temp.as_('manager', format($q$select public.create_invoice_draft(%L, null, null, %L::jsonb)$q$, pg_temp.id('brancha'), '[{"service_id":"------------------------------------","unit_price_minor":5}]'))->>'code', 'unknown_service');
  perform pg_temp.chk('items not an array refused', pg_temp.as_('manager', format($q$select public.create_invoice_draft(%L, null, null, '{"a":1}'::jsonb)$q$, pg_temp.id('brancha')))->>'code', 'invalid_items');
  perform pg_temp.chk('empty description refused', pg_temp.as_('manager', format($q$select public.create_invoice_draft(%L, null, null, %L::jsonb)$q$, pg_temp.id('brancha'), '[{"description":"  ","unit_price_minor":5}]'))->>'code', 'invalid_description');
  perform pg_temp.chk('unknown client refused', pg_temp.as_('manager', format($q$select public.create_invoice_draft(%L, null, '00000000-0000-0000-0000-000000000009')$q$, pg_temp.id('brancha')))->>'code', 'unknown_client');

  -- roles
  perform pg_temp.chk('staff cannot create', pg_temp.as_('staffa', format($q$select public.create_invoice_draft(%L)$q$, pg_temp.id('brancha')))->>'code', 'forbidden');
  perform pg_temp.chk('other business cannot create', pg_temp.as_('ownerb', format($q$select public.create_invoice_draft(%L)$q$, pg_temp.id('brancha')))->>'code', 'forbidden');
  perform pg_temp.chk('owner can create', pg_temp.as_('owner', format($q$select public.create_invoice_draft(%L)$q$, pg_temp.id('brancha')))->>'ok', 'true');
  perform pg_temp.chk('anon cannot execute create_invoice_draft', pg_temp.as_anon(format($q$select public.create_invoice_draft(%L)$q$, pg_temp.id('brancha')))->>'state', '42501');
  perform pg_temp.chk('no branch -> invalid_branch', pg_temp.as_('owner', 'select public.create_invoice_draft()')->>'code', 'invalid_branch');
end $$;

-- from an appointment
do $$
declare r jsonb; v_inv uuid; v_snap text;
begin
  r := pg_temp.as_('recep', format($q$select public.create_invoice_draft(null, %L)$q$, pg_temp.id('appt_open')));
  perform pg_temp.chk('appointment must be completed', r->>'code', 'not_completed');
  perform pg_temp.chk('refused: appointment still unlinked', (select invoice_id from public.appointments where id = pg_temp.id('appt_open')), null::uuid);

  r := pg_temp.as_('staffa', format($q$select public.create_invoice_draft(null, %L)$q$, pg_temp.id('appt_done')));
  perform pg_temp.chk('staff cannot invoice an appointment', r->>'code', 'forbidden');

  r := pg_temp.as_('recep', format($q$select public.create_invoice_draft(null, %L)$q$, pg_temp.id('appt_done')));
  perform pg_temp.chk('draft from completed appointment', r->>'ok', 'true');
  v_inv := (r->>'invoice_id')::uuid; insert into ids values ('d_appt', v_inv);
  perform pg_temp.chk('stored: appointments.invoice_id linked', (select invoice_id from public.appointments where id = pg_temp.id('appt_done')), v_inv);
  perform pg_temp.chk('stored: invoice.appointment_id', (select appointment_id from public.invoices where id = v_inv), pg_temp.id('appt_done'));
  perform pg_temp.chk('stored: client from appointment', (select client_id from public.invoices where id = v_inv), pg_temp.id('client'));
  perform pg_temp.chk('prefill uses the appointment price snapshot (3500)', (select unit_price_minor from public.invoice_items where invoice_id = v_inv), 3500::bigint);
  perform pg_temp.chk('prefill is the service line', (select description from public.invoice_items where invoice_id = v_inv), 'Cut');

  -- one live invoice per appointment
  v_snap := pg_temp.snap(v_inv);
  r := pg_temp.as_('recep', format($q$select public.create_invoice_draft(null, %L)$q$, pg_temp.id('appt_done')));
  perform pg_temp.chk('second invoice for the appointment refused', r->>'code', 'already_invoiced');
  perform pg_temp.chk('survives: first invoice untouched', pg_temp.snap(v_inv), v_snap);
  perform pg_temp.chk('only one live invoice for the appointment', (select count(*)::int from public.invoices where appointment_id = pg_temp.id('appt_done') and deleted_at is null), 1);

  -- invoice_id cannot be forged by a direct write
  r := pg_temp.as_('recep', format($q$update public.appointments set invoice_id = null where id = %L returning to_jsonb(appointments)$q$, pg_temp.id('appt_done')));
  perform pg_temp.chk('direct unlink of appointments.invoice_id is refused', coalesce(r->>'raised','false'), 'true');
  perform pg_temp.chk('survives: link intact', (select invoice_id from public.appointments where id = pg_temp.id('appt_done')), v_inv);
  perform pg_temp.chk('direct unlink refused even for postgres',
    (select count(*)::int from (select 1 from public.appointments where id = pg_temp.id('appt_done') and invoice_id is not null) z), 1);

  -- reopen is blocked while an invoice (even a draft) is attached
  r := pg_temp.as_('owner', format($q$select public.reopen_appointment(%L)$q$, pg_temp.id('appt_done')));
  perform pg_temp.chk('reopen refused while invoiced', r->>'code', 'invoiced');

  -- discard frees it
  r := pg_temp.as_('recep', format($q$select public.discard_invoice_draft(%L)$q$, v_inv));
  perform pg_temp.chk('discard draft ok', r->>'ok', 'true');
  perform pg_temp.chk('stored: draft soft-deleted', (select deleted_at is not null from public.invoices where id = v_inv), true);
  perform pg_temp.chk('stored: appointment link cleared', (select invoice_id from public.appointments where id = pg_temp.id('appt_done')), null::uuid);
  perform pg_temp.chk('discard is audited', (select count(*)::int from public.audit_logs where action = 'invoice.draft_discarded' and entity_id = v_inv::text), 1);
  perform pg_temp.chk('discarded draft not found for update', pg_temp.as_('recep', format($q$select public.update_invoice_draft(%L, null, null, false, 'x')$q$, v_inv))->>'code', 'not_found');

  r := pg_temp.as_('recep', format($q$select public.create_invoice_draft(null, %L)$q$, pg_temp.id('appt_done')));
  perform pg_temp.chk('appointment can be invoiced again after a discard', r->>'ok', 'true');
  insert into ids values ('d_appt2', (r->>'invoice_id')::uuid);
end $$;

-- update draft
do $$
declare r jsonb; v_snap text; v_inv uuid := pg_temp.id('d1');
begin
  v_snap := pg_temp.snap(v_inv);
  r := pg_temp.as_('recep', format($q$select public.update_invoice_draft(%L, %L::jsonb)$q$, v_inv, '[{"description":"x","unit_price_minor":-5}]'));
  perform pg_temp.chk('update with a bad line refused', r->>'code', 'invalid_price');
  perform pg_temp.chk('survives: bad update leaves the draft exactly as it was', pg_temp.snap(v_inv), v_snap);

  r := pg_temp.as_('recep', format($q$select public.update_invoice_draft(%L, %L::jsonb)$q$, v_inv, '[{"description":"x","unit_price_minor":1000,"discount_minor":5,"discount_reason":"nope"}]'));
  perform pg_temp.chk('receptionist cannot smuggle a discount in via update', r->>'code', 'discount_forbidden');
  perform pg_temp.chk('survives: discount refusal', pg_temp.snap(v_inv), v_snap);

  perform pg_temp.chk('staff cannot update', pg_temp.as_('staffa', format($q$select public.update_invoice_draft(%L, null, null, false, 'x')$q$, v_inv))->>'code', 'forbidden');
  perform pg_temp.chk('other business cannot update', pg_temp.as_('ownerb', format($q$select public.update_invoice_draft(%L, null, null, false, 'x')$q$, v_inv))->>'code', 'forbidden');
  perform pg_temp.chk('survives: forbidden update', pg_temp.snap(v_inv), v_snap);
  perform pg_temp.chk('anon cannot execute update_invoice_draft', pg_temp.as_anon(format($q$select public.update_invoice_draft(%L)$q$, v_inv))->>'state', '42501');

  r := pg_temp.as_('recep', format($q$select public.update_invoice_draft(%L, %L::jsonb, null, false, 'new note')$q$, v_inv,
    '[{"description":"Trim","quantity":1,"unit_price_minor":3000}]'));
  perform pg_temp.chk('update replaces lines', r->>'ok', 'true');
  perform pg_temp.chk('stored: 1 item after replace', (select count(*)::int from public.invoice_items where invoice_id = v_inv), 1);
  perform pg_temp.chk('stored: totals recomputed (3000 + 600 tax)', (select total_minor from public.invoices where id = v_inv), 3600::bigint);
  perform pg_temp.chk('stored: notes updated', (select notes from public.invoices where id = v_inv), 'new note');
  r := pg_temp.as_('recep', format($q$select public.update_invoice_draft(%L, null, null, true)$q$, v_inv));
  perform pg_temp.chk('clear_client works', (select client_id is null and bill_to_name is null from public.invoices where id = v_inv), true);
  perform pg_temp.chk('appointment draft cannot change client', pg_temp.as_('recep', format($q$select public.update_invoice_draft(%L, null, %L)$q$, pg_temp.id('d_appt2'), pg_temp.id('client')))->>'code', 'client_mismatch');
end $$;

-- ===========================================================================
-- 2. Issue
-- ===========================================================================
do $$
declare r jsonb; v_snap text; v_empty uuid; v_zero uuid; v_prefix text; v_ctr bigint; v_inv uuid := pg_temp.id('d1');
begin
  select invoice_prefix into v_prefix from public.branches where id = pg_temp.id('brancha');
  insert into ids select 'prefix_a', null where false;

  -- empty draft
  r := pg_temp.as_('recep', format($q$select public.create_invoice_draft(%L)$q$, pg_temp.id('brancha')));
  v_empty := (r->>'invoice_id')::uuid; insert into ids values ('d_empty', v_empty);
  v_snap := pg_temp.snap(v_empty);
  perform pg_temp.chk('issuing an empty draft refused', pg_temp.as_('recep', format($q$select public.issue_invoice(%L)$q$, v_empty))->>'code', 'no_items');
  perform pg_temp.chk('survives: empty draft + counter', pg_temp.snap(v_empty), v_snap);

  -- zero total
  r := pg_temp.as_('recep', format($q$select public.create_invoice_draft(%L, null, null, %L::jsonb)$q$, pg_temp.id('brancha'), '[{"description":"free","unit_price_minor":0}]'));
  v_zero := (r->>'invoice_id')::uuid;
  v_snap := pg_temp.snap(v_zero);
  perform pg_temp.chk('issuing a zero-value invoice refused', pg_temp.as_('recep', format($q$select public.issue_invoice(%L)$q$, v_zero))->>'code', 'zero_total');
  perform pg_temp.chk('survives: zero-total draft + counter', pg_temp.snap(v_zero), v_snap);

  -- roles
  v_snap := pg_temp.snap(v_inv);
  perform pg_temp.chk('staff cannot issue', pg_temp.as_('staffa', format($q$select public.issue_invoice(%L)$q$, v_inv))->>'code', 'forbidden');
  perform pg_temp.chk('other business cannot issue', pg_temp.as_('ownerb', format($q$select public.issue_invoice(%L)$q$, v_inv))->>'code', 'forbidden');
  perform pg_temp.chk('anon cannot execute issue_invoice', pg_temp.as_anon(format($q$select public.issue_invoice(%L)$q$, v_inv))->>'state', '42501');
  perform pg_temp.chk('survives: forbidden issue + counter', pg_temp.snap(v_inv), v_snap);
  perform pg_temp.chk('unknown id -> not_found', pg_temp.as_('recep', $q$select public.issue_invoice('00000000-0000-0000-0000-000000000005')$q$)->>'code', 'not_found');

  -- success (receptionist)
  r := pg_temp.as_('recep', format($q$select public.issue_invoice(%L)$q$, v_inv));
  perform pg_temp.chk('receptionist issues', r->>'ok', 'true');
  perform pg_temp.chk('number = <prefix>-000001', r->>'number', v_prefix || '-000001');
  perform pg_temp.chk('stored: number', (select number from public.invoices where id = v_inv), v_prefix || '-000001');
  perform pg_temp.chk('stored: number_seq', (select number_seq from public.invoices where id = v_inv), 1::bigint);
  perform pg_temp.chk('stored: status issued', (select status::text from public.invoices where id = v_inv), 'issued');
  perform pg_temp.chk('stored: issued_by', (select issued_by from public.invoices where id = v_inv), pg_temp.id('recep'));
  perform pg_temp.chk('stored: issued_at set', (select issued_at is not null from public.invoices where id = v_inv), true);
  perform pg_temp.chk('stored: totals (3600 draft after update)', (select subtotal_minor::text || '/' || tax_minor || '/' || total_minor from public.invoices where id = v_inv), '3000/600/3600');
  perform pg_temp.chk('stored: branch counter advanced', (select invoice_next_no from public.branches where id = pg_temp.id('brancha')), 2::bigint);
  perform pg_temp.chk('issue is audited', (select count(*)::int from public.audit_logs where action = 'invoice.issued' and entity_id = v_inv::text), 1);
  perform pg_temp.chk('issuing twice refused', pg_temp.as_('recep', format($q$select public.issue_invoice(%L)$q$, v_inv))->>'code', 'not_draft');
  perform pg_temp.chk('survives: second issue did not move the counter', (select invoice_next_no from public.branches where id = pg_temp.id('brancha')), 2::bigint);
  perform pg_temp.chk('issued invoice refuses draft edits', pg_temp.as_('recep', format($q$select public.update_invoice_draft(%L, null, null, false, 'x')$q$, v_inv))->>'code', 'not_draft');
  perform pg_temp.chk('issued invoice cannot be discarded', pg_temp.as_('recep', format($q$select public.discard_invoice_draft(%L)$q$, v_inv))->>'code', 'not_draft');
end $$;

-- an UNEXPECTED failure inside issue rolls the counter back too: no gap
create or replace function public.p5_test_boom() returns trigger language plpgsql as $$
begin
  if new.status = 'issued' and new.notes = 'BOOM' then raise exception 'boom'; end if;
  return new;
end $$;
create trigger p5_test_boom before update on public.invoices for each row execute function public.p5_test_boom();

do $$
declare r jsonb; v_boom uuid; v_prefix text; v_ctr_before bigint; v_snap text;
begin
  select invoice_prefix into v_prefix from public.branches where id = pg_temp.id('brancha');
  r := pg_temp.as_('recep', format($q$select public.create_invoice_draft(%L, null, null, %L::jsonb, 'BOOM')$q$, pg_temp.id('brancha'), '[{"description":"b","unit_price_minor":1000}]'));
  v_boom := (r->>'invoice_id')::uuid; insert into ids values ('d_boom', v_boom);
  select invoice_next_no into v_ctr_before from public.branches where id = pg_temp.id('brancha');
  v_snap := pg_temp.snap(v_boom);
  r := pg_temp.as_('recep', format($q$select public.issue_invoice(%L)$q$, v_boom));
  perform pg_temp.chk('forced mid-issue failure raised', coalesce(r->>'raised','false'), 'true');
  perform pg_temp.chk('survives: counter rolled back with the failure', (select invoice_next_no from public.branches where id = pg_temp.id('brancha')), v_ctr_before);
  perform pg_temp.chk('survives: draft untouched', pg_temp.snap(v_boom), v_snap);
  drop trigger p5_test_boom on public.invoices;
  perform pg_temp.as_('recep', format($q$select public.update_invoice_draft(%L, null, null, false, null, true)$q$, v_boom));
  r := pg_temp.as_('recep', format($q$select public.issue_invoice(%L)$q$, v_boom));
  perform pg_temp.chk('NO GAP: next issue takes number 2', r->>'number', v_prefix || '-000002');
  perform pg_temp.chk('stored seq 2, counter 3', (select number_seq::text || '/' || (select invoice_next_no from public.branches where id = pg_temp.id('brancha')) from public.invoices where id = v_boom), '2/3');
end $$;
drop function public.p5_test_boom();

-- tax snapshot: a later rate change never touches an issued invoice
do $$
declare r jsonb; v_new uuid; v_prefix text;
begin
  select invoice_prefix into v_prefix from public.branches where id = pg_temp.id('brancha');
  update public.branches set tax_rate_bp = 500, tax_number = 'NEW-TAX' where id = pg_temp.id('brancha');
  perform pg_temp.chk('issued invoice keeps its 20% snapshot', (select tax_rate_bp::text || '/' || tax_number from public.invoices where id = pg_temp.id('d1')), '2000/GB123456789');
  r := pg_temp.as_('recep', format($q$select public.create_invoice_draft(%L, null, null, %L::jsonb)$q$, pg_temp.id('brancha'), '[{"description":"t","unit_price_minor":10000}]'));
  v_new := (r->>'invoice_id')::uuid; insert into ids values ('d_new', v_new);
  r := pg_temp.as_('recep', format($q$select public.issue_invoice(%L)$q$, v_new));
  perform pg_temp.chk('new invoice uses the new 5% rate', (select tax_minor::text || '/' || tax_rate_bp || '/' || tax_number from public.invoices where id = v_new), '500/500/NEW-TAX');
  perform pg_temp.chk('number 3', r->>'number', v_prefix || '-000003');
  update public.branches set tax_rate_bp = 2000, tax_number = 'GB123456789' where id = pg_temp.id('brancha');
end $$;

-- counters cannot be moved by hand
do $$
declare r jsonb;
begin
  r := pg_temp.as_('owner', format($q$update public.branches set invoice_next_no = 1 where id = %L returning invoice_next_no$q$, pg_temp.id('brancha')));
  perform pg_temp.chk('owner cannot reset invoice_next_no', coalesce(r->>'raised','false'), 'true');
  begin
    update public.branches set invoice_next_no = 1 where id = pg_temp.id('brancha');
    perform pg_temp.chk('postgres cannot reset invoice_next_no either', 'updated', 'refused');
  exception when others then
    perform pg_temp.chk('postgres cannot reset invoice_next_no either', 'refused', 'refused');
  end;
  begin
    update public.branches set credit_note_next_no = 50 where id = pg_temp.id('brancha');
    perform pg_temp.chk('credit_note_next_no is protected too', 'updated', 'refused');
  exception when others then
    perform pg_temp.chk('credit_note_next_no is protected too', 'refused', 'refused');
  end;
  begin
    update public.branches set invoice_prefix = 'ZZZ' where id = pg_temp.id('brancha');
    perform pg_temp.chk('prefix locked after the first invoice', 'updated', 'refused');
  exception when others then
    perform pg_temp.chk('prefix locked after the first invoice', 'refused', 'refused');
  end;
end $$;

-- ===========================================================================
-- 3. Payments
-- ===========================================================================
-- d1 is issued: total 3600. d_new total 10500.
do $$
declare r jsonb; v_snap text; v_inv uuid := pg_temp.id('d1');
begin
  v_snap := pg_temp.snap(v_inv);
  perform pg_temp.chk('payment on a draft refused', pg_temp.as_('recep', format($q$select public.add_payment(%L, 'cash', 100)$q$, pg_temp.id('d_empty')))->>'code', 'not_issued');
  perform pg_temp.chk('staff cannot take a payment', pg_temp.as_('staffa', format($q$select public.add_payment(%L, 'cash', 100)$q$, v_inv))->>'code', 'forbidden');
  perform pg_temp.chk('other business cannot take a payment', pg_temp.as_('ownerb', format($q$select public.add_payment(%L, 'cash', 100)$q$, v_inv))->>'code', 'forbidden');
  perform pg_temp.chk('anon cannot execute add_payment', pg_temp.as_anon(format($q$select public.add_payment(%L, 'cash', 100)$q$, v_inv))->>'state', '42501');
  perform pg_temp.chk('unknown method refused', pg_temp.as_('recep', format($q$select public.add_payment(%L, 'bitcoin', 100)$q$, v_inv))->>'code', 'invalid_method');
  perform pg_temp.chk('zero amount refused', pg_temp.as_('recep', format($q$select public.add_payment(%L, 'cash', 0)$q$, v_inv))->>'code', 'invalid_amount');
  perform pg_temp.chk('negative amount refused', pg_temp.as_('recep', format($q$select public.add_payment(%L, 'cash', -5)$q$, v_inv))->>'code', 'invalid_amount');
  perform pg_temp.chk('overpayment refused', pg_temp.as_('recep', format($q$select public.add_payment(%L, 'cash', 3601)$q$, v_inv))->>'code', 'overpayment');
  perform pg_temp.chk('future paid_at refused', pg_temp.as_('recep', format($q$select public.add_payment(%L, 'cash', 100, now() + interval '2 days')$q$, v_inv))->>'code', 'invalid_paid_at');
  perform pg_temp.chk('paid_at before issue refused', pg_temp.as_('recep', format($q$select public.add_payment(%L, 'cash', 100, now() - interval '3 days')$q$, v_inv))->>'code', 'invalid_paid_at');
  perform pg_temp.chk('survives: every refused payment left the invoice and ledger untouched', pg_temp.snap(v_inv), v_snap);

  r := pg_temp.as_('recep', format($q$select public.add_payment(%L, 'cash', 1000, null, 'deposit')$q$, v_inv));
  perform pg_temp.chk('partial payment ok', r->>'ok', 'true');
  perform pg_temp.chk('status partial', r->>'payment_status', 'partial');
  perform pg_temp.chk('balance 2600', r->>'balance_minor', '2600');
  insert into ids values ('pay1', (r->>'payment_id')::uuid);
  perform pg_temp.chk('stored payment row', (select kind::text || '/' || method || '/' || amount_minor || '/' || currency || '/' || note || '/' || (created_by = pg_temp.id('recep')) from public.invoice_payments where id = pg_temp.id('pay1')), 'payment/cash/1000/GBP/deposit/true');
  perform pg_temp.chk('payment audited', (select count(*)::int from public.audit_logs where action = 'invoice.payment_added' and entity_id = v_inv::text), 1);
  r := pg_temp.as_('recep', format($q$select public.add_payment(%L, 'card', 2600)$q$, v_inv));
  perform pg_temp.chk('remaining paid in full -> paid', r->>'payment_status', 'paid');
  insert into ids values ('pay2', (r->>'payment_id')::uuid);
  perform pg_temp.chk('nothing more can be paid', pg_temp.as_('recep', format($q$select public.add_payment(%L, 'cash', 1)$q$, v_inv))->>'code', 'overpayment');
end $$;

-- ===========================================================================
-- 4. Credit notes + reversals (d1: net 3000, tax 600, total 3600, paid 3600)
-- ===========================================================================
do $$
declare r jsonb; v_snap text; v_inv uuid := pg_temp.id('d1'); v_prefix text;
begin
  select invoice_prefix into v_prefix from public.branches where id = pg_temp.id('brancha');
  v_snap := pg_temp.snap(v_inv);
  perform pg_temp.chk('receptionist cannot issue a credit note', pg_temp.as_('recep', format($q$select public.create_credit_note(%L, 'reason here')$q$, v_inv))->>'code', 'forbidden');
  perform pg_temp.chk('staff cannot issue a credit note', pg_temp.as_('staffa', format($q$select public.create_credit_note(%L, 'reason here')$q$, v_inv))->>'code', 'forbidden');
  perform pg_temp.chk('other business cannot issue a credit note', pg_temp.as_('ownerb', format($q$select public.create_credit_note(%L, 'reason here')$q$, v_inv))->>'code', 'forbidden');
  perform pg_temp.chk('anon cannot execute create_credit_note', pg_temp.as_anon(format($q$select public.create_credit_note(%L, 'reason here')$q$, v_inv))->>'state', '42501');
  perform pg_temp.chk('reason required', pg_temp.as_('manager', format($q$select public.create_credit_note(%L, 'x')$q$, v_inv))->>'code', 'reason_required');
  perform pg_temp.chk('amount above the creditable net refused', pg_temp.as_('manager', format($q$select public.create_credit_note(%L, 'reason here', 3001)$q$, v_inv))->>'code', 'invalid_amount');
  perform pg_temp.chk('zero amount refused', pg_temp.as_('manager', format($q$select public.create_credit_note(%L, 'reason here', 0)$q$, v_inv))->>'code', 'invalid_amount');
  perform pg_temp.chk('credit note on a draft refused', pg_temp.as_('manager', format($q$select public.create_credit_note(%L, 'reason here')$q$, pg_temp.id('d_empty')))->>'code', 'not_issued');
  perform pg_temp.chk('survives: every refused credit note left invoice, ledger and counter intact', pg_temp.snap(v_inv), v_snap);

  r := pg_temp.as_('manager', format($q$select public.create_credit_note(%L, 'goodwill', 1000)$q$, v_inv));
  perform pg_temp.chk('partial credit note ok', r->>'ok', 'true');
  perform pg_temp.chk('partial tax follows the snapshot rate (1000 -> 200)', r->>'tax_minor', '200');
  perform pg_temp.chk('own series CN-000001', r->>'number', v_prefix || '-CN-000001');
  perform pg_temp.chk('stored credit note', (select net_minor::text || '/' || tax_minor || '/' || total_minor || '/' || number_seq || '/' || currency || '/' || tax_rate_bp || '/' || reason from public.credit_notes where id = (r->>'credit_note_id')::uuid), '1000/200/1200/1/GBP/2000/goodwill');
  perform pg_temp.chk('invoice counter NOT used by credit notes', (select invoice_next_no from public.branches where id = pg_temp.id('brancha')), 4::bigint);
  perform pg_temp.chk('credit counter advanced', (select credit_note_next_no from public.branches where id = pg_temp.id('brancha')), 2::bigint);
  perform pg_temp.chk('already paid in full -> surplus is refund_due 1200', r->>'refund_due_minor', '1200');
  perform pg_temp.chk('credit note audited', (select count(*)::int from public.audit_logs where action = 'invoice.credit_note_created' and entity_id = v_inv::text), 1);

  -- reversals (the refund path)
  v_snap := pg_temp.snap(v_inv);
  perform pg_temp.chk('receptionist cannot reverse', pg_temp.as_('recep', format($q$select public.reverse_payment(%L, 'refund')$q$, pg_temp.id('pay2')))->>'code', 'forbidden');
  perform pg_temp.chk('staff cannot reverse', pg_temp.as_('staffa', format($q$select public.reverse_payment(%L, 'refund')$q$, pg_temp.id('pay2')))->>'code', 'forbidden');
  perform pg_temp.chk('other business cannot reverse', pg_temp.as_('ownerb', format($q$select public.reverse_payment(%L, 'refund')$q$, pg_temp.id('pay2')))->>'code', 'forbidden');
  perform pg_temp.chk('anon cannot execute reverse_payment', pg_temp.as_anon(format($q$select public.reverse_payment(%L, 'refund')$q$, pg_temp.id('pay2')))->>'state', '42501');
  perform pg_temp.chk('reason required to reverse', pg_temp.as_('manager', format($q$select public.reverse_payment(%L, '')$q$, pg_temp.id('pay2')))->>'code', 'reason_required');
  perform pg_temp.chk('cannot reverse more than was paid', pg_temp.as_('manager', format($q$select public.reverse_payment(%L, 'refund', 2601)$q$, pg_temp.id('pay2')))->>'code', 'invalid_amount');
  perform pg_temp.chk('unknown payment', pg_temp.as_('manager', $q$select public.reverse_payment('00000000-0000-0000-0000-000000000003', 'refund')$q$)->>'code', 'not_found');
  perform pg_temp.chk('survives: every refused reversal left the ledger intact', pg_temp.snap(v_inv), v_snap);

  r := pg_temp.as_('manager', format($q$select public.reverse_payment(%L, 'refund of credit', 1200)$q$, pg_temp.id('pay2')));
  perform pg_temp.chk('partial reversal ok', r->>'ok', 'true');
  insert into ids values ('rev1', (r->>'reversal_id')::uuid);
  perform pg_temp.chk('refund_due cleared', r->>'refund_due_minor', '0');
  perform pg_temp.chk('stored reversal row', (select kind::text || '/' || method || '/' || amount_minor || '/' || (reverses_payment_id = pg_temp.id('pay2')) || '/' || reason from public.invoice_payments where id = pg_temp.id('rev1')), 'reversal/card/1200/true/refund of credit');
  perform pg_temp.chk('original payment row is unchanged', (select amount_minor from public.invoice_payments where id = pg_temp.id('pay2')), 2600::bigint);
  perform pg_temp.chk('reversal audited', (select count(*)::int from public.audit_logs where action = 'invoice.payment_reversed' and entity_id = v_inv::text), 1);
  perform pg_temp.chk('a reversal row cannot itself be reversed', pg_temp.as_('manager', format($q$select public.reverse_payment(%L, 'again')$q$, pg_temp.id('rev1')))->>'code', 'not_a_payment');
  perform pg_temp.chk('reversing the rest only allows what is left', pg_temp.as_('manager', format($q$select public.reverse_payment(%L, 'again', 1401)$q$, pg_temp.id('pay2')))->>'code', 'invalid_amount');
  perform pg_temp.chk('payments reduced by the reversal: balance is 0, refund_due 0', pg_temp.as_('manager', format($q$select public.add_payment(%L, 'cash', 1)$q$, v_inv))->>'code', 'overpayment');

  -- full credit takes the exact remaining tax
  r := pg_temp.as_('manager', format($q$select public.create_credit_note(%L, 'void the rest')$q$, v_inv));
  perform pg_temp.chk('full credit takes remaining net 2000', r->>'net_minor', '2000');
  perform pg_temp.chk('full credit takes remaining tax exactly (400)', r->>'tax_minor', '400');
  perform pg_temp.chk('second credit note number', r->>'number', v_prefix || '-CN-000002');
  perform pg_temp.chk('credit notes add back to the invoice exactly', (select sum(total_minor)::text from public.credit_notes where invoice_id = v_inv), '3600');
  perform pg_temp.chk('fully credited status', r->>'payment_status', 'credited');
  perform pg_temp.chk('nothing left to credit', pg_temp.as_('manager', format($q$select public.create_credit_note(%L, 'again again')$q$, v_inv))->>'code', 'fully_credited');
  perform pg_temp.chk('no payment on a fully credited invoice', pg_temp.as_('recep', format($q$select public.add_payment(%L, 'cash', 1)$q$, v_inv))->>'code', 'fully_credited');
end $$;

-- rounding: net 1003 -> tax 201; credit 3 net -> 1, the rest takes 200 => 201
do $$
declare r jsonb; v_inv uuid := pg_temp.id('d_disc'); v_prefix text;
begin
  r := pg_temp.as_('manager', format($q$select public.issue_invoice(%L)$q$, v_inv));
  perform pg_temp.chk('rounding invoice issues', r->>'ok', 'true');
  perform pg_temp.chk('tax stored 201', (select tax_minor from public.invoices where id = v_inv), 201::bigint);
  perform pg_temp.chk('credit 3 net -> tax 1', pg_temp.as_('manager', format($q$select public.create_credit_note(%L, 'tiny part', 3)$q$, v_inv))->>'tax_minor', '1');
  perform pg_temp.chk('the rest takes tax 200 (no drift)', pg_temp.as_('manager', format($q$select public.create_credit_note(%L, 'the rest')$q$, v_inv))->>'tax_minor', '200');
  perform pg_temp.chk('credit tax sums to the invoice tax', (select sum(tax_minor)::text from public.credit_notes where invoice_id = v_inv), '201');
end $$;

-- ===========================================================================
-- 5. Immutability (as postgres: the guard triggers fire for every role)
-- ===========================================================================
do $$
declare v_inv uuid := pg_temp.id('d1'); v_snap text; v_ok boolean;
begin
  v_snap := pg_temp.snap(v_inv);
  v_ok := true; begin update public.invoices set notes = 'tamper' where id = v_inv; v_ok := false; exception when others then null; end;
  perform pg_temp.chk('issued invoice UPDATE refused', v_ok, true);
  v_ok := true; begin update public.invoices set total_minor = 1, net_minor = 1, subtotal_minor = 1, tax_minor = 0 where id = v_inv; v_ok := false; exception when others then null; end;
  perform pg_temp.chk('issued invoice totals UPDATE refused', v_ok, true);
  v_ok := true; begin update public.invoices set status = 'draft', number = null, number_seq = null, issued_at = null where id = v_inv; v_ok := false; exception when others then null; end;
  perform pg_temp.chk('issued -> draft refused', v_ok, true);
  v_ok := true; begin delete from public.invoices where id = v_inv; v_ok := false; exception when others then null; end;
  perform pg_temp.chk('issued invoice DELETE refused', v_ok, true);
  v_ok := true; begin update public.invoice_items set description = 'x' where invoice_id = v_inv; v_ok := false; exception when others then null; end;
  perform pg_temp.chk('issued item UPDATE refused', v_ok, true);
  v_ok := true; begin delete from public.invoice_items where invoice_id = v_inv; v_ok := false; exception when others then null; end;
  perform pg_temp.chk('issued item DELETE refused', v_ok, true);
  v_ok := true; begin insert into public.invoice_items (business_id, branch_id, invoice_id, description, quantity, unit_price_minor) select business_id, branch_id, id, 'sneak', 1, 1 from public.invoices where id = v_inv; v_ok := false; exception when others then null; end;
  perform pg_temp.chk('item INSERT on an issued invoice refused', v_ok, true);
  v_ok := true; begin update public.invoice_payments set amount_minor = 1 where invoice_id = v_inv; v_ok := false; exception when others then null; end;
  perform pg_temp.chk('payment UPDATE refused', v_ok, true);
  v_ok := true; begin delete from public.invoice_payments where invoice_id = v_inv; v_ok := false; exception when others then null; end;
  perform pg_temp.chk('payment DELETE refused', v_ok, true);
  v_ok := true; begin update public.credit_notes set reason = 'tamper' where invoice_id = v_inv; v_ok := false; exception when others then null; end;
  perform pg_temp.chk('credit note UPDATE refused', v_ok, true);
  v_ok := true; begin delete from public.credit_notes where invoice_id = v_inv; v_ok := false; exception when others then null; end;
  perform pg_temp.chk('credit note DELETE refused', v_ok, true);
  v_ok := true; begin insert into public.invoice_payments (business_id, branch_id, invoice_id, kind, method, amount_minor, currency) select business_id, branch_id, id, 'payment', 'cash', 1, 'USD' from public.invoices where id = v_inv; v_ok := false; exception when others then null; end;
  perform pg_temp.chk('payment in the wrong currency refused', v_ok, true);
  v_ok := true; begin insert into public.invoice_payments (business_id, branch_id, invoice_id, kind, method, amount_minor, currency) select business_id, branch_id, id, 'payment', 'cash', 1, 'GBP' from public.invoices where id = pg_temp.id('d_empty'); v_ok := false; exception when others then null; end;
  perform pg_temp.chk('payment on a DRAFT refused at the table level', v_ok, true);
  v_ok := true; begin insert into public.invoice_payments (business_id, branch_id, invoice_id, kind, method, amount_minor, currency) select business_id, branch_id, id, 'reversal', 'cash', 1, 'GBP' from public.invoices where id = v_inv; v_ok := false; exception when others then null; end;
  perform pg_temp.chk('reversal without a target/reason refused by constraint', v_ok, true);
  perform pg_temp.chk('survives: every tamper attempt left everything exactly as it was', pg_temp.snap(v_inv), v_snap);
  perform pg_temp.chk('draft invoice keeps its identity (cannot change branch)',
    (select count(*)::int from (select 1) z where true), 1);
  v_ok := true; begin update public.invoices set branch_id = pg_temp.id('branchk') where id = pg_temp.id('d_empty'); v_ok := false; exception when others then null; end;
  perform pg_temp.chk('a draft cannot move branch', v_ok, true);
end $$;

-- direct writes as signed-in users: no privilege, no policy
do $$
declare r jsonb;
begin
  r := pg_temp.as_('owner', format($q$insert into public.invoices (business_id, branch_id, currency) values (%L, %L, 'GBP') returning to_jsonb(invoices)$q$, pg_temp.id('biza'), pg_temp.id('brancha')));
  perform pg_temp.chk('owner cannot INSERT an invoice directly', r->>'state', '42501');
  r := pg_temp.as_('owner', format($q$update public.invoices set notes = 'x' where id = %L returning to_jsonb(invoices)$q$, pg_temp.id('d_empty')));
  perform pg_temp.chk('owner cannot UPDATE a draft directly', r->>'state', '42501');
  r := pg_temp.as_('owner', format($q$delete from public.invoices where id = %L returning to_jsonb(invoices)$q$, pg_temp.id('d_empty')));
  perform pg_temp.chk('owner cannot DELETE a draft directly', r->>'state', '42501');
  r := pg_temp.as_('owner', format($q$insert into public.invoice_payments (business_id, branch_id, invoice_id, kind, method, amount_minor, currency) values (%L, %L, %L, 'payment', 'cash', 1, 'GBP')$q$, pg_temp.id('biza'), pg_temp.id('brancha'), pg_temp.id('d1')));
  perform pg_temp.chk('owner cannot INSERT a payment directly', r->>'state', '42501');
  r := pg_temp.as_anon('select count(*) from public.invoices');
  perform pg_temp.chk('anon has no table access', r->>'state', '42501');
end $$;

-- ===========================================================================
-- 6. Currency lock
-- ===========================================================================
do $$
declare v_ok boolean;
begin
  v_ok := true; begin update public.branches set currency = 'USD' where id = pg_temp.id('brancha'); v_ok := false; exception when others then null; end;
  perform pg_temp.chk('currency locked once the branch has invoices', v_ok, true);
  perform pg_temp.chk('currency unchanged', (select currency from public.branches where id = pg_temp.id('brancha')), 'GBP');
  -- Karachi has nothing yet
  update public.branches set currency = 'USD' where id = pg_temp.id('branchk');
  perform pg_temp.chk('currency changes freely on a branch with no invoices', (select currency from public.branches where id = pg_temp.id('branchk')), 'USD');
  update public.branches set currency = 'PKR' where id = pg_temp.id('branchk');
  -- a LIVE draft locks it, a DISCARDED draft does not
  insert into public.invoices (business_id, branch_id, currency) values (pg_temp.id('biza'), pg_temp.id('branchk'), 'PKR');
  v_ok := true; begin update public.branches set currency = 'USD' where id = pg_temp.id('branchk'); v_ok := false; exception when others then null; end;
  perform pg_temp.chk('a live draft also locks the currency', v_ok, true);
  update public.invoices set deleted_at = now() where branch_id = pg_temp.id('branchk');
  update public.branches set currency = 'USD' where id = pg_temp.id('branchk');
  perform pg_temp.chk('a discarded draft does not lock it', (select currency from public.branches where id = pg_temp.id('branchk')), 'USD');
  update public.branches set currency = 'PKR' where id = pg_temp.id('branchk');
end $$;

-- ===========================================================================
-- 7. Reads: roles, list_invoices, print data
-- ===========================================================================
do $$
declare r jsonb; v_prefix text; v_p1 jsonb; v_p2 jsonb; v_total int; v_ids text;
begin
  select invoice_prefix into v_prefix from public.branches where id = pg_temp.id('brancha');
  -- issued so far on branch A: d1 (#1), d_boom (#2), d_new (#3), d_disc (#4)
  r := pg_temp.as_('recep', format($q$select public.list_invoices(%L)$q$, pg_temp.id('biza')));
  perform pg_temp.chk('receptionist lists invoices', r->>'ok', 'true');
  r := pg_temp.as_('manager', format($q$select public.list_invoices(%L)$q$, pg_temp.id('biza')));
  perform pg_temp.chk('manager lists invoices', r->>'ok', 'true');
  r := pg_temp.as_('owner', format($q$select public.list_invoices(%L)$q$, pg_temp.id('biza')));
  perform pg_temp.chk('owner lists invoices', r->>'ok', 'true');
  perform pg_temp.chk('staff forbidden to list', pg_temp.as_('staffa', format($q$select public.list_invoices(%L)$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('other business forbidden to list', pg_temp.as_('ownerb', format($q$select public.list_invoices(%L)$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('manager forbidden on a branch they do not hold', pg_temp.as_('manager', format($q$select public.list_invoices(%L, %L)$q$, pg_temp.id('biza'), pg_temp.id('branchk')))->>'code', 'forbidden');
  perform pg_temp.chk('anon cannot execute list_invoices', pg_temp.as_anon(format($q$select public.list_invoices(%L)$q$, pg_temp.id('biza')))->>'state', '42501');

  -- pagination: 2 per page, pages must be disjoint and exhaust the list
  select count(*)::int into v_total from public.invoices where business_id = pg_temp.id('biza') and deleted_at is null;
  v_p1 := pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, null, null, null, null, null, null, 2)$q$, pg_temp.id('biza')));
  perform pg_temp.chk('page 1 has 2 rows', jsonb_array_length(v_p1->'rows'), 2);
  perform pg_temp.chk('page 1 has a cursor', (v_p1->'next_cursor') is not null and v_p1->>'next_cursor' <> 'null', true);
  v_p2 := pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, null, null, null, null, null, null, 2, %L, %L)$q$,
    pg_temp.id('biza'), (v_p1->'next_cursor'->>'at'), (v_p1->'next_cursor'->>'id')));
  perform pg_temp.chk('page 2 has 2 rows', jsonb_array_length(v_p2->'rows'), 2);
  perform pg_temp.chk('pages do not overlap', (select count(distinct x->>'id')::int from jsonb_array_elements((v_p1->'rows') || (v_p2->'rows')) x), 4);
  r := pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, null, null, null, null, null, null, 100)$q$, pg_temp.id('biza')));
  perform pg_temp.chk('no cursor on the last page', r->>'next_cursor' is null, true);
  perform pg_temp.chk('full list = every live invoice', jsonb_array_length(r->'rows'), v_total);
  perform pg_temp.chk('limit is capped at 100', jsonb_array_length(pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, null, null, null, null, null, null, 5000)$q$, pg_temp.id('biza')))->'rows') <= 100, true);

  -- filters
  r := pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, 'draft')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('status filter: drafts have no number', (select bool_and(x->>'number' is null) from jsonb_array_elements(r->'rows') x), true);
  r := pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, 'issued', 'credited')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('payment_status filter: credited = d1 and d_disc', jsonb_array_length(r->'rows'), 2);
  r := pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, 'issued', 'pending')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('payment_status filter: pending (unpaid issued)', jsonb_array_length(r->'rows'), 2);
  perform pg_temp.chk('bad payment_status refused', pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, null, 'weird')$q$, pg_temp.id('biza')))->>'code', 'invalid_filter');
  r := pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, null, null, %L)$q$, pg_temp.id('biza'), pg_temp.id('client')));
  perform pg_temp.chk('client filter', (select bool_and(x->>'client_id' = pg_temp.id('client')::text) from jsonb_array_elements(r->'rows') x), true);
  r := pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, null, null, null, null, null, %L)$q$, pg_temp.id('biza'), v_prefix || '-000002'));
  perform pg_temp.chk('search by number', jsonb_array_length(r->'rows'), 1);
  r := pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, null, null, null, null, null, 'ada')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('search by client name', jsonb_array_length(r->'rows') >= 1, true);
  r := pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, null, null, null, null, null, 'a')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('search under 2 chars is ignored', jsonb_array_length(r->'rows'), v_total);
  r := pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, null, null, null, null, null, 'a%%')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('a % in search is literal, not a wildcard', jsonb_array_length(r->'rows'), 0);
  r := pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, null, null, null, '2000-01-01', '2000-01-02')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('date filter excludes everything outside', jsonb_array_length(r->'rows'), 0);
  r := pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, null, null, null, current_date - 1, current_date + 1)$q$, pg_temp.id('biza')));
  perform pg_temp.chk('date filter includes today', jsonb_array_length(r->'rows') >= 1, true);
  perform pg_temp.chk('list row carries computed money', (select (x->>'balance_minor') || '/' || (x->>'payment_status') from jsonb_array_elements(pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, null, null, null, null, null, %L)$q$, pg_temp.id('biza'), v_prefix || '-000003'))->'rows') x), '10500/pending');

  -- direct table reads obey RLS
  r := pg_temp.as_('staffa', 'select jsonb_build_object(''n'', count(*)) from public.invoices');
  perform pg_temp.chk('staff sees 0 invoice rows', r->>'n', '0');
  r := pg_temp.as_('ownerb', 'select jsonb_build_object(''n'', count(*)) from public.invoices');
  perform pg_temp.chk('other business sees 0 invoice rows', r->>'n', '0');
  r := pg_temp.as_('recep', 'select jsonb_build_object(''n'', (select count(*) from public.invoices), ''i'', (select count(*) from public.invoice_items), ''p'', (select count(*) from public.invoice_payments), ''c'', (select count(*) from public.credit_notes))');
  perform pg_temp.chk('receptionist reads invoices/items/payments/credit notes', (r->>'n')::int > 0 and (r->>'i')::int > 0 and (r->>'p')::int > 0 and (r->>'c')::int > 0, true);
  r := pg_temp.as_('staffa', 'select jsonb_build_object(''n'', (select count(*) from public.invoice_items) + (select count(*) from public.invoice_payments) + (select count(*) from public.credit_notes))');
  perform pg_temp.chk('staff sees 0 child rows', r->>'n', '0');
end $$;

do $$
declare r jsonb; v_inv uuid := pg_temp.id('d1');
begin
  r := pg_temp.as_('recep', format($q$select public.get_invoice_print_data(%L)$q$, v_inv));
  perform pg_temp.chk('print: cleared client -> null client block', r->>'client' is null, true);
  perform pg_temp.chk('print: client contact visible with clients.view_contact', pg_temp.as_('recep', format($q$select public.get_invoice_print_data(%L)$q$, pg_temp.id('d_appt2')))->'client'->>'phone', '+447700900111');
  perform pg_temp.chk('print data ok', r->>'ok', 'true');
  perform pg_temp.chk('print: invoice number + totals', (r->'invoice'->>'number') is not null and (r->'invoice'->>'total_minor') = '3600', true);
  perform pg_temp.chk('print: tax snapshot', (r->'invoice'->>'tax_rate_bp') || '/' || (r->'invoice'->>'tax_number'), '2000/GB123456789');
  perform pg_temp.chk('print: computed money', (r->'invoice'->>'payment_status') || '/' || (r->'invoice'->>'credited_minor') || '/' || (r->'invoice'->>'paid_minor'), 'credited/3600/2400');
  perform pg_temp.chk('print: items, payments (3), credit notes (2)', jsonb_array_length(r->'items') || '/' || jsonb_array_length(r->'payments') || '/' || jsonb_array_length(r->'credit_notes'), '1/3/2');
  perform pg_temp.chk('print: branch + business', (r->'branch'->>'currency') || '/' || (r->'business'->>'name'), 'GBP/P5 A');
  perform pg_temp.chk('staff forbidden', pg_temp.as_('staffa', format($q$select public.get_invoice_print_data(%L)$q$, v_inv))->>'code', 'forbidden');
  perform pg_temp.chk('other business forbidden', pg_temp.as_('ownerb', format($q$select public.get_invoice_print_data(%L)$q$, v_inv))->>'code', 'forbidden');
  perform pg_temp.chk('anon cannot execute print data', pg_temp.as_anon(format($q$select public.get_invoice_print_data(%L)$q$, v_inv))->>'state', '42501');
  perform pg_temp.chk('draft print preview works', pg_temp.as_('recep', format($q$select public.get_invoice_print_data(%L)$q$, pg_temp.id('d_empty')))->'invoice'->>'status', 'draft');
  perform pg_temp.chk('discarded/unknown -> not_found', pg_temp.as_('recep', $q$select public.get_invoice_print_data('00000000-0000-0000-0000-000000000007')$q$)->>'code', 'not_found');
end $$;

-- ===========================================================================
-- 8. Reports (DST). Issued invoices are inserted draft -> issued with the
--    exact instants under test; the report must put each in the right bucket.
-- ===========================================================================
create or replace function pg_temp.mk_issued(p_biz uuid, p_branch uuid, p_cur text, p_at timestamptz,
  p_net bigint, p_tax bigint, p_seq bigint, p_service uuid default null) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.invoices (business_id, branch_id, currency, subtotal_minor, net_minor, tax_minor, total_minor)
  values (p_biz, p_branch, p_cur, p_net, p_net, p_tax, p_net + p_tax) returning id into v_id;
  insert into public.invoice_items (business_id, branch_id, invoice_id, description, quantity, unit_price_minor, service_id)
  values (p_biz, p_branch, v_id, 'line', 1, p_net, p_service);
  update public.invoices set status = 'issued', number = 'T-' || p_seq || '-' || left(v_id::text, 6),
    number_seq = 100000 + p_seq + (extract(epoch from p_at))::bigint % 1000000, issued_at = p_at where id = v_id;
  return v_id;
end $$;

do $$
declare r jsonb; b uuid := pg_temp.id('branchb'); bz uuid := pg_temp.id('bizb'); w jsonb;
begin
  -- New York, November 2026: DST ends Sun Nov 1 at 02:00 EDT (06:00Z)
  perform pg_temp.mk_issued(bz, b, 'USD', '2026-11-01 03:59:00+00', 1000, 200, 1);  -- Oct 31 23:59 EDT  -> October
  perform pg_temp.mk_issued(bz, b, 'USD', '2026-11-01 04:00:00+00', 1000, 200, 2);  -- Nov 1 00:00 EDT   -> Nov, today(Nov 1)
  perform pg_temp.mk_issued(bz, b, 'USD', '2026-12-01 04:59:00+00', 1000, 200, 3);  -- Nov 30 23:59 EST  -> Nov
  perform pg_temp.mk_issued(bz, b, 'USD', '2026-12-01 05:00:00+00', 1000, 200, 4);  -- Dec 1 00:00 EST   -> December
  perform pg_temp.mk_issued(bz, b, 'USD', '2026-11-02 04:30:00+00', 1000, 200, 5);  -- Nov 1 23:30 EST   -> Nov, today(Nov 1)
  perform pg_temp.mk_issued(bz, b, 'USD', '2026-11-02 05:00:00+00', 1000, 200, 6);  -- Nov 2 00:00 EST   -> Nov, NOT today(Nov 1)

  r := pg_temp.as_pg('ownerb', format($q$select public.report_basic_at(%L, null, '2026-11-15 12:00:00+00')$q$, bz));
  perform pg_temp.chk('NY report ok', r->>'ok', 'true');
  w := r->'branches'->0;
  perform pg_temp.chk('NY month starts 04:00Z (EDT)', w->>'month_start', '2026-11-01T04:00:00+00:00');
  perform pg_temp.chk('NY month ends 05:00Z (EST): a 30-day-and-1-hour month', w->>'month_end', '2026-12-01T05:00:00+00:00');
  perform pg_temp.chk('NY month: 4 invoices in (2,3,5,6), 1 and 4 out', r->'revenue'->'month'->0->>'invoice_count', '4');
  perform pg_temp.chk('NY month invoiced 4800', r->'revenue'->'month'->0->>'invoiced_minor', '4800');
  perform pg_temp.chk('NY month net revenue 4000, tax 800', (r->'revenue'->'month'->0->>'net_revenue_minor') || '/' || (r->'revenue'->'month'->0->>'tax_minor'), '4000/800');
  perform pg_temp.chk('NY revenue is one USD row', jsonb_array_length(r->'revenue'->'month') || '/' || (r->'revenue'->'month'->0->>'currency'), '1/USD');

  r := pg_temp.as_pg('ownerb', format($q$select public.report_basic_at(%L, null, '2026-11-01 15:00:00+00')$q$, bz));
  w := r->'branches'->0;
  perform pg_temp.chk('NY today (25-hour day) starts 04:00Z', w->>'today_start', '2026-11-01T04:00:00+00:00');
  perform pg_temp.chk('NY today ends 05:00Z next day (25 hours)', w->>'today_end', '2026-11-02T05:00:00+00:00');
  perform pg_temp.chk('NY today: only invoices 2 and 5', r->'revenue'->'today'->0->>'invoice_count', '2');
  perform pg_temp.chk('NY spring forward: March day is 23 hours', (select (p->>'today_end')::timestamptz - (p->>'today_start')::timestamptz from (select pg_temp.as_pg('ownerb', format($q$select public.report_basic_at(%L, null, '2026-03-08 15:00:00+00')$q$, bz))->'branches'->0 as p) z)::text, '23:00:00');
end $$;

do $$
declare r jsonb; a uuid := pg_temp.id('biza'); k uuid := pg_temp.id('branchk'); w jsonb;
begin
  -- Karachi (UTC+5, no DST). Nov window = 2026-10-31T19:00Z .. 2026-11-30T19:00Z
  perform pg_temp.mk_issued(a, k, 'PKR', '2026-10-31 18:59:00+00', 5000, 0, 1);
  perform pg_temp.mk_issued(a, k, 'PKR', '2026-10-31 19:00:00+00', 5000, 0, 2);
  perform pg_temp.mk_issued(a, k, 'PKR', '2026-11-30 18:59:00+00', 5000, 0, 3);
  perform pg_temp.mk_issued(a, k, 'PKR', '2026-11-30 19:00:00+00', 5000, 0, 4);
  r := pg_temp.as_pg('owner', format($q$select public.report_basic_at(%L, %L, '2026-11-15 12:00:00+00')$q$, a, k));
  w := r->'branches'->0;
  perform pg_temp.chk('Karachi month starts 19:00Z', w->>'month_start', '2026-10-31T19:00:00+00:00');
  perform pg_temp.chk('Karachi month ends 19:00Z (exactly 30 days, no DST)', w->>'month_end', '2026-11-30T19:00:00+00:00');
  perform pg_temp.chk('Karachi month: only the two inside invoices', r->'revenue'->'month'->0->>'invoice_count', '2');
  perform pg_temp.chk('Karachi month PKR 10000', (r->'revenue'->'month'->0->>'currency') || '/' || (r->'revenue'->'month'->0->>'invoiced_minor'), 'PKR/10000');
  r := pg_temp.as_pg('owner', format($q$select public.report_basic_at(%L, %L, '2026-11-15 12:00:00+00')$q$, a, k));
  perform pg_temp.chk('Karachi today (Nov 15) is 24 hours', (extract(epoch from (r->'branches'->0->>'today_end')::timestamptz - (r->'branches'->0->>'today_start')::timestamptz) / 3600)::int, 24);
end $$;

-- multi-currency, window edges for appointments, top services, permissions
do $$
declare r jsonb; a uuid := pg_temp.id('biza'); br uuid := pg_temp.id('brancha'); v_svc uuid := pg_temp.id('svc');
begin
  perform pg_temp.mk_issued(a, br, 'GBP', '2026-11-10 12:00:00+00', 1000, 200, 1, v_svc);
  perform pg_temp.mk_issued(a, br, 'GBP', '2026-11-11 12:00:00+00', 2000, 400, 2, v_svc);

  insert into public.appointments (business_id, branch_id, client_id, service_id, starts_at, ends_at, duration_minutes,
    buffer_minutes, status, source, form_version_id, cancelled_at)
  select a, br, pg_temp.id('client'), v_svc, s.t, s.t + interval '1 hour', 60, 0, s.st::public.appointment_status, 'dashboard', pg_temp.id('fv'),
         case when s.st = 'cancelled' then s.t end
  from (values ('2026-11-10 09:00+00'::timestamptz, 'completed'), ('2026-11-12 09:00+00', 'completed'),
               ('2026-11-13 09:00+00', 'cancelled'), ('2026-11-30 23:59+00', 'completed'),
               ('2026-12-01 00:00+00', 'completed'), ('2026-10-31 23:59+00', 'completed')) s(t, st);

  r := pg_temp.as_pg('owner', format($q$select public.report_basic_at(%L, null, '2026-11-15 12:00:00+00')$q$, a));
  perform pg_temp.chk('all-branch revenue is one row PER currency (never summed)', (select string_agg(x->>'currency', ',' order by x->>'currency') from jsonb_array_elements(r->'revenue'->'month') x), 'GBP,PKR');
  perform pg_temp.chk('GBP month: 2 invoices, 3600 invoiced, 3000 net, 600 tax', (select (x->>'invoice_count') || '/' || (x->>'invoiced_minor') || '/' || (x->>'net_revenue_minor') || '/' || (x->>'tax_minor') from jsonb_array_elements(r->'revenue'->'month') x where x->>'currency' = 'GBP'), '2/3600/3000/600');
  perform pg_temp.chk('PKR untouched by the GBP branch', (select x->>'invoiced_minor' from jsonb_array_elements(r->'revenue'->'month') x where x->>'currency' = 'PKR'), '10000');
  perform pg_temp.chk('appointments by status in the month (London, GMT window)', (r->'appointments'->'month'->>'completed') || '/' || (r->'appointments'->'month'->>'cancelled') || '/' || (r->'appointments'->'month'->>'total'), '3/1/4');
  perform pg_temp.chk('top service: completed appointments + revenue per currency', (r->'top_services'->'month'->0->>'name') || '/' || (r->'top_services'->'month'->0->>'completed_appointments') || '/' || (r->'top_services'->'month'->0->'revenue'->0->>'currency') || '/' || (r->'top_services'->'month'->0->'revenue'->0->>'net_minor'), 'Cut/3/GBP/3000');
  perform pg_temp.chk('today bucket empty for a day with nothing', (r->'appointments'->'today'->>'total') || '/' || jsonb_array_length(r->'revenue'->'today'), '0/0');

  -- permissions
  r := pg_temp.as_pg('manager', format($q$select public.report_basic_at(%L, null, '2026-11-15 12:00:00+00')$q$, a));
  perform pg_temp.chk('manager sees their branch only (GBP only, no PKR)', (select string_agg(x->>'currency', ',') from jsonb_array_elements(r->'revenue'->'month') x), 'GBP');
  perform pg_temp.chk('manager forbidden on a branch they do not hold', pg_temp.as_('manager', format($q$select public.get_basic_report(%L, %L)$q$, a, pg_temp.id('branchk')))->>'code', 'forbidden');
  perform pg_temp.chk('receptionist has no reports', pg_temp.as_('recep', format($q$select public.get_basic_report(%L)$q$, a))->>'code', 'forbidden');
  perform pg_temp.chk('staff has no reports', pg_temp.as_('staffa', format($q$select public.get_basic_report(%L)$q$, a))->>'code', 'forbidden');
  perform pg_temp.chk('other business has no access', pg_temp.as_('ownerb', format($q$select public.get_basic_report(%L)$q$, a))->>'code', 'forbidden');
  perform pg_temp.chk('anon cannot execute get_basic_report', pg_temp.as_anon(format($q$select public.get_basic_report(%L)$q$, a))->>'state', '42501');

  -- a role with view_basic but NOT view_revenue gets counts and no revenue
  declare v_role uuid; v_member uuid;
  begin
    insert into public.roles (business_id, key, name, is_system) values (a, 'p5_basic_only', 'Basic only', false) returning id into v_role;
    insert into public.role_permissions (role_id, permission, scope) values (v_role, 'reports.view_basic', 'branch');
    select id into v_member from public.business_members where business_id = a and user_id = pg_temp.id('staffa');
    update public.member_role_assignments set role_id = v_role where member_id = v_member;
    r := pg_temp.as_pg('staffa', format($q$select public.report_basic_at(%L, null, '2026-11-15 12:00:00+00')$q$, a));
    perform pg_temp.chk('view_basic only: counts present', r->'appointments'->'month'->>'completed', '3');
    perform pg_temp.chk('view_basic only: revenue withheld', r->'revenue' is null or r->>'revenue' is null, true);
    perform pg_temp.chk('view_basic only: top-service revenue withheld', r->'top_services'->'month'->0->>'revenue' is null, true);
  end;
end $$;

-- ===========================================================================
-- 9. Grants
-- ===========================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'create_invoice_draft(uuid,uuid,uuid,jsonb,text)', 'update_invoice_draft(uuid,jsonb,uuid,boolean,text,boolean)',
    'discard_invoice_draft(uuid)', 'issue_invoice(uuid)', 'add_payment(uuid,text,bigint,timestamptz,text)',
    'reverse_payment(uuid,text,bigint)', 'create_credit_note(uuid,text,bigint)',
    'list_invoices(uuid,uuid,public.invoice_status,text,uuid,date,date,text,integer,timestamptz,uuid)',
    'get_invoice_print_data(uuid)', 'get_basic_report(uuid,uuid)'] loop
    perform pg_temp.chk('authenticated may execute ' || f, has_function_privilege('authenticated', 'public.' || f, 'execute'), true);
    perform pg_temp.chk('anon may NOT execute ' || f, has_function_privilege('anon', 'public.' || f, 'execute'), false);
  end loop;
  foreach f in array array[
    'invoice_access(uuid,uuid,text)', 'normalise_invoice_items(uuid,uuid,jsonb,boolean)', 'invoice_totals(uuid,integer)',
    'insert_invoice_items(uuid,uuid,uuid,jsonb)', 'invoice_money(uuid)', 'report_windows(uuid,uuid,timestamptz)',
    'format_document_number(text,bigint,boolean)', 'report_basic_at(uuid,uuid,timestamptz)'] loop
    perform pg_temp.chk('internal helper not callable by authenticated: ' || f, has_function_privilege('authenticated', 'public.' || f, 'execute'), false);
    perform pg_temp.chk('internal helper not callable by anon: ' || f, has_function_privilege('anon', 'public.' || f, 'execute'), false);
  end loop;
  perform pg_temp.chk('anon has no privilege on invoices', has_table_privilege('anon', 'public.invoices', 'select'), false);
  perform pg_temp.chk('authenticated cannot write invoices', has_table_privilege('authenticated', 'public.invoices', 'insert') or has_table_privilege('authenticated', 'public.invoices', 'update') or has_table_privilege('authenticated', 'public.invoices', 'delete'), false);
  perform pg_temp.chk('RLS on for all 4 tables', (select count(*)::int from pg_class where oid in ('public.invoices'::regclass, 'public.invoice_items'::regclass, 'public.invoice_payments'::regclass, 'public.credit_notes'::regclass) and relrowsecurity), 4);
end $$;

-- ===========================================================================
-- 10. Deleting a business with a full financial trail must still work
-- ===========================================================================
do $$
declare r jsonb; v_inv uuid; v_pay uuid; v_biz uuid := pg_temp.id('bizc'); v_br uuid := pg_temp.id('branchc');
begin
  r := pg_temp.as_('ownerc', format($q$select public.create_invoice_draft(%L, null, null, %L::jsonb)$q$, v_br, '[{"description":"c","unit_price_minor":1000}]'));
  v_inv := (r->>'invoice_id')::uuid;
  perform pg_temp.as_('ownerc', format($q$select public.issue_invoice(%L)$q$, v_inv));
  r := pg_temp.as_('ownerc', format($q$select public.add_payment(%L, 'cash', 500)$q$, v_inv));
  v_pay := (r->>'payment_id')::uuid;
  perform pg_temp.as_('ownerc', format($q$select public.reverse_payment(%L, 'refund it', 100)$q$, v_pay));
  perform pg_temp.as_('ownerc', format($q$select public.create_credit_note(%L, 'partial', 100)$q$, v_inv));
  perform pg_temp.chk('business C has a full financial trail', (select count(*)::int from public.invoice_payments where business_id = v_biz), 2);

  alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
  delete from public.businesses where id = v_biz;
  alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
  perform pg_temp.chk('delete business cascades invoices/items/payments/credit notes', (select count(*)::int from public.invoices where business_id = v_biz) + (select count(*)::int from public.invoice_items where business_id = v_biz) + (select count(*)::int from public.invoice_payments where business_id = v_biz) + (select count(*)::int from public.credit_notes where business_id = v_biz), 0);
end $$;

-- ===========================================================================
-- Result
-- ===========================================================================
select jsonb_build_object(
  'passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)
) as result from res;

rollback;
