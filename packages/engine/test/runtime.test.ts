import { expect, test } from "bun:test";
import type { TurnProvider } from "../src/index.ts";
import { AgentRuntime } from "../src/index.ts";

class FakeProvider implements TurnProvider {
  async *streamTurn(): AsyncGenerator<{ type: "text-delta"; text: string } | { type: "finish"; usage: { total: number; input: number; output: number; reasoning: number; cache: { read: number; write: number } } }> {
    yield { type: "text-delta", text: "Hello" };
    yield { type: "text-delta", text: " world" };
    yield {
      type: "finish",
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

class BrokenProvider implements TurnProvider {
  async *streamTurn(): AsyncGenerator<never> {
    throw new Error("provider failed");
  }
}

test("AgentRuntime emits started delta and finished events", async () => {
  const runtime = new AgentRuntime(new FakeProvider());
  const events = [];

  for await (const event of runtime.runTurn({
    prompt: "Say hello",
    model: "gpt-5.4",
  })) {
    events.push(event);
  }

  expect(events).toEqual([
    { type: "assistant_stream_started", model: "gpt-5.4" },
    { type: "assistant_text_delta", text: "Hello" },
    { type: "assistant_text_delta", text: " world" },
    {
      type: "assistant_stream_finished",
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

test("AgentRuntime emits a failure event when the provider throws", async () => {
  const runtime = new AgentRuntime(new BrokenProvider());
  const events = [];

  for await (const event of runtime.runTurn({
    prompt: "Say hello",
    model: "gpt-5.4",
  })) {
    events.push(event);
  }

  expect(events).toEqual([
    { type: "assistant_stream_started", model: "gpt-5.4" },
    { type: "assistant_stream_failed", error: "provider failed" },
  ]);
});
