import { expect, test } from "bun:test";
import type { ConversationSessionEntry } from "@buli/contracts";
import {
  CONVERSATION_COMPACTION_PROMPT_TEXT,
  buildConversationCompactionWorkflowModeContext,
  createConversationCompactionPromptSessionEntry,
  formatConversationCompactionWorkflowModeContextPromptBlock,
} from "../src/conversationCompaction/conversationCompactionPrompt.ts";

test("conversation compaction prompt preserves resumable task state", () => {
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("active task state");
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("verified facts");
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("uncertainties");
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("inspected files");
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("stop condition");
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("Next Steps executable");
});

test("conversation compaction prompt preserves workflow state and chronological mode phases", () => {
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("## Workflow State");
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("latest completed assistant mode");
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("latest mode-bearing conversation entry mode");
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("chronological mode phases");
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("Understand mode");
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("Plan mode");
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("Implementation mode");
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("Do not group all Understand, Plan, or Implementation turns together");
});

test("buildConversationCompactionWorkflowModeContext formats deterministic workflow mode metadata", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "How does compaction work?",
      modelFacingPromptText: "How does compaction work?",
      assistantOperatingMode: "understand",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Compaction appends a summary.",
      assistantOperatingMode: "understand",
    },
    {
      entryKind: "user_prompt",
      promptText: "Plan the change.",
      modelFacingPromptText: "Plan the change.",
      assistantOperatingMode: "plan",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Plan agreed.",
      assistantOperatingMode: "plan",
    },
    {
      entryKind: "user_prompt",
      promptText: "Clarify one thing.",
      modelFacingPromptText: "Clarify one thing.",
      assistantOperatingMode: "understand",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "incomplete",
      assistantMessageText: "Partial clarification.",
      incompleteReason: "max_output_tokens",
      assistantOperatingMode: "understand",
    },
  ];

  const workflowModeContext = buildConversationCompactionWorkflowModeContext({ conversationSessionEntries });

  expect(workflowModeContext).toEqual({
    latestModeBearingSessionEntryAssistantOperatingMode: "understand",
    latestCompletedAssistantOperatingMode: "plan",
    chronologicalModePhases: [
      {
        assistantOperatingMode: "understand",
        firstModeBearingSessionEntryNumber: 1,
        lastModeBearingSessionEntryNumber: 2,
        userPromptCount: 1,
        assistantMessageCount: 1,
        completedAssistantMessageCount: 1,
      },
      {
        assistantOperatingMode: "plan",
        firstModeBearingSessionEntryNumber: 3,
        lastModeBearingSessionEntryNumber: 4,
        userPromptCount: 1,
        assistantMessageCount: 1,
        completedAssistantMessageCount: 1,
      },
      {
        assistantOperatingMode: "understand",
        firstModeBearingSessionEntryNumber: 5,
        lastModeBearingSessionEntryNumber: 6,
        userPromptCount: 1,
        assistantMessageCount: 1,
        completedAssistantMessageCount: 0,
      },
    ],
  });

  expect(formatConversationCompactionWorkflowModeContextPromptBlock(workflowModeContext)).toContain(
    '<phase index="2" mode="plan">',
  );
  expect(formatConversationCompactionWorkflowModeContextPromptBlock(workflowModeContext)).toContain(
    "<latest_completed_assistant_mode>plan</latest_completed_assistant_mode>",
  );

  const promptEntry = createConversationCompactionPromptSessionEntry({ workflowModeContext });
  if (promptEntry.entryKind !== "user_prompt") {
    throw new Error("Expected compaction prompt to be a user prompt entry.");
  }
  expect(promptEntry.modelFacingPromptText).toContain("<workflow_mode_context>");
  expect(promptEntry.modelFacingPromptText).toContain(
    "<latest_mode_bearing_session_entry_mode>understand</latest_mode_bearing_session_entry_mode>",
  );
});
