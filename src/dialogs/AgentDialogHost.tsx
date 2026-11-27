// The agent dialog's host: opens AgentDialog.tsx (loaded when first opened) on the UI store's agent draft and saves it.
import { lazy } from "react";
import type { AgentDraft } from "../ui.ts";
import { useApp, useUi, useView } from "../appContext.ts";
import { kindOf } from "../model.ts";
import { TaskRows } from "../pageGrid/TaskRows.tsx";
import { routineDate } from "../view.ts";
import { countUsage } from "../usage.ts";
import { addedWords } from "../proposals.ts";
import * as workspace from "../workspace.ts";

// Opened by few sessions, so loaded when first opened rather than at startup; fetching them in idle moments after a
// load competed with the first clicks.
const AgentDialog = lazy(() => import("../AgentDialog.tsx"));

export function AgentDialogHost() {
  const { actions, engine, signedIn } = useApp();
  const draft = useUi((state) => state.agentDraft);
  const sharedIds = useUi((state) => state.sharedIds);
  const data = useView((view) => view.data);
  const domains = useView((view) => view.domains);
  const liveProjects = useView((view) => view.visible.projects);
  const liveNotes = useView((view) => view.visible.notes);
  const clock = useView((view) => view.now);
  const session = useView((view) => view.session);
  if (!draft) return null;
  const person = { name: session.profileName, about: session.profileBio };
  // Try it (D57): one live reply from the draft as it stands, on the workspace Save would make; nothing it says or proposes lands.
  const tryDraft = async (form: AgentDraft, request: string) => {
    countUsage("agent_draft_tried");
    const reply = await engine.reply({ agent: form.agent, data: workspace.saveDraft(data, { ...form, kind: "agent" }).data, request, person });
    const proposal = reply.proposal;
    return { text: reply.text.trim() || "(no words)", ...proposal && { proposed: `It would propose ${proposal.changes ? `${proposal.changes.length} changes` : addedWords(proposal)}; trying applies nothing.` } };
  };
  return (
    <AgentDialog draft={draft} data={data} domains={domains} liveProjects={liveProjects} notes={liveNotes.filter((note) => kindOf(note) === "note")}
      now={routineDate(clock)} person={person} renderTasks={(tasks) => <TaskRows tasks={tasks} />} preview={(form) => workspace.saveDraft(data, { ...form, kind: "agent" }).data}
      shared={sharedIds.includes(draft.agent.id)} onShare={signedIn ? actions.toggleShare : undefined} engine={engine}
      onDraft={(agentDraft) => actions.setUi({ agentDraft })} onSave={actions.saveAgentDraft} onArchive={actions.confirmAgentArchive}
      onSettings={actions.openSettings} onForget={actions.forgetMemory} onAskAtlas={actions.askAtlasForAgent} onTry={tryDraft}
      onClose={() => actions.setUi({ agentDraft: null })} />
  );
}
