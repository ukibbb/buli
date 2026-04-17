import { expect, test } from "bun:test";
import type { AssistantResponseEvent } from "@buli/contracts";
import type { AssistantConversationRunner } from "@buli/engine";
import { relayAssistantResponseRunnerEvents } from "../src/relayAssistantResponseRunnerEvents.ts";

test("relayAssistantResponseRunnerEvents forwards streamed assistant events in order", async () => {
  const assistantConversationRunner: AssistantConversationRunner = {
    startConversationTurn() {
      return {
        async *streamAssistantResponseEvents() {
          yield { type: "assistant_response_started", model: "gpt-5.4" };
          yield { type: "assistant_response_text_chunk", text: "hello" };
          yield {
            type: "assistant_response_completed",
            message: { id: "assistant-1", role: "assistant", text: "hello" },
            usage: { total: 10, input: 4, output: 5, reasoning: 1, cache: { read: 0, write: 0 } },
          };
        },
        async approvePendingToolCall() {},
        async denyPendingToolCall() {},
      };
    },
  };
  const emittedEvents: AssistantResponseEvent[] = [];

  await relayAssistantResponseRunnerEvents({
    assistantConversationRunner,
    conversationTurnRequest: { userPromptText: "say hi", selectedModelId: "gpt-5.4" },
    onConversationTurnStarted: () => {},
    onConversationTurnFinished: () => {},
    onAssistantResponseEvent: (assistantResponseEvent) => {
      emittedEvents.push(assistantResponseEvent);
    },
  });

  expect(emittedEvents).toEqual([
    { type: "assistant_response_started", model: "gpt-5.4" },
    { type: "assistant_response_text_chunk", text: "hello" },
    {
      type: "assistant_response_completed",
      message: { id: "assistant-1", role: "assistant", text: "hello" },
      usage: { total: 10, input: 4, output: 5, reasoning: 1, cache: { read: 0, write: 0 } },
    },
  ]);
});

test("relayAssistantResponseRunnerEvents converts a thrown runner error into assistant_response_failed", async () => {
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
  const emittedEvents: AssistantResponseEvent[] = [];

  await relayAssistantResponseRunnerEvents({
    assistantConversationRunner,
    conversationTurnRequest: { userPromptText: "say hi", selectedModelId: "gpt-5.4" },
    onConversationTurnStarted: () => {},
    onConversationTurnFinished: () => {},
    onAssistantResponseEvent: (assistantResponseEvent) => {
      emittedEvents.push(assistantResponseEvent);
    },
  });

  expect(emittedEvents).toEqual([{ type: "assistant_response_failed", error: "runner exploded" }]);
});
