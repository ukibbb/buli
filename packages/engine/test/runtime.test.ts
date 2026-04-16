import { expect, test } from "bun:test";
import type { ProviderStreamEvent } from "@buli/contracts";
import type { AssistantResponseProvider, AssistantResponseRequest } from "../src/index.ts";
import { AssistantResponseRuntime } from "../src/index.ts";

class FakeProvider implements AssistantResponseProvider {
  lastRequest: AssistantResponseRequest | undefined;

  async *streamAssistantResponse(input: AssistantResponseRequest): AsyncGenerator<ProviderStreamEvent> {
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
  async *streamAssistantResponse(): AsyncGenerator<ProviderStreamEvent> {
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
        assistantContentParts: expect.any(Array),
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

test("AssistantResponseRuntime translates every tool-call, turn, rate-limit, approval, and plan event", async () => {
  const providerEvents: ProviderStreamEvent[] = [
    {
      type: "tool_call_started",
      toolCallId: "tc_1",
      toolCallDetail: { toolName: "read", readFilePath: "apps/api/indexer.py" },
    },
    {
      type: "tool_call_completed",
      toolCallId: "tc_1",
      toolCallDetail: {
        toolName: "read",
        readFilePath: "apps/api/indexer.py",
        readLineCount: 46,
      },
      durationMs: 120,
    },
    {
      type: "tool_call_failed",
      toolCallId: "tc_2",
      toolCallDetail: { toolName: "grep", searchPattern: "orphan" },
      errorText: "ripgrep missing",
      durationMs: 15,
    },
    {
      type: "rate_limit_pending",
      retryAfterSeconds: 30,
      limitExplanation: "hourly tokens",
    },
    {
      type: "tool_approval_requested",
      approvalId: "apv_1",
      pendingToolCallId: "tc_3",
      pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
      riskExplanation: "destructive",
    },
    {
      type: "plan_proposed",
      planId: "plan_1",
      planTitle: "Wire atlas",
      planSteps: [{ stepIndex: 0, stepTitle: "Expose", stepStatus: "pending" }],
    },
    { type: "turn_completed", turnDurationMs: 420, modelDisplayName: "GPT-5.4" },
    { type: "text_chunk", text: "done" },
    {
      type: "completed",
      usage: { total: 20, input: 10, output: 5, reasoning: 5, cache: { read: 0, write: 0 } },
    },
  ];
  const fakeProvider = {
    async *streamAssistantResponse() {
      for (const providerStreamEvent of providerEvents) {
        yield providerStreamEvent;
      }
    },
  };
  const runtime = new AssistantResponseRuntime(fakeProvider);

  const emittedEvents = [];
  for await (const assistantResponseEvent of runtime.streamAssistantResponse({
    promptText: "do it",
    selectedModelId: "gpt-5.4",
  })) {
    emittedEvents.push(assistantResponseEvent);
  }

  expect(emittedEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_response_started",
    "assistant_tool_call_started",
    "assistant_tool_call_completed",
    "assistant_tool_call_failed",
    "assistant_rate_limit_pending",
    "assistant_tool_approval_requested",
    "assistant_plan_proposed",
    "assistant_turn_completed",
    "assistant_response_text_chunk",
    "assistant_response_completed",
  ]);

  expect(emittedEvents[7]).toEqual({
    type: "assistant_turn_completed",
    turnDurationMs: 420,
    modelDisplayName: "GPT-5.4",
  });
});

test("AssistantResponseRuntime translates an incomplete provider terminal event", async () => {
  const providerEvents: ProviderStreamEvent[] = [
    { type: "text_chunk", text: "Partial answer" },
    {
      type: "incomplete",
      incompleteReason: "max_output_tokens",
      usage: { total: 24, input: 20, output: 3, reasoning: 1, cache: { read: 0, write: 0 } },
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

  const emittedEvents = [];
  for await (const assistantResponseEvent of runtime.streamAssistantResponse({
    promptText: "continue",
    selectedModelId: "gpt-5.4",
  })) {
    emittedEvents.push(assistantResponseEvent);
  }

  expect(emittedEvents).toEqual([
    { type: "assistant_response_started", model: "gpt-5.4" },
    { type: "assistant_response_text_chunk", text: "Partial answer" },
    {
      type: "assistant_response_incomplete",
      incompleteReason: "max_output_tokens",
      usage: { total: 24, input: 20, output: 3, reasoning: 1, cache: { read: 0, write: 0 } },
    },
  ]);
});

test("attaches_assistant_content_parts_to_completed_response_event", async () => {
  const stubbedProvider: AssistantResponseProvider = {
    async *streamAssistantResponse() {
      yield { type: "text_chunk", text: "Hello " } as const;
      yield { type: "text_chunk", text: "world" } as const;
      yield {
        type: "completed",
        usage: { total: 3, input: 1, output: 2, reasoning: 0, cache: { read: 0, write: 0 } },
      } as const;
    },
  };
  const runtime = new AssistantResponseRuntime(stubbedProvider);
  const emittedEvents: import("@buli/contracts").AssistantResponseEvent[] = [];
  for await (const event of runtime.streamAssistantResponse({
    promptText: "say hello",
    selectedModelId: "gpt-5.4",
  })) {
    emittedEvents.push(event);
  }
  const completedEvent = emittedEvents.find((event) => event.type === "assistant_response_completed");
  expect(completedEvent).toBeDefined();
  if (completedEvent?.type === "assistant_response_completed") {
    expect(completedEvent.message.assistantContentParts).toEqual([
      { kind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "Hello world" }] },
    ]);
  }
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
