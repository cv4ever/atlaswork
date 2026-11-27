-- Anonymous counts (src/usage.ts) for planting a domain (agents-design D51): planted, from a common one, with another
-- agent than the one offered, the look opened, taken back with Undo, and deleted with its lone agent archived.
alter table public.usage_counts drop constraint usage_counts_event_check;
alter table public.usage_counts add constraint usage_counts_event_check check (event in ('onboarding_shown',
  'onboarding_domains', 'onboarding_crew', 'onboarding_ready', 'onboarding_finished', 'onboarding_skipped',
  'own_domain_added', 'starter_built', 'folder_linked', 'folder_reconnected', 'folder_unlinked', 'files_searched',
  'file_read', 'file_reply', 'onboarding_model', 'own_model_connected', 'memory_saved', 'memory_replaced',
  'memory_undone', 'memory_forgotten', 'ask_proposed', 'ask_sent', 'ask_always', 'ask_declined', 'domain_planted',
  'domain_planted_common', 'domain_keeper_changed', 'domain_look_opened', 'domain_unplanted',
  'domain_keeper_archived'));
