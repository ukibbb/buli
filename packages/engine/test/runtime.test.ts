import { expect, test } from "bun:test";
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
