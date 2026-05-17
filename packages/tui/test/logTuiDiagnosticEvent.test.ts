import { expect, test } from "bun:test";
import type { BuliDiagnosticLogEvent } from "@buli/contracts";
import { logTuiDiagnosticEvent } from "../src/diagnostics/logTuiDiagnosticEvent.ts";

test("logTuiDiagnosticEvent emits a TUI diagnostic event", () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];

  logTuiDiagnosticEvent((diagnosticEvent) => {
    diagnosticEvents.push(diagnosticEvent);
  }, "chat_screen.test_event", { rowCount: 24 });

  expect(diagnosticEvents).toEqual([
    {
      subsystem: "tui",
      eventName: "chat_screen.test_event",
      fields: { rowCount: 24 },
    },
  ]);
});
