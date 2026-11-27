// A person's face (agents-design D71): their photo, or their initials on their colour, round, at any size.
import type { CSSProperties } from "react";
import type { Topic } from "./model.ts";
import { initialsOf } from "./people.ts";

/** The initials' size for a face: the type ladder's step that fits it. */
const faceText = (size: number) => size >= 44 ? "var(--text-2xl)" : size >= 32 ? "var(--text-md)" : size >= 24 ? "var(--text-xs)" : "var(--text-2xs)";

export function PersonFace({ person, size = 24, className = "" }: { person: Pick<Topic, "name" | "person">; size?: number; className?: string }) {
  const style = { "--hue": person.person?.hue || "var(--accent)", "--face": `${size}px`, "--face-text": faceText(size) } as CSSProperties;
  return person.person?.photo
    ? <img className={`person-face ${className}`} style={style} src={person.person.photo} alt="" aria-hidden="true" />
    : <span className={`person-face ${className}`} style={style} aria-hidden="true">{initialsOf(person.name)}</span>;
}
