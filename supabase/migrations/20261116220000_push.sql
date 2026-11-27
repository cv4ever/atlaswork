-- Push notifications for what a routine posts while the app is closed (launch plan D17 phase 2b, agents-design D55).
-- Each device that turns them on keeps one subscription; the routines function reads them with your quiet hours.
create table public.push_subscriptions (
  endpoint text primary key check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh text not null check (length(p256dh) between 1 and 200),
  auth text not null check (length(auth) between 1 and 100),
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Quiet hours, as minutes past midnight on the account's clock: none from 21:00 until 08:00 unless you change it.
alter table public.away_settings
  add column quiet_from smallint not null default 1260 check (quiet_from between 0 and 1439),
  add column quiet_to smallint not null default 480 check (quiet_to between 0 and 1439);

-- This device's subscription, for the signed-in account. A browser that changes account moves its subscription along.
create function public.save_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values (p_endpoint, me, p_p256dh, p_auth)
    on conflict (endpoint) do update set user_id = me, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;

create function public.forget_push(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

create function public.set_quiet_hours(p_from smallint, p_to smallint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.away_settings (user_id, quiet_from, quiet_to) values (me, p_from, p_to)
    on conflict (user_id) do update set quiet_from = excluded.quiet_from, quiet_to = excluded.quiet_to;
end $$;
revoke execute on function public.save_push, public.forget_push, public.set_quiet_hours from public, anon;
grant execute on function public.save_push, public.forget_push, public.set_quiet_hours to authenticated;

-- For the routines function: an account's subscriptions with its quiet hours, and dropping one the push service says is gone.
create function public.pushes_of(p_user uuid) returns table (endpoint text, p256dh text, auth text, quiet_from smallint, quiet_to smallint)
language sql stable security definer set search_path = '' as $$
  select s.endpoint, s.p256dh, s.auth, coalesce(a.quiet_from, 1260::smallint), coalesce(a.quiet_to, 480::smallint)
  from public.push_subscriptions s left join public.away_settings a on a.user_id = s.user_id where s.user_id = p_user;
$$;

create function public.drop_push(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;
revoke execute on function public.pushes_of, public.drop_push from public, anon, authenticated;
grant execute on function public.pushes_of, public.drop_push to service_role;

-- Anonymous counts (src/usage.ts): a notification tapped open.
alter table public.usage_counts drop constraint usage_counts_event_check;
alter table public.usage_counts add constraint usage_counts_event_check check (event in ('onboarding_shown',
  'onboarding_domains', 'onboarding_crew', 'onboarding_ready', 'onboarding_finished', 'onboarding_skipped',
  'own_domain_added', 'starter_built', 'folder_linked', 'folder_reconnected', 'folder_unlinked', 'files_searched',
  'file_read', 'file_reply', 'onboarding_model', 'own_model_connected', 'memory_saved', 'memory_replaced',
  'memory_undone', 'memory_forgotten', 'ask_proposed', 'ask_sent', 'ask_always', 'ask_declined', 'domain_planted',
  'domain_planted_common', 'domain_keeper_changed', 'domain_look_opened', 'domain_unplanted',
  'domain_keeper_archived', 'shortcut_note', 'shortcut_atlas', 'shortcut_today', 'shortcut_needs', 'share_opened',
  'shortcut_voice', 'capture_dictated', 'capture_sorted', 'push_opened'));
