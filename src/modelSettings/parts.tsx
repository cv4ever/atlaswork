// Small parts of Settings → AI model: Atlaswork's own model as a choice (and the switch back to it), and how hard
// your own model thinks.
import { CircleCheck } from "lucide-react";
import type { Effort } from "../../supabase/functions/agent/responses.ts";
import { effortLabels, providerLabels } from "../ownModel.ts";
import type { OwnModelStatus } from "../ownModel.ts";
import { Tip } from "../Popups.tsx";

/** Atlaswork's hosted model: what it needs, and Use it, which disconnects your own key. */
export function HostedChoice({ signedIn, inUse, status, disabled, onUse }: {
  signedIn: boolean; inUse: boolean; status: OwnModelStatus; disabled: boolean; onUse: () => void;
}) {
  return (
    <div className="settings-card own-model-form">
      <p className="own-model-note">{signedIn ? "Atlaswork's own model, run for you. Live replies need Pro or the trial and have a daily cap."
        : "Sign in from Settings → Account for Atlaswork's live agents."}</p>
      {signedIn && !inUse && <div className="settings-actions">
        <button className="primary-button" disabled={disabled} onClick={onUse}><CircleCheck size={16} />Use Atlaswork's model</button>
      </div>}
      {signedIn && status && !inUse && <p className="own-model-note">This disconnects your {providerLabels[status.provider]} key.</p>}
    </div>
  );
}

/** Thinking: the model's default, or low, medium or high. */
export function ThinkingPicker({ value, onChange }: { value: Effort | null; onChange: (effort: Effort | null) => void }) {
  return (
    <div className="setting-row"><strong>Thinking</strong>
      <div className="segmented-control" role="radiogroup" aria-label="Thinking">
        {([null, "low", "medium", "high"] as const).map((effort) => (
          <Tip key={effort ?? "default"} label={effort ? undefined : "Whatever the model does by default"}>
            <button type="button" role="radio" aria-checked={value === effort} onClick={() => onChange(effort)}>{effort ? effortLabels[effort] : "Model default"}</button>
          </Tip>
        ))}
      </div></div>
  );
}
