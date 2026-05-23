import { expect, test } from "bun:test";
import type { ConversationMessage } from "@buli/contracts";
import {
  buildConversationTranscriptMessageIndexWindow,
  buildConversationTranscriptWindow,
  revealOlderConversationTranscriptMessages,
} from "../src/behavior/conversationTranscriptWindow.ts";

function createConversationMessage(messageIndex: number): ConversationMessage {
  return {
    id: `message-${messageIndex}`,
    role: messageIndex % 2 === 0 ? "user" : "assistant",
    messageStatus: "completed",
    createdAtMs: messageIndex,
    partIds: [`part-${messageIndex}`],
  };
}

test("buildConversationTranscriptWindow keeps the latest messages and reports hidden older count", () => {
  const conversationMessages = Array.from({ length: 10 }, (_, messageIndex) => createConversationMessage(messageIndex));

  expect(
    buildConversationTranscriptWindow({
      conversationMessages,
      requestedVisibleConversationMessageCount: 4,
      revealChunkConversationMessageCount: 3,
    }),
  ).toEqual({
    visibleConversationMessages: conversationMessages.slice(6),
    totalConversationMessageCount: 10,
    visibleConversationMessageCount: 4,
    hiddenOlderConversationMessageCount: 6,
    olderConversationMessageRevealCount: 3,
  });
});

test("buildConversationTranscriptWindow hides no messages when the visible window covers the transcript", () => {
  const conversationMessages = Array.from({ length: 3 }, (_, messageIndex) => createConversationMessage(messageIndex));

  expect(
    buildConversationTranscriptWindow({
      conversationMessages,
      requestedVisibleConversationMessageCount: 10,
      revealChunkConversationMessageCount: 4,
    }),
  ).toEqual({
    visibleConversationMessages: conversationMessages,
    totalConversationMessageCount: 3,
    visibleConversationMessageCount: 3,
    hiddenOlderConversationMessageCount: 0,
    olderConversationMessageRevealCount: 0,
  });
});

test("buildConversationTranscriptMessageIndexWindow identifies the visible tail without message allocation", () => {
  expect(
    buildConversationTranscriptMessageIndexWindow({
      totalConversationMessageCount: 10_000,
      requestedVisibleConversationMessageCount: 160,
      revealChunkConversationMessageCount: 80,
    }),
  ).toEqual({
    totalConversationMessageCount: 10_000,
    firstVisibleConversationMessageIndex: 9_840,
    visibleConversationMessageCount: 160,
    hiddenOlderConversationMessageCount: 9_840,
    olderConversationMessageRevealCount: 80,
  });
});

test("revealOlderConversationTranscriptMessages expands by chunk without exceeding total messages", () => {
  expect(
    revealOlderConversationTranscriptMessages({
      currentVisibleConversationMessageCount: 4,
      totalConversationMessageCount: 10,
      revealChunkConversationMessageCount: 3,
    }),
  ).toBe(7);
  expect(
    revealOlderConversationTranscriptMessages({
      currentVisibleConversationMessageCount: 8,
      totalConversationMessageCount: 10,
      revealChunkConversationMessageCount: 3,
    }),
  ).toBe(10);
});
