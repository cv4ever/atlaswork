-- Jobs (agents-design D76): work an agent does for you, stored in the account so it outlives the page that asked.
-- The agent function creates one after admitting the work (so it counts as the reply or hand-off it is), claims it,
-- runs the agent loop, lands the result in the workspace and ends it. A job keeps its request (the snapshot the page
-- sent: what the agent may read and the conversation's recent messages) only until it ends, and at most 24 hours; the
-- row without it (who, which agent, where it lands, how it went) stays 7 days so a phone can see it, then goes.
create table public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('reply', 'handoff')),
  agent_id text not null check (length(agent_id) between 1 and 200),
  thread_id text not null check (length(thread_id) between 1 and 200),
  message_id text not null check (length(message_id) between 1 and 200),
  -- Where it may run (D77): the server, or later one of the account's computers, named `computer:<id>`.
  runs_on text not null default 'server' check (runs_on = 'server' or runs_on ~ '^computer:[^[:space:]]{1,100}$'),
  state text not null default 'waiting' check (state in ('waiting', 'running', 'done', 'failed')),
  request jsonb check (octet_length(request::text) <= 4000000),
  progress text check (length(progress) <= 200),
  error text check (length(error) <= 600),
  -- Who holds it and until when: a run that dies leaves it to be claimed again once the lease is over.
  worker text check (length(worker) <= 200),
  lease_until timestamptz,
  runs integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index agent_jobs_mine on public.agent_jobs (user_id, created_at desc);
create index agent_jobs_open on public.agent_jobs (expires_at) where state in ('waiting', 'running');
alter table public.agent_jobs enable row level security;
-- The account reads how its jobs go, never their requests or who holds them; only the service role writes.
create policy "Users read their own jobs" on public.agent_jobs for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.agent_jobs from anon, authenticated;
grant select (id, kind, agent_id, thread_id, message_id, runs_on, state, progress, error, runs, created_at, updated_at, ended_at)
  on public.agent_jobs to authenticated;

create function public.create_job(p_user uuid, p_kind text, p_agent text, p_thread text, p_message text, p_request jsonb,
  p_runs_on text default 'server') returns uuid
language sql security definer set search_path = '' as $$
  insert into public.agent_jobs (user_id, kind, agent_id, thread_id, message_id, request, runs_on)
    values (p_user, p_kind, p_agent, p_thread, p_message, p_request, p_runs_on)
    returning id;
$$;

-- A worker claims a job once: one that waits, or one whose last run died (its lease is over), and only where the job
-- may run. The server's runs name themselves `server:<run>`; a computer (D77) will claim as `computer:<id>`, through a
-- credential of its own that a function checks before calling this. Returns the job, or null when it wasn't claimed.
create function public.claim_job(p_job uuid, p_worker text, p_lease_seconds integer default 150) returns jsonb
language sql security definer set search_path = '' as $$
  update public.agent_jobs set state = 'running', worker = p_worker, lease_until = now() + make_interval(secs => p_lease_seconds),
      runs = runs + 1, updated_at = now()
    where id = p_job and expires_at > now() and (state = 'waiting' or (state = 'running' and lease_until < now()))
      and ((runs_on = 'server' and p_worker like 'server:%') or runs_on = p_worker)
    returning jsonb_build_object('id', id, 'user', user_id, 'kind', kind, 'agent', agent_id, 'thread', thread_id,
      'message', message_id, 'request', request, 'runs', runs);
$$;

-- What the job is doing now, while the worker still holds it; false once it doesn't.
create function public.job_progress(p_job uuid, p_worker text, p_progress text) returns boolean
language sql security definer set search_path = '' as $$
  with held as (
    update public.agent_jobs set progress = left(p_progress, 200), updated_at = now()
      where id = p_job and worker = p_worker and state = 'running' returning 1)
  select exists (select 1 from held);
$$;

-- The holder ends it, done or failed with why; the request goes with it.
create function public.finish_job(p_job uuid, p_worker text, p_state text, p_error text default null) returns boolean
language sql security definer set search_path = '' as $$
  with ended as (
    update public.agent_jobs set state = p_state, error = left(p_error, 600), request = null, progress = null,
        lease_until = null, ended_at = now(), updated_at = now()
      where id = p_job and worker = p_worker and state = 'running' and p_state in ('done', 'failed') returning 1)
  select exists (select 1 from ended);
$$;

-- Hourly: a job still open after 24 hours fails and drops its request, and a job that ended 7 days ago goes.
create function public.expire_jobs() returns void
language sql security definer set search_path = '' as $$
  update public.agent_jobs set state = 'failed', error = 'It ran out of time and was stopped.', request = null, progress = null,
      lease_until = null, ended_at = now(), updated_at = now()
    where state in ('waiting', 'running') and expires_at <= now();
  delete from public.agent_jobs where ended_at < now() - interval '7 days';
$$;

revoke execute on function public.create_job, public.claim_job, public.job_progress, public.finish_job, public.expire_jobs
  from public, anon, authenticated;
grant execute on function public.create_job, public.claim_job, public.job_progress, public.finish_job, public.expire_jobs
  to service_role;

select cron.schedule('agent-jobs-expire', '7 * * * *', 'select public.expire_jobs()');
