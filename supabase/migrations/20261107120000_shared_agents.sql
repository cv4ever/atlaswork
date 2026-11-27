-- Agents shared with the community (agents-design D34): config only (name, face, role, instructions, write mode,
-- tools), never chats or workspace data. Anyone may browse; a signed-in person shares and unshares their own, keyed
-- by the agent's local id so sharing twice updates the same entry. Shares leave with the account.
create table public.shared_agents (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  source_agent uuid not null,
  name text not null check (length(name) between 1 and 40),
  portrait text not null check (portrait ~ '^[a-z]{1,24}$'),
  role text not null check (length(role) <= 80),
  instructions text not null check (length(instructions) <= 2000),
  write_mode text not null check (write_mode in ('full', 'propose')),
  tools jsonb not null default '{}' check (jsonb_typeof(tools) = 'object' and length(tools::text) <= 400),
  created_at timestamptz not null default now(),
  constraint shared_agents_owner_source_agent_key unique (owner, source_agent)
);
alter table public.shared_agents enable row level security;
create policy "Anyone can browse shared agents" on public.shared_agents for select to anon, authenticated using (true);
revoke all on public.shared_agents from anon, authenticated;
grant select (id, name, portrait, role, instructions, write_mode, tools, created_at) on public.shared_agents to anon, authenticated;
create index shared_agents_created_at on public.shared_agents (created_at desc);

-- Shares or updates one of the caller's agents; at most 20 shares per account.
create function public.share_agent(source_agent uuid, name text, portrait text, role text, instructions text, write_mode text, tools jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  shared uuid;
begin
  if me is null or coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if (select count(*) from public.shared_agents where owner = me and shared_agents.source_agent <> share_agent.source_agent) >= 20 then
    raise exception 'You can share up to 20 agents. Unshare one first.' using errcode = '53400';
  end if;
  insert into public.shared_agents as s (owner, source_agent, name, portrait, role, instructions, write_mode, tools)
  values (me, source_agent, name, portrait, role, instructions, write_mode, tools)
  on conflict on constraint shared_agents_owner_source_agent_key do update
    set name = excluded.name, portrait = excluded.portrait, role = excluded.role, instructions = excluded.instructions,
      write_mode = excluded.write_mode, tools = excluded.tools, created_at = now()
  returning id into shared;
  return shared;
end $$;
create function public.unshare_agent(source_agent uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.shared_agents where owner = (select auth.uid()) and shared_agents.source_agent = unshare_agent.source_agent;
$$;
-- Which of the caller's agents are shared, so the agent dialog can show Unshare.
create function public.my_shared_agents() returns setof uuid
language sql security definer set search_path = '' stable as $$
  select source_agent from public.shared_agents where owner = (select auth.uid());
$$;
revoke execute on function public.share_agent, public.unshare_agent, public.my_shared_agents from public, anon;
grant execute on function public.share_agent, public.unshare_agent, public.my_shared_agents to authenticated;
