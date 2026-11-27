-- Searching every computer at once (agents-design D84): the computer running a reply searches its own index and the
-- agent function asks each of the account's other computers with search on, as a short ask here. The computer claims
-- one with computer_poll and answers from its index with answer_search; the function reads the answers with the
-- service role, waits at most 15 s and deletes the asks, so a query and what it found stay only that long.
create table public.computer_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  computer_id uuid not null references public.computers on delete cascade,
  query text not null check (length(query) between 1 and 400),
  answer jsonb check (answer is null or octet_length(answer::text) <= 100000),
  claimed_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index computer_searches_waiting on public.computer_searches (computer_id, created_at) where claimed_at is null;
alter table public.computer_searches enable row level security;
-- No policies: only the service role and the functions below touch it.
revoke all on public.computer_searches from public, anon, authenticated;

-- The helper's ask (D84 slice 1) also hands its computer the oldest search ask waiting for it, made in the last 20 s
-- (`search`), which it answers before anything else.
create or replace function public.computer_poll(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  job jsonb := public.next_computer_job(p_token);
  computer uuid;
  owner uuid;
  asked uuid;
  words text;
begin
  select id, user_id into computer, owner from public.computers
    where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  update public.computer_searches set claimed_at = now()
    where id = (select s.id from public.computer_searches s where s.computer_id = computer and s.claimed_at is null
      and s.created_at > now() - interval '20 seconds' order by s.created_at limit 1 for update skip locked)
    returning id, computer_searches.query into asked, words;
  return jsonb_build_object('job', job, 'busy', exists (select 1 from public.agent_jobs where user_id = owner
      and (state in ('waiting', 'running') or created_at > now() - interval '1 minute' or ended_at > now() - interval '1 minute')),
    'search', case when asked is null then null else jsonb_build_object('id', asked, 'query', words) end);
end;
$$;

-- A computer answers a search ask it claimed, once; any other token, or a second answer, changes nothing.
create function public.answer_search(p_token text, p_id uuid, p_answer jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  computer uuid := (select id from public.computers where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'));
begin
  if computer is null then raise exception 'unknown computer' using errcode = '28000'; end if;
  update public.computer_searches set answer = p_answer, answered_at = now()
    where id = p_id and computer_id = computer and claimed_at is not null and answered_at is null;
  return found;
end;
$$;
revoke execute on function public.answer_search from public, anon, authenticated;
grant execute on function public.answer_search to anon, authenticated;

-- The 5-minute job sweep also deletes asks a function left behind (it deletes its own when it's done).
create or replace function public.expire_jobs() returns void
language sql security definer set search_path = '' as $$
  update public.agent_jobs set state = 'failed', error = 'It ran out of time and was stopped.', request = null, turns = null, used = null,
      progress = null, lease_until = null, ended_at = now(), updated_at = now()
    where state in ('waiting', 'running') and expires_at <= now();
  update public.agent_jobs set state = 'failed', error = 'The device that asked didn''t come back with its files. Ask again.',
      request = null, turns = null, used = null, progress = null, ended_at = now(), updated_at = now()
    where state = 'waiting' and runs_on like 'device:%' and updated_at < now() - interval '6 minutes';
  delete from public.agent_jobs where ended_at < now() - interval '7 days';
  delete from public.computer_searches where created_at < now() - interval '10 minutes';
$$;
