// Settings → Appearance → Emblems (emblemFamilies.ts): a tile per family, your first three domains' emblems drawn in
// it; "Theme" follows the theme's own family. Hovering or focusing a tile previews it on the workspace.
import type { CSSProperties } from "react";
import { Emblem } from "../Emblem.tsx";
import { emblemFamilies } from "../emblemFamilies.ts";
import type { EmblemFamily } from "../emblemFamilies.ts";
import { emblemFamilyOf } from "../dialogs/themes.ts";
import { domainHues } from "../model.ts";
import type { Domain } from "../model.ts";
import type { Session } from "../session.ts";

/** The tiles' stand-ins when you have fewer than three domains: the demo's Family, Finance and Career. */
const fallbackSamples = [{ name: "Family", emoji: "🏡", hue: domainHues.Clay }, { name: "Finance", emoji: "🪙", hue: domainHues.Marigold },
  { name: "Career", emoji: "🧭", hue: domainHues.Lagoon }];

export function EmblemsSection({ value, palette, domains, onChange, onPreview }: {
  value: Session["emblems"];
  palette: Session["palette"];
  domains: Domain[];
  onChange: (emblems: Session["emblems"]) => void;
  /** With no value, ends the preview. */
  onPreview: (emblems?: Session["emblems"]) => void;
}) {
  const samples = [...domains.filter((domain) => !domain.archived && domain.emoji), ...fallbackSamples].slice(0, 3);
  const choices: [Session["emblems"], string, EmblemFamily][] = [["theme", "Theme", emblemFamilyOf("theme", palette)],
    ...emblemFamilies.map(({ id, name }): [EmblemFamily, string, EmblemFamily] => [id, name, id])];
  return (
    <section className="settings-group" aria-labelledby="settings-emblems">
      <h4 id="settings-emblems">Emblems</h4>
      <div className="settings-card">
        <div className="setting-row setting-row-stacked">
          <div><strong>Domain and topic emblems</strong><p>How their emoji are drawn, everywhere they show.</p></div>
          <div className="emblem-tiles" role="group" aria-label="Emblems">
            {choices.map(([choice, label, family]) => (
              <button key={choice} type="button" className="emblem-tile" aria-pressed={value === choice}
                onPointerEnter={() => onPreview(choice)} onPointerLeave={() => onPreview()}
                onFocus={() => onPreview(choice)} onBlur={() => onPreview()} onClick={() => onChange(choice)}>
                <span aria-hidden="true">{samples.map((domain) => (
                  <span key={domain.name} style={{ "--hue": domain.hue || undefined } as CSSProperties}><Emblem emoji={domain.emoji} family={family} /></span>))}</span>
                {choice === "theme" ? <>{label}<small>{emblemFamilies.find((item) => item.id === family)?.name}</small></> : label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
