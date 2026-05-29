import { expect, test } from "bun:test";
import { InMemoryConversationHistory } from "../src/conversationHistory.ts";
import { RuntimeConversationTurnSessionRecorder } from "../src/runtimeConversationTurnSessionRecorder.ts";
import { RuntimeProviderStreamEventTranslator } from "../src/runtimeProviderStreamEventTranslator.ts";
import { finalizeFailedConversationTurn } from "../src/runtimeConversationTurnTerminalFinalizer.ts";

test("finalizeFailedConversationTurn records accepted prompt, flushes text, and returns failed event", () => {
  const conversationHistory = new InMemoryConversationHistory();
  const conversationTurnSessionRecorder = new RuntimeConversationTurnSessionRecorder({
    conversationHistory,
    userPromptText: "Original prompt",
    assistantOperatingMode: "implementation",
  });
  const providerStreamEventTranslator = new RuntimeProviderStreamEventTranslator({
    assistantResponseMessageId: "assistant-message-1",
    assistantTextPartId: "assistant-text-1",
    conversationTurnStartedAtMilliseconds: 1_000,
    assistantOperatingMode: "implementation",
    selectedModelId: "gpt-5.4",
  });
  providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "text_chunk", text: "Partial answer" },
  });

  const assistantResponseEvents = finalizeFailedConversationTurn({
    assistantResponseMessageId: "assistant-message-1",
    conversationTurnSessionRecorder,
    providerStreamEventTranslator,
    acceptedPromptFallback: {
      userPromptText: "Original prompt",
      modelFacingPromptTextForAcceptedTurn: "Expanded prompt",
      projectInstructionSnapshotsForAcceptedTurn: [],
    },
    failureExplanation: "provider failed",
  });

  expect(assistantResponseEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_message_part_updated",
    "assistant_message_failed",
  ]);
  expect(conversationHistory.listConversationSessionEntries()).toEqual([
    {
      entryKind: "user_prompt",
      promptText: "Original prompt",
      modelFacingPromptText: "Expanded prompt",
      assistantOperatingMode: "implementation",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "failed",
      assistantMessageText: "Partial answer",
      assistantOperatingMode: "implementation",
      failureExplanation: "provider failed",
    },
  ]);
});
