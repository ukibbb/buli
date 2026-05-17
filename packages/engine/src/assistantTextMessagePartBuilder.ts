import {
  AssistantTextConversationMessagePartSchema,
  type AssistantTextPartStatus,
  type AssistantTextConversationMessagePart,
} from "@buli/contracts";

export type AssistantTextMessagePartBuilderState = {
  partId: string;
  normalizedMarkdownTextChunks: string[];
};

function normalizeAssistantTextDeltaText(assistantTextDeltaText: string): string {
  return assistantTextDeltaText.replace(/\r\n?/g, "\n");
}

export function createInitialAssistantTextMessagePartBuilder(partId: string): AssistantTextMessagePartBuilderState {
  return {
    partId,
    normalizedMarkdownTextChunks: [],
  };
}

export function appendAssistantTextDeltaToAssistantTextMessagePartBuilder(
  assistantTextMessagePartBuilderState: AssistantTextMessagePartBuilderState,
  assistantTextDeltaText: string,
): AssistantTextMessagePartBuilderState {
  const normalizedAssistantTextDeltaText = normalizeAssistantTextDeltaText(assistantTextDeltaText);
  if (normalizedAssistantTextDeltaText.length === 0) {
    return assistantTextMessagePartBuilderState;
  }

  assistantTextMessagePartBuilderState.normalizedMarkdownTextChunks.push(normalizedAssistantTextDeltaText);
  return assistantTextMessagePartBuilderState;
}

export function readAssistantTextMessagePartBuilderRawMarkdownText(
  assistantTextMessagePartBuilderState: AssistantTextMessagePartBuilderState,
): string {
  return assistantTextMessagePartBuilderState.normalizedMarkdownTextChunks.join("");
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
    rawMarkdownText: readAssistantTextMessagePartBuilderRawMarkdownText(assistantTextMessagePartBuilderState),
  });
}
