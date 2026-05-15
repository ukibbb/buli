import { expect, test } from "bun:test";
import {
  AssistantResponseEventSchema,
  ConversationSessionEntrySchema,
  ConversationSessionSnapshotSchema,
  AssistantToolCallConversationMessagePartSchema,
  ConversationMessagePartSchema,
  ConversationMessageSchema,
  ConversationTurnStatusSchema,
  ModelContextItemSchema,
  PendingToolApprovalRequestSchema,
  ToolCallRequestSchema,
  UserPromptImageAttachmentSchema,
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
    }),
  ).toMatchObject({
    partKind: "assistant_text",
    partStatus: "streaming",
  });
});

test("UserPromptImageAttachmentSchema parses a base64 image data URL", () => {
  expect(
    UserPromptImageAttachmentSchema.parse({
      attachmentId: "image-1",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,aGVsbG8=",
      fileName: "clipboard.png",
    }),
  ).toEqual({
    attachmentId: "image-1",
    mimeType: "image/png",
    dataUrl: "data:image/png;base64,aGVsbG8=",
    fileName: "clipboard.png",
  });
});

test("ConversationMessagePartSchema parses a user image attachment part", () => {
  expect(
    ConversationMessagePartSchema.parse({
      id: "user-image-1",
      partKind: "user_image_attachment",
      attachment: {
        attachmentId: "image-1",
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,aGVsbG8=",
      },
    }).partKind,
  ).toBe("user_image_attachment");
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

test("AssistantToolCallConversationMessagePartSchema parses a write tool call with unified diff text", () => {
  const parsedMessagePart = AssistantToolCallConversationMessagePartSchema.parse({
    id: "tool-part-3",
    partKind: "assistant_tool_call",
    toolCallId: "call-3",
    toolCallStatus: "pending_approval",
    toolCallStartedAtMs: 1,
    toolCallDetail: {
      toolName: "write",
      writtenFilePath: "src/new-file.ts",
      addedLineCount: 1,
      removedLineCount: 0,
      unifiedDiffText: [
        "diff --git a/src/new-file.ts b/src/new-file.ts",
        "--- /dev/null",
        "+++ b/src/new-file.ts",
        "@@ -0,0 +1 @@",
        "+export const value = true;",
        "",
      ].join("\n"),
    },
  });

  expect(parsedMessagePart.toolCallDetail).toMatchObject({
    toolName: "write",
    writtenFilePath: "src/new-file.ts",
    addedLineCount: 1,
  });
});

test("AssistantToolCallConversationMessagePartSchema parses an explore tool call", () => {
  const parsedMessagePart = AssistantToolCallConversationMessagePartSchema.parse({
    id: "tool-part-explore",
    partKind: "assistant_tool_call",
    toolCallId: "call-explore",
    toolCallStatus: "completed",
    toolCallStartedAtMs: 1,
    toolCallDetail: {
      toolName: "explore",
      explorationDescription: "map runtime flow",
      explorationPrompt: "Inspect engine runtime files and summarize tool dispatch.",
      explorationResultSummary: "runtime.ts delegates tool calls through runtimeToolCallExecution.ts",
    },
  });

  expect(parsedMessagePart.toolCallDetail).toMatchObject({
    toolName: "explore",
    explorationDescription: "map runtime flow",
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

test("ToolCallRequestSchema parses typed coding tool requests", () => {
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
  expect(
    ToolCallRequestSchema.parse({
      toolName: "edit",
      editTargetPath: "packages/contracts/src/index.ts",
      oldString: "old",
      newString: "",
    }),
  ).toEqual({
    toolName: "edit",
    editTargetPath: "packages/contracts/src/index.ts",
    oldString: "old",
    newString: "",
  });
  expect(
    ToolCallRequestSchema.parse({
      toolName: "write",
      writeTargetPath: "packages/contracts/src/generated.ts",
      fileContent: "",
    }),
  ).toEqual({
    toolName: "write",
    writeTargetPath: "packages/contracts/src/generated.ts",
    fileContent: "",
  });
  expect(
    ToolCallRequestSchema.parse({
      toolName: "explore",
      explorationDescription: "map runtime flow",
      explorationPrompt: "Inspect runtime and provider flow.",
    }),
  ).toEqual({
    toolName: "explore",
    explorationDescription: "map runtime flow",
    explorationPrompt: "Inspect runtime and provider flow.",
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

test("ConversationSessionEntrySchema parses a user prompt with image attachments", () => {
  expect(
    ConversationSessionEntrySchema.parse({
      entryKind: "user_prompt",
      promptText: "What is in this image?",
      modelFacingPromptText: "What is in this image?",
      imageAttachments: [
        {
          attachmentId: "image-1",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,aGVsbG8=",
        },
      ],
    }),
  ).toMatchObject({
    entryKind: "user_prompt",
    imageAttachments: [{ attachmentId: "image-1" }],
  });
});

test("ConversationSessionEntrySchema parses a conversation compaction summary", () => {
  expect(
    ConversationSessionEntrySchema.parse({
      entryKind: "conversation_compaction_summary",
      summaryText: "Goal: continue the implementation.",
      compactedEntryCount: 12,
    }),
  ).toEqual({
    entryKind: "conversation_compaction_summary",
    summaryText: "Goal: continue the implementation.",
    compactedEntryCount: 12,
  });
});

test("ModelContextItemSchema parses a compaction summary", () => {
  expect(
    ModelContextItemSchema.parse({
      itemKind: "compaction_summary",
      summaryText: "Goal: continue the implementation.",
    }),
  ).toEqual({
    itemKind: "compaction_summary",
    summaryText: "Goal: continue the implementation.",
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
