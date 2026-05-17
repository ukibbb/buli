import { expect, test } from "bun:test";
import type { BuliDiagnosticLogEvent } from "@buli/contracts";
import { logEngineDiagnosticEvent } from "../src/runtimeDiagnostics.ts";

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
