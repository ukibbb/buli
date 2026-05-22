import type { ConversationMessage } from "@buli/contracts";

export const DEFAULT_VISIBLE_CONVERSATION_MESSAGE_COUNT = 160;
export const CONVERSATION_MESSAGE_REVEAL_CHUNK_COUNT = 80;

export type ConversationTranscriptWindow = {
  visibleConversationMessages: readonly ConversationMessage[];
  totalConversationMessageCount: number;
  visibleConversationMessageCount: number;
  hiddenOlderConversationMessageCount: number;
  olderConversationMessageRevealCount: number;
};

export function buildConversationTranscriptWindow(input: {
  conversationMessages: readonly ConversationMessage[];
  requestedVisibleConversationMessageCount?: number | undefined;
  revealChunkConversationMessageCount?: number | undefined;
}): ConversationTranscriptWindow {
  const totalConversationMessageCount = input.conversationMessages.length;
  const requestedVisibleConversationMessageCount = normalizePositiveInteger(
    input.requestedVisibleConversationMessageCount,
    DEFAULT_VISIBLE_CONVERSATION_MESSAGE_COUNT,
  );
  const revealChunkConversationMessageCount = normalizePositiveInteger(
    input.revealChunkConversationMessageCount,
    CONVERSATION_MESSAGE_REVEAL_CHUNK_COUNT,
  );
  const visibleConversationMessageCount = Math.min(
    totalConversationMessageCount,
    requestedVisibleConversationMessageCount,
  );
  const hiddenOlderConversationMessageCount = Math.max(
    0,
    totalConversationMessageCount - visibleConversationMessageCount,
  );

  return {
    visibleConversationMessages: input.conversationMessages.slice(
      totalConversationMessageCount - visibleConversationMessageCount,
    ),
    totalConversationMessageCount,
    visibleConversationMessageCount,
    hiddenOlderConversationMessageCount,
    olderConversationMessageRevealCount: Math.min(
      revealChunkConversationMessageCount,
      hiddenOlderConversationMessageCount,
    ),
  };
}

export function revealOlderConversationTranscriptMessages(input: {
  currentVisibleConversationMessageCount: number;
  totalConversationMessageCount: number;
  revealChunkConversationMessageCount?: number | undefined;
}): number {
  const revealChunkConversationMessageCount = normalizePositiveInteger(
    input.revealChunkConversationMessageCount,
    CONVERSATION_MESSAGE_REVEAL_CHUNK_COUNT,
  );

  return Math.min(
    input.totalConversationMessageCount,
    Math.max(0, input.currentVisibleConversationMessageCount) + revealChunkConversationMessageCount,
  );
}

function normalizePositiveInteger(value: number | undefined, fallbackValue: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallbackValue;
}
