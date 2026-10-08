-- Pre-launch batch 2, task 2: change email / change password inside the app.
-- 1. profiles.email only ever mirrored auth.users at INSERT, so a confirmed email change left the team list,
--    notifications and exports on the OLD address. An AFTER UPDATE trigger now keeps it in step.
-- 2. log_account_event: the person's own security events (password changed, email change requested) as audit rows
--    with no business. Two fixed event names, no free text; a repeat of the same event within 10 s is ignored so the
--    table cannot be flooded.

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles set email = new.email where id = new.id and email is distinct from new.email;
  end if;
  return null;
end $$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

revoke all on function public.sync_profile_email() from public, anon, authenticated;

-- One-off: bring any profile that already drifted back in step (none expected: the app had no email change).
update public.profiles p set email = u.email
from auth.users u
where u.id = p.id and u.email is not null and p.email is distinct from u.email
  and p.deleted_at is null;

create or replace function public.log_account_event(p_event text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_action text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  v_action := case p_event
    when 'password_changed' then 'account.password_changed'
    when 'email_change_requested' then 'account.email_change_requested'
  end;
  if v_action is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_event');
  end if;
  if exists (
    select 1 from public.audit_logs a
    where a.actor_user_id = v_uid and a.action = v_action and a.created_at > now() - interval '10 seconds'
  ) then
    return jsonb_build_object('ok', true, 'logged', false);
  end if;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id)
  values (null, v_uid, v_action, 'user', v_uid::text);
  return jsonb_build_object('ok', true, 'logged', true);
end $$;

revoke all on function public.log_account_event(text) from public, anon;
grant execute on function public.log_account_event(text) to authenticated, service_role;
