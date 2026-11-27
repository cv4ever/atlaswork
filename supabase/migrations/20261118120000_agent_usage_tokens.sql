-- What live replies read and wrote, per user and UTC day (agents-design D66, D67): input tokens over every model call
-- of a reply, the part a provider served from its prompt cache, and output tokens (the model's hidden reasoning
-- included, which Workers AI prices at about twice an input token), so the admin page's Operations shows them per
-- reply from real use rather than the demo.
alter table public.agent_usage
  add column input_tokens bigint not null default 0,
  add column cached_tokens bigint not null default 0,
  add column output_tokens bigint not null default 0;

-- The function the agent and routines Edge Functions call after each reply; tokens default to 0 so a function deployed
-- before this migration's code keeps working with its two arguments.
drop function public.record_agent_neurons(uuid, integer);
create function public.record_agent_neurons(p_user uuid, p_neurons integer, p_input integer default 0, p_cached integer default 0, p_output integer default 0) returns void
language sql set search_path = '' as $$
  update public.agent_usage set neurons = neurons + greatest(p_neurons, 0),
    input_tokens = input_tokens + greatest(p_input, 0), cached_tokens = cached_tokens + greatest(p_cached, 0),
    output_tokens = output_tokens + greatest(p_output, 0)
  where user_id = p_user and day = (now() at time zone 'utc')::date;
$$;

revoke execute on function public.record_agent_neurons from public, anon, authenticated;
grant execute on function public.record_agent_neurons to service_role;
