-- Jobs across several computers (agents-design D84), first slice: a computer's name is unique in its account, since
-- a search across computers names each path by its computer ("Office PC: Documents/..."), and a computer asks for its
-- next job every 3 s while its account has a job open or had one in the last minute, so moving a reply between
-- computers doesn't wait 10 s a move.

-- Names: existing duplicates (case aside) keep the oldest as it is and number the others ("Office PC 2"), then an
-- index keeps them apart.
do $$
declare
  twin record;
  n int;
  candidate text;
begin
  for twin in
    select id, user_id, name from (
      select id, user_id, name, created_at, row_number() over (partition by user_id, lower(name) order by created_at, id) as rank
      from public.computers) ranked
    where rank > 1 order by user_id, created_at, id
  loop
    n := 2;
    loop
      candidate := left(twin.name, 76) || ' ' || n;
      exit when not exists (select 1 from public.computers where user_id = twin.user_id and lower(name) = lower(candidate));
      n := n + 1;
    end loop;
    update public.computers set name = candidate where id = twin.id;
  end loop;
end;
$$;
create unique index computers_name_per_account on public.computers (user_id, lower(name));

-- Registering refuses a name the account already has, saying so.
create or replace function public.register_computer(p_name text) returns jsonb
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
  if exists (select 1 from public.computers where user_id = me and lower(name) = lower(label)) then
    raise exception 'You already have a computer called %. Give this one another name.', label using errcode = '23505';
  end if;
  insert into public.computers (user_id, name, token_hash)
    values (me, label, encode(extensions.digest(token, 'sha256'), 'hex')) returning id into made;
  return jsonb_build_object('id', made, 'name', label, 'token', token);
end;
$$;

-- The helper's ask: its next job as `next_computer_job` claims it (null when none waits), and whether the account has
-- a job open or had one in the last minute (`busy`), when it asks again in 3 s rather than 10. Helpers from before
-- D84 keep calling `next_computer_job`.
create function public.computer_poll(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  job jsonb := public.next_computer_job(p_token);
  owner uuid := (select user_id from public.computers where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'));
begin
  return jsonb_build_object('job', job, 'busy', exists (select 1 from public.agent_jobs where user_id = owner
    and (state in ('waiting', 'running') or created_at > now() - interval '1 minute' or ended_at > now() - interval '1 minute')));
end;
$$;
revoke execute on function public.computer_poll from public, anon, authenticated;
grant execute on function public.computer_poll to anon, authenticated;
