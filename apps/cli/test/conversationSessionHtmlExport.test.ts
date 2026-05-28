import { expect, test } from "bun:test";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConversationSessionEntry } from "@buli/contracts";
import {
  renderConversationSessionHtmlDocument,
  writeConversationSessionHtmlExport,
} from "../src/conversationSession/export/conversationSessionHtmlExport.ts";

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
    toolCallId: "call-read-many",
    toolCallRequest: {
      toolName: "read_many",
      readTargets: [
        { readTargetPath: "README.md", offsetLineNumber: 1, maximumLineCount: 2 },
        { readTargetPath: "missing.txt" },
      ],
    },
  },
  {
    entryKind: "completed_tool_result",
    toolCallId: "call-read-many",
    toolCallDetail: {
      toolName: "read_many",
      requestedReadTargetPaths: ["README.md", "missing.txt"],
      completedReadCount: 1,
      failedReadCount: 1,
    },
    toolResultText: "<summary>1 completed, 1 failed</summary>",
  },
  {
    entryKind: "tool_call",
    toolCallId: "call-search-many",
    toolCallRequest: {
      toolName: "search_many",
      searches: [
        { searchKind: "glob", globPattern: "src/**/*.ts" },
        { searchKind: "grep", regexPattern: "ToolCallRequest", searchPath: "packages", includeGlobPattern: "*.ts", contextLineCount: 2 },
      ],
    },
  },
  {
    entryKind: "completed_tool_result",
    toolCallId: "call-search-many",
    toolCallDetail: {
      toolName: "search_many",
      requestedSearches: [
        { searchKind: "glob", globPattern: "src/**/*.ts" },
        { searchKind: "grep", regexPattern: "ToolCallRequest", searchPath: "packages", includeGlobPattern: "*.ts", contextLineCount: 2 },
      ],
      completedSearchCount: 2,
      failedSearchCount: 0,
    },
    toolResultText: "<summary>2 completed, 0 failed</summary>",
  },
  {
    entryKind: "tool_call",
    toolCallId: "call-3",
    toolCallRequest: {
      toolName: "query_codebase_knowledge",
      codebaseProblemDescription: "Find runtime dispatch",
      knownRelevantFilePaths: ["packages/engine/src/runtimeToolCallExecution.ts"],
      knownRelevantSymbolNames: ["streamAssistantResponseEventsForRequestedToolCalls"],
      maximumKnowledgeResultCount: 3,
    },
  },
  {
    entryKind: "completed_tool_result",
    toolCallId: "call-3",
    toolCallDetail: {
      toolName: "query_codebase_knowledge",
      codebaseProblemDescription: "Find runtime dispatch",
      knownRelevantFilePaths: ["packages/engine/src/runtimeToolCallExecution.ts"],
      knownRelevantSymbolNames: ["streamAssistantResponseEventsForRequestedToolCalls"],
      matchedKnowledgeCount: 2,
      recommendedReadCount: 3,
    },
    toolResultText: "<codebase_knowledge_query>2 matches</codebase_knowledge_query>",
  },
  {
    entryKind: "tool_call",
    toolCallId: "call-4",
    toolCallRequest: {
      toolName: "edit",
      editTargetPath: "src/app.ts",
      oldString: "const title = \"old\";",
      newString: "const title = \"new\";",
    },
  },
  {
    entryKind: "completed_tool_result",
    toolCallId: "call-4",
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
    toolCallId: "call-edit-many",
    toolCallRequest: {
      toolName: "edit_many",
      edits: [
        { editTargetPath: "src/app.ts", oldString: "old", newString: "new" },
        { editTargetPath: "src/app.ts", oldString: "unused", newString: "used" },
      ],
    },
  },
  {
    entryKind: "tool_call",
    toolCallId: "call-patch-many",
    toolCallRequest: {
      toolName: "patch_many",
      patchText: "*** Begin Patch\n*** Add File: generated.txt\n+new\n*** Update File: src/app.ts\n@@\n-old\n+new\n*** End Patch",
    },
  },
  {
    entryKind: "tool_call",
    toolCallId: "call-7",
    toolCallRequest: {
      toolName: "write",
      writeTargetPath: "notes/new-file.txt",
      fileContent: "hello from write",
    },
  },
  {
    entryKind: "completed_tool_result",
    toolCallId: "call-7",
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
      toolCallId: "call-7",
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
        {
          subagentChildToolCallId: "call-child-edit-many-1",
          subagentChildToolCallStatus: "completed",
          subagentChildToolCallStartedAtMs: 2,
          subagentChildToolCallDurationMs: 7,
          subagentChildToolCallDetail: {
            toolName: "edit_many",
            editCount: 2,
          },
        },
        {
          subagentChildToolCallId: "call-child-patch-many-1",
          subagentChildToolCallStatus: "completed",
          subagentChildToolCallStartedAtMs: 3,
          subagentChildToolCallDurationMs: 9,
          subagentChildToolCallDetail: {
            toolName: "patch_many",
            patchTargetText: "2 files",
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
  expect(html).toContain("2 paths");
  expect(html).toContain("missing.txt");
  expect(html).toContain("1/2 read, 1 failed");
  expect(html).toContain("SearchMany");
  expect(html).toContain("2 searches");
  expect(html).toContain("2 searched");
  expect(html).toContain("ToolCallRequest");
  expect(html).toContain("context 2");
  expect(html).toContain("CodebaseKnowledge");
  expect(html).toContain("Find runtime dispatch");
  expect(html).toContain("known files");
  expect(html).toContain("streamAssistantResponseEventsForRequestedToolCalls");
  expect(html).toContain("2 matches · 3 reads");
  expect(html).toContain("src/app.ts");
  expect(html).toContain("const title = &quot;old&quot;;");
  expect(html).toContain("EditMany");
  expect(html).toContain("PatchMany");
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
  expect(html).toContain("<b>EditMany</b> 2 edits");
  expect(html).toContain("<b>PatchMany</b> 2 files");
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

  expect(html).toContain('<header class="appbar">');
  expect(html).toContain('<nav class="trace"');
  expect(html).toContain('class="meta-grid"');
  expect(html).toContain('data-theme="auto"');
  expect(html).toContain("buli-export-theme");
  expect(html).toContain("--space-1:");
  expect(html).toContain('class="badge badge-user"');
  expect(html).toContain('class="badge badge-tool"');
  expect(html).toContain('class="badge badge-result"');
  expect(html).toContain('class="badge badge-patch"');
  expect(html).toContain('class="badge badge-compaction"');
  expect(html).toContain('class="shiki');
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

test("renderConversationSessionHtmlDocument parses code fence title labels like the TUI", () => {
  const html = renderConversationSessionHtmlDocument({
    conversationSessionEntries: [
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: ["```ts title=src/app.ts", "const value = true;", "```"].join("\n"),
      },
    ],
    exportedAtMs: 1700000000000,
    workspaceRootPath: "/tmp/project",
    conversationSessionId: "session-code-title",
  });

  expect(html).toContain('<div class="code-tab">src/app.ts</div>');
  expect(html).toContain('data-lang="typescript"');
  expect(html).not.toContain("ts · src/app.ts");
  expect(html).not.toContain("ts title=src/app.ts");
});

test("renderConversationSessionHtmlDocument parses quoted code fence path labels with source ranges", () => {
  const html = renderConversationSessionHtmlDocument({
    conversationSessionEntries: [
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: ['```ts path="src/runtime.ts:10-12"', "startRuntime();", "```"].join("\n"),
      },
    ],
    exportedAtMs: 1700000000000,
    workspaceRootPath: "/tmp/project",
    conversationSessionId: "session-code-path",
  });

  expect(html).toContain('<div class="code-tab">src/runtime.ts:10-12</div>');
  expect(html).toContain('data-lang="typescript"');
  expect(html).not.toContain("ts · src/runtime.ts:10-12");
  expect(html).not.toContain('path=&quot;src/runtime.ts:10-12&quot;');
});

test("renderConversationSessionHtmlDocument renders unknown code fence labels safely", () => {
  const html = renderConversationSessionHtmlDocument({
    conversationSessionEntries: [
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: ["```mermaid", "<script>alert('x')</script>", "```"].join("\n"),
      },
    ],
    exportedAtMs: 1700000000000,
    workspaceRootPath: "/tmp/project",
    conversationSessionId: "session-unknown-code",
  });

  expect(html).toContain("mermaid");
  expect(html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
  expect(html).not.toContain("<script>alert('x')</script>");
});

test("renderConversationSessionHtmlDocument renders no-language code fences with code label", () => {
  const html = renderConversationSessionHtmlDocument({
    conversationSessionEntries: [
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: ["```", "plain text", "```"].join("\n"),
      },
    ],
    exportedAtMs: 1700000000000,
    workspaceRootPath: "/tmp/project",
    conversationSessionId: "session-no-lang-code",
  });

  expect(html).toContain('<div class="code-tab">code</div>');
});

test("renderConversationSessionHtmlDocument renders markdown images as safe text links only", () => {
  const html = renderConversationSessionHtmlDocument({
    conversationSessionEntries: [
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "![diagram](https://example.com/diagram.png) ![bad](javascript:alert('x'))",
      },
    ],
    exportedAtMs: 1700000000000,
    workspaceRootPath: "/tmp/project",
    conversationSessionId: "session-markdown-image",
  });

  expect(html).toContain("image: diagram");
  expect(html).toContain('<a href="https://example.com/diagram.png">image: diagram</a>');
  expect(html).toContain("image: bad");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("javascript:alert");
});

test("renderConversationSessionHtmlDocument blocks unsafe markdown href variants", () => {
  const html = renderConversationSessionHtmlDocument({
    conversationSessionEntries: [
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: [
          "[protocol relative](//example.com)",
          "[spaced js](java script:alert(1))",
          "[mailto](mailto:test@example.com)",
        ].join(" "),
      },
    ],
    exportedAtMs: 1700000000000,
    workspaceRootPath: "/tmp/project",
    conversationSessionId: "session-link-safety",
  });

  expect(html).toContain("protocol relative");
  expect(html).toContain("spaced js");
  expect(html).not.toContain('href="//example.com"');
  expect(html).not.toContain("javascript:");
  expect(html).toContain('href="mailto:test@example.com"');
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
