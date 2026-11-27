-- Chat messages one record each (agents-design D76). Threads were saved whole, so a reply the agent function landed
-- in a chat while you wrote in it overwrote your message, or yours overwrote the reply (D73). Now
-- `message:<thread>:<id>` holds one message, as `{thread, n, message}` with `n` its place in the thread when written,
-- and `thread:<id>` the rest (title, read count, members, session starts). Each writer sends only the messages it
-- added or changed (src/records.ts `accountRecordsOf`), so both survive. Reads still get whole threads, so the app
-- reads one shape and an app from before this change keeps working.
do $$
declare existing text;
begin
  select conname into existing from pg_constraint
    where conrelid = 'public.workspace_records'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%key ~%';
  if existing is not null then execute format('alter table public.workspace_records drop constraint %I', existing); end if;
end $$;
alter table public.workspace_records add constraint workspace_records_key_check
  check (key ~ '^(domains|routineRuns|projectOrder|initialized|everyAgent|(project|note|task|agent|thread|team|topic|brief|memory|run|message):[^[:space:]]{1,200})$');

-- Turns the named threads that still hold their messages into a thread record and one record per message. An app
-- from before this change writes threads whole: its messages replace their records, as its whole write did before,
-- and messages only other writers added stay. A message id twice in one thread keeps its later copy.
create function public.split_threads(p_user uuid, p_keys text[]) returns void
language sql security definer set search_path = '' as $$
  insert into public.workspace_records (user_id, key, value)
    select distinct on (held.key) p_user, held.key, held.value from (
      select 'message:' || substr(r.key, 8) || ':' || (m.message ->> 'id') as key,
        jsonb_build_object('thread', substr(r.key, 8), 'n', m.n - 1, 'message', m.message) as value, m.n
      from public.workspace_records r,
        jsonb_array_elements(case when jsonb_typeof(r.value -> 'messages') = 'array' then r.value -> 'messages' else '[]' end)
          with ordinality as m (message, n)
      where r.user_id = p_user and r.key = any(p_keys) and m.message ? 'id'
    ) as held order by held.key, held.n desc
    on conflict (user_id, key) do update set value = excluded.value, updated_at = now();
  update public.workspace_records set value = value - 'messages', updated_at = now()
    where user_id = p_user and key = any(p_keys) and value ? 'messages';
$$;
revoke execute on function public.split_threads from public, anon, authenticated;

-- The one write every path uses (save_workspace, the routines and agent functions): as before, plus whole threads
-- split as they arrive, and a deleted thread taking its messages with it.
create or replace function public.save_workspace_of(p_user uuid, p_puts jsonb, p_deletes text[], p_replace boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  gone text[] := array(select substr(item, 8) from unnest(coalesce(p_deletes, '{}')) as item where item like 'thread:%');
begin
  if p_user is null then raise exception 'no account' using errcode = '42501'; end if;
  if jsonb_typeof(p_puts) <> 'object' then raise exception 'puts must be an object' using errcode = '22023'; end if;
  if p_replace then delete from public.workspace_records where user_id = p_user; end if;
  insert into public.workspace_records (user_id, key, value)
    select p_user, item.key, item.value from jsonb_each(p_puts) as item
    on conflict (user_id, key) do update set value = case when excluded.key = 'routineRuns'
      then public.merge_routine_runs(workspace_records.value, excluded.value) else excluded.value end, updated_at = now();
  perform public.split_threads(p_user, array(select item from jsonb_object_keys(p_puts) as item where item like 'thread:%'));
  delete from public.workspace_records where user_id = p_user and key = any(coalesce(p_deletes, '{}'));
  if cardinality(gone) > 0 then
    delete from public.workspace_records where user_id = p_user and key like 'message:%' and value ->> 'thread' = any(gone);
  end if;
  if (select coalesce(sum(octet_length(value::text)), 0) from public.workspace_records where user_id = p_user) > 25000000 then
    raise exception 'Your workspace is full (25 MB). Delete or archive something, then try again.' using errcode = '53400';
  end if;
end $$;

-- Reads put each thread's messages back in it, in the order they were written (`n`; two written at the same place by
-- different writers go by time). A message whose thread is gone (deleted while a reply landed) stays out.
create or replace function public.load_workspace_of(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with messages as (
    select value ->> 'thread' as thread,
      jsonb_agg(value -> 'message' order by (value ->> 'n')::int, value -> 'message' ->> 'at' nulls first, value -> 'message' ->> 'id') as list
    from public.workspace_records where user_id = p_user and key like 'message:%' group by 1
  )
  select coalesce(jsonb_object_agg(r.key, case when r.key like 'thread:%'
      then r.value || jsonb_build_object('messages', coalesce(m.list, r.value -> 'messages', '[]'::jsonb)) else r.value end), '{}'::jsonb)
  from public.workspace_records r left join messages m on r.key like 'thread:%' and m.thread = substr(r.key, 8)
  where r.user_id = p_user and r.key not like 'message:%';
$$;

-- The signed-in read, through the same assembly; as under row-level security before, nothing for a signed-out or
-- anonymous caller.
create or replace function public.load_workspace() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then return '{}'::jsonb; end if;
  return public.load_workspace_of(me);
end $$;

-- Every thread saved so far.
do $$
declare account uuid;
begin
  for account in select distinct user_id from public.workspace_records where key like 'thread:%' and value ? 'messages' loop
    perform public.split_threads(account,
      array(select key from public.workspace_records where user_id = account and key like 'thread:%' and value ? 'messages'));
  end loop;
end $$;
