import type { ConversationSessionEntry } from "@buli/contracts";

export const CONVERSATION_COMPACTION_PROMPT_TEXT = [
  "Create a compact continuation summary for the next assistant turn.",
  "Preserve only information needed to continue the current session correctly.",
  "Output exactly the Markdown structure shown below and keep the section order unchanged.",
  "",
  "## Goal",
  "- [single-sentence task summary]",
  "",
  "## Constraints & Preferences",
  "- [user constraints, preferences, specs, or \"(none)\"]",
  "",
  "## Progress",
  "### Done",
  "- [completed work or \"(none)\"]",
  "",
  "### In Progress",
  "- [current work or \"(none)\"]",
  "",
  "### Blocked",
  "- [blockers or \"(none)\"]",
  "",
  "## Key Decisions",
  "- [decision and why, or \"(none)\"]",
  "",
  "## Next Steps",
  "- [ordered next actions or \"(none)\"]",
  "",
  "## Critical Context",
  "- [important technical facts, errors, open questions, or \"(none)\"]",
  "",
  "## Relevant Files",
  "- [file or directory path: why it matters, or \"(none)\"]",
  "",
  "Rules:",
  "- Keep every section, even when empty.",
  "- Use terse bullets, not prose paragraphs.",
  "- Preserve exact file paths, commands, error strings, and identifiers when known.",
  "- Do not answer the user, ask questions, or introduce new plans beyond summarizing the current continuation state.",
  "- Do not mention the summary process or that context was compacted.",
].join("\n");

export function buildConversationCompactionSystemPrompt(input: { workspaceRootPath: string }): string {
  return [
    "You are buli's conversation compaction worker.",
    `Current workspace root: ${input.workspaceRootPath}`,
    "Summarize the prior conversation for continuation by the same assistant.",
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
