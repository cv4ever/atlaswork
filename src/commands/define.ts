// The shape of a command (one entry in commands.ts's registry) and the readers every command shares for the model's
// arguments, which the agent function has already checked against the command's spec.
import type { Command } from "../../supabase/functions/agent/logic.ts";
import { routineKinds } from "../model.ts";
import type { Ask, Display, MessageLink, Need, Proposal, RoutineKind } from "../model.ts";
import type { Fill } from "../formFill.ts";
import type { Request } from "./request.ts";

export const texts = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** A checked list's items as records, reading a bare string as the first field (an older function sends strings). */
export const records = (value: unknown, first: string) => Array.isArray(value) ? value.flatMap((item): Record<string, string>[] =>
  typeof item === "string" ? [{ [first]: item }] : item && typeof item === "object" ? [item as Record<string, string>] : []) : [];
export const isDay = (text: unknown): text is string => typeof text === "string" && /^\d{4}-\d{2}-\d{2}$/.test(text);
export const pending = (id: string) => ({ id, noteId: "", sourceTitle: "", sourceBody: "", status: "pending" as const });

export const textOf = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
export const routinesOf = (value: unknown) => [...new Set(texts(value))].filter((kind): kind is RoutineKind => Object.hasOwn(routineKinds, kind));

/** A fill that changes something; one with only what it assumed has nothing to show. */
export const filled = <T extends Fill>(fill: T) => Object.keys(fill).some((key) => key !== "kind" && key !== "assumed" && key !== "steps" && key !== "routines")
  || ("steps" in fill && fill.steps.length > 0) || fill.routines.length > 0 ? fill : undefined;

export type CommandDef = {
  needs: Need[];
  /** Offered only when this holds; absent means whenever the permissions allow. */
  when?: (request: Request) => boolean;
  spec: (request: Request) => Omit<Command, "name">;
} & (
  | { propose: (request: Request, args: Record<string, unknown>, id: string) => Proposal | undefined;
    links?: never; ask?: never; show?: never; fill?: never }
  | { links: (request: Request, args: Record<string, unknown>) => { links: MessageLink[]; taskIds?: string[] } | undefined;
    propose?: never; ask?: never; show?: never; fill?: never }
  | { ask: (request: Request, args: Record<string, unknown>) => Pick<Ask, "to" | "question" | "then"> | undefined;
    propose?: never; links?: never; show?: never; fill?: never }
  /** Shows something in the reply (D64): answers to tap, or the person's own widgets and tasks drawn live. Changes nothing. */
  | { show: (request: Request, args: Record<string, unknown>) => Display | undefined; propose?: never; links?: never; ask?: never; fill?: never }
  /** Fills the dialog the request came from (D63); offered only there, and alone. */
  | { fill: (request: Request, args: Record<string, unknown>) => Fill | undefined; propose?: never; links?: never; ask?: never; show?: never }
);
