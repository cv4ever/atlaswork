// Atlas's note over a draft he wrote (D57): whose changes these are and why, and Try it, which sends his test request
// to the agent as drafted, saving nothing.
import { useState } from "react";
import type { AtlasMark } from "../agentDrafts.ts";
import { usePortraitSrc } from "../crewStyle.ts";
import { plainOf } from "../markdown.ts";
import { Tip } from "../Popups.tsx";

export function AtlasNote({ atlas, editing, name, onTry }: {
  atlas: AtlasMark;
  /** The saved agent's name, when Atlas changed an agent you have. */
  editing?: string;
  name: string;
  /** Runs the draft on a request; absent where no model answers. */
  onTry?: (request: string) => Promise<{ text: string; proposed?: string }>;
}) {
  const portraitSrc = usePortraitSrc();
  const [tried, setTried] = useState<{ busy?: true; text?: string; proposed?: string; failed?: true } | null>(null);
  const tryIt = (request: string) => {
    setTried({ busy: true });
    onTry!(request).then((reply) => setTried({ ...reply, ...reply.text && { text: plainOf(reply.text) } }), (cause: unknown) =>
      setTried({ text: cause instanceof Error ? cause.message : "They couldn't answer.", failed: true }));
  };
  const whose = atlas.by ? `${atlas.by.name}'s suggested changes` : editing ? `Atlas's changes to ${editing}` : "Atlas's draft";
  return (
    <div className="atlas-draft" role="note"><img src={portraitSrc(atlas.by ?? { portrait: "atlas" })} alt="" />
      <span>{whose}. Nothing changes until you save.{atlas.why && <small>{atlas.why}</small>}
        {atlas.test && onTry && <small className="atlas-try">
          <Tip label={`Sends “${atlas.test}” to ${name || "them"} as they are now; nothing is saved`}>
            <button type="button" className="text-button" disabled={tried?.busy} onClick={() => tryIt(atlas.test!)}>{tried ? "Try it again" : "Try it"}</button>
          </Tip> “{atlas.test}”</small>}
        {tried && <small className={tried.failed ? "field-error" : "atlas-tried"} role="status">{tried.busy ? `${name || "They"} is answering…`
          : <>{tried.failed ? "" : `${name || "They"}: `}{tried.text}{tried.proposed && <em> {tried.proposed}</em>}</>}</small>}
      </span></div>
  );
}
