-- Removing a computer forgets where things are on it (agents-design D80): as before it stops the computer's token and
-- fails the work waiting for it, and now it also deletes every memory learned there (`memory:<id>` records naming it
-- in `computer`), and the pills of ones still offered, kept or turned down under replies (`ChatMessage.learned`) say
-- it was removed, with their sentence gone and nothing left to keep or undo. Memories from your own words never name a
-- computer, so they stay even when their text mentions it.
create or replace function public.remove_computer(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from public.computers where id = p_id and user_id = me;
  if not found then return false; end if;
  update public.agent_jobs set state = 'failed', error = 'That computer was removed, so the work waiting for it stopped.',
      request = null, turns = null, used = null, progress = null, worker = null, lease_until = null, ended_at = now(), updated_at = now()
    where user_id = me and runs_on = 'computer:' || p_id and state in ('waiting', 'running');
  delete from public.workspace_records
    where user_id = me and key like 'memory:%' and value #>> '{computer,id}' = p_id::text;
  update public.workspace_records r set value = jsonb_set(r.value, '{message,learned}', (
      select jsonb_agg(case when entry #>> '{memory,computer,id}' = p_id::text
        then jsonb_set(entry - 'replaced', '{memory,text}', '""') || '{"state": "gone"}' else entry end order by place)
      from jsonb_array_elements(r.value #> '{message,learned}') with ordinality as learned (entry, place))), updated_at = now()
    where r.user_id = me and r.key like 'message:%' and jsonb_typeof(r.value #> '{message,learned}') = 'array'
      and exists (select 1 from jsonb_array_elements(r.value #> '{message,learned}') as entry
        where entry #>> '{memory,computer,id}' = p_id::text);
  return true;
end;
$$;
