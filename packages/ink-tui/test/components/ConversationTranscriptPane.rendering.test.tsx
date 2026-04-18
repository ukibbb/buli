import { expect, test } from "bun:test";
import EventEmitter from "node:events";
import { stripVTControlCharacters } from "node:util";
import { Box, render, renderToString } from "ink";
import React from "react";
import { parseAssistantResponseIntoContentParts } from "@buli/engine";
import type { ConversationTranscriptEntry } from "../../src/chatScreenState.ts";
import { ConversationTranscriptPane } from "../../src/components/ConversationTranscriptPane.tsx";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

function createMockStdout(columns = 80) {
  const stdout = new EventEmitter() as NodeJS.WriteStream & {
    columns: number;
    isTTY: boolean;
    write: (chunk: string | Uint8Array) => boolean;
  };

  stdout.columns = columns;
  stdout.isTTY = true;
  stdout.write = (_chunk: string | Uint8Array) => true;

  return stdout;
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
      kind: "incomplete_response_notice",
      incompleteReason: "max_output_tokens",
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
  // Incomplete response notice
  expect(output).toContain("Response incomplete");
  expect(output).toContain("max_output_tokens");
  // Turn footer
  expect(output).toContain("GPT-5.4 (demo)");
  expect(output).toContain("180 tok");
});

test("ConversationTranscriptPane renders a turn footer before usage arrives", () => {
  const output = renderWithoutAnsi(
    <ConversationTranscriptPane
      conversationTranscriptEntries={[
        {
          kind: "turn_footer",
          turnFooterId: "tf_pending",
          turnDurationMs: 1200,
          modelDisplayName: "GPT-5.4",
          usage: undefined,
        },
      ]}
      hiddenTranscriptRowsAboveViewport={0}
      onConversationTranscriptViewportMeasured={() => {}}
    />,
  );

  expect(output).toContain("GPT-5.4");
  expect(output).toContain("1.2s");
  expect(output).not.toContain("tok");
});

test("ConversationTranscriptPane parses assistant markdown into rich blocks", () => {
  const markdownText = [
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
  ].join("\n");
  const conversationTranscriptEntries: ConversationTranscriptEntry[] = [
    {
      kind: "message",
      message: {
        id: "a1",
        role: "assistant",
        text: markdownText,
        assistantContentParts: [...parseAssistantResponseIntoContentParts(markdownText)],
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

test("ConversationTranscriptPane renders a dedicated streaming assistant message block", () => {
  const output = renderWithoutAnsi(
    <ConversationTranscriptPane
      conversationTranscriptEntries={[
        {
          kind: "streaming_assistant_message",
          messageId: "stream-1",
          renderState: "streaming",
          streamingProjection: {
            fullResponseText: "# Done\n\nTail text",
            completedContentParts: [
              {
                kind: "heading",
                headingLevel: 1,
                inlineSpans: [{ spanKind: "plain", spanText: "Done" }],
              },
            ],
            openContentPart: {
              kind: "streaming_markdown_text",
              text: "Tail text",
            },
          },
        },
      ]}
      hiddenTranscriptRowsAboveViewport={0}
      onConversationTranscriptViewportMeasured={() => {}}
    />,
  );

  expect(output).toContain("assistant · streaming");
  expect(output).toContain("Done");
  expect(output).toContain("Tail text");
});

test("ConversationTranscriptPane keeps full transcript height stable when only the scroll offset changes", async () => {
  const mockStdout = createMockStdout();
  const measuredConversationTranscriptViewports: Array<{
    visibleViewportHeightInRows: number;
    fullTranscriptContentHeightInRows: number;
  }> = [];
  const conversationTranscriptEntries: ConversationTranscriptEntry[] = Array.from({ length: 6 }, (_, index) => ({
    kind: "message",
    message: {
      id: `user-${index}`,
      role: "user",
      text: `Message ${index + 1}`,
    },
  }));

  const renderedConversationTranscriptPane = render(
    <Box flexDirection="column" height={4}>
      <ConversationTranscriptPane
        conversationTranscriptEntries={conversationTranscriptEntries}
        hiddenTranscriptRowsAboveViewport={0}
        onConversationTranscriptViewportMeasured={(conversationTranscriptViewportMeasurements) => {
          measuredConversationTranscriptViewports.push(conversationTranscriptViewportMeasurements);
        }}
      />
    </Box>,
    {
      debug: true,
      stdout: mockStdout,
    },
  );

  try {
    await renderedConversationTranscriptPane.waitUntilRenderFlush();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const initialConversationTranscriptViewportMeasurements = measuredConversationTranscriptViewports.at(-1);
    if (!initialConversationTranscriptViewportMeasurements) {
      throw new Error("expected initial transcript viewport measurements");
    }

    measuredConversationTranscriptViewports.length = 0;
    renderedConversationTranscriptPane.rerender(
      <Box flexDirection="column" height={4}>
        <ConversationTranscriptPane
          conversationTranscriptEntries={conversationTranscriptEntries}
          hiddenTranscriptRowsAboveViewport={2}
          onConversationTranscriptViewportMeasured={(conversationTranscriptViewportMeasurements) => {
            measuredConversationTranscriptViewports.push(conversationTranscriptViewportMeasurements);
          }}
        />
      </Box>,
    );
    await renderedConversationTranscriptPane.waitUntilRenderFlush();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(measuredConversationTranscriptViewports).toHaveLength(0);
  } finally {
    renderedConversationTranscriptPane.unmount();
    await renderedConversationTranscriptPane.waitUntilExit();
  }
});
