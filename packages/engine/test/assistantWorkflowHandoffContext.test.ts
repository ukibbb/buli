import { expect, test } from "bun:test";
import { buildAssistantWorkflowHandoffContext, buildAssistantWorkflowHandoffPromptBlock } from "../src/assistantWorkflowHandoffContext.ts";
import type { ConversationSessionEntry } from "@buli/contracts";

const planWorkflowHandoff = {
  handoffKind: "plan" as const,
  agreedGoal: "Implement <typed> workflow handoffs.",
  currentStateSummary: "Strict workflow gates are being replaced.",
  chosenApproach: "Record a typed handoff tool result.",
  targetFiles: [
    {
      filePath: "packages/engine/src/runtime.ts",
      operationKind: "update" as const,
      reason: "Attach the recorded handoff to completed assistant messages.",
    },
  ],
  implementationSteps: ["Store handoff", "Inject handoff into next turn"],
  verificationCommands: [
    { command: "bun test packages/engine/test/runtime.test.ts", reason: "Verify runtime handoff flow." },
  ],
  risks: [],
  isReadyForImplementation: true,
  requiredPreApplyReads: [],
};

test("buildAssistantWorkflowHandoffContext finds latest visible completed handoffs", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Old compacted plan.",
      assistantOperatingMode: "plan",
      workflowHandoff: {
        ...planWorkflowHandoff,
        agreedGoal: "Old compacted goal.",
      },
    },
    {
      entryKind: "conversation_compaction_summary",
      summaryText: "Older conversation was compacted.",
      compactedEntryCount: 1,
      retainedRecentConversationSessionEntryCount: 0,
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Current plan.",
      assistantOperatingMode: "plan",
      workflowHandoff: planWorkflowHandoff,
    },
  ];

  expect(buildAssistantWorkflowHandoffContext({
    currentAssistantOperatingMode: "implementation",
    conversationSessionEntries,
  })).toMatchObject({
    currentAssistantOperatingMode: "implementation",
    latestCompletedAssistantOperatingMode: "plan",
    latestPlanWorkflowHandoff: {
      agreedGoal: "Implement <typed> workflow handoffs.",
    },
  });
});

test("buildAssistantWorkflowHandoffPromptBlock formats implementation guidance and escapes handoff text", () => {
  const promptBlock = buildAssistantWorkflowHandoffPromptBlock({
    currentAssistantOperatingMode: "implementation",
    conversationSessionEntries: [
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "Current plan.",
        assistantOperatingMode: "plan",
        workflowHandoff: planWorkflowHandoff,
      },
    ],
  });

  expect(promptBlock).toContain("Use the latest plan handoff as the implementation contract");
  expect(promptBlock).toContain("&lt;typed&gt;");
  expect(promptBlock).toContain("latest_plan_handoff");
});
