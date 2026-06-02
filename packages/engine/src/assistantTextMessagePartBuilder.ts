import {
  AssistantTextConversationMessagePartSchema,
  readTrailingPossibleInternalModeScopeTagFragment,
  removeInternalModeScopeTagsFromAssistantTranscriptText,
  type AssistantTextPartStatus,
  type AssistantTextConversationMessagePart,
} from "@buli/contracts";

export type AssistantTextMessagePartBuilderState = {
  partId: string;
  rawMarkdownText: string;
  pendingPossibleInternalModeScopeTagFragment: string;
};

function normalizeAssistantTextDeltaText(assistantTextDeltaText: string): string {
  return assistantTextDeltaText.replace(/\r\n?/g, "\n");
}

export function createInitialAssistantTextMessagePartBuilder(partId: string): AssistantTextMessagePartBuilderState {
  return {
    partId,
    rawMarkdownText: "",
    pendingPossibleInternalModeScopeTagFragment: "",
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

  const assistantTextDeltaWithPendingTagFragment = [
    assistantTextMessagePartBuilderState.pendingPossibleInternalModeScopeTagFragment,
    normalizedAssistantTextDeltaText,
  ].join("");
  const assistantTextDeltaWithoutCompleteInternalTags = removeInternalModeScopeTagsFromAssistantTranscriptText(
    assistantTextDeltaWithPendingTagFragment,
  );
  const pendingPossibleInternalModeScopeTagFragment = readTrailingPossibleInternalModeScopeTagFragment(
    assistantTextDeltaWithoutCompleteInternalTags,
  );
  const visibleAssistantTextDelta = pendingPossibleInternalModeScopeTagFragment.length > 0
    ? assistantTextDeltaWithoutCompleteInternalTags.slice(0, -pendingPossibleInternalModeScopeTagFragment.length)
    : assistantTextDeltaWithoutCompleteInternalTags;

  assistantTextMessagePartBuilderState.pendingPossibleInternalModeScopeTagFragment =
    pendingPossibleInternalModeScopeTagFragment;
  assistantTextMessagePartBuilderState.rawMarkdownText += visibleAssistantTextDelta;
  return assistantTextMessagePartBuilderState;
}

export function readAssistantTextMessagePartBuilderRawMarkdownText(
  assistantTextMessagePartBuilderState: AssistantTextMessagePartBuilderState,
): string {
  return assistantTextMessagePartBuilderState.rawMarkdownText;
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
