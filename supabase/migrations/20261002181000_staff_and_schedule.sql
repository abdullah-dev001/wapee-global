-- Phase 2, part 2: staff profiles and the schedule.
--
-- staff_profiles, staff_branches, service_staff, staff_working_hours,
-- staff_breaks, staff_time_off, branch_hours, branch_closures.
--
-- Shape decisions, and why:
--
-- * **A staff member is not necessarily a login user.** `staff_profiles.member_id`
--   is nullable: a salon can add "Ayesha, 9–5, does haircuts" with no email and no
--   account. Invite her later and the rows link up. Plan limits count staff, not
--   seats (product doc §10, "Staff per location").
--
-- * **Recurring hours are stored as weekday + local minutes-from-midnight**, not
--   timestamps. `day_of_week` 0–6 (0 = Sunday, matching Postgres `dow` and JS
--   `getDay`) with `start_minute`/`end_minute` as integers (540 = 09:00).
--   "Tuesday 9am" must stay 9am across a DST change, which a timestamptz cannot
--   promise. A split shift is two rows.
--
--   Minutes rather than `time` because **Postgres has no range type over `time`**,
--   and the overlap guarantee below needs one. `int4range` over minutes is exact
--   (no sub-minute booking exists), indexable by GiST, and makes the no-overnight
--   rule a plain `end_minute <= 1440` check. `lib/time` converts to and from
--   "HH:MM" for the UI.
--
--   Time off and closures are real instants/dates, so they use `timestamptz` and
--   `date` respectively.
--
-- * **No overnight shifts.** `end_minute > start_minute` is enforced, so a shift
--   never wraps midnight. A business open past midnight needs two rows on
--   consecutive days; revisit if a real customer needs true overnight.
--
-- * **No overlapping intervals** for the same staff + branch + weekday, enforced
--   by a GiST exclusion constraint, so a double-booked schedule cannot exist even
--   if the UI has a bug.
--
-- * **Time off needs no approval.** Product doc §6.3 lists only "working hours,
--   breaks, time off" and the §9 permission catalogue has no approve-time-off
--   permission (`appointments.approve` is about bookings). So time off is recorded
--   directly by whoever holds `staff.manage_schedule` — Staff for their own rows
--   (Own scope), Manager/Owner for anyone in scope. Add a workflow later if asked.
--
-- * **Own scope works through `staff_profiles.member_id`.** A Staff member holds
--   `staff.manage_schedule` at `own` scope, so the policies below compare the
--   row's staff profile to the caller's own membership.

-- ---------------------------------------------------------------------------
-- staff_profiles
-- ---------------------------------------------------------------------------
create table public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- NULL = a staff member with no app account. Set when they accept an invite.
  -- ON DELETE SET NULL: removing someone's login must not erase their schedule
  -- or their history in past appointments.
  member_id uuid references public.business_members (id) on delete set null,
  -- Shown on the booking page and the calendar. Independent of the login name so
  -- a business can use a working name ("Dr. A").
  display_name text not null,
  job_title text,
  email extensions.citext,
  phone text,
  -- Off = keeps history, takes no new bookings, hidden from the booking page.
  is_active boolean not null default true,
  -- Shown to customers when choosing staff.
  is_bookable_online boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,

  constraint staff_profiles_display_name_length check (char_length(display_name) between 1 and 120),
  constraint staff_profiles_job_title_length check (job_title is null or char_length(job_title) <= 120)
);

comment on table public.staff_profiles is
  'A person who performs services. member_id is NULL for staff with no app login (doc §10 counts staff, not seats).';
comment on column public.staff_profiles.member_id is
  'The app account, when there is one. SET NULL on member delete so the schedule and history survive.';

-- One staff profile per app account per business.
create unique index staff_profiles_unique_member
  on public.staff_profiles (business_id, member_id)
  where member_id is not null and deleted_at is null;
create index staff_profiles_business_idx
  on public.staff_profiles (business_id) where deleted_at is null;
create index staff_profiles_member_idx
  on public.staff_profiles (member_id) where member_id is not null;
create index staff_profiles_name_trgm_idx
  on public.staff_profiles using gin (display_name extensions.gin_trgm_ops);

create trigger staff_profiles_set_updated_at
  before update on public.staff_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- staff_branches: where someone works
-- ---------------------------------------------------------------------------
-- Separate from working hours so a staff member can be assigned to a branch
-- before anyone sets their timetable.
create table public.staff_branches (
  staff_id uuid not null references public.staff_profiles (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (staff_id, branch_id)
);

comment on table public.staff_branches is
  'Which branches a staff member works at. Assignable before any hours exist.';

create index staff_branches_branch_idx on public.staff_branches (branch_id);
create index staff_branches_business_idx on public.staff_branches (business_id);

-- ---------------------------------------------------------------------------
-- service_staff: who performs what
-- ---------------------------------------------------------------------------
create table public.service_staff (
  service_id uuid not null references public.services (id) on delete cascade,
  staff_id uuid not null references public.staff_profiles (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (service_id, staff_id)
);

comment on table public.service_staff is
  'Which staff perform a service. No per-staff price or duration (doc §6.3).';

create index service_staff_staff_idx on public.service_staff (staff_id);
create index service_staff_business_idx on public.service_staff (business_id);

-- ---------------------------------------------------------------------------
-- staff_working_hours: the recurring weekly timetable
-- ---------------------------------------------------------------------------
create table public.staff_working_hours (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles (id) on delete cascade,
  -- Hours are per staff PER BRANCH: multi-branch gives each branch its own
  -- timetable (doc §8.2) and retrofitting this column later would be painful.
  branch_id uuid not null references public.branches (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- 0 = Sunday .. 6 = Saturday, matching Postgres `extract(dow)` and JS getDay().
  day_of_week smallint not null,
  -- LOCAL minutes from midnight in the branch timezone (540 = 09:00).
  -- Deliberately not timestamptz: "Tuesday 9am" must stay 9am when the clocks
  -- change. See the header for why minutes rather than `time`.
  start_minute integer not null,
  end_minute integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint staff_working_hours_dow_range check (day_of_week between 0 and 6),
  constraint staff_working_hours_start_range check (start_minute between 0 and 1439),
  -- No overnight shifts: a shift never wraps midnight. 1440 = end of day.
  constraint staff_working_hours_end_range check (end_minute between 1 and 1440),
  constraint staff_working_hours_end_after_start check (end_minute > start_minute)
);

comment on table public.staff_working_hours is
  'Recurring weekly hours per staff per branch. Weekday + local minutes, never timestamps, so DST cannot shift a shift.';
comment on column public.staff_working_hours.day_of_week is
  '0 = Sunday .. 6 = Saturday (Postgres dow, JS getDay).';
comment on column public.staff_working_hours.start_minute is
  'Local minutes from midnight at the branch. 540 = 09:00. No range type exists over `time`, so overlap checks use int4range over these.';

-- The real guarantee: one staff member cannot have two overlapping intervals on
-- the same weekday at the same branch. Needs btree_gist for the uuid/smallint
-- parts alongside the range.
alter table public.staff_working_hours
  add constraint staff_working_hours_no_overlap
  exclude using gist (
    staff_id with =,
    branch_id with =,
    day_of_week with =,
    -- '[)' so 09:00–12:00 and 12:00–17:00 are adjacent, not overlapping.
    int4range(start_minute, end_minute, '[)') with &&
  );

create index staff_working_hours_staff_idx on public.staff_working_hours (staff_id);
create index staff_working_hours_branch_idx on public.staff_working_hours (branch_id);
create index staff_working_hours_business_idx on public.staff_working_hours (business_id);

create trigger staff_working_hours_set_updated_at
  before update on public.staff_working_hours
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- staff_breaks: recurring unpaid gaps inside the working day
-- ---------------------------------------------------------------------------
create table public.staff_breaks (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  day_of_week smallint not null,
  start_minute integer not null,
  end_minute integer not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint staff_breaks_dow_range check (day_of_week between 0 and 6),
  constraint staff_breaks_start_range check (start_minute between 0 and 1439),
  constraint staff_breaks_end_range check (end_minute between 1 and 1440),
  constraint staff_breaks_end_after_start check (end_minute > start_minute),
  constraint staff_breaks_label_length check (label is null or char_length(label) <= 60)
);

comment on table public.staff_breaks is
  'Recurring break inside the working day (lunch). Same weekday + local time shape as working hours.';

-- Two breaks on the same day cannot overlap each other either.
alter table public.staff_breaks
  add constraint staff_breaks_no_overlap
  exclude using gist (
    staff_id with =,
    branch_id with =,
    day_of_week with =,
    int4range(start_minute, end_minute, '[)') with &&
  );

create index staff_breaks_staff_idx on public.staff_breaks (staff_id);
create index staff_breaks_branch_idx on public.staff_breaks (branch_id);
create index staff_breaks_business_idx on public.staff_breaks (business_id);

create trigger staff_breaks_set_updated_at
  before update on public.staff_breaks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- staff_time_off: one-off absence
-- ---------------------------------------------------------------------------
-- A real instant in time, so timestamptz (UTC) rather than weekday + local time.
-- No approval workflow: see the header note.
create table public.staff_time_off (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- NULL = away from every branch, which is the usual case for holiday.
  branch_id uuid references public.branches (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- A whole-day absence, so the UI can show a date instead of a time.
  is_all_day boolean not null default true,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,

  constraint staff_time_off_end_after_start check (ends_at > starts_at),
  constraint staff_time_off_reason_length check (reason is null or char_length(reason) <= 500)
);

comment on table public.staff_time_off is
  'One-off absence. UTC instants. No approval step: doc §6.3 and the §9 permission list define none.';

-- One staff member cannot have two overlapping absences.
alter table public.staff_time_off
  add constraint staff_time_off_no_overlap
  exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  );

create index staff_time_off_staff_idx on public.staff_time_off (staff_id);
create index staff_time_off_business_idx on public.staff_time_off (business_id);
-- The slot engine asks "is anyone off during this window".
create index staff_time_off_range_idx on public.staff_time_off using gist (tstzrange(starts_at, ends_at, '[)'));

create trigger staff_time_off_set_updated_at
  before update on public.staff_time_off
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- branch_hours: when the branch itself is open
-- ---------------------------------------------------------------------------
create table public.branch_hours (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  day_of_week smallint not null,
  start_minute integer not null,
  end_minute integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint branch_hours_dow_range check (day_of_week between 0 and 6),
  constraint branch_hours_start_range check (start_minute between 0 and 1439),
  constraint branch_hours_end_range check (end_minute between 1 and 1440),
  constraint branch_hours_end_after_start check (end_minute > start_minute)
);

comment on table public.branch_hours is
  'Opening hours per branch per weekday. A day with no row is closed.';

alter table public.branch_hours
  add constraint branch_hours_no_overlap
  exclude using gist (
    branch_id with =,
    day_of_week with =,
    int4range(start_minute, end_minute, '[)') with &&
  );

create index branch_hours_branch_idx on public.branch_hours (branch_id);
create index branch_hours_business_idx on public.branch_hours (business_id);

create trigger branch_hours_set_updated_at
  before update on public.branch_hours
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- branch_closures: holidays and one-off closed days
-- ---------------------------------------------------------------------------
create table public.branch_closures (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Local dates, not instants: "closed on 25 December" is a calendar fact.
  starts_on date not null,
  ends_on date not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint branch_closures_end_not_before_start check (ends_on >= starts_on),
  constraint branch_closures_name_length check (char_length(name) between 1 and 120)
);

comment on table public.branch_closures is
  'Holidays and closed days per branch. Local dates; a single day has starts_on = ends_on.';

-- Overlapping closures are harmless but confusing, so they are refused.
alter table public.branch_closures
  add constraint branch_closures_no_overlap
  exclude using gist (
    branch_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  );

create index branch_closures_branch_idx on public.branch_closures (branch_id);
create index branch_closures_business_idx on public.branch_closures (business_id);

create trigger branch_closures_set_updated_at
  before update on public.branch_closures
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tenant guards: a child row's branch/staff must share its business
-- ---------------------------------------------------------------------------
create or replace function public.enforce_staff_branch_tenant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_staff_business uuid;
  v_branch_business uuid;
begin
  select business_id into v_staff_business from public.staff_profiles where id = new.staff_id;
  if v_staff_business is null or new.business_id <> v_staff_business then
    raise exception 'Staff member belongs to a different business' using errcode = '23514';
  end if;

  -- branch_id is nullable on staff_time_off ("away from every branch").
  if new.branch_id is not null then
    select business_id into v_branch_business from public.branches where id = new.branch_id;
    if v_branch_business is null or v_branch_business <> v_staff_business then
      raise exception 'Branch belongs to a different business' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.enforce_staff_branch_tenant is
  'Keeps a schedule row''s staff, branch and business consistent. RLS checks the caller; this checks the data.';

create trigger staff_branches_tenant_guard
  before insert or update on public.staff_branches
  for each row execute function public.enforce_staff_branch_tenant();
create trigger staff_working_hours_tenant_guard
  before insert or update on public.staff_working_hours
  for each row execute function public.enforce_staff_branch_tenant();
create trigger staff_breaks_tenant_guard
  before insert or update on public.staff_breaks
  for each row execute function public.enforce_staff_branch_tenant();
create trigger staff_time_off_tenant_guard
  before insert or update on public.staff_time_off
  for each row execute function public.enforce_staff_branch_tenant();

-- service_staff joins two business-scoped tables.
create or replace function public.enforce_service_staff_tenant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_service_business uuid;
  v_staff_business uuid;
begin
  select business_id into v_service_business from public.services where id = new.service_id;
  select business_id into v_staff_business from public.staff_profiles where id = new.staff_id;
  if v_service_business is null or v_staff_business is null
     or v_service_business <> v_staff_business
     or new.business_id <> v_service_business then
    raise exception 'Service and staff member must belong to the same business'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger service_staff_tenant_guard
  before insert or update on public.service_staff
  for each row execute function public.enforce_service_staff_tenant();

-- ---------------------------------------------------------------------------
-- Own-scope helper
-- ---------------------------------------------------------------------------
-- A Staff member holds staff.manage_schedule at `own` scope, so they may edit
-- their OWN hours and time off and nobody else's. `has_permission()` cannot
-- express "this row is mine", so this does the row check and the policies
-- combine the two.
create or replace function public.is_own_staff_profile(p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    join public.business_members m on m.id = sp.member_id
    where sp.id = p_staff_id
      and sp.deleted_at is null
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.deleted_at is null
  );
$$;

comment on function public.is_own_staff_profile is
  'True when the staff profile belongs to the caller. Implements the Own scope for schedule rows.';

revoke all on function public.is_own_staff_profile(uuid) from public;
revoke execute on function public.is_own_staff_profile(uuid) from anon;
grant execute on function public.is_own_staff_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.staff_profiles enable row level security;
alter table public.staff_branches enable row level security;
alter table public.service_staff enable row level security;
alter table public.staff_working_hours enable row level security;
alter table public.staff_breaks enable row level security;
alter table public.staff_time_off enable row level security;
alter table public.branch_hours enable row level security;
alter table public.branch_closures enable row level security;

-- staff_profiles: every member may see the team (staff.view); only
-- staff.manage may change it. Someone editing their own profile is a Phase 4
-- concern (a "my profile" screen), not something staff.manage should imply.
create policy staff_profiles_select on public.staff_profiles
  for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy staff_profiles_insert on public.staff_profiles
  for insert to authenticated
  with check (public.can(business_id, null, 'staff.manage'));
create policy staff_profiles_update on public.staff_profiles
  for update to authenticated
  using (public.can(business_id, null, 'staff.manage'))
  with check (public.can(business_id, null, 'staff.manage'));
create policy staff_profiles_delete on public.staff_profiles
  for delete to authenticated
  using (public.can(business_id, null, 'staff.manage'));

-- staff_branches / service_staff: assigning people is staff.manage.
create policy staff_branches_select on public.staff_branches
  for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy staff_branches_insert on public.staff_branches
  for insert to authenticated
  with check (public.can(business_id, branch_id, 'staff.manage'));
create policy staff_branches_delete on public.staff_branches
  for delete to authenticated
  using (public.can(business_id, branch_id, 'staff.manage'));

create policy service_staff_select on public.service_staff
  for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy service_staff_insert on public.service_staff
  for insert to authenticated
  with check (public.can(business_id, null, 'staff.manage'));
create policy service_staff_delete on public.service_staff
  for delete to authenticated
  using (public.can(business_id, null, 'staff.manage'));

-- Schedule rows: `staff.manage_schedule`, plus the Own-scope row check.
-- A Staff member's grant is scoped `own`, so has_permission() returns true for
-- them and `is_own_staff_profile()` is what actually limits them to their own
-- rows. A Manager's grant is `branch`, and they pass the row check for anyone.
create policy staff_working_hours_select on public.staff_working_hours
  for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy staff_working_hours_insert on public.staff_working_hours
  for insert to authenticated
  with check (
    public.can(business_id, branch_id, 'staff.manage')
    or (public.can(business_id, branch_id, 'staff.manage_schedule')
        and public.is_own_staff_profile(staff_id))
  );
create policy staff_working_hours_update on public.staff_working_hours
  for update to authenticated
  using (
    public.can(business_id, branch_id, 'staff.manage')
    or (public.can(business_id, branch_id, 'staff.manage_schedule')
        and public.is_own_staff_profile(staff_id))
  )
  with check (
    public.can(business_id, branch_id, 'staff.manage')
    or (public.can(business_id, branch_id, 'staff.manage_schedule')
        and public.is_own_staff_profile(staff_id))
  );
create policy staff_working_hours_delete on public.staff_working_hours
  for delete to authenticated
  using (
    public.can(business_id, branch_id, 'staff.manage')
    or (public.can(business_id, branch_id, 'staff.manage_schedule')
        and public.is_own_staff_profile(staff_id))
  );

create policy staff_breaks_select on public.staff_breaks
  for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy staff_breaks_insert on public.staff_breaks
  for insert to authenticated
  with check (
    public.can(business_id, branch_id, 'staff.manage')
    or (public.can(business_id, branch_id, 'staff.manage_schedule')
        and public.is_own_staff_profile(staff_id))
  );
create policy staff_breaks_update on public.staff_breaks
  for update to authenticated
  using (
    public.can(business_id, branch_id, 'staff.manage')
    or (public.can(business_id, branch_id, 'staff.manage_schedule')
        and public.is_own_staff_profile(staff_id))
  )
  with check (
    public.can(business_id, branch_id, 'staff.manage')
    or (public.can(business_id, branch_id, 'staff.manage_schedule')
        and public.is_own_staff_profile(staff_id))
  );
create policy staff_breaks_delete on public.staff_breaks
  for delete to authenticated
  using (
    public.can(business_id, branch_id, 'staff.manage')
    or (public.can(business_id, branch_id, 'staff.manage_schedule')
        and public.is_own_staff_profile(staff_id))
  );

-- Time off: branch_id is nullable, so the permission is checked business-wide.
create policy staff_time_off_select on public.staff_time_off
  for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy staff_time_off_insert on public.staff_time_off
  for insert to authenticated
  with check (
    public.can(business_id, null, 'staff.manage')
    or (public.can(business_id, null, 'staff.manage_schedule')
        and public.is_own_staff_profile(staff_id))
  );
create policy staff_time_off_update on public.staff_time_off
  for update to authenticated
  using (
    public.can(business_id, null, 'staff.manage')
    or (public.can(business_id, null, 'staff.manage_schedule')
        and public.is_own_staff_profile(staff_id))
  )
  with check (
    public.can(business_id, null, 'staff.manage')
    or (public.can(business_id, null, 'staff.manage_schedule')
        and public.is_own_staff_profile(staff_id))
  );
create policy staff_time_off_delete on public.staff_time_off
  for delete to authenticated
  using (
    public.can(business_id, null, 'staff.manage')
    or (public.can(business_id, null, 'staff.manage_schedule')
        and public.is_own_staff_profile(staff_id))
  );

-- Branch hours and closures are a property of the location: settings.business.
create policy branch_hours_select on public.branch_hours
  for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy branch_hours_insert on public.branch_hours
  for insert to authenticated
  with check (public.can(business_id, branch_id, 'settings.business'));
create policy branch_hours_update on public.branch_hours
  for update to authenticated
  using (public.can(business_id, branch_id, 'settings.business'))
  with check (public.can(business_id, branch_id, 'settings.business'));
create policy branch_hours_delete on public.branch_hours
  for delete to authenticated
  using (public.can(business_id, branch_id, 'settings.business'));

create policy branch_closures_select on public.branch_closures
  for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy branch_closures_insert on public.branch_closures
  for insert to authenticated
  with check (public.can(business_id, branch_id, 'settings.business'));
create policy branch_closures_update on public.branch_closures
  for update to authenticated
  using (public.can(business_id, branch_id, 'settings.business'))
  with check (public.can(business_id, branch_id, 'settings.business'));
create policy branch_closures_delete on public.branch_closures
  for delete to authenticated
  using (public.can(business_id, branch_id, 'settings.business'));

grant select, insert, update, delete on public.staff_profiles to authenticated;
grant select, insert, delete on public.staff_branches to authenticated;
grant select, insert, delete on public.service_staff to authenticated;
grant select, insert, update, delete on public.staff_working_hours to authenticated;
grant select, insert, update, delete on public.staff_breaks to authenticated;
grant select, insert, update, delete on public.staff_time_off to authenticated;
grant select, insert, update, delete on public.branch_hours to authenticated;
grant select, insert, update, delete on public.branch_closures to authenticated;

revoke all on function public.enforce_staff_branch_tenant() from public, anon, authenticated;
revoke all on function public.enforce_service_staff_tenant() from public, anon, authenticated;
