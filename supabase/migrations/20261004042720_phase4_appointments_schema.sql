-- Phase 4 part A: dashboard appointments backend.
--
-- SCOPE OF THIS FILE: schema-only additions needed before the RPCs below can
-- be written. Three small things:
--
-- 1. `appointments.invoice_id` — the Phase 5 seam. Nullable, no FK yet because
--    `invoices` does not exist. Phase 5 adds
--    `alter table appointments add constraint ... foreign key (invoice_id)
--    references invoices(id)` once that table exists. Decided with the user
--    2026-10-05.
--
-- 2. **The allowed status-transition table, in ONE place.** The brief asks for
--    every allowed AND forbidden transition to be defined once and tested.
--    A table (not a hardcoded case statement scattered across 6 RPCs) means a
--    future status or a future rule change touches one row set, and the SQL
--    test suite can simply enumerate every (from, to) pair and assert against
--    this table instead of re-deriving the rules.
--
--    Rules (agreed with the user, 2026-10-05):
--      pending    -> confirmed (approve), cancelled
--      confirmed  -> cancelled, completed, no_show, (reschedule keeps status)
--      cancelled, completed, no_show -> NOTHING. Terminal, no reopen, ever.
--      A mistake is fixed by creating a new appointment, never by reopening a
--      finished one (matches the "financial records immutable, corrections
--      via new rows" pattern already used for credit notes / reversals).
--
-- 3. **`appointments` joins the `supabase_realtime` publication.** Realtime's
--    `postgres_changes` honours RLS for an authenticated client (Supabase
--    applies the subscriber's RLS policies to each change event), so this is
--    safe to add without a separate access layer — the existing
--    `appointments_select` policy (Own/Branch/All) is the only thing that
--    decides who is told about a change. See context/appointments.md for the
--    channel name the UI should subscribe to.

alter table public.appointments
  add column invoice_id uuid null;

comment on column public.appointments.invoice_id is
  'Phase 5 seam: links a completed appointment to its invoice once invoices exist. No FK yet (Phase 5 adds appointments_invoice_id_fkey references invoices(id) when that table is created). Decided 2026-10-05.';

-- ---------------------------------------------------------------------------
-- The one allowed-transition table
-- ---------------------------------------------------------------------------
create table public.appointment_status_transitions (
  from_status public.appointment_status not null,
  to_status public.appointment_status not null,
  primary key (from_status, to_status)
);

comment on table public.appointment_status_transitions is
  'The ONE place every allowed appointment status change is defined. cancelled/completed/no_show are terminal (no row with them as from_status) — no reopen, ever (agreed with the user 2026-10-05). A correction is a new appointment, not a reopened one.';

insert into public.appointment_status_transitions (from_status, to_status) values
  ('pending', 'confirmed'),   -- approve_appointment
  ('pending', 'cancelled'),   -- cancel_appointment
  ('confirmed', 'cancelled'), -- cancel_appointment
  ('confirmed', 'completed'), -- mark_completed
  ('confirmed', 'no_show');   -- mark_no_show
-- Reschedule does not change `status` (confirmed stays confirmed, pending
-- stays pending under manual confirmation) so it needs no row here — it is
-- validated the same way create_booking/reschedule_booking already are
-- (collision checks), not through this table.
-- No row has cancelled/completed/no_show as from_status: terminal, by design.

alter table public.appointment_status_transitions enable row level security;
-- Read-only reference data, same posture as `permissions`/`reserved_slugs`:
-- every member may read it (so the UI can know which buttons apply), nobody
-- writes it from the app.
create policy appointment_status_transitions_select on public.appointment_status_transitions
  for select to authenticated, anon
  using (true);

revoke all on public.appointment_status_transitions from public;
grant select on public.appointment_status_transitions to authenticated, anon;

create or replace function public.is_allowed_appointment_transition(
  p_from public.appointment_status,
  p_to public.appointment_status
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.appointment_status_transitions
    where from_status = p_from and to_status = p_to
  );
$$;

comment on function public.is_allowed_appointment_transition is
  'The single source of truth every mutating appointment RPC checks before changing status. SECURITY INVOKER + a read-only table any role may SELECT, so no grant juggling.';

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.appointments;
