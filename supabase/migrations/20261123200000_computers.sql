-- Computers (agents-design D77): each install of the desktop app is one of the account's computers, with a token of
-- its own that only claims that computer's jobs, never the account's session (R12). The server keeps the token's hash,
-- not the token. Signed in, you register a computer (the desktop window does, in one click) and list or remove yours;
-- a computer asks for its next job with its token alone, through the publishable key.
create extension if not exists pgcrypto with schema extensions;

create table public.computers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 80),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen timestamptz
);
create index computers_user on public.computers (user_id);

alter table public.computers enable row level security;
create policy "Users read their own computers" on public.computers for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.computers from anon, authenticated;
grant select (id, name, created_at, last_seen) on public.computers to authenticated;

-- Registers a computer for the signed-in account and returns its token, the only time it's shown. At most ten.
create function public.register_computer(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  label text := left(btrim(coalesce(p_name, '')), 80);
  token text := 'awc_' || translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  made uuid;
begin
  if me is null or coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if label = '' then raise exception 'a computer needs a name' using errcode = '22023'; end if;
  if (select count(*) from public.computers where user_id = me) >= 10 then
    raise exception 'Ten computers is the most an account can have. Remove one first.' using errcode = '53400';
  end if;
  insert into public.computers (user_id, name, token_hash)
    values (me, label, encode(extensions.digest(token, 'sha256'), 'hex')) returning id into made;
  return jsonb_build_object('id', made, 'name', label, 'token', token);
end;
$$;

-- Removes one of your computers: its token stops working at once, and work waiting for it fails, so the chat offers
-- Retry instead of waiting a day. False when it isn't yours.
create function public.remove_computer(p_id uuid) returns boolean
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
  return true;
end;
$$;

-- A computer's next job: its token names it (an unknown or removed one is refused), it's marked as seen, and the
-- oldest job waiting for it is claimed for the job's whole budget (D76's 10 minutes and some), with what was asked and
-- what earlier runs left (`claim_job`). Null when nothing waits.
create function public.next_computer_job(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  computer uuid;
  owner uuid;
  job uuid;
begin
  update public.computers set last_seen = now()
    where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    returning id, user_id into computer, owner;
  if computer is null then raise exception 'unknown computer' using errcode = '28000'; end if;
  select id into job from public.agent_jobs
    where user_id = owner and runs_on = 'computer:' || computer and expires_at > now()
      and (state = 'waiting' or (state = 'running' and lease_until < now()))
    order by created_at limit 1 for update skip locked;
  if job is null then return null; end if;
  return public.claim_job(job, 'computer:' || computer, 900);
end;
$$;

revoke execute on function public.register_computer, public.remove_computer, public.next_computer_job from public, anon, authenticated;
grant execute on function public.register_computer, public.remove_computer to authenticated;
grant execute on function public.next_computer_job to anon, authenticated;
