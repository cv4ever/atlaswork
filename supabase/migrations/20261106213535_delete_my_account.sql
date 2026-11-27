-- GDPR erasure from the app (Settings → Account → Delete account). Deleting the auth user cascades to
-- workspace_records, entitlements and agent_usage (each references auth.users on delete cascade).
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from auth.users where id = me;
end $$;
revoke execute on function public.delete_my_account from public, anon;
grant execute on function public.delete_my_account to authenticated;
