import { expect, test } from "bun:test";
import type { AssistantResponseEvent } from "@buli/contracts";
import type { AssistantConversationRunner } from "@buli/engine";
import { relayAssistantResponseRunnerEvents } from "../src/relayAssistantResponseRunnerEvents.ts";

test("relayAssistantResponseRunnerEvents forwards streamed assistant events in order", async () => {
  const assistantConversationRunner: AssistantConversationRunner = {
    startConversationTurn() {
      return {
        async *streamAssistantResponseEvents() {
          yield { type: "assistant_turn_started", messageId: "assistant-1", startedAtMs: 1 };
          yield {
            type: "assistant_message_completed",
            messageId: "assistant-1",
            usage: { total: 10, input: 4, output: 5, reasoning: 1, cache: { read: 0, write: 0 } },
          };
        },
        async approvePendingToolCall() {},
        async denyPendingToolCall() {},
        interrupt() {},
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
    "assistant_message_completed",
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
        interrupt() {},
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
