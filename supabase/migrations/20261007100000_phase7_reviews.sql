-- Phase 7A (2/4): reviews.
--
-- Flow: appointment becomes Completed (inside `mark_completed`, same
-- transaction) -> ONE review_request per appointment (token hashed sha256,
-- expires, single use) -> public submit (service_role RPCs behind Edge
-- Functions) -> owner lists / replies / features on the website.
--
-- COMPLIANCE, enforced by the system (doc §6.4):
--   * the Google review link is ONE setting per branch and is returned
--     identically after every submit, whatever the star rating — there is no
--     branch in the code that looks at the rating before returning it;
--   * nothing here offers an incentive, and no screen/field asks for staff;
--   * the public never sees which staff member served them (staff_id is
--     stored ONLY so a Staff user can see reviews of their own appointments).
--
-- NOTHING is sent (Phase 6): `mark_completed` / `reissue_review_request`
-- return the raw token ONCE so the dashboard can copy/show the link. THE SEAM
-- for email/SMS is `review_requests.sent_at` + the single place the token is
-- minted (`create_review_request_internal`).

alter table public.branches add column google_review_url text;
alter table public.branches add constraint branches_google_review_url check (
  google_review_url is null or google_review_url ~ '^https://[^[:space:]<>"'']{3,500}$'
);
comment on column public.branches.google_review_url is
  'One Google review link per branch, shown to EVERY reviewer after submit regardless of rating (doc §6.4).';

-- ---------------------------------------------------------------------------
-- review_requests
-- ---------------------------------------------------------------------------
create table public.review_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  branch_id uuid not null references public.branches (id),
  -- UNIQUE for all time (not just live rows): one request per completed
  -- appointment, ever. Reopen + complete again does NOT create a second.
  appointment_id uuid not null unique references public.appointments (id),
  client_id uuid references public.clients (id) on delete set null,
  -- sha256 hex of the raw token. The raw token is never stored.
  token_hash text not null unique,
  expires_at timestamptz not null,
  -- Single use: set when the review is submitted.
  used_at timestamptz,
  -- Phase 6 seam: set by the sender when an email/SMS actually goes out.
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint review_requests_hash_format check (token_hash ~ '^[0-9a-f]{64}$')
);
create index review_requests_business_idx on public.review_requests (business_id);
create index review_requests_branch_idx on public.review_requests (branch_id);
create index review_requests_client_idx on public.review_requests (client_id) where client_id is not null;

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  branch_id uuid not null references public.branches (id),
  appointment_id uuid not null unique references public.appointments (id),
  review_request_id uuid not null unique references public.review_requests (id),
  client_id uuid references public.clients (id) on delete set null,
  -- Internal only (Own-scope visibility for Staff). NEVER public.
  staff_id uuid references public.staff_profiles (id) on delete set null,
  rating smallint not null,
  comment text,
  -- Snapshot at submit: the ONLY name that may ever be shown publicly.
  reviewer_first_name text not null,
  -- 'removed' is reserved for a super-admin takedown (no owner RPC).
  status text not null default 'published',
  owner_reply text,
  replied_at timestamptz,
  replied_by uuid references public.profiles (id) on delete set null,
  featured_on_website boolean not null default false,
  featured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint reviews_rating check (rating between 1 and 5),
  constraint reviews_comment_length check (comment is null or char_length(comment) <= 2000),
  constraint reviews_first_name_length check (char_length(reviewer_first_name) between 1 and 60),
  constraint reviews_status check (status in ('published', 'removed')),
  constraint reviews_reply_length check (owner_reply is null or char_length(owner_reply) between 1 and 1000),
  constraint reviews_featured_needs_published check (not featured_on_website or status = 'published')
);
create index reviews_business_created_idx on public.reviews (business_id, created_at desc, id desc) where deleted_at is null;
create index reviews_branch_idx on public.reviews (branch_id);
create index reviews_staff_idx on public.reviews (staff_id) where staff_id is not null;
create index reviews_client_idx on public.reviews (client_id) where client_id is not null;
create index reviews_replied_by_idx on public.reviews (replied_by) where replied_by is not null;
create index reviews_featured_idx on public.reviews (business_id, featured_at desc)
  where featured_on_website and status = 'published' and deleted_at is null;

create trigger review_requests_set_updated_at before update on public.review_requests
  for each row execute function public.set_updated_at();
create trigger reviews_set_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

-- The customer's words are IMMUTABLE: only the owner-side columns may change.
-- Released when the business itself is being deleted (cascade).
create or replace function public.enforce_review_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.businesses b where b.id = old.business_id) then
      raise exception 'reviews cannot be deleted' using errcode = '23514';
    end if;
    return old;
  end if;
  if new.business_id <> old.business_id or new.branch_id <> old.branch_id
     or new.appointment_id <> old.appointment_id or new.review_request_id <> old.review_request_id
     or new.rating <> old.rating or new.comment is distinct from old.comment
     or new.reviewer_first_name <> old.reviewer_first_name or new.created_at <> old.created_at then
    raise exception 'a submitted review cannot be edited' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger reviews_guard before update or delete on public.reviews
  for each row execute function public.enforce_review_guard();
revoke all on function public.enforce_review_guard() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- RLS: SELECT only. Branch/All scope sees the branch; Own scope (Staff) sees
-- only reviews of their own appointments.
-- ---------------------------------------------------------------------------
alter table public.review_requests enable row level security;
alter table public.reviews enable row level security;

create policy reviews_select on public.reviews for select to authenticated
  using (deleted_at is null
         and public.can(business_id, branch_id, 'reviews.view')
         and (public.has_permission_at_branch_scope(business_id, branch_id, 'reviews.view')
              or (staff_id is not null and public.is_own_staff_profile(staff_id))));

create policy review_requests_select on public.review_requests for select to authenticated
  using (deleted_at is null
         and public.can(business_id, branch_id, 'reviews.view')
         and public.has_permission_at_branch_scope(business_id, branch_id, 'reviews.view'));

revoke all on public.review_requests, public.reviews from anon, authenticated, public;
grant select on public.reviews, public.review_requests to authenticated;
-- The token hash is not for the dashboard.
revoke select on public.review_requests from authenticated;
grant select (id, business_id, branch_id, appointment_id, client_id, expires_at, used_at, sent_at, created_at, updated_at)
  on public.review_requests to authenticated;

-- ---------------------------------------------------------------------------
-- create_review_request_internal — THE one place a token is minted.
-- No API grant: called only from mark_completed / reissue_review_request.
-- Returns the RAW token (once) or NULL when a request already exists.
-- ---------------------------------------------------------------------------
create or replace function public.create_review_request_internal(p_appointment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_a record;
  v_raw text;
  v_expires timestamptz := now() + interval '30 days';
  v_id uuid;
begin
  select a.id, a.business_id, a.branch_id, a.client_id into v_a
  from public.appointments a where a.id = p_appointment_id and a.deleted_at is null;
  if v_a.id is null then return null; end if;

  v_raw := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.review_requests (business_id, branch_id, appointment_id, client_id, token_hash, expires_at)
  values (v_a.business_id, v_a.branch_id, v_a.id, v_a.client_id,
          pg_catalog.encode(extensions.digest(v_raw, 'sha256'), 'hex'), v_expires)
  on conflict (appointment_id) do nothing
  returning id into v_id;

  if v_id is null then return null; end if;  -- already had one: no new raw token
  return jsonb_build_object('token', v_raw, 'expires_at', v_expires);
end $$;
revoke all on function public.create_review_request_internal(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- mark_completed: unchanged rules, PLUS the review request in the same
-- transaction. Validation still finishes before the first write.
-- ---------------------------------------------------------------------------
create or replace function public.mark_completed(p_appointment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
  v_req jsonb;
begin
  select a.id, a.business_id, a.branch_id, a.staff_id, a.status into v_row
  from public.appointments a
  where a.id = p_appointment_id and a.deleted_at is null
  for update of a;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not public.can(v_row.business_id, v_row.branch_id, 'appointments.edit') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if not public.has_permission_at_branch_scope(v_row.business_id, v_row.branch_id, 'appointments.edit') then
    if v_row.staff_id is null or not public.is_own_staff_profile(v_row.staff_id) then
      return jsonb_build_object('ok', false, 'code', 'forbidden');
    end if;
  end if;
  if not public.is_allowed_appointment_transition(v_row.status, 'completed') then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition', 'status', v_row.status);
  end if;

  update public.appointments set status = 'completed' where id = p_appointment_id;
  v_req := public.create_review_request_internal(p_appointment_id);

  perform public.write_audit_log(
    v_row.business_id, 'appointment.completed', 'appointment', p_appointment_id::text,
    jsonb_build_object('status', v_row.status), jsonb_build_object('status', 'completed'));

  -- `review_request` is present ONLY when a new request was just created. The
  -- raw token exists in this response and nowhere else; the dashboard builds
  -- the link from it. Use reissue_review_request for a later copy.
  return jsonb_build_object('ok', true, 'status', 'completed')
         || case when v_req is null then '{}'::jsonb
                 else jsonb_build_object('review_request', v_req) end;
end $$;

-- ---------------------------------------------------------------------------
-- reissue_review_request: rotate the token. The OLD token stops working (the
-- stored hash is replaced). Refused once reviewed or not completed.
-- ---------------------------------------------------------------------------
create or replace function public.reissue_review_request(p_appointment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_a record;
  v_req record;
  v_raw text;
  v_expires timestamptz := now() + interval '30 days';
begin
  select a.id, a.business_id, a.branch_id, a.staff_id, a.status into v_a
  from public.appointments a where a.id = p_appointment_id and a.deleted_at is null for update of a;
  if v_a.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;

  if not public.can(v_a.business_id, v_a.branch_id, 'appointments.edit') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if not public.has_permission_at_branch_scope(v_a.business_id, v_a.branch_id, 'appointments.edit') then
    if v_a.staff_id is null or not public.is_own_staff_profile(v_a.staff_id) then
      return jsonb_build_object('ok', false, 'code', 'forbidden');
    end if;
  end if;
  if v_a.status <> 'completed' then
    return jsonb_build_object('ok', false, 'code', 'not_completed');
  end if;

  select r.id, r.used_at into v_req from public.review_requests r
  where r.appointment_id = p_appointment_id and r.deleted_at is null for update;
  if v_req.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_req.used_at is not null
     or exists (select 1 from public.reviews rv where rv.appointment_id = p_appointment_id) then
    return jsonb_build_object('ok', false, 'code', 'already_reviewed');
  end if;

  v_raw := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  update public.review_requests
  set token_hash = pg_catalog.encode(extensions.digest(v_raw, 'sha256'), 'hex'),
      expires_at = v_expires, sent_at = null
  where id = v_req.id;

  perform public.write_audit_log(v_a.business_id, 'review_request.reissued', 'appointment',
    p_appointment_id::text, null, null);

  return jsonb_build_object('ok', true, 'review_request',
    jsonb_build_object('token', v_raw, 'expires_at', v_expires));
end $$;

-- ---------------------------------------------------------------------------
-- PUBLIC (service_role only): get_review_request / submit_review.
-- Every failure is the SAME {ok:false, code:'invalid_token'}: unknown, expired,
-- used, reopened/cancelled appointment, inactive business. Never raises (the
-- rate-limit counter lives in the caller and must survive).
-- ---------------------------------------------------------------------------
create or replace function public.get_review_request(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_r record;
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 256 then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;
  select rr.id, bz.name as business_name, br.name as branch_name, s.name as service_name,
         a.starts_at, br.timezone into v_r
  from public.review_requests rr
  join public.appointments a on a.id = rr.appointment_id and a.deleted_at is null and a.status = 'completed'
  join public.businesses bz on bz.id = rr.business_id and bz.deleted_at is null
  join public.branches br on br.id = rr.branch_id
  join public.services s on s.id = a.service_id
  where rr.token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
    and rr.used_at is null and rr.deleted_at is null and rr.expires_at > now()
    and public.business_is_active(rr.business_id);
  if v_r.id is null then return jsonb_build_object('ok', false, 'code', 'invalid_token'); end if;

  -- Deliberately NO staff name (doc §6.4: never ask customers to name staff).
  return jsonb_build_object('ok', true,
    'business_name', v_r.business_name, 'branch_name', v_r.branch_name,
    'service_name', v_r.service_name,
    'visit_date', to_char(v_r.starts_at at time zone v_r.timezone, 'YYYY-MM-DD'));
end $$;

create or replace function public.submit_review(p_token text, p_rating integer, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_r record;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_first text;
  v_google text;
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 256 then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  -- Lock the request row: two simultaneous submits serialise, the second sees
  -- used_at set.
  select rr.id, rr.business_id, rr.branch_id, rr.appointment_id, rr.client_id, a.staff_id,
         c.full_name into v_r
  from public.review_requests rr
  join public.appointments a on a.id = rr.appointment_id and a.deleted_at is null and a.status = 'completed'
  join public.businesses bz on bz.id = rr.business_id and bz.deleted_at is null
  left join public.clients c on c.id = rr.client_id
  where rr.token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
    and rr.used_at is null and rr.deleted_at is null and rr.expires_at > now()
    and public.business_is_active(rr.business_id)
  for update of rr;
  if v_r.id is null then return jsonb_build_object('ok', false, 'code', 'invalid_token'); end if;

  -- Validate everything BEFORE the first write.
  if p_rating is null or p_rating not between 1 and 5 then
    return jsonb_build_object('ok', false, 'code', 'invalid_rating');
  end if;
  if v_comment is not null and char_length(v_comment) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_comment');
  end if;
  if exists (select 1 from public.reviews rv where rv.appointment_id = v_r.appointment_id) then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  v_first := left(coalesce(nullif(split_part(btrim(coalesce(v_r.full_name, '')), ' ', 1), ''), 'Guest'), 60);

  insert into public.reviews (business_id, branch_id, appointment_id, review_request_id, client_id,
                              staff_id, rating, comment, reviewer_first_name)
  values (v_r.business_id, v_r.branch_id, v_r.appointment_id, v_r.id, v_r.client_id,
          v_r.staff_id, p_rating, v_comment, v_first);
  update public.review_requests set used_at = now() where id = v_r.id;

  -- THE compliance rule: the branch's Google link, returned for EVERY rating.
  select br.google_review_url into v_google from public.branches br where br.id = v_r.branch_id;
  return jsonb_build_object('ok', true, 'google_review_url', v_google);
end $$;

-- ---------------------------------------------------------------------------
-- Owner actions
-- ---------------------------------------------------------------------------
-- Keyset-paginated list. SECURITY INVOKER: RLS (reviews_select) is the boundary.
create or replace function public.list_reviews(
  p_business_id uuid,
  p_branch_id uuid default null,
  p_rating integer default null,
  p_has_reply boolean default null,
  p_featured boolean default null,
  p_limit integer default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with page as (
    select r.*
    from public.reviews r
    where r.business_id = p_business_id and r.deleted_at is null
      and (p_branch_id is null or r.branch_id = p_branch_id)
      and (p_rating is null or r.rating = p_rating)
      and (p_has_reply is null or (r.owner_reply is not null) = p_has_reply)
      and (p_featured is null or r.featured_on_website = p_featured)
      and (p_cursor_created_at is null
           or (r.created_at, r.id) < (p_cursor_created_at, coalesce(p_cursor_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by r.created_at desc, r.id desc
    -- one extra row: "is there a next page" costs nothing
    limit greatest(1, least(coalesce(p_limit, 20), 100)) + 1
  ), numbered as (
    select page.*, row_number() over (order by created_at desc, id desc) as rn from page
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', n.id, 'branch_id', n.branch_id, 'appointment_id', n.appointment_id,
        'rating', n.rating, 'comment', n.comment, 'reviewer_first_name', n.reviewer_first_name,
        'status', n.status, 'owner_reply', n.owner_reply, 'replied_at', n.replied_at,
        'featured_on_website', n.featured_on_website, 'created_at', n.created_at)
        order by n.rn)
      from numbered n where n.rn <= greatest(1, least(coalesce(p_limit, 20), 100))), '[]'::jsonb),
    'next_cursor', (select jsonb_build_object('created_at', n.created_at, 'id', n.id)
      from numbered n where n.rn = greatest(1, least(coalesce(p_limit, 20), 100))
        and exists (select 1 from numbered x where x.rn > greatest(1, least(coalesce(p_limit, 20), 100))))
  )
$$;

create or replace function public.reply_to_review(p_review_id uuid, p_reply text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_r record;
  v_reply text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  select rv.id, rv.business_id, rv.branch_id, rv.status, rv.owner_reply into v_r
  from public.reviews rv where rv.id = p_review_id and rv.deleted_at is null for update;
  if v_r.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.can(v_r.business_id, v_r.branch_id, 'reviews.reply')
     or not public.has_permission_at_branch_scope(v_r.business_id, v_r.branch_id, 'reviews.reply') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if v_r.status <> 'published' then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_reply is null or char_length(v_reply) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_reply');
  end if;

  update public.reviews set owner_reply = v_reply, replied_at = now(), replied_by = auth.uid()
  where id = p_review_id;

  perform public.write_audit_log(v_r.business_id, 'review.replied', 'review', p_review_id::text,
    jsonb_build_object('owner_reply', v_r.owner_reply), jsonb_build_object('owner_reply', v_reply));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.set_review_featured(p_review_id uuid, p_featured boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_r record;
begin
  if p_featured is null then return jsonb_build_object('ok', false, 'code', 'bad_request'); end if;
  select rv.id, rv.business_id, rv.branch_id, rv.status, rv.featured_on_website into v_r
  from public.reviews rv where rv.id = p_review_id and rv.deleted_at is null for update;
  if v_r.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.can(v_r.business_id, v_r.branch_id, 'reviews.feature_on_website')
     or not public.has_permission_at_branch_scope(v_r.business_id, v_r.branch_id, 'reviews.feature_on_website') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if v_r.status <> 'published' then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_r.featured_on_website = p_featured then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;
  -- The website shows at most 12: keep the public payload bounded.
  if p_featured and (select count(*) from public.reviews x
                     where x.business_id = v_r.business_id and x.featured_on_website
                       and x.status = 'published' and x.deleted_at is null) >= 12 then
    return jsonb_build_object('ok', false, 'code', 'too_many_featured');
  end if;

  update public.reviews
  set featured_on_website = p_featured,
      featured_at = case when p_featured then now() else null end
  where id = p_review_id;

  perform public.write_audit_log(v_r.business_id,
    case when p_featured then 'review.featured' else 'review.unfeatured' end,
    'review', p_review_id::text,
    jsonb_build_object('featured_on_website', v_r.featured_on_website),
    jsonb_build_object('featured_on_website', p_featured));
  return jsonb_build_object('ok', true, 'changed', true);
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.mark_completed(uuid) from public, anon;
grant execute on function public.mark_completed(uuid) to authenticated;
revoke all on function public.reissue_review_request(uuid) from public, anon;
grant execute on function public.reissue_review_request(uuid) to authenticated;
revoke all on function public.get_review_request(text) from public, anon, authenticated;
revoke all on function public.submit_review(text, integer, text) from public, anon, authenticated;
grant execute on function public.get_review_request(text) to service_role;
grant execute on function public.submit_review(text, integer, text) to service_role;
revoke all on function public.list_reviews(uuid, uuid, integer, boolean, boolean, integer, timestamptz, uuid) from public, anon;
grant execute on function public.list_reviews(uuid, uuid, integer, boolean, boolean, integer, timestamptz, uuid) to authenticated;
revoke all on function public.reply_to_review(uuid, text) from public, anon;
revoke all on function public.set_review_featured(uuid, boolean) from public, anon;
grant execute on function public.reply_to_review(uuid, text) to authenticated;
grant execute on function public.set_review_featured(uuid, boolean) to authenticated;

insert into public.rate_limit_rules (endpoint, scope, window_seconds, max_attempts, note) values
  ('get_review_request', 'ip', 3600, 60, 'Review page reads. A customer reloading their own page must not be blocked.'),
  ('submit_review', 'ip', 3600, 10, 'Review writes. 10 an hour from one address is already abnormal.');
