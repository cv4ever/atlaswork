-- Accounts and server storage (launch plan step 5, D15).

-- What each account may use. A new account gets the 14-day Pro trial (D12); billing (step 6) will set 'pro' or
-- 'free' with the service role. Anonymous users get no row, so they get no live agents.
create table public.entitlements (
  user_id uuid primary key references auth.users on delete cascade,
  plan text not null check (plan in ('trial', 'pro', 'free')),
  trial_ends_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.entitlements enable row level security;
create policy "Users read their own entitlement" on public.entitlements
  for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.entitlements from anon, authenticated;

create function public.start_trial() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(new.is_anonymous, false) then
    insert into public.entitlements (user_id, plan, trial_ends_at) values (new.id, 'trial', now() + interval '14 days')
      on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
revoke execute on function public.start_trial from public, anon, authenticated;
-- An anonymous user who later links an email becomes a real account: is_anonymous turns false.
create trigger start_trial after insert or update of is_anonymous on auth.users
  for each row execute function public.start_trial();
insert into public.entitlements (user_id, plan, trial_ends_at)
  select id, 'trial', now() + interval '14 days' from auth.users where not coalesce(is_anonymous, false)
  on conflict (user_id) do nothing;

-- Live replies need Pro or a running trial: 'plan' refuses without counting.
create or replace function public.begin_agent_reply(p_user uuid, p_replies integer, p_neurons integer) returns text
language plpgsql set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  used integer;
begin
  if not exists (select 1 from public.entitlements where user_id = p_user
    and (plan = 'pro' or (plan = 'trial' and trial_ends_at > now()))) then return 'plan'; end if;
  if (select coalesce(sum(neurons), 0) from public.agent_usage where day = today) >= p_neurons then return 'budget'; end if;
  insert into public.agent_usage (user_id, day, replies) values (p_user, today, 1)
    on conflict (user_id, day) do update set replies = agent_usage.replies + 1 where agent_usage.replies < p_replies
    returning replies into used;
  return case when used is null then 'user' else 'ok' end;
end $$;

-- The workspace, one row per record, keyed like the browser's IndexedDB store (src/storage.ts). File bodies stay
-- on the device that added them (D11).
create table public.workspace_records (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null check (key ~ '^(domains|routineRuns|projectOrder|initialized|(project|note|task|agent|thread|team|topic):[^[:space:]]{1,200})$'),
  value jsonb not null check (octet_length(value::text) <= 1000000),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.workspace_records enable row level security;
-- Anonymous users (the old live-agent sign-in) have no workspace on the server.
create policy "Users manage their own workspace" on public.workspace_records for all to authenticated
  using ((select auth.uid()) = user_id and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false))
  with check ((select auth.uid()) = user_id and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));
revoke all on public.workspace_records from anon;

-- One object of every record: PostgREST caps plain selects at 1,000 rows.
create function public.load_workspace() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.workspace_records where user_id = (select auth.uid());
$$;

-- One changeset, all-or-nothing (WorkspaceStore.save): upserts, then deletes. `p_replace` first empties the workspace
-- (a backup restore). Runs as the caller, so row-level security limits it to their own rows.
create function public.save_workspace(p_puts jsonb, p_deletes text[], p_replace boolean default false) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if jsonb_typeof(p_puts) <> 'object' then raise exception 'puts must be an object' using errcode = '22023'; end if;
  if p_replace then delete from public.workspace_records where user_id = (select auth.uid()); end if;
  insert into public.workspace_records (user_id, key, value)
    select (select auth.uid()), item.key, item.value from jsonb_each(p_puts) as item
    on conflict (user_id, key) do update set value = excluded.value, updated_at = now();
  delete from public.workspace_records where user_id = (select auth.uid()) and key = any(coalesce(p_deletes, '{}'));
end $$;
revoke execute on function public.load_workspace, public.save_workspace from public, anon;
grant execute on function public.load_workspace, public.save_workspace to authenticated;
