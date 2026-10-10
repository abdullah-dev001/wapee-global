-- "Get ready for your first booking" checklist on Today: remember a dismissal PER BUSINESS.
--
-- Whether each step is done is NOT stored: it is derived on the client from
-- branch_is_bookable() reason codes (single source of truth, docs/business-flows.md gap 6).
-- Only the owner's "dismiss" / "I copied my link" is remembered, so it is shared by every
-- device and every teammate who may see the card.
--
-- Businesses that exist today are marked dismissed: they are already past onboarding, and a
-- checklist that appeared for them would be noise. They still get the small "booking is not
-- available" banner if a required setup item is missing.

alter table public.businesses
  add column setup_checklist_dismissed_at timestamptz;

comment on column public.businesses.setup_checklist_dismissed_at is
  'When the setup checklist on Today was dismissed (or completed). Null = still shown to people with settings.booking. Set only through dismiss_setup_checklist().';

update public.businesses set setup_checklist_dismissed_at = now() where setup_checklist_dismissed_at is null;

create or replace function public.dismiss_setup_checklist(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.can(p_business_id, null, 'settings.booking') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  -- The first dismissal wins: pressing it twice (two devices) keeps the original time.
  update public.businesses
  set setup_checklist_dismissed_at = coalesce(setup_checklist_dismissed_at, now())
  where id = p_business_id and deleted_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.dismiss_setup_checklist is
  'Hides the Today setup checklist for the whole business. Needs settings.booking. Returns {ok, code}.';

revoke all on function public.dismiss_setup_checklist(uuid) from public, anon;
grant execute on function public.dismiss_setup_checklist(uuid) to authenticated;
