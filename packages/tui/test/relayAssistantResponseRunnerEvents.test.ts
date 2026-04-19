import { expect, test } from "bun:test";
import type { AssistantResponseEvent } from "@buli/contracts";
import type { AssistantConversationRunner } from "@buli/engine";
import { relayAssistantResponseRunnerEvents } from "../src/relayAssistantResponseRunnerEvents.ts";

test("relayAssistantResponseRunnerEvents forwards streamed assistant events in ordered batches", async () => {
  const assistantConversationRunner: AssistantConversationRunner = {
    startConversationTurn() {
      return {
        async *streamAssistantResponseEvents() {
          yield { type: "assistant_turn_started", messageId: "assistant-1", startedAtMs: 1 };
          yield {
            type: "assistant_message_part_added",
            messageId: "assistant-1",
            part: {
              id: "assistant-text-1",
              partKind: "assistant_text",
              partStatus: "streaming",
              rawMarkdownText: "hello",
              completedContentParts: [],
              openContentPart: { kind: "streaming_markdown_text", text: "hello" },
            },
          };
          yield {
            type: "assistant_message_completed",
            messageId: "assistant-1",
            usage: { total: 10, input: 4, output: 5, reasoning: 1, cache: { read: 0, write: 0 } },
          };
        },
        async approvePendingToolCall() {},
        async denyPendingToolCall() {},
      };
    },
  };
  const emittedEventBatches: AssistantResponseEvent[][] = [];

  await relayAssistantResponseRunnerEvents({
    assistantConversationRunner,
    conversationTurnRequest: { userPromptText: "say hi", selectedModelId: "gpt-5.4" },
    onConversationTurnStarted: () => {},
    onConversationTurnFinished: () => {},
    onAssistantResponseEvents: (assistantResponseEvents) => {
      emittedEventBatches.push([...assistantResponseEvents]);
    },
  });

  expect(emittedEventBatches.flat()).toEqual([
    { type: "assistant_turn_started", messageId: "assistant-1", startedAtMs: 1 },
    {
      type: "assistant_message_part_added",
      messageId: "assistant-1",
      part: {
        id: "assistant-text-1",
        partKind: "assistant_text",
        partStatus: "streaming",
        rawMarkdownText: "hello",
        completedContentParts: [],
        openContentPart: { kind: "streaming_markdown_text", text: "hello" },
      },
    },
    {
      type: "assistant_message_completed",
      messageId: "assistant-1",
      usage: { total: 10, input: 4, output: 5, reasoning: 1, cache: { read: 0, write: 0 } },
    },
  ]);
});

test("relayAssistantResponseRunnerEvents converts a thrown runner error into a synthetic failed assistant turn", async () => {
  const assistantConversationRunner: AssistantConversationRunner = {
    startConversationTurn() {
      return {
        async *streamAssistantResponseEvents() {
          throw new Error("runner exploded");
        },
        async approvePendingToolCall() {},
        async denyPendingToolCall() {},
      };
    },
  };
  const emittedEventBatches: AssistantResponseEvent[][] = [];

  await relayAssistantResponseRunnerEvents({
    assistantConversationRunner,
    conversationTurnRequest: { userPromptText: "say hi", selectedModelId: "gpt-5.4" },
    onConversationTurnStarted: () => {},
    onConversationTurnFinished: () => {},
    onAssistantResponseEvents: (assistantResponseEvents) => {
      emittedEventBatches.push([...assistantResponseEvents]);
    },
  });

  expect(emittedEventBatches.flat().map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_turn_started",
    "assistant_message_failed",
  ]);
});
