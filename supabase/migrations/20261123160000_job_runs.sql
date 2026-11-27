-- Long jobs across runs (agents-design D76; Carlos chose runs that start the next themselves, a minute sweep for runs
-- that died, and one admission for the whole job). A hand-off's run that reaches its time with budget left saves what
-- the model did so far (`turns`: its tool calls and what they returned, and `used`, what it read, D81) and how long it
-- ran (`ms`), lets the job wait for the server again, and starts the next run, which carries on from there. The saved
-- turns go with the request when the job ends or expires.
alter table public.agent_jobs
  add column turns jsonb check (octet_length(turns::text) <= 4000000),
  add column used jsonb check (octet_length(used::text) <= 20000),
  add column ms integer not null default 0 check (ms >= 0);

create or replace function public.claim_job(p_job uuid, p_worker text, p_lease_seconds integer default 150) returns jsonb
language sql security definer set search_path = '' as $$
  update public.agent_jobs set state = 'running', worker = p_worker, lease_until = now() + make_interval(secs => p_lease_seconds),
      runs = runs + 1, updated_at = now()
    where id = p_job and expires_at > now() and (state = 'waiting' or (state = 'running' and lease_until < now()))
      and ((runs_on = 'server' and p_worker like 'server:%') or runs_on = p_worker)
    returning jsonb_build_object('id', id, 'user', user_id, 'kind', kind, 'agent', agent_id, 'thread', thread_id,
      'message', message_id, 'request', request, 'runs', runs, 'turns', turns, 'used', used, 'ms', ms);
$$;

-- The holder lets the job wait for another worker (`p_runs_on`), with what it did so far and how long it ran.
drop function public.release_job(uuid, text, text);
create function public.release_job(p_job uuid, p_worker text, p_runs_on text, p_turns jsonb default null, p_used jsonb default null,
  p_ms integer default 0) returns boolean
language sql security definer set search_path = '' as $$
  with released as (
    update public.agent_jobs set state = 'waiting', runs_on = p_runs_on, worker = null, lease_until = null,
        turns = coalesce(p_turns, turns), used = coalesce(p_used, used), ms = ms + greatest(p_ms, 0), updated_at = now()
      where id = p_job and worker = p_worker and state = 'running' returning 1)
  select exists (select 1 from released);
$$;

create or replace function public.finish_job(p_job uuid, p_worker text, p_state text, p_error text default null) returns boolean
language sql security definer set search_path = '' as $$
  with ended as (
    update public.agent_jobs set state = p_state, error = left(p_error, 600), request = null, turns = null, used = null, progress = null,
        lease_until = null, ended_at = now(), updated_at = now()
      where id = p_job and worker = p_worker and state = 'running' and p_state in ('done', 'failed') returning 1)
  select exists (select 1 from ended);
$$;

create or replace function public.expire_jobs() returns void
language sql security definer set search_path = '' as $$
  update public.agent_jobs set state = 'failed', error = 'It ran out of time and was stopped.', request = null, turns = null, used = null,
      progress = null, lease_until = null, ended_at = now(), updated_at = now()
    where state in ('waiting', 'running') and expires_at <= now();
  delete from public.agent_jobs where ended_at < now() - interval '7 days';
$$;

-- What the server picks up again: a job left waiting for it over 30 seconds (its next run never started), or one whose
-- run died (its lease is over). Jobs waiting for a device or a computer stay theirs.
create function public.stalled_jobs() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.agent_jobs
    where runs_on = 'server' and expires_at > now()
      and ((state = 'waiting' and updated_at < now() - interval '30 seconds') or (state = 'running' and lease_until < now()))
    order by updated_at limit 20;
$$;

-- A long job's next run goes on without counting another reply, while the plan, the shared budget and the account's
-- share allow (begin_agent_reply's checks, without the count).
create function public.may_continue_agent(p_user uuid, p_neurons integer, p_own boolean default false, p_user_neurons integer default null)
  returns text
language plpgsql stable set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
begin
  if p_own then return 'ok'; end if;
  if not exists (select 1 from public.entitlements where user_id = p_user
    and (plan = 'pro' or (plan = 'trial' and trial_ends_at > now()))) then return 'plan'; end if;
  if (select coalesce(sum(neurons), 0) from public.agent_usage where day = today) >= p_neurons then return 'budget'; end if;
  if p_user_neurons is not null and (select coalesce(sum(neurons), 0) from public.agent_usage
    where day = today and user_id = p_user) >= p_user_neurons then return 'share'; end if;
  return 'ok';
end $$;

revoke execute on function public.release_job, public.stalled_jobs, public.may_continue_agent from public, anon, authenticated;
grant execute on function public.release_job, public.stalled_jobs, public.may_continue_agent to service_role;

-- Every minute, when a job stalled, pg_cron asks the agent function to start its next run. The function's address and
-- the bearer it checks (its JOBS_SECRET) come from Vault (`agent_url`, `jobs_secret`), set once outside migrations;
-- until they exist nothing is posted.
select cron.schedule('agent-jobs-continue', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'agent_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'jobs_secret')),
    body := '{"sweep":true}'::jsonb,
    timeout_milliseconds := 5000)
  where exists (select 1 from public.stalled_jobs())
    and exists (select 1 from vault.decrypted_secrets where name = 'agent_url')
$$);
