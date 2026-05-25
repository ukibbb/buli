import { expect, test } from "bun:test";
import type { AssistantResponseEvent } from "@buli/contracts";
import type { AssistantConversationRunner } from "@buli/engine";
import { relayAssistantResponseRunnerEvents } from "../src/relayAssistantResponseRunnerEvents.ts";

class DeferredCompletion {
  readonly promise: Promise<void>;
  private resolvePromise: (() => void) | undefined;

  constructor() {
    this.promise = new Promise<void>((resolvePromise) => {
      this.resolvePromise = resolvePromise;
    });
  }

  complete(): void {
    this.resolvePromise?.();
  }
}

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

  const relayResult = await relayAssistantResponseRunnerEvents({
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
  expect(relayResult.terminalAssistantResponseEvent).toMatchObject({
    type: "assistant_message_completed",
    messageId: "assistant-1",
  });
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

  const relayResult = await relayAssistantResponseRunnerEvents({
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
  expect(relayResult.terminalAssistantResponseEvent).toMatchObject({
    type: "assistant_message_failed",
    errorText: "runner exploded",
  });
});

test("relayAssistantResponseRunnerEvents batches streaming text updates until a non-streaming event arrives", async () => {
  const releaseTerminalEvent = new DeferredCompletion();
  const assistantConversationRunner: AssistantConversationRunner = {
    startConversationTurn() {
      return {
        async *streamAssistantResponseEvents() {
          yield { type: "assistant_turn_started", messageId: "assistant-1", startedAtMs: 1 };
          yield {
            type: "assistant_message_part_updated",
            messageId: "assistant-1",
            part: {
              id: "text-part-1",
              partKind: "assistant_text",
              partStatus: "streaming",
              rawMarkdownText: "Hello",
            },
          };
          await releaseTerminalEvent.promise;
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

  const relayPromise = relayAssistantResponseRunnerEvents({
    assistantConversationRunner,
    conversationTurnRequest: { userPromptText: "say hi", selectedModelId: "gpt-5.4" },
    onConversationTurnStarted: () => {},
    onConversationTurnFinished: () => {},
    onAssistantResponseEvents: (assistantResponseEvents) => {
      emittedEventBatches.push([...assistantResponseEvents]);
    },
  });

  await waitMilliseconds(10);
  expect(emittedEventBatches.map((eventBatch) => eventBatch.map((assistantResponseEvent) => assistantResponseEvent.type))).toEqual([
    ["assistant_turn_started"],
  ]);

  releaseTerminalEvent.complete();
  await relayPromise;
  expect(emittedEventBatches.map((eventBatch) => eventBatch.map((assistantResponseEvent) => assistantResponseEvent.type))).toEqual([
    ["assistant_turn_started"],
    ["assistant_message_part_updated", "assistant_message_completed"],
  ]);
});

test("relayAssistantResponseRunnerEvents flushes tool-call events without waiting for the streaming batch window", async () => {
  const releaseTerminalEvent = new DeferredCompletion();
  const assistantConversationRunner: AssistantConversationRunner = {
    startConversationTurn() {
      return {
        async *streamAssistantResponseEvents() {
          yield { type: "assistant_turn_started", messageId: "assistant-1", startedAtMs: 1 };
          yield {
            type: "assistant_message_part_updated",
            messageId: "assistant-1",
            part: {
              id: "text-part-1",
              partKind: "assistant_text",
              partStatus: "streaming",
              rawMarkdownText: "Hello",
            },
          };
          yield {
            type: "assistant_message_part_added",
            messageId: "assistant-1",
            part: {
              id: "tool-part-1",
              partKind: "assistant_tool_call",
              toolCallId: "call_read_1",
              toolCallStatus: "running",
              toolCallStartedAtMs: 1,
              toolCallDetail: { toolName: "read", readFilePath: "notes.txt" },
            },
          };
          await releaseTerminalEvent.promise;
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

  const relayPromise = relayAssistantResponseRunnerEvents({
    assistantConversationRunner,
    conversationTurnRequest: { userPromptText: "read notes", selectedModelId: "gpt-5.4" },
    onConversationTurnStarted: () => {},
    onConversationTurnFinished: () => {},
    onAssistantResponseEvents: (assistantResponseEvents) => {
      emittedEventBatches.push([...assistantResponseEvents]);
    },
  });

  await waitForCondition({
    condition: () => emittedEventBatches.length >= 2,
    timeoutMilliseconds: 500,
    createTimeoutError: () => new Error("Tool-call event was not flushed immediately."),
  });
  expect(emittedEventBatches.map((eventBatch) => eventBatch.map((assistantResponseEvent) => assistantResponseEvent.type))).toEqual([
    ["assistant_turn_started"],
    ["assistant_message_part_updated", "assistant_message_part_added"],
  ]);

  releaseTerminalEvent.complete();
  await relayPromise;
});

function waitMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function waitForCondition(input: {
  condition: () => boolean;
  timeoutMilliseconds: number;
  createTimeoutError: () => Error;
}): Promise<void> {
  const startedAtMs = Date.now();
  while (!input.condition()) {
    if (Date.now() - startedAtMs >= input.timeoutMilliseconds) {
      throw input.createTimeoutError();
    }

    await waitMilliseconds(1);
  }
}
