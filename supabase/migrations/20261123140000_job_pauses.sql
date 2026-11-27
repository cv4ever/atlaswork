-- Chat replies are jobs too (agents-design D76). A reply that reads a linked folder pauses for files only the device
-- that asked can read (D47): its run lets the job go to that device, `device:<resume nonce>`, and the leg that resumes
-- with the device's file results claims it as that, so no other worker picks it up without them.
alter table public.agent_jobs drop constraint agent_jobs_runs_on_check;
alter table public.agent_jobs add constraint agent_jobs_runs_on_check
  check (runs_on = 'server' or runs_on ~ '^(computer|device):[^[:space:]]{1,100}$');

-- The holder lets the job wait for another worker, `p_runs_on`; false once it doesn't hold it.
create function public.release_job(p_job uuid, p_worker text, p_runs_on text) returns boolean
language sql security definer set search_path = '' as $$
  with released as (
    update public.agent_jobs set state = 'waiting', runs_on = p_runs_on, worker = null, lease_until = null, updated_at = now()
      where id = p_job and worker = p_worker and state = 'running' returning 1)
  select exists (select 1 from released);
$$;
revoke execute on function public.release_job from public, anon, authenticated;
grant execute on function public.release_job to service_role;
