import { expect, test } from "bun:test";
import type { JsonObject } from "@buli/contracts";
import {
  createMcpCustomAssistantTools,
  createNoVibeMcpCustomAssistantTools,
  type McpToolCallInput,
  type NoVibeMcpToolCallInput,
} from "../src/mcpCustomAssistantTools.ts";

test("converts generic MCP tools into approval-required Buli custom assistant tools by default", () => {
  const customAssistantTools = createMcpCustomAssistantTools({
    serverName: "docs/server",
    serverDisplayName: "Docs",
    listedMcpTools: [
      {
        name: "search.docs",
        description: "Search docs.",
        inputSchema: {
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
      },
    ],
    callMcpTool: async () => ({ content: [{ type: "text", text: "ok" }] }),
  });

  expect(customAssistantTools).toHaveLength(1);
  expect(customAssistantTools[0]?.toolName).toBe("docs_server_search_docs");
  expect(customAssistantTools[0]?.providerToolDefinition).toMatchObject({
    toolName: "docs_server_search_docs",
    description: "Search docs.",
    parameters: {
      type: "object",
      required: ["query"],
      additionalProperties: false,
    },
  });
  expect(customAssistantTools[0]?.executionPolicy).toEqual({
    workspaceEffectKind: "workspace_change_possible",
    isAutoConcurrent: false,
    isAutoApprovedReadOnly: false,
    clearsSameTurnReadCoverageBeforeExecution: true,
  });
  expect(customAssistantTools[0]?.approvalPolicy).toEqual({
    approvalPolicyKind: "requires_user_approval",
    riskExplanation: "Docs MCP tool search.docs comes from an external MCP server. Buli cannot verify that it is read-only, so it requires approval before running because it may change the workspace or external state.",
  });
});

test("converts trusted read-only MCP tools into auto-approved Buli custom assistant tools", () => {
  const customAssistantTools = createMcpCustomAssistantTools({
    serverName: "docs/server",
    serverDisplayName: "Docs",
    toolExecutionPolicy: "read_only_auto_approved",
    listedMcpTools: [{ name: "search.docs", description: "Search docs." }],
    callMcpTool: async () => ({ content: [{ type: "text", text: "ok" }] }),
  });

  expect(customAssistantTools[0]?.executionPolicy).toEqual({
    workspaceEffectKind: "read_only",
    isAutoConcurrent: true,
    isAutoApprovedReadOnly: true,
    clearsSameTurnReadCoverageBeforeExecution: false,
  });
  expect(customAssistantTools[0]?.approvalPolicy).toEqual({ approvalPolicyKind: "auto_approve" });
});

test("keeps legacy NoVibe custom tool naming compatibility", () => {
  const customAssistantTools = createNoVibeMcpCustomAssistantTools({
    listedMcpTools: [{ name: "teacher/library.note-read" }],
    callNoVibeMcpTool: async () => ({ content: [{ type: "text", text: "ok" }] }),
  });

  expect(customAssistantTools[0]?.toolName).toBe("novibe_teacher_library_note_read");
  expect(customAssistantTools[0]?.approvalPolicy).toEqual({ approvalPolicyKind: "auto_approve" });
});

test("forwards custom tool arguments to the original MCP tool name", async () => {
  const receivedCalls: NoVibeMcpToolCallInput[] = [];
  const customAssistantTools = createNoVibeMcpCustomAssistantTools({
    listedMcpTools: [
      {
        name: "teacher_library_note_read",
        description: "Read a NoVibe library note.",
        inputSchema: {
          properties: {
            note_id: { type: "string" },
          },
          required: ["note_id"],
        },
      },
    ],
    callNoVibeMcpTool: async (toolCallInput) => {
      receivedCalls.push(toolCallInput);
      return {
        structuredContent: { title: "Learning note" },
        content: [{ type: "text", text: "Learning note body" }],
      };
    },
  });
  const abortController = new AbortController();
  const toolArgumentsJson = { note_id: "3a2d8b90-ef8d-4fa3-8c12-4c1c21d26f8e" } satisfies JsonObject;

  const outcome = await customAssistantTools[0]?.executor({
    toolCallId: "call-1",
    toolCallRequest: {
      toolName: "novibe_teacher_library_note_read",
      toolArgumentsJson,
    },
    workspaceRootPath: "/workspace",
    abortSignal: abortController.signal,
  });

  expect(receivedCalls).toEqual([
    {
      mcpToolName: "teacher_library_note_read",
      argumentsJson: toolArgumentsJson,
      abortSignal: abortController.signal,
    },
  ]);
  expect(outcome?.outcomeKind).toBe("completed");
  expect(outcome?.toolResultText).toBe("Learning note body");
  expect(outcome?.toolResultJson).toEqual({ title: "Learning note" });
  expect(outcome?.toolCallDetail).toMatchObject({
    toolName: "novibe_teacher_library_note_read",
    toolDisplayName: "NoVibe teacher_library_note_read",
    toolArgumentsJson,
    toolResultJson: { title: "Learning note" },
  });
});

test("summary retention keeps full MCP result for the provider outcome but stores retained session fields", async () => {
  const receivedCalls: McpToolCallInput[] = [];
  const customAssistantTools = createMcpCustomAssistantTools({
    serverName: "novibe",
    serverDisplayName: "NoVibe",
    toolResultRetention: "summary",
    listedMcpTools: [{ name: "teacher_library_note_read" }],
    callMcpTool: async (toolCallInput) => {
      receivedCalls.push(toolCallInput);
      return {
        structuredContent: { body: "private structured note" },
        content: [{ type: "text", text: "private note body\nsecond line" }],
      };
    },
  });

  const outcome = await customAssistantTools[0]?.executor({
    toolCallId: "call-1",
    toolCallRequest: { toolName: "novibe_teacher_library_note_read", toolArgumentsJson: {} },
    workspaceRootPath: "/workspace",
    abortSignal: new AbortController().signal,
  });

  expect(receivedCalls).toHaveLength(1);
  expect(outcome?.toolResultText).toBe("private note body\nsecond line");
  expect(outcome?.toolResultJson).toEqual({ body: "private structured note" });
  expect(outcome?.sessionToolResultText).toContain("NoVibe MCP tool result retained as summary");
  expect(outcome?.sessionToolResultText).toContain("Summary: private note body");
  expect(outcome?.sessionToolResultText).not.toContain("second line");
  expect(outcome?.sessionToolCallDetail).toEqual({
    toolName: "novibe_teacher_library_note_read",
    toolDisplayName: "NoVibe teacher_library_note_read",
    toolArgumentsJson: {},
    toolResultSummary: "private note body",
  });
});

test("redacted retention keeps full MCP result for the provider outcome but redacts session fields", async () => {
  const customAssistantTools = createMcpCustomAssistantTools({
    serverName: "novibe",
    serverDisplayName: "NoVibe",
    toolResultRetention: "redacted",
    listedMcpTools: [{ name: "teacher_library_note_read" }],
    callMcpTool: async () => ({ content: [{ type: "text", text: "private note body" }] }),
  });

  const outcome = await customAssistantTools[0]?.executor({
    toolCallId: "call-1",
    toolCallRequest: { toolName: "novibe_teacher_library_note_read", toolArgumentsJson: {} },
    workspaceRootPath: "/workspace",
    abortSignal: new AbortController().signal,
  });

  expect(outcome?.toolResultText).toBe("private note body");
  expect(outcome?.sessionToolResultText).toContain("was shown to the model during the originating assistant turn");
  expect(outcome?.sessionToolResultText).not.toContain("private note body");
  expect(outcome?.sessionToolCallDetail).toEqual({
    toolName: "novibe_teacher_library_note_read",
    toolDisplayName: "NoVibe teacher_library_note_read",
    toolArgumentsJson: {},
    toolResultSummary: "NoVibe MCP result was not saved by retention policy.",
  });
});

test("returns a failed custom tool outcome when MCP marks the result as an error", async () => {
  const customAssistantTools = createNoVibeMcpCustomAssistantTools({
    listedMcpTools: [{ name: "teacher_library_note_read", description: "Read a NoVibe library note." }],
    callNoVibeMcpTool: async () => ({
      isError: true,
      content: [{ type: "text", text: "Note does not exist." }],
      structuredContent: { code: "not_found" },
    }),
  });

  const outcome = await customAssistantTools[0]?.executor({
    toolCallId: "call-1",
    toolCallRequest: { toolName: "novibe_teacher_library_note_read", toolArgumentsJson: {} },
    workspaceRootPath: "/workspace",
    abortSignal: new AbortController().signal,
  });

  if (!outcome || outcome.outcomeKind !== "failed") {
    throw new Error("Expected NoVibe MCP tool call to return a failed custom tool outcome.");
  }
  expect(outcome.toolResultText).toBe("Note does not exist.");
  expect(outcome.failureExplanation).toBe("Note does not exist.");
  expect(outcome.toolResultJson).toEqual({ code: "not_found" });
});
