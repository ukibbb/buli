import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import type { ConversationTranscriptEntry } from "../../src/chatScreenState.ts";
import { ConversationTranscriptPane } from "../../src/components/ConversationTranscriptPane.tsx";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

test("ConversationTranscriptPane renders every new transcript entry kind", () => {
  const conversationTranscriptEntries: ConversationTranscriptEntry[] = [
    {
      kind: "message",
      message: { id: "u1", role: "user", text: "walk the atlas indexer" },
    },
    {
      kind: "completed_tool_call",
      toolCallId: "tc_read",
      durationMs: 120,
      toolCallDetail: {
        toolName: "read",
        readFilePath: "apps/api/indexer.py",
        readLineCount: 46,
        readByteCount: 1820,
      },
    },
    {
      kind: "completed_tool_call",
      toolCallId: "tc_grep",
      durationMs: 90,
      toolCallDetail: {
        toolName: "grep",
        searchPattern: "GraphSyncService",
        matchedFileCount: 4,
        totalMatchCount: 14,
      },
    },
    {
      kind: "failed_tool_call",
      toolCallId: "tc_edit_err",
      durationMs: 10,
      errorText: "file not found",
      toolCallDetail: { toolName: "edit", editedFilePath: "missing/path.py" },
    },
    {
      kind: "plan_proposal",
      planId: "plan_1",
      planTitle: "Wire stream export",
      planSteps: [
        { stepIndex: 0, stepTitle: "Expose endpoint", stepStatus: "completed" },
        { stepIndex: 1, stepTitle: "Cover test", stepStatus: "pending" },
      ],
    },
    {
      kind: "rate_limit_notice",
      rateLimitNoticeId: "rl_1",
      retryAfterSeconds: 45,
      limitExplanation: "Hourly cap reached",
      noticeStartedAtMs: Date.now(),
    },
    {
      kind: "tool_approval_request",
      approvalId: "apv_1",
      pendingToolCallId: "tc_dangerous",
      pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
      riskExplanation: "Destructive command",
    },
    {
      kind: "turn_footer",
      turnFooterId: "tf_1",
      turnDurationMs: 4200,
      modelDisplayName: "GPT-5.4 (demo)",
      usage: { input: 100, output: 50, reasoning: 20, total: 180, cache: { read: 10, write: 0 } },
    },
  ];

  const output = renderWithoutAnsi(
    <ConversationTranscriptPane
      conversationTranscriptEntries={conversationTranscriptEntries}
      hiddenTranscriptRowsAboveViewport={0}
      onConversationTranscriptViewportMeasured={() => {}}
    />,
  );

  // User prompt block
  expect(output).toContain("walk the atlas indexer");
  // Tool-call cards
  expect(output).toContain("Read");
  expect(output).toContain("apps/api/indexer.py");
  expect(output).toContain("Grep");
  expect(output).toContain("GraphSyncService");
  expect(output).toContain("Edit");
  expect(output).toContain("missing/path.py");
  expect(output).toContain("file not found");
  // Plan proposal
  expect(output).toContain("Plan");
  expect(output).toContain("Wire stream export");
  expect(output).toContain("Expose endpoint");
  // Rate-limit notice
  expect(output).toContain("Rate limit pending");
  expect(output).toContain("Hourly cap reached");
  // Tool-approval request
  expect(output).toContain("Approval required");
  expect(output).toContain("Destructive command");
  expect(output).toContain("rm -rf build");
  // Turn footer
  expect(output).toContain("GPT-5.4 (demo)");
  expect(output).toContain("180 tok");
});

test("ConversationTranscriptPane parses assistant markdown into rich blocks", () => {
  const conversationTranscriptEntries: ConversationTranscriptEntry[] = [
    {
      kind: "message",
      message: {
        id: "a1",
        role: "assistant",
        text: [
          "# Report",
          "",
          "Here is a **bold** and `code` phrase.",
          "",
          "1. first",
          "2. second",
          "",
          "```ts",
          "const answer = 42;",
          "```",
        ].join("\n"),
      },
    },
  ];
  const output = renderWithoutAnsi(
    <ConversationTranscriptPane
      conversationTranscriptEntries={conversationTranscriptEntries}
      hiddenTranscriptRowsAboveViewport={0}
      onConversationTranscriptViewportMeasured={() => {}}
    />,
  );
  expect(output).toContain("Report");
  expect(output).toContain("bold");
  expect(output).toContain("code");
  expect(output).toContain("first");
  expect(output).toContain("second");
  expect(output).toContain("const answer = 42;");
});
