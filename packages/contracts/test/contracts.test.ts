import { expect, test } from "bun:test";
import {
  AssistantResponseEventSchema,
  ConversationSessionEntrySchema,
  ConversationSessionSnapshotSchema,
  AssistantToolCallConversationMessagePartSchema,
  ConversationMessagePartSchema,
  ConversationMessageSchema,
  ConversationTurnStatusSchema,
  PendingToolApprovalRequestSchema,
  ToolCallRequestSchema,
} from "../src/index.ts";

test("ConversationMessageSchema parses a completed user message", () => {
  expect(
    ConversationMessageSchema.parse({
      id: "user-1",
      role: "user",
      messageStatus: "completed",
      createdAtMs: 1,
      partIds: ["part-1"],
    }),
  ).toEqual({
    id: "user-1",
    role: "user",
    messageStatus: "completed",
    createdAtMs: 1,
    partIds: ["part-1"],
  });
});

test("ConversationMessagePartSchema parses an assistant text part with an open streaming tail", () => {
  expect(
    ConversationMessagePartSchema.parse({
      id: "assistant-text-1",
      partKind: "assistant_text",
      partStatus: "streaming",
      rawMarkdownText: "Hello",
      completedContentParts: [],
      openContentPart: {
        kind: "streaming_markdown_text",
        text: "Hello",
      },
    }),
  ).toMatchObject({
    partKind: "assistant_text",
    partStatus: "streaming",
  });
});

test("AssistantToolCallConversationMessagePartSchema parses a denied tool call", () => {
  expect(
    AssistantToolCallConversationMessagePartSchema.parse({
      id: "tool-part-1",
      partKind: "assistant_tool_call",
      toolCallId: "call-1",
      toolCallStatus: "denied",
      toolCallStartedAtMs: 1,
      toolCallDetail: {
        toolName: "bash",
        commandLine: "rm -rf build",
      },
      denialText: "The user denied this bash command, so it was not executed.",
    }).toolCallStatus,
  ).toBe("denied");
});

test("AssistantToolCallConversationMessagePartSchema parses an edit tool call with unified diff text", () => {
  const parsedMessagePart = AssistantToolCallConversationMessagePartSchema.parse({
    id: "tool-part-2",
    partKind: "assistant_tool_call",
    toolCallId: "call-2",
    toolCallStatus: "completed",
    toolCallStartedAtMs: 1,
    toolCallDetail: {
      toolName: "edit",
      editedFilePath: "src/config.ts",
      unifiedDiffText: [
        "diff --git a/src/config.ts b/src/config.ts",
        "--- a/src/config.ts",
        "+++ b/src/config.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new",
        "",
      ].join("\n"),
    },
  });

  expect(parsedMessagePart.toolCallDetail).toMatchObject({
    toolName: "edit",
    unifiedDiffText: expect.stringContaining("@@ -1 +1 @@"),
  });
});

test("PendingToolApprovalRequestSchema parses the dedicated approval model", () => {
  expect(
    PendingToolApprovalRequestSchema.parse({
      approvalId: "approval-1",
      pendingToolCallId: "call-1",
      pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
      riskExplanation: "This bash command will run inside the current workspace.",
    }).approvalId,
  ).toBe("approval-1");
});

test("ToolCallRequestSchema parses read-only coding tool requests", () => {
  expect(
    ToolCallRequestSchema.parse({
      toolName: "read",
      readTargetPath: "packages/contracts/src/index.ts",
      offsetLineNumber: 3,
      maximumLineCount: 20,
    }),
  ).toEqual({
    toolName: "read",
    readTargetPath: "packages/contracts/src/index.ts",
    offsetLineNumber: 3,
    maximumLineCount: 20,
  });
  expect(
    ToolCallRequestSchema.parse({
      toolName: "glob",
      globPattern: "**/*.ts",
      searchDirectoryPath: "packages/contracts",
    }),
  ).toEqual({
    toolName: "glob",
    globPattern: "**/*.ts",
    searchDirectoryPath: "packages/contracts",
  });
  expect(
    ToolCallRequestSchema.parse({
      toolName: "grep",
      regexPattern: "ToolCallRequestSchema",
      searchPath: "packages/contracts",
      includeGlobPattern: "*.ts",
    }),
  ).toEqual({
    toolName: "grep",
    regexPattern: "ToolCallRequestSchema",
    searchPath: "packages/contracts",
    includeGlobPattern: "*.ts",
  });
});

test("AssistantResponseEventSchema parses assistant_message_part_added", () => {
  expect(
    AssistantResponseEventSchema.parse({
      type: "assistant_message_part_added",
      messageId: "assistant-1",
      part: {
        id: "plan-part-1",
        partKind: "assistant_plan_proposal",
        planId: "plan-1",
        planTitle: "Inspect the codebase",
        planSteps: [{ stepIndex: 0, stepTitle: "Read files", stepStatus: "pending" }],
      },
    }).type,
  ).toBe("assistant_message_part_added");
});

test("AssistantResponseEventSchema parses assistant_message_failed", () => {
  expect(
    AssistantResponseEventSchema.parse({
      type: "assistant_message_failed",
      messageId: "assistant-1",
      errorText: "Provider stream ended before completion",
    }).type,
  ).toBe("assistant_message_failed");
});

test("AssistantResponseEventSchema parses assistant_message_interrupted", () => {
  expect(
    AssistantResponseEventSchema.parse({
      type: "assistant_message_interrupted",
      messageId: "assistant-1",
      interruptionReason: "Interrupted by user.",
    }).type,
  ).toBe("assistant_message_interrupted");
});

test("ConversationTurnStatusSchema parses waiting_for_tool_approval", () => {
  expect(ConversationTurnStatusSchema.parse("waiting_for_tool_approval")).toBe("waiting_for_tool_approval");
});

test("ConversationSessionEntrySchema parses completed assistant history entries", () => {
  expect(
    ConversationSessionEntrySchema.parse({
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Done.",
    }),
  ).toEqual({
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "Done.",
  });
});

test("ConversationSessionEntrySchema parses incomplete assistant history entries", () => {
  expect(
    ConversationSessionEntrySchema.parse({
      entryKind: "assistant_message",
      assistantMessageStatus: "incomplete",
      assistantMessageText: "Partial answer",
      incompleteReason: "max_output_tokens",
    }),
  ).toEqual({
    entryKind: "assistant_message",
    assistantMessageStatus: "incomplete",
    assistantMessageText: "Partial answer",
    incompleteReason: "max_output_tokens",
  });
});

test("ConversationSessionEntrySchema parses failed assistant history entries", () => {
  expect(
    ConversationSessionEntrySchema.parse({
      entryKind: "assistant_message",
      assistantMessageStatus: "failed",
      assistantMessageText: "Partial unsafe answer",
      failureExplanation: "Provider failed mid-turn",
    }),
  ).toEqual({
    entryKind: "assistant_message",
    assistantMessageStatus: "failed",
    assistantMessageText: "Partial unsafe answer",
    failureExplanation: "Provider failed mid-turn",
  });
});

test("ConversationSessionEntrySchema parses interrupted assistant history entries", () => {
  expect(
    ConversationSessionEntrySchema.parse({
      entryKind: "assistant_message",
      assistantMessageStatus: "interrupted",
      assistantMessageText: "Partial answer",
      interruptionReason: "Interrupted by user.",
    }),
  ).toEqual({
    entryKind: "assistant_message",
    assistantMessageStatus: "interrupted",
    assistantMessageText: "Partial answer",
    interruptionReason: "Interrupted by user.",
  });
});

test("ConversationSessionSnapshotSchema parses persisted conversation history", () => {
  expect(
    ConversationSessionSnapshotSchema.parse({
      schemaVersion: 1,
      conversationSessionEntries: [
        {
          entryKind: "user_prompt",
          promptText: "Say hello",
          modelFacingPromptText: "Say hello",
        },
        {
          entryKind: "assistant_message",
          assistantMessageStatus: "completed",
          assistantMessageText: "Hello.",
        },
      ],
    }),
  ).toEqual({
    schemaVersion: 1,
    conversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Say hello",
        modelFacingPromptText: "Say hello",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "Hello.",
      },
    ],
  });
});
