import type {
  AssistantResponseEvent,
  AssistantReasoningPartStatus,
  AssistantTextPartStatus,
  AssistantToolCallConversationMessagePart,
  AssistantToolCallPartStatus,
  ConversationMessagePart,
  ConversationMessageStatus,
  ConversationTurnStatus,
  PendingToolApprovalRequest,
} from "@buli/contracts";

export type ExpectedConversationMessageShape = {
  role: "user" | "assistant";
  messageStatus: ConversationMessageStatus;
  partKinds: readonly ConversationMessagePart["partKind"][];
  parts: readonly ExpectedConversationMessagePartShape[];
};

export type ExpectedConversationMessagePartShape = {
  partKind: ConversationMessagePart["partKind"];
  partStatus?: AssistantTextPartStatus | AssistantReasoningPartStatus | undefined;
  toolCallStatus?: AssistantToolCallPartStatus | undefined;
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
