-- Every device reads its jobs since agents-design D76's progress, so a job left waiting for a device that went away
-- would show as on its way for a day. A reply that paused for this device's files (D47) can only go on within its resume
-- token's 5 minutes (resume.ts), so a job waiting for a device over 6 minutes fails, and the chat offers Retry. The
-- expiry runs every 5 minutes instead of hourly to catch them.
create or replace function public.expire_jobs() returns void
language sql security definer set search_path = '' as $$
  update public.agent_jobs set state = 'failed', error = 'It ran out of time and was stopped.', request = null, turns = null, used = null,
      progress = null, lease_until = null, ended_at = now(), updated_at = now()
    where state in ('waiting', 'running') and expires_at <= now();
  update public.agent_jobs set state = 'failed', error = 'The device that asked didn''t come back with its files. Ask again.',
      request = null, turns = null, used = null, progress = null, ended_at = now(), updated_at = now()
    where state = 'waiting' and runs_on like 'device:%' and updated_at < now() - interval '6 minutes';
  delete from public.agent_jobs where ended_at < now() - interval '7 days';
$$;

select cron.schedule('agent-jobs-expire', '*/5 * * * *', 'select public.expire_jobs()');
