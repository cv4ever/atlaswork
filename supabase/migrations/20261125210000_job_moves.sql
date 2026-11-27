-- Jobs across several computers (agents-design D84, slice 3): a reply that reads a file on another of the account's
-- computers moves there, and its request says where it now runs (`at`, with what its searches found), so release_job
-- may replace the request as it lets the job wait for that computer. Only the agent function calls it, as before.
drop function public.release_job(uuid, text, text, jsonb, jsonb, integer);
create function public.release_job(p_job uuid, p_worker text, p_runs_on text, p_turns jsonb default null, p_used jsonb default null,
  p_ms integer default 0, p_request jsonb default null) returns boolean
language sql security definer set search_path = '' as $$
  with released as (
    update public.agent_jobs set state = 'waiting', runs_on = p_runs_on, worker = null, lease_until = null,
        turns = coalesce(p_turns, turns), used = coalesce(p_used, used), ms = ms + greatest(p_ms, 0),
        request = coalesce(p_request, request), updated_at = now()
      where id = p_job and worker = p_worker and state = 'running' returning 1)
  select exists (select 1 from released);
$$;
revoke execute on function public.release_job from public, anon, authenticated;
grant execute on function public.release_job to service_role;
