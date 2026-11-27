-- A computer runs its jobs (agents-design D77): its helper runs the agent loop there and asks the agent function for
-- each model call, image, calendar read and progress line, and for the landing. The function knows a computer by its
-- token (`computer_of`) and lets it act only on a job that computer holds; it counts each model call against the job
-- (`job_call`), so a computer can't spend more of the account's replies on a job than a hand-off may.
alter table public.agent_jobs add column calls integer not null default 0;

-- The computer a token names, marked as seen; null for an unknown or removed one.
create function public.computer_of(p_token text) returns jsonb
language sql security definer set search_path = '' as $$
  update public.computers set last_seen = now()
    where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    returning jsonb_build_object('id', id, 'user', user_id, 'name', name);
$$;

-- Counts one model call against a job its worker holds; the count so far, or null when the worker doesn't hold it.
create function public.job_call(p_job uuid, p_worker text) returns integer
language sql security definer set search_path = '' as $$
  update public.agent_jobs set calls = calls + 1, updated_at = now()
    where id = p_job and worker = p_worker and state = 'running'
    returning calls;
$$;

revoke execute on function public.computer_of, public.job_call from public, anon, authenticated;
grant execute on function public.computer_of, public.job_call to service_role;
