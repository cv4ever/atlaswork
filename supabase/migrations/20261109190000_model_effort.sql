-- How hard the customer's own reasoning model thinks (Settings → AI model: Fast, Balanced, Thorough). Null leaves the
-- model's default. Applies to OpenAI and OpenRouter; Anthropic ignores it.
alter table public.model_keys add column effort text check (effort in ('low', 'medium', 'high'));

drop function public.set_model_key(text, text, text, text);
-- Saves the caller's model. `p_key` null keeps the stored key (changing only the model, address or effort).
create function public.set_model_key(p_provider text, p_base_url text, p_model text, p_key text, p_effort text default null) returns void
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
  insert into public.model_keys (user_id, provider, base_url, model, secret_id, hint, effort)
    values (me, p_provider, case when p_provider = 'openai' then nullif(p_base_url, '') end, p_model, secret,
      coalesce('…' || right(p_key, 4), existing.hint), p_effort)
    on conflict (user_id) do update set provider = excluded.provider, base_url = excluded.base_url, model = excluded.model,
      hint = excluded.hint, effort = excluded.effort, updated_at = now();
end $$;
revoke execute on function public.set_model_key from public, anon;
grant execute on function public.set_model_key to authenticated;

create or replace function public.model_key_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('provider', provider, 'base_url', base_url, 'model', model, 'hint', hint, 'effort', effort)
  from public.model_keys where user_id = (select auth.uid());
$$;

create or replace function public.model_key_for(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('provider', k.provider, 'base_url', k.base_url, 'model', k.model, 'key', s.decrypted_secret, 'effort', k.effort)
  from public.model_keys k join vault.decrypted_secrets s on s.id = k.secret_id where k.user_id = p_user;
$$;
