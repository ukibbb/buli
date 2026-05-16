import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
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
    entryKind: "tool_call",
    toolCallId: "call-5",
    toolCallRequest: {
      toolName: "explore",
      explorationDescription: "map runtime",
      explorationPrompt: "Inspect runtime dispatch.",
    },
  },
  {
    entryKind: "completed_tool_result",
    toolCallId: "call-5",
    toolCallDetail: {
      toolName: "explore",
      explorationDescription: "map runtime",
      explorationResultSummary: "Runtime dispatches tool calls.",
    },
    toolResultText: "Runtime dispatches tool calls.",
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
  expect(html).toContain("Session ");
  expect(html).toContain(">session-a<");
  expect(html).toContain("Mode: Understand");
  expect(html).toContain("Render &lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
  expect(html).toContain('src="data:image/png;base64,aGVsbG8="');
  expect(html).toContain("clipboard.png · image/png");
  expect(html).not.toContain("<script>alert('x')</script>");
  expect(html).toContain("Tool · call");
  expect(html).toContain("pwd");
  expect(html).toContain("README.md");
  expect(html).toContain("src/app.ts");
  expect(html).toContain("const title = &quot;old&quot;;");
  expect(html).toContain("notes/new-file.txt");
  expect(html).toContain("hello from write");
  expect(html).toContain("map runtime");
  expect(html).toContain("Inspect runtime dispatch.");
  expect(html).toContain("Runtime dispatches tool calls.");
  expect(html).toContain("<h1>Done</h1>");
  expect(html).toContain("&lt;script&gt;alert(&#39;assistant&#39;)&lt;/script&gt;");
  expect(html).not.toContain("<script>alert('assistant')</script>");
  expect(html).toContain('<a href="https://example.com">safe link</a>');
  expect(html).toContain("unsafe link");
  expect(html).not.toContain("javascript:alert");
  expect(html).toContain('<pre data-lang="ts"><code>const safe = true;</code></pre>');
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
});
