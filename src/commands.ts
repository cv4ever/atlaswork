// What an agent can do beyond talking (D33): changes it proposes, links it hands over (a mail draft, a calendar
// file, a web search) and questions it asks another agent (D50). Each one's spec goes to the live agent function as a
// tool (supabase/functions/agent/logic.ts, `Command`), which checks the model's arguments against it. Drafts bind
// identities in the request's Agent's Workspace; Room admits them against current records before posting, and again
// at Apply. Link drafts are never sent. Each command is one `CommandDef` in src/commands/ (tasks, projects, agents,
// links, show, fill, files; request.ts and define.ts are what they share), listed in `commands` below; a new agent
// ability is one more entry there, and the function needs no change.
import type { Command } from "../supabase/functions/agent/logic.ts";
import type { AgentWorkspace, Handoff } from "./agentWorkspace.ts";
import { canUse, routineKinds } from "./model.ts";
import type { Ask, CommandOrigin, Display, Proposal } from "./model.ts";
import type { Fill } from "./formFill.ts";
import type { CommandDef } from "./commands/define.ts";
import { propose_tasks, sort_capture, complete_tasks, reschedule_tasks, plan_day, move_tasks } from "./commands/tasks.ts";
import { propose_project, arrange_page, review_changes } from "./commands/projects.ts";
import { propose_agent, propose_my_setup, ask_agent } from "./commands/agents.ts";
import { draft_email, add_to_calendar, search_web } from "./commands/links.ts";
import { offer_choices, show_widgets, ask_calendar_access } from "./commands/show.ts";
import { fill_project, fill_domain } from "./commands/fill.ts";
import { tidy_files } from "./commands/files.ts";
import { prepare } from "./commands/request.ts";
import type { Source, Request } from "./commands/request.ts";

const commands: Record<string, CommandDef> = {
  propose_tasks, propose_project, sort_capture, complete_tasks, reschedule_tasks, plan_day, move_tasks, arrange_page, review_changes,
  propose_agent, propose_my_setup, draft_email, add_to_calendar, search_web, ask_agent, offer_choices, show_widgets, ask_calendar_access,
  fill_project, fill_domain, tidy_files,
};

/**
 * The commands this agent's permissions allow, as the live function receives them. A command whose shown choices are
 * empty (a place to put things in, for an agent on the bench) has no valid call, so it isn't offered; an optional
 * argument or field may have none. A required list's required field counts, as move_tasks' place does. A dialog's
 * request (D63) gets its fill command alone, and nothing else ever gets one.
 */
export function specsOf(source: Source, selected?: AgentWorkspace): Command[] {
  const request = prepare(source, selected);
  const callable = (choice: { show?: boolean; optional?: boolean; oneOf?: string[] }) => !choice.show || choice.optional || !!choice.oneOf?.length;
  return Object.entries(commands)
    .filter(([, command]) => !command.fill === !request.form && command.needs.every((tool) => canUse(request.agent, tool)) && (command.when?.(request) ?? true)
      // A weekly improvement only suggests (D68): what it shows, never a proposal, link or question.
      && (request.routine?.kind !== "improve" || !!command.show))
    .map(([name, command]) => ({ name, ...command.spec(request) }))
    .filter((spec) => Object.values(spec.args).every((arg) => callable(arg) && (arg.optional || Object.values(arg.fields ?? {}).every(callable))));
}

/** The function's draft as the command it names, when this agent may use it. */
function commandOf(request: Request, draft: unknown) {
  if (typeof draft !== "object" || !draft || !("command" in draft) || !("args" in draft)) return undefined;
  const command = typeof draft.command === "string" && Object.hasOwn(commands, draft.command) ? commands[draft.command] : undefined;
  if (!command || typeof draft.args !== "object" || !draft.args || !command.needs.every((tool) => canUse(request.agent, tool))
    || request.routine?.kind === "improve" && !command.show) return undefined;
  return { name: draft.command as string, command, args: draft.args as Record<string, unknown> };
}

function originOf(request: Request, name: string): CommandOrigin {
  return { agentId: request.agent.id, command: name,
    needs: [...new Set([...commands[name].needs, ...request.routine ? routineKinds[request.routine.kind].needs : []])],
    ...request.workspace.attached ? { attachedNoteId: request.workspace.attached.id } : {} };
}

/** Binds the checked draft to send-time identities. Admission later checks those identities, never newer titles. */
export function proposalOf(source: Source, draft: unknown, selected?: AgentWorkspace): Proposal | undefined {
  const request = prepare(source, selected);
  const found = commandOf(request, draft);
  const proposal = found?.command.propose?.(request, found.args, crypto.randomUUID());
  return proposal && { ...proposal, origin: originOf(request, found!.name) };
}

/** A link draft plus its original permissions and calendar identities, checked by Room before posting. */
export function handoffOf(source: Source, draft: unknown, selected?: AgentWorkspace): Handoff | undefined {
  const request = prepare(source, selected);
  const found = commandOf(request, draft);
  const handed = found?.command.links?.(request, found.args);
  return handed && { links: handed.links, origin: { ...originOf(request, found!.name), ...handed.taskIds ? { taskIds: handed.taskIds } : {} } };
}

/** A question draft (D50), bound to the asked agent's id, with its origin for the checks before it's sent. */
export function askOf(source: Source, draft: unknown, selected?: AgentWorkspace): Ask | undefined {
  const request = prepare(source, selected);
  const found = commandOf(request, draft);
  const asked = found?.command.ask?.(request, found.args);
  return asked && { id: crypto.randomUUID(), ...asked, status: "pending", origin: originOf(request, found!.name) };
}

/** What a reply shows (D64): choices to tap, or the person's widgets and tasks by identity, only in a chat the person is in. */
export function displayOf(source: Source, draft: unknown, selected?: AgentWorkspace): Display | undefined {
  const request = prepare(source, selected);
  const found = commandOf(request, draft);
  return found?.command.show && (found.command.when?.(request) ?? true) ? found.command.show(request, found.args) : undefined;
}

/** A dialog's fill (D63), only for the dialog the request came from; nothing in it is saved until the person saves the dialog. */
export function fillOf(source: Source, draft: unknown, selected?: AgentWorkspace): Fill | undefined {
  const request = prepare(source, selected);
  const found = commandOf(request, draft);
  return found?.command.fill && found.command.when?.(request) ? found.command.fill(request, found.args) : undefined;
}
