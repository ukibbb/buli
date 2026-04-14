import { expect, test } from "bun:test";
import {
  AssistantReasoningSummaryCompletedEventSchema,
  AssistantReasoningSummaryStartedEventSchema,
  AssistantReasoningSummaryTextChunkEventSchema,
  AssistantResponseEventSchema,
  AvailableAssistantModelSchema,
  ProviderCompletedEventSchema,
  ReasoningEffortSchema,
  TokenUsageSchema,
} from "../src/index.ts";

test("ReasoningEffortSchema parses supported effort values", () => {
  expect(ReasoningEffortSchema.parse("minimal")).toBe("minimal");
  expect(ReasoningEffortSchema.parse("xhigh")).toBe("xhigh");
});

test("AvailableAssistantModelSchema parses a model with reasoning metadata", () => {
  const model = AvailableAssistantModelSchema.parse({
    id: "gpt-5.4",
    displayName: "GPT-5.4",
    defaultReasoningEffort: "medium",
    supportedReasoningEfforts: ["low", "medium", "high"],
  });

  expect(model.id).toBe("gpt-5.4");
  expect(model.displayName).toBe("GPT-5.4");
  expect(model.defaultReasoningEffort).toBe("medium");
  expect(model.supportedReasoningEfforts).toEqual(["low", "medium", "high"]);
});

test("AvailableAssistantModelSchema parses a model without reasoning metadata", () => {
  const model = AvailableAssistantModelSchema.parse({
    id: "gpt-4.1-mini",
    displayName: "gpt-4.1-mini",
    supportedReasoningEfforts: [],
  });

  expect(model.displayName).toBe("gpt-4.1-mini");
  expect(model.defaultReasoningEffort).toBeUndefined();
  expect(model.supportedReasoningEfforts).toEqual([]);
});

test("TokenUsageSchema parses reasoning token usage", () => {
  const usage = TokenUsageSchema.parse({
    total: 171,
    input: 100,
    output: 40,
    reasoning: 21,
    cache: {
      read: 10,
      write: 0,
    },
  });

  expect(usage.total).toBe(171);
  expect(usage.reasoning).toBe(21);
  expect(usage.cache.read).toBe(10);
});

test("ProviderCompletedEventSchema parses final usage", () => {
  const event = ProviderCompletedEventSchema.parse({
    type: "completed",
    usage: {
      total: 220,
      input: 120,
      output: 60,
      reasoning: 40,
      cache: {
        read: 15,
        write: 0,
      },
    },
  });

  expect(event.usage.output).toBe(60);
  expect(event.usage.reasoning).toBe(40);
});

test("AssistantResponseEventSchema parses a completed assistant response", () => {
  const event = AssistantResponseEventSchema.parse({
    type: "assistant_response_completed",
    message: {
      id: "msg_1",
      role: "assistant",
      text: "Hello from the model",
    },
    usage: {
      total: 90,
      input: 50,
      output: 30,
      reasoning: 10,
      cache: {
        read: 0,
        write: 0,
      },
    },
  });

  expect(event.type).toBe("assistant_response_completed");
  if (event.type !== "assistant_response_completed") {
    throw new Error("expected assistant_response_completed event");
  }

  expect(event.message.role).toBe("assistant");
  expect(event.usage.reasoning).toBe(10);
});

test("AssistantReasoningSummaryStartedEventSchema parses a started event", () => {
  const event = AssistantReasoningSummaryStartedEventSchema.parse({
    type: "assistant_reasoning_summary_started",
  });
  expect(event.type).toBe("assistant_reasoning_summary_started");
});

test("AssistantReasoningSummaryTextChunkEventSchema parses a text chunk event", () => {
  const event = AssistantReasoningSummaryTextChunkEventSchema.parse({
    type: "assistant_reasoning_summary_text_chunk",
    text: "thinking about neo4j…",
  });
  expect(event.text).toBe("thinking about neo4j…");
});

test("AssistantReasoningSummaryTextChunkEventSchema rejects a chunk with missing text", () => {
  expect(() =>
    AssistantReasoningSummaryTextChunkEventSchema.parse({
      type: "assistant_reasoning_summary_text_chunk",
    }),
  ).toThrow();
});

test("AssistantReasoningSummaryCompletedEventSchema parses a completed event", () => {
  const event = AssistantReasoningSummaryCompletedEventSchema.parse({
    type: "assistant_reasoning_summary_completed",
    reasoningDurationMs: 3200,
  });
  expect(event.reasoningDurationMs).toBe(3200);
});

test("AssistantReasoningSummaryCompletedEventSchema rejects a negative duration", () => {
  expect(() =>
    AssistantReasoningSummaryCompletedEventSchema.parse({
      type: "assistant_reasoning_summary_completed",
      reasoningDurationMs: -1,
    }),
  ).toThrow();
});

test("AssistantResponseEventSchema accepts the three new reasoning summary arms", () => {
  expect(
    AssistantResponseEventSchema.parse({ type: "assistant_reasoning_summary_started" }).type,
  ).toBe("assistant_reasoning_summary_started");
  expect(
    AssistantResponseEventSchema.parse({
      type: "assistant_reasoning_summary_text_chunk",
      text: "x",
    }).type,
  ).toBe("assistant_reasoning_summary_text_chunk");
  expect(
    AssistantResponseEventSchema.parse({
      type: "assistant_reasoning_summary_completed",
      reasoningDurationMs: 0,
    }).type,
  ).toBe("assistant_reasoning_summary_completed");
});

import {
  ProviderReasoningSummaryStartedEventSchema,
  ProviderReasoningSummaryTextChunkEventSchema,
  ProviderReasoningSummaryCompletedEventSchema,
  ProviderStreamEventSchema,
} from "../src/index.ts";

test("ProviderReasoningSummaryStartedEventSchema parses a started event", () => {
  expect(
    ProviderReasoningSummaryStartedEventSchema.parse({ type: "reasoning_summary_started" }).type,
  ).toBe("reasoning_summary_started");
});

test("ProviderReasoningSummaryTextChunkEventSchema parses a text chunk event", () => {
  expect(
    ProviderReasoningSummaryTextChunkEventSchema.parse({
      type: "reasoning_summary_text_chunk",
      text: "abc",
    }).text,
  ).toBe("abc");
});

test("ProviderReasoningSummaryCompletedEventSchema parses a completed event", () => {
  expect(
    ProviderReasoningSummaryCompletedEventSchema.parse({
      type: "reasoning_summary_completed",
      reasoningDurationMs: 1200,
    }).reasoningDurationMs,
  ).toBe(1200);
});

test("ProviderStreamEventSchema accepts the three new reasoning arms", () => {
  expect(
    ProviderStreamEventSchema.parse({ type: "reasoning_summary_started" }).type,
  ).toBe("reasoning_summary_started");
  expect(
    ProviderStreamEventSchema.parse({
      type: "reasoning_summary_text_chunk",
      text: "x",
    }).type,
  ).toBe("reasoning_summary_text_chunk");
  expect(
    ProviderStreamEventSchema.parse({
      type: "reasoning_summary_completed",
      reasoningDurationMs: 0,
    }).type,
  ).toBe("reasoning_summary_completed");
});
