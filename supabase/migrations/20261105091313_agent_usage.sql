-- Live agent replies and Workers AI Neurons per user and UTC day (the free Neuron allowance resets at 00:00 UTC).
-- Only the agent Edge Function writes here, through the two functions below with the service role.
create table public.agent_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  replies integer not null default 0,
  neurons integer not null default 0,
  primary key (user_id, day)
);
alter table public.agent_usage enable row level security;
create policy "Users read their own usage" on public.agent_usage
  for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.agent_usage from anon, authenticated;

-- Counts one reply for `p_user` and returns 'ok', or refuses without counting: 'user' at the per-user cap,
-- 'budget' once today's Neurons across everyone reach `p_neurons`. Concurrent replies can overshoot the budget by one each.
create function public.begin_agent_reply(p_user uuid, p_replies integer, p_neurons integer) returns text
language plpgsql set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  used integer;
begin
  if (select coalesce(sum(neurons), 0) from public.agent_usage where day = today) >= p_neurons then return 'budget'; end if;
  insert into public.agent_usage (user_id, day, replies) values (p_user, today, 1)
    on conflict (user_id, day) do update set replies = agent_usage.replies + 1 where agent_usage.replies < p_replies
    returning replies into used;
  return case when used is null then 'user' else 'ok' end;
end $$;

create function public.record_agent_neurons(p_user uuid, p_neurons integer) returns void
language sql set search_path = '' as $$
  update public.agent_usage set neurons = neurons + greatest(p_neurons, 0)
  where user_id = p_user and day = (now() at time zone 'utc')::date;
$$;

-- Callers could otherwise raise their own cap or erase their spend.
revoke execute on function public.begin_agent_reply, public.record_agent_neurons from public, anon, authenticated;
grant execute on function public.begin_agent_reply, public.record_agent_neurons to service_role;
