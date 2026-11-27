-- Routines while the app is closed (launch plan D17, agents-design D54). An account that opts in ("Run routines while
-- I'm away") has its due routines run by the `routines` Edge Function, which pg_cron calls every 15 minutes, as long as
-- no device has had the app open in the last 10 minutes (the app runs them itself then) and one did within 7 days.
-- The app reports its time zone each time it's opened or comes back into view. Your name and "about you" live here
-- too, so every device and the server greet you the same way.
create table public.away_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  run_away boolean not null default false,
  time_zone text not null default 'UTC' check (length(time_zone) between 1 and 64),
  person_name text not null default '' check (length(person_name) <= 80),
  person_about text not null default '' check (length(person_about) <= 600),
  last_seen timestamptz not null default now(),
  last_run timestamptz
);
alter table public.away_settings enable row level security;
create policy "Users read their own away settings" on public.away_settings for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.away_settings from anon, authenticated;
grant select on public.away_settings to authenticated;

-- The app, on open and on coming back into view: the account was just seen, in this time zone. A zone Postgres
-- doesn't know is refused, so the server never runs a routine on the wrong clock.
create function public.seen_app(p_time_zone text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_time_zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;
  insert into public.away_settings (user_id, time_zone, last_seen) values (me, p_time_zone, now())
    on conflict (user_id) do update set time_zone = excluded.time_zone, last_seen = now();
end $$;

-- Settings → Routines' switch and the profile: each argument left null keeps what's stored.
create function public.set_away(p_run_away boolean default null, p_person_name text default null, p_person_about text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.away_settings (user_id, run_away, person_name, person_about)
    values (me, coalesce(p_run_away, false), coalesce(left(p_person_name, 80), ''), coalesce(left(p_person_about, 600), ''))
    on conflict (user_id) do update set
      run_away = coalesce(p_run_away, away_settings.run_away),
      person_name = coalesce(left(p_person_name, 80), away_settings.person_name),
      person_about = coalesce(left(p_person_about, 600), away_settings.person_about);
end $$;
revoke execute on function public.seen_app, public.set_away from public, anon;
grant execute on function public.seen_app, public.set_away to authenticated;

-- The same writes as the signed-in functions, for one named account; only the service role (the routines function)
-- may call them. save_workspace and claim_routine now delegate here, so both paths keep one set of rules.
create function public.save_workspace_of(p_user uuid, p_puts jsonb, p_deletes text[], p_replace boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then raise exception 'no account' using errcode = '42501'; end if;
  if jsonb_typeof(p_puts) <> 'object' then raise exception 'puts must be an object' using errcode = '22023'; end if;
  if p_replace then delete from public.workspace_records where user_id = p_user; end if;
  insert into public.workspace_records (user_id, key, value)
    select p_user, item.key, item.value from jsonb_each(p_puts) as item
    on conflict (user_id, key) do update set value = case when excluded.key = 'routineRuns'
      then public.merge_routine_runs(workspace_records.value, excluded.value) else excluded.value end, updated_at = now();
  delete from public.workspace_records where user_id = p_user and key = any(coalesce(p_deletes, '{}'));
  if (select coalesce(sum(octet_length(value::text)), 0) from public.workspace_records where user_id = p_user) > 25000000 then
    raise exception 'Your workspace is full (25 MB). Delete or archive something, then try again.' using errcode = '53400';
  end if;
end $$;

create function public.claim_routine_of(p_user uuid, p_id text, p_due timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  receipts jsonb;
  claimed boolean;
begin
  if p_user is null then raise exception 'no account' using errcode = '42501'; end if;
  if p_id is null or length(p_id) not between 1 and 200 or p_due is null or not isfinite(p_due) then
    raise exception 'a routine and finite due time are required' using errcode = '22023';
  end if;
  -- Even the first claim locks one shared row before checking its prior receipt.
  insert into public.workspace_records (user_id, key, value) values (p_user, 'routineRuns', '{}') on conflict do nothing;
  select value into receipts from public.workspace_records where user_id = p_user and key = 'routineRuns' for update;
  claimed := not receipts ? p_id or (receipts ->> p_id)::timestamptz < p_due;
  if claimed then
    -- Use the ordinary write's quota check. Any refusal rolls the entire claim back.
    perform public.save_workspace_of(p_user, jsonb_build_object('routineRuns', jsonb_build_object(p_id,
      to_char(p_due at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))), '{}');
    select value into receipts from public.workspace_records where user_id = p_user and key = 'routineRuns';
  end if;
  return jsonb_build_object('claimed', claimed, 'receipts', receipts);
end $$;

create function public.load_workspace_of(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.workspace_records where user_id = p_user;
$$;

create or replace function public.save_workspace(p_puts jsonb, p_deletes text[], p_replace boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform public.save_workspace_of(me, p_puts, p_deletes, p_replace);
end $$;

create or replace function public.claim_routine(p_id text, p_due timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return public.claim_routine_of(me, p_id, p_due);
end $$;

-- Who the routines function runs now: opted in, seen within 7 days (paused after that until the next visit), no app
-- open in the last 10 minutes, and able to answer (Pro, a running trial, or a model of their own).
create function public.away_accounts() returns table (user_id uuid, time_zone text, person_name text, person_about text)
language sql stable security definer set search_path = '' as $$
  select a.user_id, a.time_zone, a.person_name, a.person_about from public.away_settings a
  where a.run_away and a.last_seen > now() - interval '7 days' and a.last_seen < now() - interval '10 minutes'
    and (exists (select 1 from public.entitlements e where e.user_id = a.user_id and (e.plan = 'pro' or (e.plan = 'trial' and e.trial_ends_at > now())))
      or exists (select 1 from public.model_keys k where k.user_id = a.user_id));
$$;

create function public.away_ran(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  update public.away_settings set last_run = now() where user_id = p_user;
$$;
revoke execute on function public.save_workspace_of, public.claim_routine_of, public.load_workspace_of, public.away_accounts, public.away_ran
  from public, anon, authenticated;
grant execute on function public.save_workspace_of, public.claim_routine_of, public.load_workspace_of, public.away_accounts, public.away_ran
  to service_role;

-- Every 15 minutes pg_cron asks the routines function to run what's due. The function's address and the bearer secret
-- it checks (the function's ROUTINES_CRON_SECRET) come from Vault (`routines_url`, `routines_cron_secret`), set once
-- outside migrations; until they exist the job posts nowhere and nothing runs.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('routines-away', '*/15 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'routines_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'routines_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000)
$$);
