import type { ChatSessionFixtureScenario } from "../scenarioShape.ts";

export const pendingToolApproval: ChatSessionFixtureScenario = {
  scenarioName: "pendingToolApproval",
  responseEventSequence: [
    { type: "assistant_turn_started", messageId: "assistant-1", startedAtMs: 1 },
    {
      type: "assistant_message_part_added",
      messageId: "assistant-1",
      part: {
        id: "tool-1",
        partKind: "assistant_tool_call",
        toolCallId: "call-1",
        toolCallStatus: "pending_approval",
        toolCallStartedAtMs: 1,
        toolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
      },
    },
    {
      type: "assistant_pending_tool_approval_requested",
      approvalRequest: {
        approvalId: "approval-1",
        pendingToolCallId: "call-1",
        pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
        riskExplanation: "This command is destructive.",
      },
    },
  ],
  expectedConversationMessages: [
    {
      role: "assistant",
      messageStatus: "streaming",
      partKinds: ["assistant_tool_call"],
    },
  ],
  expectedConversationTurnStatus: "waiting_for_tool_approval",
  expectedPendingToolApprovalRequest: {
    approvalId: "approval-1",
    pendingToolCallId: "call-1",
    pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
    riskExplanation: "This command is destructive.",
  },
  expectedToolCallPart: {
    toolCallId: "call-1",
    toolCallStatus: "pending_approval",
  },
};
