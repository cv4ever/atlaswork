-- Anonymous counts (src/usage.ts): where things are on a computer that agents offered to remember (agents-design
-- D80): offered, which the agent function counts as it lands one, and the ones you kept or turned down.
alter table public.usage_counts drop constraint usage_counts_event_check;
alter table public.usage_counts add constraint usage_counts_event_check check (event in ('onboarding_shown',
  'onboarding_domains', 'onboarding_crew', 'onboarding_ready', 'onboarding_finished', 'onboarding_skipped',
  'own_domain_added', 'starter_built', 'folder_linked', 'folder_reconnected', 'folder_unlinked', 'files_searched',
  'file_read', 'file_reply', 'onboarding_model', 'own_model_connected', 'memory_saved', 'memory_replaced',
  'memory_undone', 'memory_forgotten', 'ask_proposed', 'ask_sent', 'ask_always', 'ask_declined', 'domain_planted',
  'domain_planted_common', 'domain_keeper_changed', 'domain_look_opened', 'domain_unplanted',
  'domain_keeper_archived', 'shortcut_note', 'shortcut_atlas', 'shortcut_today', 'shortcut_needs', 'share_opened',
  'shortcut_voice', 'capture_dictated', 'capture_sorted', 'push_opened', 'agent_drafted', 'agent_drafted_existing',
  'agent_draft_saved', 'agent_draft_changed', 'agent_quiet_archived', 'agent_draft_tried', 'nav_today', 'nav_projects', 'nav_capture',
  'nav_chat', 'nav_needs', 'nav_more', 'nav_domain', 'nav_swipe', 'nav_search', 'nav_profile', 'nav_domains',
  'nav_library', 'nav_archive', 'nav_agents', 'nav_routines', 'nav_settings', 'describe_sent', 'describe_filled',
  'describe_dictated', 'describe_undone', 'describe_saved', 'project_reviewed', 'project_review_saved',
  'describe_stopped', 'agent_replied', 'agent_cant',
  'memory_learned', 'memory_learned_kept', 'memory_learned_declined'));
