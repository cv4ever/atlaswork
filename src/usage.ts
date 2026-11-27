// Anonymous usage counts (launch plan D8): how many people reach each step of getting started, per day, so we can see
// where the first run loses people. A call only adds one to today's count for a named moment. It sends no account,
// device id, cookie or content, and the table keeps no rows per person (`count_usage` in the
// `20261109120000_usage_counts.sql` migration). Production builds on a real host only: development, tests and the
// production builds the speed check and `vite preview` serve on loopback never count. Until 2026-11-15 they did, and
// with the app closed to strangers every count was such a run; those rows were deleted that day.
import { backend } from "./account.ts";

export const usageEvents = ["onboarding_shown", "onboarding_domains", "onboarding_crew", "onboarding_ready",
  "onboarding_finished", "onboarding_skipped", "own_domain_added", "starter_built",
  // Linked folders (agents-design D47): links made, reopened and removed, file tools run, and replies that used files.
  "folder_linked", "folder_reconnected", "folder_unlinked", "files_searched", "file_read", "file_reply",
  // Who answers (agents-design D48): the first run's model action taken, and a model of your own connected anywhere.
  "onboarding_model", "own_model_connected",
  // What agents remember (agents-design D49): memories saved and corrected, and the ones you undid or forgot; where
  // things are on a computer (D80): offered (counted by the agent function as it lands), kept, and turned down.
  "memory_saved", "memory_replaced", "memory_undone", "memory_forgotten", "memory_learned", "memory_learned_kept", "memory_learned_declined",
  // Agents asking each other (agents-design D50): questions drafted, and your Send, Always and Decline on them.
  "ask_proposed", "ask_sent", "ask_always", "ask_declined",
  // Planting a domain (agents-design D51): planted, from a common one, with another agent than the one offered, the look
  // opened, taken back with Undo, and deleted with its lone agent archived.
  "domain_planted", "domain_planted_common", "domain_keeper_changed", "domain_look_opened", "domain_unplanted", "domain_keeper_archived",
  // Opening the app from outside it (agents-design D52): each home-screen shortcut, and something shared to it.
  "shortcut_note", "shortcut_atlas", "shortcut_today", "shortcut_needs", "share_opened",
  // Capture (agents-design D53): the Speak shortcut, the microphone started, and a capture handed to Atlas to sort.
  "shortcut_voice", "capture_dictated", "capture_sorted",
  // Routines while you're away (agents-design D55): a notification tapped open.
  "push_opened",
  // Agents Atlas drafts (agents-design D57): drafted, starting from a crew or suggested agent, saved from the dialog,
  // saved with your own changes, archived from the draft's quiet-agent offer, and tried on Atlas's test request.
  "agent_drafted", "agent_drafted_existing", "agent_draft_saved", "agent_draft_changed", "agent_quiet_archived", "agent_draft_tried",
  // The phone's navigation (agents-design D59): each bar button and Chat's hold, a domain seed, a swipe between
  // domains, Search, your picture, and each page in More, to see what the bars should hold.
  "nav_today", "nav_projects", "nav_capture", "nav_chat", "nav_needs", "nav_more", "nav_domain", "nav_swipe",
  "nav_search", "nav_profile", "nav_domains", "nav_library", "nav_archive", "nav_agents", "nav_routines",
  "nav_settings",
  // Describe it (agents-design D63): words sent from a dialog, fills that changed it, the microphone started, Undo,
  // a dialog saved after a fill, a chat's project proposal opened in the dialog and started from there, and Stop.
  "describe_sent", "describe_filled", "describe_dictated", "describe_undone", "describe_saved", "project_reviewed", "project_review_saved",
  "describe_stopped",
  // What agents can't do (agents-design D61, 2026-11-20): every reply to you, and those that say they can't do what
  // you asked and propose nothing, so the share shows how often people hit a missing tool. No words are sent.
  "agent_replied", "agent_cant"] as const;
export type UsageEvent = (typeof usageEvents)[number];

/** Adds one to today's count for `event`. Fire and forget: a failed count never shows or retries. */
export function countUsage(event: UsageEvent) {
  if (!backend || !import.meta.env.PROD || ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname)) return;
  void fetch(`${backend.url}/rest/v1/rpc/count_usage`, {
    method: "POST", keepalive: true,
    headers: { apikey: backend.key, "content-type": "application/json" },
    body: JSON.stringify({ event }),
  }).catch(() => {});
}
