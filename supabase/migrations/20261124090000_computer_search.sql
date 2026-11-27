-- Searching a computer (agents-design D78): whether agents may search the folders on a computer's search list. The
-- list itself never leaves the computer (the desktop app's settings.json), and its helper searches only that list and
-- only while the app there has search on, so this flag says where a search may go, never what it may read. The
-- computer's own window turns it on or off through its account; every device of the account reads it.
alter table public.computers add column search boolean not null default false;
grant select (search) on public.computers to authenticated;

-- Turns one of your computers' search on or off. False when it isn't yours.
create function public.set_computer_search(p_id uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.computers set search = coalesce(p_on, false) where id = p_id and user_id = me;
  return found;
end;
$$;

revoke execute on function public.set_computer_search from public, anon, authenticated;
grant execute on function public.set_computer_search to authenticated;
