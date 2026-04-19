import type {
  AssistantResponseEvent,
  AssistantToolCallConversationMessagePart,
  ConversationTurnStatus,
  PendingToolApprovalRequest,
} from "@buli/contracts";

export type ExpectedConversationMessageShape = {
  role: "user" | "assistant";
  messageStatus: "streaming" | "completed" | "incomplete" | "failed";
  partKinds: readonly string[];
};

export type ChatSessionFixtureScenario = {
  scenarioName: string;
  responseEventSequence: readonly AssistantResponseEvent[];
  expectedConversationMessages: readonly ExpectedConversationMessageShape[];
  expectedConversationTurnStatus: ConversationTurnStatus;
  expectedPendingToolApprovalRequest?: PendingToolApprovalRequest;
  expectedToolCallPart?: Pick<
    AssistantToolCallConversationMessagePart,
    "toolCallStatus" | "toolCallId"
  >;
};
