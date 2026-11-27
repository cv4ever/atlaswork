-- Replies Groq answered because Workers AI refused (agents-design D67): the function falls back silently, so without
-- this nobody sees that the shared allowance ran out (2026-11-19 and 20: Workers AI refused all day). Counted per
-- user and UTC day like the rest of agent_usage; Operations shows them per day.
alter table public.agent_usage add column stand_ins integer not null default 0;

-- `p_stood_in` defaults to false so a function deployed before this migration's code keeps working.
drop function public.record_agent_neurons(uuid, integer, integer, integer, integer);
create function public.record_agent_neurons(p_user uuid, p_neurons integer, p_input integer default 0, p_cached integer default 0, p_output integer default 0,
  p_stood_in boolean default false) returns void
language sql set search_path = '' as $$
  update public.agent_usage set neurons = neurons + greatest(p_neurons, 0),
    input_tokens = input_tokens + greatest(p_input, 0), cached_tokens = cached_tokens + greatest(p_cached, 0),
    output_tokens = output_tokens + greatest(p_output, 0), stand_ins = stand_ins + (case when p_stood_in then 1 else 0 end)
  where user_id = p_user and day = (now() at time zone 'utc')::date;
$$;

revoke execute on function public.record_agent_neurons from public, anon, authenticated;
grant execute on function public.record_agent_neurons to service_role;
