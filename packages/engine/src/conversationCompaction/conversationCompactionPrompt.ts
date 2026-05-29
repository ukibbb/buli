import type { ConversationSessionEntry } from "@buli/contracts";

export const CONVERSATION_COMPACTION_PROMPT_TEXT = [
  "Create a compact continuation summary for the next assistant turn.",
  "This summary will replace all earlier messages in the model context.",
  "Make it self-contained enough that the next assistant can continue correctly without seeing any prior messages.",
  "Preserve only information needed to continue the current session correctly, but preserve that task state precisely.",
  "Output exactly the Markdown structure shown below and keep the section order unchanged.",
  "",
  "## Goal",
  "- [single-sentence task summary with the exact user goal]",
  "",
  "## Constraints & Preferences",
  "- [user constraints, preferences, specs, requested style, or \"(none)\"]",
  "",
  "## Progress",
  "### Done",
  "- [completed work, inspected facts, commands run, files changed, or \"(none)\"]",
  "",
  "### In Progress",
  "- [current work, exact current step, partial answer state, or \"(none)\"]",
  "",
  "### Blocked",
  "- [blockers or \"(none)\"]",
  "",
  "## Key Decisions",
  "- [decision, why it was made, and any rejected alternative that matters, or \"(none)\"]",
  "",
  "## Next Steps",
  "- [ordered next actions with enough detail to resume immediately, or \"(none)\"]",
  "",
  "## Critical Context",
  "- [important technical facts, exact errors, model-visible state transitions, open questions, or \"(none)\"]",
  "",
  "## Relevant Files",
  "- [exact file or directory path: why it matters and what is known about it, or \"(none)\"]",
  "",
  "Rules:",
  "- Keep every section, even when empty.",
  "- Use terse bullets, not prose paragraphs.",
  "- Preserve the active task state, not just transcript history: goal, constraints, current progress, current hypothesis or mental model, blockers, and next action.",
  "- Distinguish verified facts from assumptions, uncertainties, and open questions when that affects how the next assistant should continue.",
  "- For investigation tasks, preserve inspected files, symbols, searches, evidence found, evidence still missing, and why the next step follows from the evidence.",
  "- Preserve the stop condition: what would count as fulfilling the original user goal.",
  "- If the task is not done, make Next Steps executable without asking the user to continue.",
  "- Prefer losing conversational wording over losing goal, constraints, evidence, current hypothesis, blockers, stop condition, or next action.",
  "- Preserve exact file paths, commands, error strings, identifiers, function names, API contracts, and test names when known.",
  "- Explain how the current work has been approached, where it is happening, and exactly how to continue.",
  "- If a response was cut off, state where it stopped and what the next assistant should continue with.",
  "- Do not answer the user, ask questions, or introduce new plans beyond summarizing the current continuation state.",
  "- Do not mention the summary process or that context was compacted.",
].join("\n");

export function buildConversationCompactionSystemPrompt(input: { workspaceRootPath: string }): string {
  return [
    "You are buli's conversation compaction worker.",
    `Current workspace root: ${input.workspaceRootPath}`,
    "Summarize the prior conversation for continuation by the same assistant.",
    "The summary you produce is the only prior conversation context the next model call will receive.",
    "Use only the provided conversation context. Do not call tools.",
  ].join("\n");
}

export function createConversationCompactionPromptSessionEntry(): ConversationSessionEntry {
  return {
    entryKind: "user_prompt",
    promptText: CONVERSATION_COMPACTION_PROMPT_TEXT,
    modelFacingPromptText: CONVERSATION_COMPACTION_PROMPT_TEXT,
  };
}
