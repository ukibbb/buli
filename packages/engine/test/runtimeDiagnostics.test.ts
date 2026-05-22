import { expect, test } from "bun:test";
import type { BuliDiagnosticLogEvent } from "@buli/contracts";
import {
  logEngineDiagnosticEvent,
  summarizeAssistantResponseEventForDiagnostics,
  summarizeProviderStreamEventForDiagnostics,
} from "../src/runtimeDiagnostics.ts";

test("logEngineDiagnosticEvent emits an engine diagnostic event", () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];

  logEngineDiagnosticEvent((diagnosticEvent) => {
    diagnosticEvents.push(diagnosticEvent);
  }, "runtime.test_event", { turnDurationMs: 42 });

  expect(diagnosticEvents).toEqual([
    {
      subsystem: "engine",
      eventName: "runtime.test_event",
      fields: { turnDurationMs: 42 },
    },
  ]);
});

test("summarizeProviderStreamEventForDiagnostics summarizes code execution walkthrough presentation events", () => {
  expect(summarizeProviderStreamEventForDiagnostics({
    type: "code_execution_walkthrough_presented",
    presentationCallId: "call_code_walkthrough_1",
    codeExecutionWalkthrough: {
      titleText: "Request flow",
      walkthroughKind: "source_walkthrough",
      steps: [
        {
          stepTitle: "Prompt accepted",
          whatHappensText: "The prompt is recorded.",
          codeExamples: [{ sourceFilePath: "src/runtime.ts", startLineNumber: 1, endLineNumber: 1, codeText: "recordPrompt();" }],
        },
        {
          stepTitle: "Provider streams",
          whatHappensText: "Chunks are translated.",
          codeExamples: [{ sourceFilePath: "src/stream.ts", startLineNumber: 2, endLineNumber: 3, codeText: "translateChunk();" }],
        },
      ],
    },
  })).toEqual({
    presentationCallId: "call_code_walkthrough_1",
    codeExecutionWalkthroughTitleLength: "Request flow".length,
    codeExecutionWalkthroughStepCount: 2,
    codeExecutionWalkthroughCodeExampleCount: 2,
  });
});

test("summarizeProviderStreamEventForDiagnostics includes context-window usage on terminal events", () => {
  expect(summarizeProviderStreamEventForDiagnostics({
    type: "completed",
    usage: { total: 17, input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 1 } },
    contextWindowUsage: { total: 170, input: 100, output: 50, reasoning: 20, cache: { read: 30, write: 10 } },
  })).toEqual({
    totalTokens: 17,
    inputTokens: 10,
    outputTokens: 5,
    reasoningTokens: 2,
    cacheReadTokens: 3,
    cacheWriteTokens: 1,
    contextWindowTotalTokens: 170,
    contextWindowInputTokens: 100,
    contextWindowOutputTokens: 50,
    contextWindowReasoningTokens: 20,
    contextWindowCacheReadTokens: 30,
    contextWindowCacheWriteTokens: 10,
  });
});

test("summarizeAssistantResponseEventForDiagnostics includes context-window usage on terminal events", () => {
  expect(summarizeAssistantResponseEventForDiagnostics({
    type: "assistant_message_incomplete",
    messageId: "assistant-1",
    incompleteReason: "max_output_tokens",
    usage: { total: 17, input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 1 } },
    contextWindowUsage: { total: 170, input: 100, output: 50, reasoning: 20, cache: { read: 30, write: 10 } },
  })).toEqual({
    messageId: "assistant-1",
    incompleteReason: "max_output_tokens",
    totalTokens: 17,
    inputTokens: 10,
    outputTokens: 5,
    reasoningTokens: 2,
    cacheReadTokens: 3,
    cacheWriteTokens: 1,
    contextWindowTotalTokens: 170,
    contextWindowInputTokens: 100,
    contextWindowOutputTokens: 50,
    contextWindowReasoningTokens: 20,
    contextWindowCacheReadTokens: 30,
    contextWindowCacheWriteTokens: 10,
  });
});
