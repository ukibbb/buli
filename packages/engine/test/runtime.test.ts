import { expect, test } from "bun:test";
import type { ProviderStreamEvent } from "@buli/contracts";
import type { AssistantResponseProvider, AssistantResponseRequest } from "../src/index.ts";
import { AssistantResponseRuntime } from "../src/index.ts";

class FakeProvider implements AssistantResponseProvider {
  lastRequest: AssistantResponseRequest | undefined;

  async *streamAssistantResponse(
    input: AssistantResponseRequest,
  ): AsyncGenerator<{ type: "text_chunk"; text: string } | { type: "completed"; usage: { total: number; input: number; output: number; reasoning: number; cache: { read: number; write: number } } }> {
    this.lastRequest = input;
    yield { type: "text_chunk", text: "Hello" };
    yield { type: "text_chunk", text: " world" };
    yield {
      type: "completed",
      usage: {
        total: 180,
        input: 100,
        output: 50,
        reasoning: 30,
        cache: { read: 20, write: 0 },
      },
    };
  }
}

class BrokenProvider implements AssistantResponseProvider {
  async *streamAssistantResponse(): AsyncGenerator<{ type: "text_chunk"; text: string } | { type: "completed"; usage: { total: number; input: number; output: number; reasoning: number; cache: { read: number; write: number } } }> {
    throw new Error("provider failed");
  }
}

test("AssistantResponseRuntime emits started chunk and completed events", async () => {
  const provider = new FakeProvider();
  const runtime = new AssistantResponseRuntime(provider);
  const events = [];

  for await (const event of runtime.streamAssistantResponse({
    promptText: "Say hello",
    selectedModelId: "gpt-5.4",
    selectedReasoningEffort: "high",
  })) {
    events.push(event);
  }

  expect(provider.lastRequest).toEqual({
    promptText: "Say hello",
    selectedModelId: "gpt-5.4",
    selectedReasoningEffort: "high",
  });

  expect(events).toEqual([
    { type: "assistant_response_started", model: "gpt-5.4" },
    { type: "assistant_response_text_chunk", text: "Hello" },
    { type: "assistant_response_text_chunk", text: " world" },
    {
      type: "assistant_response_completed",
      message: {
        id: expect.any(String),
        role: "assistant",
        text: "Hello world",
      },
      usage: {
        total: 180,
        input: 100,
        output: 50,
        reasoning: 30,
        cache: { read: 20, write: 0 },
      },
    },
  ]);
});

test("AssistantResponseRuntime emits a failure event when the provider throws", async () => {
  const runtime = new AssistantResponseRuntime(new BrokenProvider());
  const events = [];

  for await (const event of runtime.streamAssistantResponse({
    promptText: "Say hello",
    selectedModelId: "gpt-5.4",
  })) {
    events.push(event);
  }

  expect(events).toEqual([
    { type: "assistant_response_started", model: "gpt-5.4" },
    { type: "assistant_response_failed", error: "provider failed" },
  ]);
});

test("AssistantResponseRuntime re-emits reasoning-summary events from the provider in order", async () => {
  const providerEvents: ProviderStreamEvent[] = [
    { type: "reasoning_summary_started" },
    { type: "reasoning_summary_text_chunk", text: "hmm" },
    { type: "reasoning_summary_completed", reasoningDurationMs: 900 },
    { type: "text_chunk", text: "answer" },
    {
      type: "completed",
      usage: {
        total: 10,
        input: 5,
        output: 3,
        reasoning: 2,
        cache: { read: 0, write: 0 },
      },
    },
  ];
  const fakeProvider = {
    async *streamAssistantResponse() {
      for (const providerEvent of providerEvents) {
        yield providerEvent;
      }
    },
  };
  const runtime = new AssistantResponseRuntime(fakeProvider);

  const emittedTypes: string[] = [];
  for await (const assistantResponseEvent of runtime.streamAssistantResponse({
    promptText: "explain",
    selectedModelId: "gpt-5.4",
  })) {
    emittedTypes.push(assistantResponseEvent.type);
  }

  expect(emittedTypes).toEqual([
    "assistant_response_started",
    "assistant_reasoning_summary_started",
    "assistant_reasoning_summary_text_chunk",
    "assistant_reasoning_summary_completed",
    "assistant_response_text_chunk",
    "assistant_response_completed",
  ]);
});
