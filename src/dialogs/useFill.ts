// Describe it (agents-design D63): one live reply that fills a record dialog from your words.
import { useApp, useView } from "../appContext.ts";
import type { FormKind } from "../formFill.ts";
import type { Agent } from "../model.ts";
import { useModelState } from "../modelMenu.ts";

/**
 * Asks an agent to fill a dialog from your words (agents-design D63): one live reply, offering only that dialog's fill
 * command. Undefined while no model answers (signed out without one of your own), so the dialogs hide Describe it.
 */
export function useFill() {
  const { engine } = useApp();
  const models = useModelState(engine);
  const data = useView((view) => view.data);
  const session = useView((view) => view.session);
  const provider = models.status === "ready" ? models.provider : models.status === "loading" ? models.last : undefined;
  if (!provider || provider.using === "none") return undefined;
  // An engine that can't cut the call off (the dev ones) may still answer after Stop: that answer is dropped here, before
  // the dialog would put it in the form.
  return (agent: Agent, form: FormKind, request: string, signal: AbortSignal) =>
    engine.reply({ agent, data, request, form, signal, person: { name: session.profileName, about: session.profileBio } })
      .then((reply) => { signal.throwIfAborted(); return reply; });
}
