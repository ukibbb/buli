import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const assistantReplyWithToolApprovalRequest: AssistantTranscriptScenario = {
  scenarioName: "assistantReplyWithToolApprovalRequest",
  responseEventSequence: [
    { type: "assistant_response_started", model: "gpt-5.4" },
    {
      type: "assistant_tool_approval_requested",
      approvalId: "approval-001",
      pendingToolCallId: "tc-bash-pending-1",
      pendingToolCallDetail: {
        toolName: "bash",
        commandLine: "rm -rf ./dist",
      },
      riskExplanation: "This command will permanently delete the dist directory and all its contents.",
    },
  ],
  expectedConversationTranscriptEntries: [
    {
      kind: "tool_approval_request",
      approvalId: "approval-001",
      pendingToolCallId: "tc-bash-pending-1",
      pendingToolCallDetail: {
        toolName: "bash",
        commandLine: "rm -rf ./dist",
      },
      riskExplanation: "This command will permanently delete the dist directory and all its contents.",
    },
  ],
};
