import { expect, test } from "bun:test";
import {
  ASSISTANT_TOOL_REQUEST_NAMES,
  AssistantOperatingModeSchema,
  AssistantResponseEventSchema,
  ConversationSessionEntrySchema,
  ConversationSessionSnapshotSchema,
  AssistantToolCallConversationMessagePartSchema,
  ConversationMessagePartSchema,
  ConversationMessageSchema,
  ConversationTurnStatusSchema,
  FILE_MUTATION_TOOL_REQUEST_NAMES,
  MAX_BASH_TOOL_TIMEOUT_MILLISECONDS,
  ModelContextItemSchema,
  PendingToolApprovalRequestSchema,
  ProviderStreamEventSchema,
  READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES,
  RENDER_ONLY_TOOL_DETAIL_NAMES,
  ToolCallRequestSchema,
  WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES,
  createStartedToolCallDetailFromRequest,
  isAssistantToolRequestName,
  isExploreToolCallRequest,
  isFileMutationToolCallRequest,
  isReadOnlyAssistantModeToolRequestName,
  isWorkspaceInspectionToolCallRequest,
  UserPromptImageAttachmentSchema,
} from "../src/index.ts";

test("AssistantOperatingModeSchema parses understand, plan, and implementation modes", () => {
  expect(AssistantOperatingModeSchema.options).toEqual(["understand", "plan", "implementation"]);
  expect(AssistantOperatingModeSchema.parse("understand")).toBe("understand");
  expect(AssistantOperatingModeSchema.parse("plan")).toBe("plan");
  expect(AssistantOperatingModeSchema.parse("implementation")).toBe("implementation");
});

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

test("ToolCallRequestSchema rejects bash timeouts above the safety cap", () => {
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "bash",
      shellCommand: "pwd",
      commandDescription: "Print working directory",
      timeoutMilliseconds: MAX_BASH_TOOL_TIMEOUT_MILLISECONDS + 1,
    }),
  ).toThrow();
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
    durationMs: 4,
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
    durationMs: 5,
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

test("AssistantToolCallConversationMessagePartSchema parses an explore tool call with child activity", () => {
  const parsedMessagePart = AssistantToolCallConversationMessagePartSchema.parse({
    id: "tool-part-explore",
    partKind: "assistant_tool_call",
    toolCallId: "call-explore",
    toolCallStatus: "running",
    toolCallStartedAtMs: 1,
    toolCallDetail: {
      toolName: "explore",
      explorationDescription: "map docs",
      explorationPrompt: "Read README.md and summarize it.",
      explorationChildToolCalls: [
        {
          explorerChildToolCallId: "call-read-1",
          explorerChildToolCallStatus: "running",
          explorerChildToolCallStartedAtMs: 2,
          explorerChildToolCallDetail: {
            toolName: "read",
            readFilePath: "README.md",
          },
        },
        {
          explorerChildToolCallId: "call-grep-1",
          explorerChildToolCallStatus: "completed",
          explorerChildToolCallStartedAtMs: 3,
          explorerChildToolCallDurationMs: 4,
          explorerChildToolCallDetail: {
            toolName: "grep",
            searchPattern: "Explorer",
            totalMatchCount: 1,
            matchedFileCount: 1,
          },
        },
      ],
    },
  });

  expect(parsedMessagePart.toolCallDetail).toMatchObject({
    toolName: "explore",
    explorationChildToolCalls: [
      {
        explorerChildToolCallId: "call-read-1",
        explorerChildToolCallStatus: "running",
        explorerChildToolCallDetail: { toolName: "read", readFilePath: "README.md" },
      },
      {
        explorerChildToolCallId: "call-grep-1",
        explorerChildToolCallStatus: "completed",
        explorerChildToolCallDurationMs: 4,
        explorerChildToolCallDetail: { toolName: "grep", searchPattern: "Explorer" },
      },
    ],
  });
});

test("AssistantToolCallConversationMessagePartSchema enforces status-specific terminal fields", () => {
  const toolCallPartBase = {
    id: "tool-part-status-rules",
    partKind: "assistant_tool_call",
    toolCallId: "call-status-rules",
    toolCallStartedAtMs: 1,
    toolCallDetail: {
      toolName: "bash",
      commandLine: "pwd",
    },
  };

  expect(() =>
    AssistantToolCallConversationMessagePartSchema.parse({
      ...toolCallPartBase,
      toolCallStatus: "completed",
    })
  ).toThrow();
  expect(() =>
    AssistantToolCallConversationMessagePartSchema.parse({
      ...toolCallPartBase,
      toolCallStatus: "completed",
      durationMs: 1,
      errorText: "should not be present",
    })
  ).toThrow();
  expect(() =>
    AssistantToolCallConversationMessagePartSchema.parse({
      ...toolCallPartBase,
      toolCallStatus: "failed",
      durationMs: 1,
    })
  ).toThrow();
  expect(() =>
    AssistantToolCallConversationMessagePartSchema.parse({
      ...toolCallPartBase,
      toolCallStatus: "denied",
    })
  ).toThrow();
  expect(() =>
    AssistantToolCallConversationMessagePartSchema.parse({
      ...toolCallPartBase,
      toolCallStatus: "interrupted",
    })
  ).toThrow();
  expect(() =>
    AssistantToolCallConversationMessagePartSchema.parse({
      ...toolCallPartBase,
      toolCallStatus: "running",
      durationMs: 1,
    })
  ).toThrow();

  expect(AssistantToolCallConversationMessagePartSchema.parse({
    ...toolCallPartBase,
    toolCallStatus: "completed",
    durationMs: 1,
  }).toolCallStatus).toBe("completed");
  expect(AssistantToolCallConversationMessagePartSchema.parse({
    ...toolCallPartBase,
    toolCallStatus: "failed",
    errorText: "Command failed.",
  }).toolCallStatus).toBe("failed");
  expect(AssistantToolCallConversationMessagePartSchema.parse({
    ...toolCallPartBase,
    toolCallStatus: "denied",
    denialText: "The user denied this command.",
  }).toolCallStatus).toBe("denied");
  expect(AssistantToolCallConversationMessagePartSchema.parse({
    ...toolCallPartBase,
    toolCallStatus: "interrupted",
    errorText: "Interrupted by user.",
  }).toolCallStatus).toBe("interrupted");
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

test("tool catalog lists assistant request tools by execution boundary", () => {
  expect(ASSISTANT_TOOL_REQUEST_NAMES).toEqual(["bash", "read", "glob", "grep", "edit", "write", "explore"]);
  expect(WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES).toEqual(["read", "glob", "grep"]);
  expect(FILE_MUTATION_TOOL_REQUEST_NAMES).toEqual(["edit", "write"]);
  expect(READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES).toEqual(["read", "glob", "grep", "explore"]);
  expect(RENDER_ONLY_TOOL_DETAIL_NAMES).toEqual(["todowrite", "task"]);
});

test("tool catalog classifies typed tool requests", () => {
  expect(isAssistantToolRequestName("bash")).toBe(true);
  expect(isAssistantToolRequestName("task")).toBe(false);
  expect(isWorkspaceInspectionToolCallRequest({ toolName: "read", readTargetPath: "README.md" })).toBe(true);
  expect(isWorkspaceInspectionToolCallRequest({ toolName: "grep", regexPattern: "ToolCallRequest" })).toBe(true);
  expect(isWorkspaceInspectionToolCallRequest({ toolName: "write", writeTargetPath: "generated.ts", fileContent: "" })).toBe(false);
  expect(isFileMutationToolCallRequest({ toolName: "edit", editTargetPath: "README.md", oldString: "old", newString: "new" })).toBe(true);
  expect(isFileMutationToolCallRequest({ toolName: "read", readTargetPath: "README.md" })).toBe(false);
  expect(isExploreToolCallRequest({ toolName: "explore", explorationDescription: "map runtime", explorationPrompt: "Inspect runtime." })).toBe(true);
  expect(isExploreToolCallRequest({ toolName: "glob", globPattern: "**/*.ts" })).toBe(false);
  expect(isReadOnlyAssistantModeToolRequestName("read")).toBe(true);
  expect(isReadOnlyAssistantModeToolRequestName("explore")).toBe(true);
  expect(isReadOnlyAssistantModeToolRequestName("write")).toBe(false);
});

test("createStartedToolCallDetailFromRequest maps requests to render details", () => {
  expect(createStartedToolCallDetailFromRequest({
    toolName: "bash",
    shellCommand: "pwd",
    commandDescription: "Print working directory",
    workingDirectoryPath: "packages/contracts",
    timeoutMilliseconds: 1000,
  })).toEqual({
    toolName: "bash",
    commandLine: "pwd",
    commandDescription: "Print working directory",
    workingDirectoryPath: "packages/contracts",
    timeoutMilliseconds: 1000,
  });
  expect(createStartedToolCallDetailFromRequest({ toolName: "read", readTargetPath: "README.md" })).toEqual({
    toolName: "read",
    readFilePath: "README.md",
  });
  expect(createStartedToolCallDetailFromRequest({ toolName: "glob", globPattern: "**/*.ts", searchDirectoryPath: "packages" })).toEqual({
    toolName: "glob",
    globPattern: "**/*.ts",
    searchDirectoryPath: "packages",
  });
  expect(createStartedToolCallDetailFromRequest({ toolName: "grep", regexPattern: "ToolCallRequest" })).toEqual({
    toolName: "grep",
    searchPattern: "ToolCallRequest",
  });
  expect(createStartedToolCallDetailFromRequest({ toolName: "edit", editTargetPath: "README.md", oldString: "old", newString: "new" })).toEqual({
    toolName: "edit",
    editedFilePath: "README.md",
  });
  expect(createStartedToolCallDetailFromRequest({ toolName: "write", writeTargetPath: "generated.ts", fileContent: "" })).toEqual({
    toolName: "write",
    writtenFilePath: "generated.ts",
  });
  expect(createStartedToolCallDetailFromRequest({
    toolName: "explore",
    explorationDescription: "map runtime",
    explorationPrompt: "Inspect runtime.",
  })).toEqual({
    toolName: "explore",
    explorationDescription: "map runtime",
    explorationPrompt: "Inspect runtime.",
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

test("ProviderStreamEventSchema parses ordered batched tool-call requests", () => {
  expect(
    ProviderStreamEventSchema.parse({
      type: "tool_calls_requested",
      requestedToolCalls: [
        {
          toolCallId: "call-read-1",
          toolCallRequest: {
            toolName: "read",
            readTargetPath: "README.md",
          },
        },
        {
          toolCallId: "call-grep-1",
          toolCallRequest: {
            toolName: "grep",
            regexPattern: "ProviderStreamEventSchema",
          },
        },
      ],
    }).type,
  ).toBe("tool_calls_requested");
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

test("ConversationSessionEntrySchema parses assistant text segment history entries", () => {
  expect(
    ConversationSessionEntrySchema.parse({
      entryKind: "assistant_text_segment",
      assistantTextSegmentText: "I will inspect the file first.",
    }),
  ).toEqual({
    entryKind: "assistant_text_segment",
    assistantTextSegmentText: "I will inspect the file first.",
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

test("ConversationSessionEntrySchema parses project instruction snapshots on user prompts", () => {
  expect(
    ConversationSessionEntrySchema.parse({
      entryKind: "user_prompt",
      promptText: "Explain the runtime",
      modelFacingPromptText: "Explain the runtime",
      projectInstructionSnapshots: [
        {
          fileName: "AGENTS.md",
          displayPath: "AGENTS.md",
          instructionText: "- Prefer integration tests.",
          contentHash: "abc123",
        },
      ],
    }),
  ).toMatchObject({
    entryKind: "user_prompt",
    projectInstructionSnapshots: [{ displayPath: "AGENTS.md" }],
  });
});

test("ConversationSessionEntrySchema parses assistant operating mode on user prompts", () => {
  expect(
    ConversationSessionEntrySchema.parse({
      entryKind: "user_prompt",
      promptText: "Make an implementation plan",
      modelFacingPromptText: "Make an implementation plan",
      assistantOperatingMode: "plan",
    }),
  ).toEqual({
    entryKind: "user_prompt",
    promptText: "Make an implementation plan",
    modelFacingPromptText: "Make an implementation plan",
    assistantOperatingMode: "plan",
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
