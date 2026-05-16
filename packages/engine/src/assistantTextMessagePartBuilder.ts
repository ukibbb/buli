import {
  AssistantTextConversationMessagePartSchema,
  type AssistantTextPartStatus,
  type AssistantTextConversationMessagePart,
} from "@buli/contracts";

export type AssistantTextMessagePartBuilderState = {
  partId: string;
  rawMarkdownText: string;
};

function normalizeAssistantTextDeltaText(assistantTextDeltaText: string): string {
  return assistantTextDeltaText.replace(/\r\n?/g, "\n");
}

export function createInitialAssistantTextMessagePartBuilder(partId: string): AssistantTextMessagePartBuilderState {
  return {
    partId,
    rawMarkdownText: "",
  };
}

export function appendAssistantTextDeltaToAssistantTextMessagePartBuilder(
  assistantTextMessagePartBuilderState: AssistantTextMessagePartBuilderState,
  assistantTextDeltaText: string,
): AssistantTextMessagePartBuilderState {
  return {
    partId: assistantTextMessagePartBuilderState.partId,
    rawMarkdownText:
      assistantTextMessagePartBuilderState.rawMarkdownText + normalizeAssistantTextDeltaText(assistantTextDeltaText),
  };
}

export function buildStreamingAssistantTextConversationMessagePart(
  assistantTextMessagePartBuilderState: AssistantTextMessagePartBuilderState,
): AssistantTextConversationMessagePart {
  return buildAssistantTextConversationMessagePartWithStatus(assistantTextMessagePartBuilderState, "streaming");
}

export function buildCompletedAssistantTextConversationMessagePart(
  assistantTextMessagePartBuilderState: AssistantTextMessagePartBuilderState,
): AssistantTextConversationMessagePart {
  return buildAssistantTextConversationMessagePartWithStatus(assistantTextMessagePartBuilderState, "completed");
}

export function buildAssistantTextConversationMessagePartWithStatus(
  assistantTextMessagePartBuilderState: AssistantTextMessagePartBuilderState,
  partStatus: AssistantTextPartStatus,
): AssistantTextConversationMessagePart {
  return AssistantTextConversationMessagePartSchema.parse({
    id: assistantTextMessagePartBuilderState.partId,
    partKind: "assistant_text",
    partStatus,
    rawMarkdownText: assistantTextMessagePartBuilderState.rawMarkdownText,
  });
}
