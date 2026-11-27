-- Tidying a computer (agents-design D79): whether agents may move and rename files in the folders on that computer's
-- search list (D78) and make their folders in its Documents. The computer's own window turns it on, only while search
-- is on there (Documents must be on its list too, which only the computer knows), and every device of the account reads
-- it. Turning search off turns tidying off with it.
alter table public.computers add column tidy boolean not null default false;
grant select (tidy) on public.computers to authenticated;

-- Turns one of your computers' tidying on or off. False when it isn't yours; on refuses while its search is off.
create function public.set_computer_tidy(p_id uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if coalesce(p_on, false) and exists (select 1 from public.computers where id = p_id and user_id = me and not search) then
    raise exception 'Turn on search on that computer first.' using errcode = '22023';
  end if;
  update public.computers set tidy = coalesce(p_on, false) where id = p_id and user_id = me;
  return found;
end;
$$;

revoke execute on function public.set_computer_tidy from public, anon, authenticated;
grant execute on function public.set_computer_tidy to authenticated;

-- Search off takes tidying with it, since tidying moves only what a search found.
create or replace function public.set_computer_search(p_id uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.computers set search = coalesce(p_on, false), tidy = tidy and coalesce(p_on, false)
    where id = p_id and user_id = me;
  return found;
end;
$$;
