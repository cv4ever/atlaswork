-- Anonymous counts (src/usage.ts) for who answers (agents-design D48): the first run's model action taken, and a
-- model of your own connected from Settings or by OpenRouter's sign-in.
alter table public.usage_counts drop constraint usage_counts_event_check;
alter table public.usage_counts add constraint usage_counts_event_check check (event in ('onboarding_shown',
  'onboarding_domains', 'onboarding_crew', 'onboarding_ready', 'onboarding_finished', 'onboarding_skipped',
  'own_domain_added', 'starter_built', 'folder_linked', 'folder_reconnected', 'folder_unlinked', 'files_searched',
  'file_read', 'file_reply', 'onboarding_model', 'own_model_connected'));
