-- A size cap per account (launch plan R8): the free plan's database is 500 MB in total. Writes now go only through
-- save_workspace, so the cap can't be skipped by writing to the table directly.
drop policy "Users manage their own workspace" on public.workspace_records;
create policy "Users read their own workspace" on public.workspace_records for select to authenticated
  using ((select auth.uid()) = user_id and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));
revoke insert, update, delete on public.workspace_records from authenticated;

-- One changeset, all-or-nothing (WorkspaceStore.save): upserts, then deletes. `p_replace` first empties the workspace
-- (a backup restore). Runs as the owner, so every statement names the caller's rows itself. A changeset that leaves
-- the workspace over 25 MB is refused whole; deletes always fit, so a full workspace can still shrink.
create or replace function public.save_workspace(p_puts jsonb, p_deletes text[], p_replace boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if jsonb_typeof(p_puts) <> 'object' then raise exception 'puts must be an object' using errcode = '22023'; end if;
  if p_replace then delete from public.workspace_records where user_id = me; end if;
  insert into public.workspace_records (user_id, key, value)
    select me, item.key, item.value from jsonb_each(p_puts) as item
    on conflict (user_id, key) do update set value = excluded.value, updated_at = now();
  delete from public.workspace_records where user_id = me and key = any(coalesce(p_deletes, '{}'));
  -- shortcut: sums the whole workspace on every save; keep a running total per account if saves get slow.
  if (select coalesce(sum(octet_length(value::text)), 0) from public.workspace_records where user_id = me) > 25000000 then
    raise exception 'Your workspace is full (25 MB). Delete or archive something, then try again.' using errcode = '53400';
  end if;
end $$;
revoke execute on function public.save_workspace from public, anon;
grant execute on function public.save_workspace to authenticated;
