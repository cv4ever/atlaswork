-- Anonymous usage counts (launch plan D8, src/usage.ts): how many people reach each step of getting started, per
-- day. One row per day and moment holding only a number: no account, device, IP or content, so no count leads back to
-- a person. Anyone may add one through count_usage; nobody but the service role reads the table.
create table public.usage_counts (
  day date not null default current_date,
  event text not null check (event in ('onboarding_shown', 'onboarding_domains', 'onboarding_crew', 'onboarding_ready',
    'onboarding_finished', 'onboarding_skipped', 'own_domain_added', 'starter_built')),
  count integer not null default 0 check (count >= 0),
  primary key (day, event)
);
alter table public.usage_counts enable row level security;
revoke all on public.usage_counts from anon, authenticated;

-- Adds one to today's count; an unknown moment is refused by the check above.
create function public.count_usage(event text) returns void
language sql security definer set search_path = '' as $$
  insert into public.usage_counts as u (event, count) values (count_usage.event, 1)
  on conflict (day, event) do update set count = u.count + 1;
$$;
revoke execute on function public.count_usage from public;
grant execute on function public.count_usage to anon, authenticated;
