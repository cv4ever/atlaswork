-- A Routine dispatch requires a durable claim, not an optimistic Workspace write. Ordinary saves merge receipts
-- monotonically, so a stale device cannot erase another device's claim. A deliberate whole-workspace restore can.
create function public.merge_routine_runs(a jsonb, b jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from (
    select distinct on (key) key, value from (
      select * from jsonb_each(coalesce(a, '{}'::jsonb))
      union all
      select * from jsonb_each(coalesce(b, '{}'::jsonb))
    ) as receipts order by key, (value #>> '{}')::timestamptz desc
  ) as latest;
$$;
revoke execute on function public.merge_routine_runs from public, anon, authenticated;

-- Keep the existing authorization, all-or-nothing changeset and quota. Only receipt conflict handling changes.
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
    on conflict (user_id, key) do update set value = case when excluded.key = 'routineRuns'
      then public.merge_routine_runs(workspace_records.value, excluded.value) else excluded.value end, updated_at = now();
  delete from public.workspace_records where user_id = me and key = any(coalesce(p_deletes, '{}'));
  if (select coalesce(sum(octet_length(value::text)), 0) from public.workspace_records where user_id = me) > 25000000 then
    raise exception 'Your workspace is full (25 MB). Delete or archive something, then try again.' using errcode = '53400';
  end if;
end $$;

create function public.claim_routine(p_id text, p_due timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  receipts jsonb;
  claimed boolean;
begin
  if me is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_id is null or length(p_id) not between 1 and 200 or p_due is null or not isfinite(p_due) then
    raise exception 'a routine and finite due time are required' using errcode = '22023';
  end if;
  -- Even the first claim locks one shared row before checking its prior receipt.
  insert into public.workspace_records (user_id, key, value) values (me, 'routineRuns', '{}') on conflict do nothing;
  select value into receipts from public.workspace_records where user_id = me and key = 'routineRuns' for update;
  claimed := not receipts ? p_id or (receipts ->> p_id)::timestamptz < p_due;
  if claimed then
    -- Use the ordinary write's quota check. Any refusal rolls the entire claim back.
    perform public.save_workspace(jsonb_build_object('routineRuns', jsonb_build_object(p_id,
      to_char(p_due at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))), '{}');
    select value into receipts from public.workspace_records where user_id = me and key = 'routineRuns';
  end if;
  return jsonb_build_object('claimed', claimed, 'receipts', receipts);
end $$;
revoke execute on function public.claim_routine from public, anon;
grant execute on function public.claim_routine to authenticated;
