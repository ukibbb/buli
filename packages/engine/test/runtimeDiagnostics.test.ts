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

test("summarizeProviderStreamEventForDiagnostics summarizes learning sequence presentation events", () => {
  expect(summarizeProviderStreamEventForDiagnostics({
    type: "learning_sequence_presented",
    presentationCallId: "call_learning_sequence_1",
    learningSequence: {
      titleText: "Request flow",
      sequenceItems: [{ labelText: "Prompt accepted" }, { labelText: "Provider streams" }],
    },
  })).toEqual({
    presentationCallId: "call_learning_sequence_1",
    learningSequenceTitleLength: "Request flow".length,
    learningSequenceItemCount: 2,
  });
});
