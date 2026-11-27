-- Anonymous counts (src/usage.ts) for what agents remember (agents-design D49): memories saved and corrected, and the
-- ones taken back with Undo or forgotten from Briefing, so the share taken back shows whether agents remember well.
alter table public.usage_counts drop constraint usage_counts_event_check;
alter table public.usage_counts add constraint usage_counts_event_check check (event in ('onboarding_shown',
  'onboarding_domains', 'onboarding_crew', 'onboarding_ready', 'onboarding_finished', 'onboarding_skipped',
  'own_domain_added', 'starter_built', 'folder_linked', 'folder_reconnected', 'folder_unlinked', 'files_searched',
  'file_read', 'file_reply', 'onboarding_model', 'own_model_connected', 'memory_saved', 'memory_replaced',
  'memory_undone', 'memory_forgotten'));
