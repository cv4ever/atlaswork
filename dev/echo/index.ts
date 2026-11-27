// Dev builds only (src/main.tsx loads it behind `import.meta.env.DEV`): a model-free engine for the browser
// regressions, which check screens, not answers. With `localStorage["workbench.dev.echo"] = "on"` every agent answers
// at once by echoing the request, with made-up usage, so the checks need no account, quota or network. A message
// starting "propose:" drafts that one task in the agent's first place, which the engine binds like a model's draft,
// so the checks can Apply and Undo a Proposal. "remember: <words>" remembers those words about you (D49), for the
// chip and its Undo. "ask: <Name>: <question>" asks that agent the question (D50), for the card, Send and the answer;
// "… | then: <what>" adds the asker's follow-up. With `localStorage["workbench.dev.echo.routine-ask"] = "<Name>: <question>"`
// every routine run by another agent asks that instead of staying quiet, for Today's questions row.
// "agent: {…}" drafts an agent (D57) with that JSON as propose_agent's arguments, for the card, Review and Save; "do:
// <command> {…}" drafts any command with those arguments (propose_project, move_tasks, sort_capture… D61). Typed into a
// project or domain dialog's Describe it, "do: fill_project {…}" or "do: fill_domain {…}" fills that dialog (D63).
// "read: <path>", "search: <words>" and "look: <image>" run the file tools on the agent's linked folders and image
// notes (D47, D58) and echo what they returned (an image as its size). "calendar: [from] [to]" plays a Google Calendar
// read with its sources line (D81). It reports itself as the provider in use ("Echo", on this device)
// with the account's saved provider kept. Its made-up models (two plain, two named like a maker's, so the message box's
// picker shows vendor tabs, D82), thinking and prices let the checks pick an agent's own model and see its spend
// (agents-design D44, D45): a reply names the model and effort it answered on.
import type { AgentAdapter, EngineInfo, ModelMenu } from "../../src/atlas.ts";

export const echoKey = "workbench.dev.echo";
const info: EngineInfo = { badge: "Dev · echo" };
const menu: ModelMenu = { source: "echo", label: "Echo", current: "echo-small", efforts: { current: null },
  list: async () => [{ id: "echo-small", name: "Echo small" }, { id: "echo-large", name: "Echo large" },
    { id: "echo/claude-echo", name: "Echo: Claude Echo" }, { id: "echo/gpt-echo", name: "Echo: GPT Echo" }],
  prices: async () => ({ "echo-small": { input: 1, output: 2 }, "echo-large": { input: 10, output: 20 }, "echo/claude-echo": { input: 3, output: 15 }, "echo/gpt-echo": { input: 0, output: 0 } }),
  test: async ({ id }) => !id || id.startsWith("echo") ? { text: "OK", ms: 10 } : Promise.reject(new Error(`Echo has no model ${id}.`)) };

/** `base` unless this browser switched echo on. */
export function withEcho(base: AgentAdapter): AgentAdapter {
  if (localStorage.getItem(echoKey) !== "on") return base;
  return {
    ...base,
    about: () => info,
    load: async () => ({ provider: { ...(await base.load?.())?.provider ?? { own: null }, using: "device", device: "Echo" }, menu }),
    reply: async ({ agent, request, routine, form, onProgress }, snapshot, files) => {
      const model = agent.model?.source === "echo" ? agent.model.id : menu.current;
      const usage = { input: 900 + request.length, output: 40, model: { source: "echo", id: model } };
      const asking = (line: string) => {
        const [, to, question, then] = /^([^:]+):\s*(.+?)(?:\s*\|\s*then:\s*(.+))?$/i.exec(line) ?? [];
        return to ? { text: `Echo asks ${to.trim()}.`, draft: { command: "ask_agent", args: { to: to.trim(), question: question.trim(), ...then ? { then: then.trim() } : {} } }, usage } : undefined;
      };
      if (routine) {
        const line = localStorage.getItem(`${echoKey}.routine-ask`);
        return (line && !line.toLowerCase().startsWith(`${agent.name.toLowerCase()}:`) && asking(line)) || { text: "NOTHING NEW" };
      }
      // "calendar: 2026-11-24 2026-11-30" (both optional) reads a made-up Google Calendar the way the function reports
      // it (agents-design D81): a second of "Checking your calendar" with its mark, then a day-by-day reply under the
      // sources chip. "calendar: fail" is Google not answering, "calendar: disconnected" a grant Google revoked.
      const calendar = /^calendar:\s*(.*)$/i.exec(request);
      if (calendar) {
        // Two steps, so the typing indicator shows the first ticked above the second (D81).
        for (const [text, tool] of [["Reading notes", "read_notes"], ["Checking your calendar", "read_calendar"]]) {
          onProgress?.(text, tool);
          const waited = Promise.withResolvers<void>();
          setTimeout(waited.resolve, 900);
          await waited.promise;
        }
        if (/^fail/i.test(calendar[1])) return { text: "I couldn't read your Google Calendar this time. Try again in a moment.", used: [{ tool: "read_calendar", failed: "unanswered" }], usage };
        if (/^disconnected/i.test(calendar[1]))
          return { text: "Your Google Calendar isn't connected any more. Connect it again in Settings → Connections.", used: [{ tool: "read_calendar", failed: "disconnected" }], usage };
        const [from = snapshot().today, to = from] = calendar[1].match(/\d{4}-\d{2}-\d{2}/g) ?? [];
        return { text: `Here's what's on:\n\n- **${from}**: 09:00 Dentist, 13:30 Lunch with Ana\n- **${to}**: 16:00 Team review\n\nYou're free most of the afternoon on the first day.`,
          used: [{ tool: "read_notes", about: "dentist" }, { tool: "read_calendar", about: from === to ? from : `${from}/${to}` }], usage };
      }
      // "read: Folder/notes.md", "search: words" and "look: name" run the file and image tools (agents-design D47, D58).
      const file = /^(read|search|look):\s*(.+)/i.exec(request);
      if (file) {
        if (!files) return { text: `Echo sees no linked folders or images.`, usage };
        const [name, arg] = { read: ["read_file", { path: file[2].trim() }], search: ["search_files", { query: file[2].trim() }], look: ["read_image", { name: file[2].trim() }] }[file[1].toLowerCase() as "read" | "search" | "look"];
        const folders = snapshot().folders?.map((folder) => `${folder.name} (${folder.files.length} files)`).join(", ") ?? "no folders";
        const result = await files({ id: "echo", type: "function", function: { name: name as string, arguments: JSON.stringify(arg) } });
        return { text: `Echo with ${folders}: ${result.startsWith("data:image/") ? `an image of ${result.length} characters (${result.slice(0, 23)}…)` : result.slice(0, 400)}`,
          used: [{ tool: name as string, about: file[2].trim() }], usage };
      }
      const proposed = /^propose:\s*(.+)/i.exec(request)?.[1].trim();
      const place = proposed && snapshot().places[0];
      if (place) return { text: `Echo drafted: ${proposed}`, draft: { command: "propose_tasks", args: { place, tasks: [proposed] } }, usage };
      const kept = /^remember:\s*(.+)/i.exec(request)?.[1].trim();
      if (kept) return { text: "Echo will remember that.", memories: [{ text: kept, place: "", quote: kept }], usage };
      const question = /^ask:\s*(.+)/i.exec(request)?.[1];
      if (question && asking(question)) return asking(question)!;
      const agentArgs = /^agent:\s*(\{.+\})\s*$/is.exec(request)?.[1];
      if (agentArgs) return { text: "Echo drafted an agent.", draft: { command: "propose_agent", args: JSON.parse(agentArgs) as Record<string, unknown> }, usage };
      // A dialog's request (D63) quotes your words inside what the form holds; "do:" reads them alone.
      const said = form ? /In my words: “([\s\S]*?)”\nThe form now/.exec(request)?.[1] ?? request : request;
      const [, command, commandArgs] = /^do:\s*([a-z_]+)\s*(\{.+\})\s*$/is.exec(said) ?? [];
      if (command) return { text: `Echo drafted ${command}.`, draft: { command, args: JSON.parse(commandArgs) as Record<string, unknown> }, usage };
      return { text: `Echo${agent.model?.source === "echo" ? ` on ${model}` : ""}${agent.effort ? ` · ${agent.effort}` : ""}: ${request.slice(0, 200)}`, usage };
    },
  };
}
