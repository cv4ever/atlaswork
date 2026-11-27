-- Open signups (launch plan step 5, D12, 2026-11-27): anyone may create an account. A self-signup starts on Free and
-- answers through an AI model of its own; Atlaswork's hosted model stays invite-only, so an account the admin page
-- invited (Supabase sets `invited_at`) still starts the 14-day trial. Existing accounts keep their plan.
create or replace function public.start_trial() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(new.is_anonymous, false) then
    insert into public.entitlements (user_id, plan, trial_ends_at)
      values (new.id, case when new.invited_at is null then 'free' else 'trial' end,
        case when new.invited_at is null then null else now() + interval '14 days' end)
      on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
revoke execute on function public.start_trial from public, anon, authenticated;
