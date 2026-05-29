import {
  findLatestVisibleCompletedAssistantOperatingMode,
  type AssistantOperatingMode,
  type ConversationSessionEntry,
} from "@buli/contracts";

export type ConversationCompactionWorkflowModePhase = {
  assistantOperatingMode: AssistantOperatingMode;
  firstModeBearingSessionEntryNumber: number;
  lastModeBearingSessionEntryNumber: number;
  userPromptCount: number;
  assistantMessageCount: number;
  completedAssistantMessageCount: number;
};

export type ConversationCompactionWorkflowModeContext = {
  latestModeBearingSessionEntryAssistantOperatingMode?: AssistantOperatingMode | undefined;
  latestCompletedAssistantOperatingMode?: AssistantOperatingMode | undefined;
  chronologicalModePhases: readonly ConversationCompactionWorkflowModePhase[];
};

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
  "## Workflow State",
  "- [latest completed assistant mode, latest mode-bearing conversation entry mode, chronological mode phases, and what each mode established or \"(none)\"]",
  "- Understand mode: [facts learned, evidence, mental model, open questions, or \"(none)\"]",
  "- Plan mode: [agreed goal, chosen approach, target files, risks, verification, or \"(none)\"]",
  "- Implementation mode: [changes applied, verification results, remaining issues, or \"(none)\"]",
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
  "- Preserve workflow state explicitly: latest completed assistant mode, latest mode-bearing conversation entry mode, chronological mode phases, and what Understand, Plan, and Implementation mode accomplished.",
  "- Keep mode phases chronological. Do not group all Understand, Plan, or Implementation turns together if the user switched modes multiple times.",
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

export function buildConversationCompactionWorkflowModeContext(input: {
  conversationSessionEntries: readonly ConversationSessionEntry[];
}): ConversationCompactionWorkflowModeContext {
  const chronologicalModePhases: ConversationCompactionWorkflowModePhase[] = [];
  let latestModeBearingSessionEntryAssistantOperatingMode: AssistantOperatingMode | undefined;

  input.conversationSessionEntries.forEach((conversationSessionEntry, sessionEntryIndex) => {
    const assistantOperatingMode = readModeBearingConversationSessionEntryAssistantOperatingMode(conversationSessionEntry);
    if (assistantOperatingMode === undefined) {
      return;
    }

    latestModeBearingSessionEntryAssistantOperatingMode = assistantOperatingMode;
    const currentSessionEntryNumber = sessionEntryIndex + 1;
    const latestModePhase = chronologicalModePhases.at(-1);
    if (latestModePhase?.assistantOperatingMode === assistantOperatingMode) {
      updateConversationCompactionWorkflowModePhase(latestModePhase, conversationSessionEntry, currentSessionEntryNumber);
      return;
    }

    chronologicalModePhases.push(
      createConversationCompactionWorkflowModePhase(conversationSessionEntry, assistantOperatingMode, currentSessionEntryNumber),
    );
  });

  const latestCompletedAssistantOperatingMode = findLatestVisibleCompletedAssistantOperatingMode(input.conversationSessionEntries);

  return {
    ...(latestModeBearingSessionEntryAssistantOperatingMode !== undefined
      ? { latestModeBearingSessionEntryAssistantOperatingMode }
      : {}),
    ...(latestCompletedAssistantOperatingMode !== undefined ? { latestCompletedAssistantOperatingMode } : {}),
    chronologicalModePhases,
  };
}

export function formatConversationCompactionWorkflowModeContextPromptBlock(
  workflowModeContext: ConversationCompactionWorkflowModeContext,
): string {
  return [
    "Workflow mode context from session metadata:",
    "<workflow_mode_context>",
    workflowModeContext.latestCompletedAssistantOperatingMode
      ? `  <latest_completed_assistant_mode>${workflowModeContext.latestCompletedAssistantOperatingMode}</latest_completed_assistant_mode>`
      : "  <latest_completed_assistant_mode>none</latest_completed_assistant_mode>",
    workflowModeContext.latestModeBearingSessionEntryAssistantOperatingMode
      ? `  <latest_mode_bearing_session_entry_mode>${workflowModeContext.latestModeBearingSessionEntryAssistantOperatingMode}</latest_mode_bearing_session_entry_mode>`
      : "  <latest_mode_bearing_session_entry_mode>none</latest_mode_bearing_session_entry_mode>",
    "  <chronological_mode_phases>",
    ...formatConversationCompactionWorkflowModePhaseLines(workflowModeContext.chronologicalModePhases),
    "  </chronological_mode_phases>",
    "</workflow_mode_context>",
  ].join("\n");
}

export function createConversationCompactionPromptSessionEntry(input?: {
  workflowModeContext?: ConversationCompactionWorkflowModeContext | undefined;
}): ConversationSessionEntry {
  const compactionPromptText = input?.workflowModeContext
    ? [
        CONVERSATION_COMPACTION_PROMPT_TEXT,
        "",
        formatConversationCompactionWorkflowModeContextPromptBlock(input.workflowModeContext),
      ].join("\n")
    : CONVERSATION_COMPACTION_PROMPT_TEXT;

  return {
    entryKind: "user_prompt",
    promptText: compactionPromptText,
    modelFacingPromptText: compactionPromptText,
  };
}

function readModeBearingConversationSessionEntryAssistantOperatingMode(
  conversationSessionEntry: ConversationSessionEntry,
): AssistantOperatingMode | undefined {
  if (conversationSessionEntry.entryKind === "user_prompt" || conversationSessionEntry.entryKind === "assistant_message") {
    return conversationSessionEntry.assistantOperatingMode;
  }

  return undefined;
}

function createConversationCompactionWorkflowModePhase(
  conversationSessionEntry: ConversationSessionEntry,
  assistantOperatingMode: AssistantOperatingMode,
  sessionEntryNumber: number,
): ConversationCompactionWorkflowModePhase {
  const workflowModePhase: ConversationCompactionWorkflowModePhase = {
    assistantOperatingMode,
    firstModeBearingSessionEntryNumber: sessionEntryNumber,
    lastModeBearingSessionEntryNumber: sessionEntryNumber,
    userPromptCount: 0,
    assistantMessageCount: 0,
    completedAssistantMessageCount: 0,
  };
  updateConversationCompactionWorkflowModePhase(workflowModePhase, conversationSessionEntry, sessionEntryNumber);
  return workflowModePhase;
}

function updateConversationCompactionWorkflowModePhase(
  workflowModePhase: ConversationCompactionWorkflowModePhase,
  conversationSessionEntry: ConversationSessionEntry,
  sessionEntryNumber: number,
): void {
  workflowModePhase.lastModeBearingSessionEntryNumber = sessionEntryNumber;
  if (conversationSessionEntry.entryKind === "user_prompt") {
    workflowModePhase.userPromptCount += 1;
    return;
  }

  if (conversationSessionEntry.entryKind === "assistant_message") {
    workflowModePhase.assistantMessageCount += 1;
    if (conversationSessionEntry.assistantMessageStatus === "completed") {
      workflowModePhase.completedAssistantMessageCount += 1;
    }
  }
}

function formatConversationCompactionWorkflowModePhaseLines(
  chronologicalModePhases: readonly ConversationCompactionWorkflowModePhase[],
): string[] {
  if (chronologicalModePhases.length === 0) {
    return ["    <phase>none</phase>"];
  }

  return chronologicalModePhases.map((workflowModePhase, phaseIndex) =>
    [
      `    <phase index="${phaseIndex + 1}" mode="${workflowModePhase.assistantOperatingMode}">`,
      `      <mode_bearing_session_entry_range>${workflowModePhase.firstModeBearingSessionEntryNumber}-${workflowModePhase.lastModeBearingSessionEntryNumber}</mode_bearing_session_entry_range>`,
      `      <user_prompt_count>${workflowModePhase.userPromptCount}</user_prompt_count>`,
      `      <assistant_message_count>${workflowModePhase.assistantMessageCount}</assistant_message_count>`,
      `      <completed_assistant_message_count>${workflowModePhase.completedAssistantMessageCount}</completed_assistant_message_count>`,
      "    </phase>",
    ].join("\n")
  );
}
