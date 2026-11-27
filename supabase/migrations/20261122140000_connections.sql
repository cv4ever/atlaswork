-- Connections to outside accounts (agents-design D74): Google Calendar first. One row per account and provider holds
-- the refresh token, encrypted by the connectors function (CONNECTOR_KEY) before it gets here, so the database never
-- sees it in the clear. Only the service role reads or writes rows; a signed-in person sees which providers are
-- connected and as whom, never the token.
create table public.connections (
  user_id uuid not null references auth.users on delete cascade,
  provider text not null check (provider in ('google_calendar')),
  account text not null default '' check (length(account) <= 320),
  token text not null check (length(token) <= 4000),
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.connections enable row level security;
revoke all on public.connections from public, anon, authenticated;

-- Settings → Connections: what this account has connected, without tokens.
create function public.my_connections() returns table (provider text, account text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.provider, c.account, c.created_at from public.connections c where c.user_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false);
$$;
revoke execute on function public.my_connections from public, anon;
grant execute on function public.my_connections to authenticated;

-- The connectors and agent functions: read, store and remove one account's connection.
create function public.connection_of(p_user uuid, p_provider text) returns table (account text, token text)
language sql stable set search_path = '' as $$
  select c.account, c.token from public.connections c where c.user_id = p_user and c.provider = p_provider;
$$;
create function public.set_connection_of(p_user uuid, p_provider text, p_account text, p_token text) returns void
language sql set search_path = '' as $$
  insert into public.connections (user_id, provider, account, token) values (p_user, p_provider, coalesce(p_account, ''), p_token)
    on conflict (user_id, provider) do update set account = excluded.account, token = excluded.token, created_at = now();
$$;
-- Returns the token it removed, so the function can revoke it at the provider.
create function public.drop_connection_of(p_user uuid, p_provider text) returns text
language sql set search_path = '' as $$
  delete from public.connections where user_id = p_user and provider = p_provider returning token;
$$;
revoke execute on function public.connection_of, public.set_connection_of, public.drop_connection_of from public, anon, authenticated;
grant execute on function public.connection_of, public.set_connection_of, public.drop_connection_of to service_role;
grant select, insert, update, delete on public.connections to service_role;
