import { expect, test } from "bun:test";
import type { BuliDiagnosticLogEvent } from "@buli/contracts";
import { logEngineDiagnosticEvent, summarizeProviderStreamEventForDiagnostics } from "../src/runtimeDiagnostics.ts";

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
