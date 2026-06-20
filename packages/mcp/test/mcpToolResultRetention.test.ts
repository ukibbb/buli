import { expect, test } from "bun:test";
import { projectMcpToolResultRetention } from "../src/mcpToolResultRetention.ts";

const baseRetentionInput = {
  customToolName: "novibe_teacher_library_note_read",
  toolDisplayName: "NoVibe teacher_library_note_read",
  serverDisplayName: "NoVibe",
  mcpToolName: "teacher_library_note_read",
  toolArgumentsJson: { note_id: "note-1" },
  toolResultText: "private note body\nmore private detail",
  toolResultSummary: "private note body",
  toolResultJson: { body: "private note body" },
} as const;

test("full retention leaves session fields unset", () => {
  expect(projectMcpToolResultRetention({
    ...baseRetentionInput,
    toolResultRetention: "full",
  })).toEqual({});
});

test("summary retention stores only summary-shaped session text and detail", () => {
  const projectedRetention = projectMcpToolResultRetention({
    ...baseRetentionInput,
    toolResultRetention: "summary",
  });

  expect(projectedRetention.sessionToolResultText).toContain("retained as summary");
  expect(projectedRetention.sessionToolResultText).toContain("Summary: private note body");
  expect(projectedRetention.sessionToolResultText).not.toContain("more private detail");
  expect(projectedRetention.sessionToolCallDetail).toEqual({
    toolName: "novibe_teacher_library_note_read",
    toolDisplayName: "NoVibe teacher_library_note_read",
    toolArgumentsJson: { note_id: "note-1" },
    toolResultSummary: "private note body",
  });
});

test("redacted retention stores a placeholder without full result text or structured JSON", () => {
  const projectedRetention = projectMcpToolResultRetention({
    ...baseRetentionInput,
    toolResultRetention: "redacted",
  });

  expect(projectedRetention.sessionToolResultText).toContain("was shown to the model");
  expect(projectedRetention.sessionToolResultText).not.toContain("private note body");
  expect(projectedRetention.sessionToolCallDetail).toEqual({
    toolName: "novibe_teacher_library_note_read",
    toolDisplayName: "NoVibe teacher_library_note_read",
    toolArgumentsJson: { note_id: "note-1" },
    toolResultSummary: "NoVibe MCP result was not saved by retention policy.",
  });
});
