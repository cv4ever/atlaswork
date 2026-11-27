-- Work you hand off (agents-design D73) counts as several of the day's replies: `p_count` of them at once, admitted
-- only when all fit under the cap. Every other caller passes the default, one.
drop function public.begin_agent_reply(uuid, integer, integer, boolean, integer);
create function public.begin_agent_reply(p_user uuid, p_replies integer, p_neurons integer, p_own boolean default false,
  p_user_neurons integer default null, p_count integer default 1) returns text
language plpgsql set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  used integer;
begin
  if p_count is null or p_count < 1 or p_count > p_replies then return 'user'; end if;
  if not p_own then
    if not exists (select 1 from public.entitlements where user_id = p_user
      and (plan = 'pro' or (plan = 'trial' and trial_ends_at > now()))) then return 'plan'; end if;
    if (select coalesce(sum(neurons), 0) from public.agent_usage where day = today) >= p_neurons then return 'budget'; end if;
    if p_user_neurons is not null and (select coalesce(sum(neurons), 0) from public.agent_usage
      where day = today and user_id = p_user) >= p_user_neurons then return 'share'; end if;
  end if;
  insert into public.agent_usage (user_id, day, replies) values (p_user, today, p_count)
    on conflict (user_id, day) do update set replies = agent_usage.replies + p_count where agent_usage.replies + p_count <= p_replies
    returning replies into used;
  return case when used is null then 'user' else 'ok' end;
end $$;
revoke execute on function public.begin_agent_reply from public, anon, authenticated;
grant execute on function public.begin_agent_reply to service_role;
