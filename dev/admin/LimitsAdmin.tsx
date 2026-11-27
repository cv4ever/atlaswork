// The admin page's Limits section: how much of a workspace a prompt lists (`listingLimits`, edited here and saved to
// `limits` in the agent function's texts.ts), the reply caps (supabase/functions/agent/caps.ts) and the other request
// limits both sides fit to, each with what it bounds. A key without words here still shows, marked, so a new limit can't
// hide. Saving a limit restarts the dev server (its bridge imports it); the page then says what it did to Atlas's tokens.
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { caps, refusals } from "../../supabase/functions/agent/caps.ts";
import { limits } from "../../supabase/functions/agent/logic.ts";
import { post } from "./api.ts";
import { briefingOf, budgetOf, catalogue, draftOf, placed } from "./catalogue.ts";
import { listingLimits } from "./limits.ts";
import type { Saved } from "./server.ts";

const capWords: Record<string, string> = {
  replies: "Live replies per account per UTC day on Atlaswork's model.",
  ownReplies: "Replies per account per UTC day on the account's own model.",
  neurons: "Workers AI Neurons a day across every account: the shared budget.",
  userNeurons: "One account's share of that budget a day, so a few heavy replies can't spend it for everyone. Own models skip it.",
};
const limitWords: Record<string, [string, string]> = {
  body: ["Request body", "Bytes the agent function accepts in one request."],
  request: ["Message", "Characters in one chat message; longer is refused before sending."],
  text: ["Note text", "Characters of a note's title or body sent to the model."],
  title: ["Task title", "Characters of a task title."],
  items: ["Notes and tasks", "The newest notes and open tasks a request carries."],
  lookups: ["Lookups", "Reading tools (read_notes, list_tasks, command lookups) one reply may call."],
  rounds: ["Tool rounds", "Rounds of tool calls before the model must answer without tools."],
  commands: ["Commands", "Proposal and handoff commands a request may offer."],
  everyAgent: ["Rules for every agent", "Characters of the person's rules for every agent."],
  folders: ["Linked folders", "Folders listed per request (agents-design D47)."],
  fileReads: ["File tools", "search_files and read_file calls in one reply."],
  turns: ["Resumed turns", "Turns a reply paused for file tools carries back."],
  memory: ["Memory length", "Characters of one remembered thing."],
  remembers: ["Remembered per reply", "Things one reply may remember, and places on a computer it may offer to remember (D80)."],
  what: ["Where-it-is label", "Characters of what an agent names when it offers to remember where something is on a computer (remember_where, agents-design D80)."],
  image: ["Image size", "Characters of one shrunken image read_image sends back (a base64 JPEG, PNG or WebP; agents-design D58)."],
  images: ["Images listed", "The newest image notes a request names for read_image (D58)."],
  people: ["People listed", "People a request names with who they are and their next date (agents-design D71)."],
};
type Key = keyof typeof listingLimits;
const savedKey = "atlaswork.admin.limit-saved";
const number = new Intl.NumberFormat("en");

/** Atlas in the demo, who sees every place: about how many tokens a call sends with the limits as saved now. */
function atlasTokens() {
  const atlas = catalogue()[0].entries[0];
  const { agent, data } = placed(atlas, draftOf(atlas), "demo");
  return budgetOf(briefingOf(agent, data)).total;
}

export default function LimitsAdmin() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ key: string; text: string; error?: boolean } | null>(null);
  const tokens = atlasTokens();
  // A save restarts the dev server and reloads this page: what it changed waits in sessionStorage.
  useEffect(() => {
    const kept = JSON.parse(sessionStorage.getItem(savedKey) ?? "null") as { key: Key; from: number; tokens: number } | null;
    sessionStorage.removeItem(savedKey);
    if (kept) setStatus({ key: kept.key, text: `Saved: ${listingLimits[kept.key].label} ${kept.from} → ${limits[kept.key]}; Atlas in the demo goes from about ${number.format(kept.tokens)} to ${number.format(atlasTokens())} tokens per call. Every agent gets it from the next release.` });
  }, []);
  const save = async (key: Key) => {
    const value = Number(values[key]);
    sessionStorage.setItem(savedKey, JSON.stringify({ key, from: limits[key], tokens }));
    try {
      const result = await post<Saved>("/api/admin/line", { kind: "limit", name: key, value });
      if (!result.files.length) { sessionStorage.removeItem(savedKey); setStatus({ key, text: "Nothing changed in the source." }); }
      else setStatus({ key, text: "Saved to texts.ts; the dev server restarts to pick it up…" });
    } catch (cause) {
      sessionStorage.removeItem(savedKey);
      setStatus({ key, text: cause instanceof Error ? cause.message : "Saving failed.", error: true });
    }
  };
  return (
    <section className="admin-page" aria-labelledby="limits-title">
      <header className="admin-head">
        <div><h1 id="limits-title">Limits</h1>
          <p>Read from the agent function&rsquo;s source, so they&rsquo;re what the next deploy enforces. The browser fits each request to the same <code>limits</code>.</p></div>
      </header>
      <h2 className="admin-section-title">How much a prompt lists <small>Atlas in the demo: about {number.format(tokens)} tokens per call</small></h2>
      <p className="admin-lede">Less listed means fewer tokens per call, but the agent may have to look things up instead, and each lookup sends the whole prompt again. Check a change with Cases before releasing it.</p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th scope="col">Limit</th><th scope="col" className="admin-num">Value</th><th scope="col">What it bounds</th></tr></thead>
          <tbody>
            {(Object.keys(listingLimits) as Key[]).map((key) => {
              const range = listingLimits[key], value = values[key] ?? String(limits[key]);
              const changed = Number(value) !== limits[key];
              const valid = Number.isInteger(Number(value)) && value.trim() !== "" && Number(value) >= range.min && Number(value) <= range.max;
              return (
                <tr key={key}>
                  <th scope="row">{range.label}<small><code>{key}</code></small></th>
                  <td className="admin-num">
                    <span className="admin-limit-edit">
                      <input type="number" min={range.min} max={range.max} value={value} aria-label={range.label} aria-invalid={!valid || undefined}
                        onChange={(event) => setValues({ ...values, [key]: event.target.value })} />
                      <button type="button" className="icon-button" disabled={!changed || !valid} onClick={() => void save(key)}
                        aria-label={`Save ${range.label}`} title={valid ? "Save to source" : `${range.min} to ${range.max}`}><Save size={16} /></button>
                    </span>
                  </td>
                  <td>{range.does}{status?.key === key && <p className="admin-status" role="status" data-error={status.error || undefined}>{status.text}</p>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2 className="admin-section-title">Reply caps <small><code>caps.ts</code></small></h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th scope="col">Cap</th><th scope="col" className="admin-num">Value</th><th scope="col">What it bounds</th></tr></thead>
          <tbody>
            {Object.entries(caps).map(([key, value]) => (
              <tr key={key}><th scope="row"><code>{key}</code></th><td className="admin-num">{number.format(value)}</td>
                <td>{capWords[key] ?? <span className="admin-unsorted">Undescribed: add it to capWords in dev/admin/LimitsAdmin.tsx.</span>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="admin-sub">What a person is told when one is reached</h3>
      <ul className="admin-quotes">
        <li><span>No plan</span>{refusals.plan}</li>
        <li><span>Replies used</span>{refusals.replies(caps.replies)}</li>
        <li><span>Share used</span>{refusals.share}</li>
      </ul>
      <h2 className="admin-section-title">Request limits <small><code>texts.ts</code></small></h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th scope="col">Limit</th><th scope="col" className="admin-num">Value</th><th scope="col">What it bounds</th></tr></thead>
          <tbody>
            {Object.entries(limits).filter(([key]) => !(key in listingLimits)).map(([key, value]) => (
              <tr key={key}><th scope="row">{limitWords[key]?.[0] ?? key}<small><code>{key}</code></small></th><td className="admin-num">{number.format(value)}</td>
                <td>{limitWords[key]?.[1] ?? <span className="admin-unsorted">Undescribed: add it to limitWords in dev/admin/LimitsAdmin.tsx.</span>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
