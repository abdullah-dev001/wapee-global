-- Removes the 33_seed_account.sql fixture by recorded key (users p12ashot.*, business p12ashot-acc). Safe to re-run.
do $$
declare v_biz uuid;
begin
  select id into v_biz from public.businesses where slug = 'p12ashot-acc';
  if v_biz is not null then
    perform set_config('wapee.erase_business', v_biz::text, true);
    delete from public.businesses where id = v_biz;
    perform set_config('wapee.erase_business', '', true);
  end if;
  delete from public.audit_logs where action = 'account.deleted' and entity_type = 'user' and created_at > now() - interval '1 day' and entity_id in (select id::text from auth.users where email like 'p12ashot.%@example.com');
  delete from auth.users where email like 'p12ashot.%@example.com';
end $$;
select (select count(*) from auth.users where email like 'p12ashot.%') as users_left, (select count(*) from public.businesses where slug = 'p12ashot-acc') as biz_left;
