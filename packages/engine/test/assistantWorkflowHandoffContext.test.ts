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

const understandingWorkflowHandoff = {
  handoffKind: "understanding" as const,
  userGoal: "Understand workflow handoff persistence.",
  currentUnderstanding: "Compaction hides older assistant messages from model-visible history.",
  importantFindings: ["A summary checkpoint can carry typed workflow handoffs forward."],
  evidenceReferences: [],
  constraints: ["Keep only the latest handoff of each kind."],
  openQuestions: [],
  recommendedNextStep: "Create the plan handoff checkpoint.",
};

const implementationWorkflowHandoff = {
  handoffKind: "implementation" as const,
  implementedOutcome: "Persisted workflow handoff checkpoints across compaction.",
  changedFiles: [
    {
      filePath: "packages/engine/src/assistantWorkflowHandoffContext.ts",
      changeSummary: "Read handoff checkpoints from visible history and summary fallback.",
    },
  ],
  verificationResults: [
    {
      command: "bun test packages/engine/test/assistantWorkflowHandoffContext.test.ts",
      outcomeKind: "passed" as const,
      summary: "Workflow context tests passed.",
    },
  ],
  remainingIssues: [],
  recommendedNextStep: "Run affected package tests.",
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

test("buildAssistantWorkflowHandoffContext uses compaction summary latest mode when older messages are hidden", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Old compacted plan.",
      assistantOperatingMode: "plan",
      workflowHandoff: planWorkflowHandoff,
    },
    {
      entryKind: "conversation_compaction_summary",
      summaryText: "Older conversation was compacted after plan mode.",
      compactedEntryCount: 1,
      retainedRecentConversationSessionEntryCount: 0,
      latestCompletedAssistantOperatingMode: "plan",
    },
    {
      entryKind: "user_prompt",
      promptText: "Execute it.",
      modelFacingPromptText: "Execute it.",
      assistantOperatingMode: "implementation",
    },
  ];

  expect(buildAssistantWorkflowHandoffContext({
    currentAssistantOperatingMode: "implementation",
    conversationSessionEntries,
  })).toMatchObject({
    currentAssistantOperatingMode: "implementation",
    latestCompletedAssistantOperatingMode: "plan",
  });
});

test("buildAssistantWorkflowHandoffContext falls back to compaction summary workflow handoff checkpoints", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Old compacted plan.",
      assistantOperatingMode: "plan",
      workflowHandoff: planWorkflowHandoff,
    },
    {
      entryKind: "conversation_compaction_summary",
      summaryText: "Older conversation was compacted after plan mode.",
      compactedEntryCount: 1,
      retainedRecentConversationSessionEntryCount: 0,
      latestCompletedAssistantOperatingMode: "plan",
      latestPlanWorkflowHandoff: planWorkflowHandoff,
    },
    {
      entryKind: "user_prompt",
      promptText: "Execute it.",
      modelFacingPromptText: "Execute it.",
      assistantOperatingMode: "implementation",
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

test("buildAssistantWorkflowHandoffContext lets newer completed handoffs win while keeping summary fallbacks per kind", () => {
  const newerPlanWorkflowHandoff = {
    ...planWorkflowHandoff,
    agreedGoal: "Use the new visible plan.",
  };
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "conversation_compaction_summary",
      summaryText: "Older conversation was compacted after plan mode.",
      compactedEntryCount: 1,
      retainedRecentConversationSessionEntryCount: 0,
      latestUnderstandingWorkflowHandoff: understandingWorkflowHandoff,
      latestPlanWorkflowHandoff: planWorkflowHandoff,
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Implementation complete.",
      assistantOperatingMode: "implementation",
      workflowHandoff: implementationWorkflowHandoff,
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "New plan ready.",
      assistantOperatingMode: "plan",
      workflowHandoff: newerPlanWorkflowHandoff,
    },
  ];

  expect(buildAssistantWorkflowHandoffContext({
    currentAssistantOperatingMode: "implementation",
    conversationSessionEntries,
  })).toMatchObject({
    latestUnderstandingWorkflowHandoff: {
      currentUnderstanding: "Compaction hides older assistant messages from model-visible history.",
    },
    latestPlanWorkflowHandoff: {
      agreedGoal: "Use the new visible plan.",
    },
    latestImplementationWorkflowHandoff: {
      implementedOutcome: "Persisted workflow handoff checkpoints across compaction.",
    },
  });
});

test("buildAssistantWorkflowHandoffContext lets newer completed messages win over summary mode metadata", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "conversation_compaction_summary",
      summaryText: "Older conversation was compacted after plan mode.",
      compactedEntryCount: 1,
      retainedRecentConversationSessionEntryCount: 0,
      latestCompletedAssistantOperatingMode: "plan",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Implementation complete.",
      assistantOperatingMode: "implementation",
    },
  ];

  expect(buildAssistantWorkflowHandoffContext({
    currentAssistantOperatingMode: "understand",
    conversationSessionEntries,
  })).toMatchObject({
    currentAssistantOperatingMode: "understand",
    latestCompletedAssistantOperatingMode: "implementation",
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
