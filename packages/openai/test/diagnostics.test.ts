import { expect, test } from "bun:test";
import type { BuliDiagnosticLogEvent } from "@buli/contracts";
import { logOpenAiDiagnosticEvent, summarizeOpenAiToolCallRequestForDiagnostics } from "../src/provider/diagnostics.ts";

test("logOpenAiDiagnosticEvent emits an OpenAI diagnostic event", () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];

  logOpenAiDiagnosticEvent((diagnosticEvent) => {
    diagnosticEvents.push(diagnosticEvent);
  }, "stream.test_event", { sseFrameCount: 3 });

  expect(diagnosticEvents).toEqual([
    {
      subsystem: "openai",
      eventName: "stream.test_event",
      fields: { sseFrameCount: 3 },
    },
  ]);
});

test("summarizeOpenAiToolCallRequestForDiagnostics reports bash metadata without raw command text", () => {
  const diagnosticFields = summarizeOpenAiToolCallRequestForDiagnostics({
    toolName: "bash",
    shellCommand: "pwd",
    commandDescription: "Print working directory",
    workingDirectoryPath: "packages/openai",
    timeoutMilliseconds: 1000,
  });

  expect(diagnosticFields).toEqual({
    toolName: "bash",
    shellCommandLength: 3,
    commandDescriptionLength: 23,
    hasWorkingDirectoryPath: true,
    hasTimeoutMilliseconds: true,
  });
  expect("shellCommand" in diagnosticFields).toBe(false);
  expect("commandDescription" in diagnosticFields).toBe(false);
});

test("summarizeOpenAiToolCallRequestForDiagnostics reports non-bash tool names", () => {
  expect(summarizeOpenAiToolCallRequestForDiagnostics({
    toolName: "read",
    readTargetPath: "README.md",
  })).toEqual({
    toolName: "read",
  });
});
