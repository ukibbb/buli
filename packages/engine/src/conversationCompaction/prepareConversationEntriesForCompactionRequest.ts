import type {
  AssistantMessageConversationSessionEntry,
  ConversationSessionEntry,
  UserPromptConversationSessionEntry,
} from "@buli/contracts";

export const DEFAULT_COMPACTION_TOOL_RESULT_TEXT_MAXIMUM_CHARACTER_COUNT = 2_000;

type ToolResultConversationSessionEntry = Extract<
  ConversationSessionEntry,
  { entryKind: "completed_tool_result" | "failed_tool_result" | "denied_tool_result" }
>;

export type ConversationEntriesForCompactionRequestProjection = {
  conversationSessionEntries: readonly ConversationSessionEntry[];
  originalCharacterCount: number;
  projectedCharacterCount: number;
  strippedImageAttachmentCount: number;
  truncatedToolResultCount: number;
  removedProviderTurnReplayCount: number;
};

export function prepareConversationEntriesForCompactionRequest(input: {
  conversationSessionEntries: readonly ConversationSessionEntry[];
  maximumToolResultTextCharacterCount?: number | undefined;
}): ConversationEntriesForCompactionRequestProjection {
  const maximumToolResultTextCharacterCount = input.maximumToolResultTextCharacterCount ??
    DEFAULT_COMPACTION_TOOL_RESULT_TEXT_MAXIMUM_CHARACTER_COUNT;
  let strippedImageAttachmentCount = 0;
  let truncatedToolResultCount = 0;
  let removedProviderTurnReplayCount = 0;

  const conversationSessionEntries = input.conversationSessionEntries.map((conversationSessionEntry) => {
    if (conversationSessionEntry.entryKind === "user_prompt") {
      strippedImageAttachmentCount += conversationSessionEntry.imageAttachments?.length ?? 0;
      return stripUserPromptImageAttachmentsForCompaction(conversationSessionEntry);
    }

    if (conversationSessionEntry.entryKind === "assistant_message") {
      removedProviderTurnReplayCount += conversationSessionEntry.providerTurnReplay ? 1 : 0;
      return removeAssistantMessageProviderReplayForCompaction(conversationSessionEntry);
    }

    if (isToolResultConversationSessionEntry(conversationSessionEntry)) {
      const truncatedToolResultEntry = truncateToolResultTextForCompaction({
        conversationSessionEntry,
        maximumToolResultTextCharacterCount,
      });
      truncatedToolResultCount += truncatedToolResultEntry === conversationSessionEntry ? 0 : 1;
      return truncatedToolResultEntry;
    }

    return conversationSessionEntry;
  });

  return {
    conversationSessionEntries,
    originalCharacterCount: countSerializedConversationSessionEntryCharacters(input.conversationSessionEntries),
    projectedCharacterCount: countSerializedConversationSessionEntryCharacters(conversationSessionEntries),
    strippedImageAttachmentCount,
    truncatedToolResultCount,
    removedProviderTurnReplayCount,
  };
}

function stripUserPromptImageAttachmentsForCompaction(
  userPromptEntry: UserPromptConversationSessionEntry,
): UserPromptConversationSessionEntry {
  const imageAttachments = userPromptEntry.imageAttachments ?? [];
  if (imageAttachments.length === 0) {
    return userPromptEntry;
  }

  const imageAttachmentPlaceholderText = imageAttachments
    .map((imageAttachment) => `[Attached ${imageAttachment.mimeType}: ${imageAttachment.fileName ?? "image"}]`)
    .join("\n");
  const modelFacingPromptText = userPromptEntry.modelFacingPromptText.length > 0
    ? `${userPromptEntry.modelFacingPromptText}\n\n${imageAttachmentPlaceholderText}`
    : imageAttachmentPlaceholderText;
  const { imageAttachments: removedImageAttachments, ...userPromptEntryWithoutImageAttachments } = userPromptEntry;
  void removedImageAttachments;

  return {
    ...userPromptEntryWithoutImageAttachments,
    modelFacingPromptText,
  };
}

function removeAssistantMessageProviderReplayForCompaction(
  assistantMessageEntry: AssistantMessageConversationSessionEntry,
): AssistantMessageConversationSessionEntry {
  if (!assistantMessageEntry.providerTurnReplay) {
    return assistantMessageEntry;
  }

  const { providerTurnReplay: removedProviderTurnReplay, ...assistantMessageEntryWithoutProviderReplay } = assistantMessageEntry;
  void removedProviderTurnReplay;
  return assistantMessageEntryWithoutProviderReplay;
}

function truncateToolResultTextForCompaction(input: {
  conversationSessionEntry: ToolResultConversationSessionEntry;
  maximumToolResultTextCharacterCount: number;
}): ToolResultConversationSessionEntry {
  if (input.conversationSessionEntry.toolResultText.length <= input.maximumToolResultTextCharacterCount) {
    return input.conversationSessionEntry;
  }

  return {
    ...input.conversationSessionEntry,
    toolResultText: truncateTextForCompaction({
      text: input.conversationSessionEntry.toolResultText,
      maximumCharacterCount: input.maximumToolResultTextCharacterCount,
    }),
  };
}

function truncateTextForCompaction(input: { text: string; maximumCharacterCount: number }): string {
  const preservedCharacterCount = Math.max(0, input.maximumCharacterCount);
  if (input.text.length <= preservedCharacterCount) {
    return input.text;
  }

  const omittedCharacterCount = input.text.length - preservedCharacterCount;
  return `${input.text.slice(0, preservedCharacterCount)}\n[Tool result truncated for compaction: omitted ${omittedCharacterCount} chars]`;
}

function countSerializedConversationSessionEntryCharacters(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): number {
  return JSON.stringify(conversationSessionEntries).length;
}

function isToolResultConversationSessionEntry(
  conversationSessionEntry: ConversationSessionEntry,
): conversationSessionEntry is ToolResultConversationSessionEntry {
  return conversationSessionEntry.entryKind === "completed_tool_result" ||
    conversationSessionEntry.entryKind === "failed_tool_result" ||
    conversationSessionEntry.entryKind === "denied_tool_result";
}
