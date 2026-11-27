// The agent loop's pure parts: request validation, the prompt, tools run against the browser's snapshot, proposal
// drafts and reply guards. index.ts adds HTTP, identity, the daily caps and the provider call. File tools (D47) are the
// one exception to "tools run against the snapshot": the loop pauses, the browser reads the files, and resumes it.
// This file is the loop's interface for index.ts and the browser; the parts: contract.ts (what they exchange),
// texts.ts (the words and limits the admin page edits), validate.ts, tools.ts, prompt.ts and run.ts.
export type { Arg, Field, Command, Lookup, Snapshot, Recalled, Remembering, Folder, Land, Draft, Message, Turn, ToolCall, Usage, Completion, Model } from "./contract.ts";
export { limits, aboutYou, toolTexts, groundRules, lineTemplates, templateSlots, slotsOf } from "./texts.ts";
export type { GroundRule, LineTemplate } from "./texts.ts";
export { isImage, cleanTurns, modelId, parseTest, parseSnapshot } from "./validate.ts";
export { gatesOf, toolProgress, imageFile, toolsFor } from "./tools.ts";
export { promptParts, systemPrompt } from "./prompt.ts";
export type { PromptSource, PromptTexts, PromptPart } from "./prompt.ts";
export { runTool, degenerate, AgentError, seeingPrompt, runAgent, usedOf } from "./run.ts";
export type { AgentOutcome, Budget, Outside } from "./run.ts";
