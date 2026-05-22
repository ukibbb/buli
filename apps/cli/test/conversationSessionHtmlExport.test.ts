import { expect, test } from "bun:test";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConversationSessionEntry } from "@buli/contracts";
import {
  renderConversationSessionHtmlDocument,
  writeConversationSessionHtmlExport,
} from "../src/conversationSessionHtmlExport.ts";

const conversationSessionEntries = [
  {
    entryKind: "user_prompt",
    promptText: "Render <script>alert('x')</script>",
    modelFacingPromptText: "Render <script>alert('x')</script>",
    assistantOperatingMode: "understand",
    imageAttachments: [
      {
        attachmentId: "image-1",
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,aGVsbG8=",
        fileName: "clipboard.png",
      },
    ],
  },
  {
    entryKind: "tool_call",
    toolCallId: "call-1",
    toolCallRequest: {
      toolName: "bash",
      shellCommand: "pwd",
      commandDescription: "Print working directory",
    },
  },
  {
    entryKind: "completed_tool_result",
    toolCallId: "call-1",
    toolCallDetail: {
      toolName: "bash",
      commandLine: "pwd",
      commandDescription: "Print working directory",
    },
    toolResultText: "/tmp/project",
  },
  {
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: [
      "# Done",
      "",
      "The command returned `/tmp/project`.",
      "",
      "<script>alert('assistant')</script>",
      "",
      "[safe link](https://example.com) [unsafe link](javascript:alert('x'))",
      "",
      "```ts",
      "const safe = true;",
      "```",
    ].join("\n"),
  },
  {
    entryKind: "conversation_compaction_summary",
    summaryText: "Goal: continue the exported session from compacted context.",
    compactedEntryCount: 4,
    retainedRecentConversationSessionEntryCount: 0,
  },
  {
    entryKind: "tool_call",
    toolCallId: "call-2",
    toolCallRequest: {
      toolName: "read",
      readTargetPath: "README.md",
    },
  },
  {
    entryKind: "completed_tool_result",
    toolCallId: "call-2",
    toolCallDetail: {
      toolName: "read",
      readFilePath: "README.md",
      readLineCount: 10,
    },
    toolResultText: "1: # Project",
  },
  {
    entryKind: "tool_call",
    toolCallId: "call-3",
    toolCallRequest: {
      toolName: "edit",
      editTargetPath: "src/app.ts",
      oldString: "const title = \"old\";",
      newString: "const title = \"new\";",
    },
  },
  {
    entryKind: "completed_tool_result",
    toolCallId: "call-3",
    toolCallDetail: {
      toolName: "edit",
      editedFilePath: "src/app.ts",
      addedLineCount: 1,
      removedLineCount: 1,
    },
    toolResultText: "Edited file: src/app.ts",
  },
  {
    entryKind: "tool_call",
    toolCallId: "call-4",
    toolCallRequest: {
      toolName: "write",
      writeTargetPath: "notes/new-file.txt",
      fileContent: "hello from write",
    },
  },
  {
    entryKind: "completed_tool_result",
    toolCallId: "call-4",
    toolCallDetail: {
      toolName: "write",
      writtenFilePath: "notes/new-file.txt",
      addedLineCount: 1,
      removedLineCount: 0,
    },
    toolResultText: "Wrote file: notes/new-file.txt",
  },
  {
    entryKind: "workspace_patch",
    workspacePatch: {
      workspacePatchId: "patch-1",
      toolCallId: "call-4",
      capturedAtMs: 100,
      baselineSnapshotHash: "before-tree",
      resultingSnapshotHash: "after-tree",
      changedFileCount: 1,
      addedLineCount: 1,
      removedLineCount: 0,
      changedFiles: [
        {
          filePath: "notes/new-file.txt",
          changeKind: "added",
          addedLineCount: 1,
          removedLineCount: 0,
          unifiedDiffText: [
            "diff --git a/notes/new-file.txt b/notes/new-file.txt",
            "--- /dev/null",
            "+++ b/notes/new-file.txt",
            "@@ -0,0 +1 @@",
            "+hello from write",
            "",
          ].join("\n"),
        },
      ],
    },
  },
  {
    entryKind: "tool_call",
    toolCallId: "call-5",
    toolCallRequest: {
      toolName: "task",
      subagentName: "explore",
      subagentDescription: "map runtime",
      subagentPrompt: "Inspect runtime dispatch.",
    },
  },
  {
    entryKind: "completed_tool_result",
    toolCallId: "call-5",
    toolCallDetail: {
      toolName: "task",
      subagentName: "explore",
      subagentDescription: "map runtime",
      subagentPrompt: "Inspect runtime dispatch.",
      subagentChildToolCalls: [
        {
          subagentChildToolCallId: "call-child-read-1",
          subagentChildToolCallStatus: "completed",
          subagentChildToolCallStartedAtMs: 1,
          subagentChildToolCallDurationMs: 5,
          subagentChildToolCallDetail: {
            toolName: "read",
            readFilePath: "packages/engine/src/runtime.ts",
          },
        },
      ],
      subagentResultSummary: "Runtime dispatches tool calls.",
    },
    toolResultText: "Runtime dispatches tool calls.",
  },
  {
    entryKind: "tool_call",
    toolCallId: "call-6",
    toolCallRequest: {
      toolName: "task",
      subagentName: "explore",
      subagentDescription: "map contracts",
      subagentPrompt: "Inspect contract files.",
    },
  },
  {
    entryKind: "completed_tool_result",
    toolCallId: "call-6",
    toolCallDetail: {
      toolName: "task",
      subagentName: "explore",
      subagentDescription: "map contracts",
      subagentResultSummary: "Contracts expose task requests.",
    },
    toolResultText: "Contracts expose task requests.",
  },
] satisfies ConversationSessionEntry[];

test("renderConversationSessionHtmlDocument renders escaped, styled current-session HTML", () => {
  const html = renderConversationSessionHtmlDocument({
    conversationSessionEntries,
    exportedAtMs: 1700000000000,
    workspaceRootPath: "/tmp/project",
    conversationSessionId: "session-a",
  });

  expect(html).toContain("buli-session-export");
  expect(html).not.toContain("fonts.googleapis.com");
  expect(html).not.toContain("fonts.gstatic.com");
  expect(html).toContain("Session ");
  expect(html).toContain(">session-a<");
  expect(html).toContain("Agent: Understand Agent");
  expect(html).toContain("Render &lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
  expect(html).toContain('src="data:image/png;base64,aGVsbG8="');
  expect(html).toContain("clipboard.png &middot; image/png");
  expect(html).not.toContain("<script>alert('x')</script>");
  expect(html).toContain("Tool call");
  expect(html).toContain("pwd");
  expect(html).toContain("README.md");
  expect(html).toContain("src/app.ts");
  expect(html).toContain("const title = &quot;old&quot;;");
  expect(html).toContain("notes/new-file.txt");
  expect(html).toContain("hello from write");
  expect(html).toContain("Workspace patch");
  expect(html).toContain("workspace patch");
  expect(html).toContain("+1 -0");
  expect(html).toContain("map runtime");
  expect(html).toContain("Inspect runtime dispatch.");
  expect(html).toContain("Subagent: explore");
  expect(html).toContain("Subagent activity");
  expect(html).toContain("packages/engine/src/runtime.ts");
  expect(html).toContain("Runtime dispatches tool calls.");
  expect(html).toContain("explore: map contracts");
  expect(html).toContain("Inspect contract files.");
  expect(html).toContain("Contracts expose task requests.");
  expect(html).toContain("<h1>Done</h1>");
  expect(html).toContain("&lt;script&gt;alert(&#39;assistant&#39;)&lt;/script&gt;");
  expect(html).not.toContain("<script>alert('assistant')</script>");
  expect(html).toContain('<a href="https://example.com">safe link</a>');
  expect(html).toContain("unsafe link");
  expect(html).not.toContain("javascript:alert");
  expect(html).toContain('data-lang="typescript"');
  expect(html).toContain('data-copy-text="const safe = true;"');
  expect(html).toContain("Compaction");
  expect(html).toContain("Context compacted from 4 entries.");
  expect(html).toContain("continue the exported session from compacted context");
});

test("renderConversationSessionHtmlDocument renders image-only user prompts without empty text placeholder", () => {
  const html = renderConversationSessionHtmlDocument({
    conversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "",
        modelFacingPromptText: "",
        imageAttachments: [
          {
            attachmentId: "image-only-1",
            mimeType: "image/jpeg",
            dataUrl: "data:image/jpeg;base64,aW1hZ2U=",
          },
        ],
      },
    ],
    exportedAtMs: 1700000000000,
    workspaceRootPath: "/tmp/project",
    conversationSessionId: "session-image-only",
  });

  expect(html).toContain('src="data:image/jpeg;base64,aW1hZ2U="');
  expect(html).not.toContain("No prompt text was recorded.");
});

test("renderConversationSessionHtmlDocument omits invalid image data URLs", () => {
  const html = renderConversationSessionHtmlDocument({
    conversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Look at this image",
        modelFacingPromptText: "Look at this image",
        imageAttachments: [
          {
            attachmentId: "invalid-image-1",
            mimeType: "image/png",
            dataUrl: "https://example.test/tracker.png",
          },
        ],
      },
    ],
    exportedAtMs: 1700000000000,
    workspaceRootPath: "/tmp/project",
    conversationSessionId: "session-invalid-image",
  });

  expect(html).not.toContain("https://example.test/tracker.png");
  expect(html).toContain("1 image attachment omitted from export");
});

test("renderConversationSessionHtmlDocument renders assistant text segments without duplicating terminal aggregate text", () => {
  const html = renderConversationSessionHtmlDocument({
    conversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Inspect README",
        modelFacingPromptText: "Inspect README",
      },
      {
        entryKind: "assistant_text_segment",
        assistantTextSegmentText: "Before tool.",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call-read",
        toolCallRequest: {
          toolName: "read",
          readTargetPath: "README.md",
        },
      },
      {
        entryKind: "completed_tool_result",
        toolCallId: "call-read",
        toolCallDetail: {
          toolName: "read",
          readFilePath: "README.md",
          readLineCount: 1,
        },
        toolResultText: "1: # Demo",
      },
      {
        entryKind: "assistant_text_segment",
        assistantTextSegmentText: "After tool.",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "Before tool.\n\nAfter tool.",
      },
    ],
    exportedAtMs: 1700000000000,
    workspaceRootPath: "/tmp/project",
    conversationSessionId: "session-segmented",
  });

  expect(html.match(/Before tool\./g)).toHaveLength(1);
  expect(html.match(/After tool\./g)).toHaveLength(1);
  expect(html).not.toContain("No assistant text was recorded.");
});

test("renderConversationSessionHtmlDocument renders assistant code execution walkthrough segments without duplicating fallback text", () => {
  const html = renderConversationSessionHtmlDocument({
    conversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Explain runtime flow",
        modelFacingPromptText: "Explain runtime flow",
      },
      {
        entryKind: "assistant_code_execution_walkthrough_segment",
        titleText: "Runtime flow",
        summaryText: "The main stages in one turn.",
        walkthroughKind: "source_walkthrough",
        steps: [
          {
            stepTitle: "Prompt accepted",
            whatHappensText: "The prompt is recorded.",
            codeExamples: [{ sourceFilePath: "src/runtime.ts", startLineNumber: 1, endLineNumber: 1, codeText: "recordPrompt();" }],
          },
          {
            stepTitle: "Provider streams",
            whatHappensText: "Chunks become assistant events.",
            codeExamples: [{ sourceFilePath: "src/stream.ts", startLineNumber: 2, endLineNumber: 3, codeText: "translateChunk();" }],
          },
        ],
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "**Runtime flow**\nThe main stages in one turn.",
      },
    ],
    exportedAtMs: 1700000000000,
    workspaceRootPath: "/tmp/project",
    conversationSessionId: "session-code-execution-walkthrough",
  });

  expect(html).toContain("source evidence");
  expect(html.match(/<span class="panel-purpose">Runtime flow<\/span>/g)).toHaveLength(1);
  expect(html.match(/Prompt accepted/g)).toHaveLength(1);
  expect(html).not.toContain("**Runtime flow**");
});

test("renderConversationSessionHtmlDocument escapes assistant code execution walkthrough text", () => {
  const html = renderConversationSessionHtmlDocument({
    conversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Explain safely",
        modelFacingPromptText: "Explain safely",
      },
      {
        entryKind: "assistant_code_execution_walkthrough_segment",
        titleText: '<script>alert("title")</script>',
        summaryText: '<img src=x onerror="alert(1)">',
        walkthroughKind: "source_walkthrough",
        steps: [
          {
            stepTitle: 'javascript:alert("label")',
            whatHappensText: '<a href="javascript:alert(1)">bad</a>',
            codeExamples: [
              {
                sourceFilePath: "src/example.ts",
                startLineNumber: 1,
                endLineNumber: 1,
                codeText: '<script>alert("code")</script>',
              },
            ],
          },
        ],
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "fallback",
      },
    ],
    exportedAtMs: 1700000000000,
    workspaceRootPath: "/tmp/project",
    conversationSessionId: "session-code-execution-walkthrough-escaping",
  });

  expect(html).toContain("&lt;script&gt;alert(&quot;title&quot;)&lt;/script&gt;");
  expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  expect(html).toContain("&lt;a href=&quot;javascript:alert(1)&quot;&gt;bad&lt;/a&gt;");
  expect(html).toContain("&lt;script&gt;alert(&quot;code&quot;)&lt;/script&gt;");
  expect(html).not.toContain('<script>alert("title")</script>');
  expect(html).not.toContain('<img src=x onerror="alert(1)">');
  expect(html).not.toContain('<a href="javascript:alert(1)">bad</a>');
  expect(html).not.toContain('<script>alert("code")</script>');
});

test("renderConversationSessionHtmlDocument omits mode labels for legacy user prompts", () => {
  const html = renderConversationSessionHtmlDocument({
    conversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Legacy prompt",
        modelFacingPromptText: "Legacy prompt",
      },
    ],
    exportedAtMs: 1700000000000,
    workspaceRootPath: "/tmp/project",
    conversationSessionId: "session-legacy",
  });

  expect(html).toContain("Legacy prompt");
  expect(html).not.toContain("Mode:");
});

test("writeConversationSessionHtmlExport writes the exported session file", async () => {
  const exportDirectoryPath = await mkdtemp(join(tmpdir(), "buli-session-export-"));

  const exportResult = writeConversationSessionHtmlExport({
    conversationSessionEntries,
    exportDirectoryPath,
    exportedAtMs: 1700000000000,
    workspaceRootPath: "/tmp/project",
    conversationSessionId: "session-a",
  });

  expect(exportResult.exportFilePath).toContain(exportDirectoryPath);
  expect(exportResult.exportFilePath.endsWith(".html")).toBe(true);
  expect(exportResult.exportFileUrl.startsWith("file://")).toBe(true);
  const exportedHtml = await readFile(exportResult.exportFilePath, "utf8");
  expect(exportedHtml).toContain(">session-a<");
  expect((await stat(exportDirectoryPath)).mode & 0o777).toBe(0o700);
  expect((await stat(exportResult.exportFilePath)).mode & 0o777).toBe(0o600);
});
