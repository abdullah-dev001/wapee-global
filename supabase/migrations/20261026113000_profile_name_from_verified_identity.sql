-- Profile name follows the VERIFIED identity (found in the Google sign-in test A4, 2026-10-23).
--
-- profiles.full_name is copied from the signup metadata at INSERT (handle_new_user) and never
-- again. Someone who registers another person's address with email + password but never
-- confirms it therefore chooses the profile name. When the real owner later signs in with Google,
-- Supabase links Google to that same (unconfirmed) user, removes the unverified email identity
-- and the password, confirms the email and replaces the auth metadata with Google's, but the
-- profile kept the squatter's name ("A4 Unconfirmed Squatter" on dev), shown in team lists.
--
-- Rule (AFTER UPDATE on auth.users), never overwriting a name the confirmed owner chose:
--   1. FIRST confirmation (email_confirmed_at NULL -> set): the name in profiles came from the
--      unconfirmed signup, which the verified owner never confirmed. Take the name from the
--      metadata the confirmation arrived with (Google's on a link). For a plain email
--      confirmation that is the same name as before, so nothing changes.
--   2. Already confirmed: only FILL an empty profile name from the metadata (e.g. a password
--      account with no name that links Google). A non-empty name is the owner's choice: kept.
--
-- The trigger sits on Supabase Auth's own table: a failure here must never block a sign-in, so
-- an error is raised as a WARNING (visible in the database logs) and the auth update goes on.

create or replace function public.sync_profile_name_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), '')
  ), 120);
  if v_name is null then
    return null;
  end if;

  begin
    if old.email_confirmed_at is null and new.email_confirmed_at is not null then
      update public.profiles set full_name = v_name
      where id = new.id and full_name is distinct from v_name;
    else
      update public.profiles set full_name = v_name
      where id = new.id and nullif(btrim(coalesce(full_name, '')), '') is null;
    end if;
  exception when others then
    raise warning 'sync_profile_name_from_auth: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end $$;

comment on function public.sync_profile_name_from_auth is
  'AFTER UPDATE on auth.users: on the FIRST email confirmation the profile name follows the confirmed metadata (a squatter''s unconfirmed signup cannot choose it); afterwards it only fills an empty name. Never blocks the auth update.';

revoke all on function public.sync_profile_name_from_auth() from public, anon, authenticated;

drop trigger if exists on_auth_user_name_sync on auth.users;
create trigger on_auth_user_name_sync
  after update of email_confirmed_at, raw_user_meta_data on auth.users
  for each row execute function public.sync_profile_name_from_auth();
