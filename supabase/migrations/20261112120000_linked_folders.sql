-- Linked folders (docs/agents-design.md D47).

-- A reply that paused for file tools resumes on a signed, one-use token (supabase/functions/agent/resume.ts), so the
-- leg that resumes it isn't another reply. Each token's nonce is claimed once here; claims older than an hour go,
-- since a token lives five minutes. Only the agent function, as the service role, reads or writes them.
create table public.agent_resumes (
  nonce uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.agent_resumes enable row level security;
revoke all on public.agent_resumes from anon, authenticated;

-- True the first time a nonce is claimed, false on any replay.
create function public.claim_agent_resume(p_user uuid, p_nonce uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.agent_resumes where created_at < now() - interval '1 hour';
  insert into public.agent_resumes (nonce, user_id) values (p_nonce, p_user) on conflict do nothing;
  return found;
end $$;
revoke execute on function public.claim_agent_resume from public, anon, authenticated;
grant execute on function public.claim_agent_resume to service_role;

-- Anonymous counts (src/usage.ts) for the experiment: folders linked, reopened and removed, file tools run, and
-- replies that used files.
alter table public.usage_counts drop constraint usage_counts_event_check;
alter table public.usage_counts add constraint usage_counts_event_check check (event in ('onboarding_shown',
  'onboarding_domains', 'onboarding_crew', 'onboarding_ready', 'onboarding_finished', 'onboarding_skipped',
  'own_domain_added', 'starter_built', 'folder_linked', 'folder_reconnected', 'folder_unlinked', 'files_searched',
  'file_read', 'file_reply'));
