-- Bring your own model (launch plan D16): a customer's own AI provider and key. The key is encrypted in Supabase Vault;
-- the customer can set, replace or remove it but never read it back. Only the agent function (service role) reads it.
create table public.model_keys (
  user_id uuid primary key references auth.users on delete cascade,
  provider text not null check (provider in ('openrouter', 'openai', 'anthropic')),
  -- OpenAI-compatible endpoints only: https on a public host name, never an address, so the function can't be aimed inward.
  base_url text check (base_url ~ '^https://[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]*)?$'
    and base_url !~ '^https://[0-9.]+([:/]|$)' and base_url !~* '^https://[^/]*(localhost|\.local|\.internal)([:/]|$)'),
  model text not null check (length(model) between 1 and 200),
  secret_id uuid not null,
  hint text not null,
  updated_at timestamptz not null default now()
);
alter table public.model_keys enable row level security;
revoke all on public.model_keys from anon, authenticated;

-- The Vault secret goes with its row, including when the account is deleted (the row cascades from auth.users).
create function public.forget_model_key() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id = old.secret_id;
  return old;
end $$;
revoke execute on function public.forget_model_key from public, anon, authenticated;
create trigger forget_model_key after delete on public.model_keys for each row execute function public.forget_model_key();

-- Saves the caller's model. `p_key` null keeps the stored key (changing only the model or address).
create function public.set_model_key(p_provider text, p_base_url text, p_model text, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  existing public.model_keys;
  secret uuid;
begin
  if me is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_key is not null and (length(p_key) not between 8 and 500 or p_key ~ '\s') then
    raise exception 'That doesn''t look like an API key.' using errcode = '22023';
  end if;
  select * into existing from public.model_keys where user_id = me;
  if p_key is null and existing is null then raise exception 'Add a key first.' using errcode = '22023'; end if;
  if p_key is null then
    secret := existing.secret_id;
  elsif existing is null then
    secret := vault.create_secret(p_key, 'model_key_' || me, 'Customer model key (D16)');
  else
    perform vault.update_secret(existing.secret_id, p_key);
    secret := existing.secret_id;
  end if;
  insert into public.model_keys (user_id, provider, base_url, model, secret_id, hint)
    values (me, p_provider, case when p_provider = 'openai' then nullif(p_base_url, '') end, p_model, secret,
      coalesce('…' || right(p_key, 4), existing.hint))
    on conflict (user_id) do update set provider = excluded.provider, base_url = excluded.base_url, model = excluded.model,
      hint = excluded.hint, updated_at = now();
end $$;

create function public.clear_model_key() returns void
language sql security definer set search_path = '' as $$
  delete from public.model_keys where user_id = (select auth.uid());
$$;

-- What the app may show: never the key, only its last four characters.
create function public.model_key_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('provider', provider, 'base_url', base_url, 'model', model, 'hint', hint)
  from public.model_keys where user_id = (select auth.uid());
$$;
revoke execute on function public.set_model_key, public.clear_model_key, public.model_key_status from public, anon;
grant execute on function public.set_model_key, public.clear_model_key, public.model_key_status to authenticated;

-- The agent function's read, with the decrypted key.
create function public.model_key_for(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('provider', k.provider, 'base_url', k.base_url, 'model', k.model, 'key', s.decrypted_secret)
  from public.model_keys k join vault.decrypted_secrets s on s.id = k.secret_id where k.user_id = p_user;
$$;
revoke execute on function public.model_key_for from public, anon, authenticated;
grant execute on function public.model_key_for to service_role;

-- A customer's own model needs no plan and spends none of our Neuron budget; only the per-user cap applies.
drop function public.begin_agent_reply(uuid, integer, integer);
create function public.begin_agent_reply(p_user uuid, p_replies integer, p_neurons integer, p_own boolean default false) returns text
language plpgsql set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  used integer;
begin
  if not p_own then
    if not exists (select 1 from public.entitlements where user_id = p_user
      and (plan = 'pro' or (plan = 'trial' and trial_ends_at > now()))) then return 'plan'; end if;
    if (select coalesce(sum(neurons), 0) from public.agent_usage where day = today) >= p_neurons then return 'budget'; end if;
  end if;
  insert into public.agent_usage (user_id, day, replies) values (p_user, today, 1)
    on conflict (user_id, day) do update set replies = agent_usage.replies + 1 where agent_usage.replies < p_replies
    returning replies into used;
  return case when used is null then 'user' else 'ok' end;
end $$;
revoke execute on function public.begin_agent_reply from public, anon, authenticated;
grant execute on function public.begin_agent_reply to service_role;
