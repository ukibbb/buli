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
  expect(html).toContain("Render &lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
  expect(html).not.toContain("<script>alert('x')</script>");
  expect(html).toContain("Tool · call");
  expect(html).toContain("pwd");
  expect(html).toContain("README.md");
  expect(html).toContain("<h1>Done</h1>");
  expect(html).toContain("&lt;script&gt;alert(&#39;assistant&#39;)&lt;/script&gt;");
  expect(html).not.toContain("<script>alert('assistant')</script>");
  expect(html).toContain('<a href="https://example.com">safe link</a>');
  expect(html).toContain("unsafe link");
  expect(html).not.toContain("javascript:alert");
  expect(html).toContain('<pre data-lang="ts"><code>const safe = true;</code></pre>');
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
