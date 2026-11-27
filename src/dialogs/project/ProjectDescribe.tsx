// Describe it on the project dialog (D63): the domain's agent (Atlas where nobody looks after the domain) fills the form
// from your words, lighting up what it changed; each assumption opens the field it went into, and Undo takes the fill
// back while nothing changed since.
import { useApp } from "../../appContext.ts";
import { DescribeIt } from "../../DescribeIt.tsx";
import { filledProject, projectRequest, unfilledProject } from "../../formFill.ts";
import type { ProjectField } from "../../formFill.ts";
import type { Agent, WorkspaceData } from "../../model.ts";
import type { ProjectForm } from "../../ui.ts";
import type { useFill } from "../useFill.ts";

/** The project dialog's folded choices: one fact each, unfolding one at a time. */
export type ProjectFact = "domain" | "finish" | "crew" | "steps" | "routines";

export function ProjectDescribe({ form, filler, fill, finish, data, today, now, onUnfold }: {
  form: ProjectForm;
  filler: Agent;
  fill: NonNullable<ReturnType<typeof useFill>>;
  /** The finish day the dialog shows. */
  finish: string;
  data: WorkspaceData;
  today: string;
  now: Date;
  onUnfold: (fact: ProjectFact) => void;
}) {
  const { actions } = useApp();
  const isNew = !form.original;
  const id = form.project.id;
  return (
    <DescribeIt agent={filler} placeholder={isNew ? `Tell ${filler.name} what you want to get done` : `Tell ${filler.name} what to change`}
      ask={async (words, signal) => {
        const reply = await fill(filler, { kind: "project", editing: !isNew }, projectRequest(form, finish, data, words), signal);
        if (reply.fill?.kind !== "project") return { filled: false, said: reply.text.trim() || `${filler.name} didn't fill anything in. Say a little more.` };
        const filledIn = reply.fill;
        let before: ProjectForm | null = null, after: ProjectForm | null = null;
        actions.setUi((state) => {
          before = state.projectForm?.project.id === id ? state.projectForm : null;
          after = before && filledProject(before, filledIn, today, now.toISOString());
          return after ? { projectForm: after } : {};
        });
        const unfold = (fact: ProjectFact) => () => onUnfold(fact);
        const focus = (field: string) => () => document.getElementById(field)?.focus();
        const opens: Partial<Record<ProjectField, () => void>> = { title: focus("project-title"), goal: focus("project-goal"),
          domain: unfold("domain"), finish: unfold("finish"), lead: unfold("crew"), steps: unfold("steps"), routines: unfold("routines") };
        return { filled: true, said: "Filled in. Check it, then save it.",
          assumed: filledIn.assumed.map((choice) => ({ what: choice.what, open: choice.field && opens[choice.field] })),
          undo: () => actions.setUi((state) => ({ projectForm: state.projectForm && before && after
            ? unfilledProject(state.projectForm, before, after) : state.projectForm })) };
      }} />
  );
}
