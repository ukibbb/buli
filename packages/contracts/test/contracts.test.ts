import { expect, test } from "bun:test";
import {
  ASSISTANT_TOOL_REQUEST_NAMES,
  ASSISTANT_PRESENTATION_FUNCTION_NAMES,
  AssistantOperatingModeSchema,
  AssistantPrimaryAgentNameSchema,
  AssistantResponseEventSchema,
  AssistantSubagentNameSchema,
  ConversationSessionEntrySchema,
  ConversationSessionSnapshotSchema,
  AssistantToolCallConversationMessagePartSchema,
  ConversationMessagePartSchema,
  ConversationMessageSchema,
  ConversationTurnStatusSchema,
  FILE_MUTATION_TOOL_REQUEST_NAMES,
  formatLearningSequenceAsMarkdownText,
  LearningSequenceSchema,
  MAX_BASH_TOOL_TIMEOUT_MILLISECONDS,
  ModelContextItemSchema,
  PendingToolApprovalRequestSchema,
  ProviderStreamEventSchema,
  READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES,
  RENDER_ONLY_TOOL_DETAIL_NAMES,
  summarizeTokenUsageForDiagnostics,
  ToolCallRequestSchema,
  type BuliDiagnosticLogEvent,
  WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES,
  createStartedToolCallDetailFromRequest,
  emitBuliDiagnosticLogEvent,
  isAssistantToolRequestName,
  isAssistantPresentationFunctionName,
  isAssistantSubagentName,
  isFileMutationToolCallRequest,
  isReadOnlyAssistantModeToolRequestName,
  isWorkspaceInspectionToolCallRequest,
  listModelVisibleConversationSessionEntries,
  UserPromptImageAttachmentSchema,
} from "../src/index.ts";

test("emitBuliDiagnosticLogEvent forwards diagnostic events", () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];

  emitBuliDiagnosticLogEvent((diagnosticEvent) => diagnosticEvents.push(diagnosticEvent), {
    subsystem: "engine",
    eventName: "conversation_turn.started",
    fields: { selectedModelId: "gpt-5.5" },
  });

  expect(diagnosticEvents).toEqual([
    {
      subsystem: "engine",
      eventName: "conversation_turn.started",
      fields: { selectedModelId: "gpt-5.5" },
    },
  ]);
});

test("emitBuliDiagnosticLogEvent ignores diagnostic logger failures", () => {
  expect(() =>
    emitBuliDiagnosticLogEvent(() => {
      throw new Error("diagnostic sink failed");
    }, {
      subsystem: "openai",
      eventName: "stream.started",
    })
  ).not.toThrow();
});

test("summarizeTokenUsageForDiagnostics reports normalized token counts", () => {
  expect(summarizeTokenUsageForDiagnostics({
    input: 10,
    output: 5,
    reasoning: 2,
    cache: { read: 3, write: 1 },
  })).toEqual({
    totalTokens: 17,
    inputTokens: 10,
    outputTokens: 5,
    reasoningTokens: 2,
    cacheReadTokens: 3,
    cacheWriteTokens: 1,
  });
});

test("AssistantOperatingModeSchema parses understand, plan, and implementation modes", () => {
  expect(AssistantPrimaryAgentNameSchema.options).toEqual(["understand", "plan", "implementation"]);
  expect(AssistantOperatingModeSchema.options).toEqual(["understand", "plan", "implementation"]);
  expect(AssistantOperatingModeSchema.parse("understand")).toBe("understand");
  expect(AssistantOperatingModeSchema.parse("plan")).toBe("plan");
  expect(AssistantOperatingModeSchema.parse("implementation")).toBe("implementation");
  expect(AssistantSubagentNameSchema.options).toEqual(["explore"]);
  expect(isAssistantSubagentName("explore")).toBe(true);
  expect(isAssistantSubagentName("general")).toBe(false);
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

test("ConversationMessagePartSchema parses an assistant learning sequence part", () => {
  expect(
    ConversationMessagePartSchema.parse({
      id: "assistant-learning-sequence-1",
      partKind: "assistant_learning_sequence",
      titleText: "Request flow",
      summaryText: "How a turn moves through the runtime.",
      sequenceItems: [
        { labelText: "Prompt accepted", detailText: "The prompt is recorded." },
        { labelText: "Provider streams" },
      ],
    }),
  ).toEqual({
    id: "assistant-learning-sequence-1",
    partKind: "assistant_learning_sequence",
    titleText: "Request flow",
    summaryText: "How a turn moves through the runtime.",
    sequenceItems: [
      { labelText: "Prompt accepted", detailText: "The prompt is recorded." },
      { labelText: "Provider streams" },
    ],
  });
});

test("LearningSequenceSchema formats model-readable fallback text", () => {
  const learningSequence = LearningSequenceSchema.parse({
    titleText: "Runtime flow",
    sequenceItems: [
      { labelText: "Translate event", detailText: "The stream event becomes a message part." },
      { labelText: "Render part" },
    ],
  });

  expect(formatLearningSequenceAsMarkdownText(learningSequence)).toBe([
    "**Runtime flow**",
    "Translate event -> Render part",
    "",
    "- Translate event: The stream event becomes a message part.",
  ].join("\n"));
});

test("LearningSequenceSchema rejects whitespace-only text fields", () => {
  expect(() =>
    LearningSequenceSchema.parse({
      titleText: "   ",
      sequenceItems: [{ labelText: "Valid stage" }],
    })
  ).toThrow();
  expect(() =>
    LearningSequenceSchema.parse({
      titleText: "Runtime flow",
      sequenceItems: [{ labelText: "\t" }],
    })
  ).toThrow();
});

test("LearningSequenceSchema trims accepted text fields", () => {
  expect(
    LearningSequenceSchema.parse({
      titleText: " Runtime flow ",
      summaryText: " Summary ",
      sequenceItems: [{ labelText: " Prompt accepted ", detailText: " Recorded " }],
    }),
  ).toEqual({
    titleText: "Runtime flow",
    summaryText: "Summary",
    sequenceItems: [{ labelText: "Prompt accepted", detailText: "Recorded" }],
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

test("ConversationSessionEntrySchema parses a workspace patch entry", () => {
  const parsedEntry = ConversationSessionEntrySchema.parse({
    entryKind: "workspace_patch",
    workspacePatch: {
      workspacePatchId: "patch-1",
      toolCallId: "call-bash-1",
      capturedAtMs: 10,
      baselineSnapshotHash: "before-tree",
      resultingSnapshotHash: "after-tree",
      changedFileCount: 1,
      addedLineCount: 1,
      removedLineCount: 0,
      changedFiles: [
        {
          filePath: "notes.txt",
          changeKind: "modified",
          addedLineCount: 1,
          removedLineCount: 0,
          unifiedDiffText: [
            "diff --git a/notes.txt b/notes.txt",
            "--- a/notes.txt",
            "+++ b/notes.txt",
            "@@ -1 +1,2 @@",
            " alpha",
            "+beta",
            "",
          ].join("\n"),
        },
      ],
    },
  });

  expect(parsedEntry).toMatchObject({
    entryKind: "workspace_patch",
    workspacePatch: {
      workspacePatchId: "patch-1",
      changedFileCount: 1,
      changedFiles: [{ filePath: "notes.txt", changeKind: "modified" }],
    },
  });
});

test("ConversationMessagePartSchema parses an assistant workspace patch part", () => {
  const parsedPart = ConversationMessagePartSchema.parse({
    id: "workspace-patch-part-1",
    partKind: "assistant_workspace_patch",
    workspacePatch: {
      workspacePatchId: "patch-1",
      toolCallId: "call-bash-1",
      capturedAtMs: 10,
      baselineSnapshotHash: "before-tree",
      resultingSnapshotHash: "after-tree",
      changedFileCount: 1,
      addedLineCount: 1,
      removedLineCount: 0,
      changedFiles: [
        {
          filePath: "notes.txt",
          changeKind: "added",
          addedLineCount: 1,
          removedLineCount: 0,
        },
      ],
    },
  });

  expect(parsedPart).toMatchObject({
    partKind: "assistant_workspace_patch",
    workspacePatch: { workspacePatchId: "patch-1" },
  });
});

test("AssistantToolCallConversationMessagePartSchema parses a task tool call", () => {
  const parsedMessagePart = AssistantToolCallConversationMessagePartSchema.parse({
    id: "tool-part-task",
    partKind: "assistant_tool_call",
    toolCallId: "call-task",
    toolCallStatus: "completed",
    toolCallStartedAtMs: 1,
    durationMs: 5,
    toolCallDetail: {
      toolName: "task",
      subagentName: "explore",
      subagentDescription: "map runtime flow",
      subagentPrompt: "Inspect engine runtime files and summarize tool dispatch.",
      subagentResultSummary: "runtime.ts delegates tool calls through runtimeToolCallExecution.ts",
    },
  });

  expect(parsedMessagePart.toolCallDetail).toMatchObject({
    toolName: "task",
    subagentName: "explore",
    subagentDescription: "map runtime flow",
  });
});

test("AssistantToolCallConversationMessagePartSchema parses a task tool call with subagent child activity", () => {
  const parsedMessagePart = AssistantToolCallConversationMessagePartSchema.parse({
    id: "tool-part-task",
    partKind: "assistant_tool_call",
    toolCallId: "call-task",
    toolCallStatus: "running",
    toolCallStartedAtMs: 1,
    toolCallDetail: {
      toolName: "task",
      subagentName: "explore",
      subagentDescription: "map docs",
      subagentPrompt: "Read README.md and summarize it.",
      subagentChildToolCalls: [
        {
          subagentChildToolCallId: "call-read-1",
          subagentChildToolCallStatus: "running",
          subagentChildToolCallStartedAtMs: 2,
          subagentChildToolCallDetail: {
            toolName: "read",
            readFilePath: "README.md",
          },
        },
        {
          subagentChildToolCallId: "call-grep-1",
          subagentChildToolCallStatus: "completed",
          subagentChildToolCallStartedAtMs: 3,
          subagentChildToolCallDurationMs: 4,
          subagentChildToolCallDetail: {
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
    toolName: "task",
    subagentChildToolCalls: [
      {
        subagentChildToolCallId: "call-read-1",
        subagentChildToolCallStatus: "running",
        subagentChildToolCallDetail: { toolName: "read", readFilePath: "README.md" },
      },
      {
        subagentChildToolCallId: "call-grep-1",
        subagentChildToolCallStatus: "completed",
        subagentChildToolCallDurationMs: 4,
        subagentChildToolCallDetail: { toolName: "grep", searchPattern: "Explorer" },
      },
    ],
  });
});

test("AssistantToolCallConversationMessagePartSchema parses denied subagent child tool requests", () => {
  const parsedMessagePart = AssistantToolCallConversationMessagePartSchema.parse({
    id: "tool-part-task-denied-children",
    partKind: "assistant_tool_call",
    toolCallId: "call-task",
    toolCallStatus: "running",
    toolCallStartedAtMs: 1,
    toolCallDetail: {
      toolName: "task",
      subagentName: "explore",
      subagentDescription: "map runtime",
      subagentPrompt: "Inspect runtime files.",
      subagentChildToolCalls: [
        {
          subagentChildToolCallId: "call-bash-1",
          subagentChildToolCallStatus: "denied",
          subagentChildToolCallStartedAtMs: 2,
          subagentChildToolCallDurationMs: 1,
          subagentChildToolCallDenialText: "Subagent is read-only and cannot use bash.",
          subagentChildToolCallDetail: {
            toolName: "bash",
            commandLine: "pwd",
            commandDescription: "Print working directory",
          },
        },
        {
          subagentChildToolCallId: "call-task-child",
          subagentChildToolCallStatus: "denied",
          subagentChildToolCallStartedAtMs: 3,
          subagentChildToolCallDurationMs: 1,
          subagentChildToolCallDenialText: "Subagents cannot spawn another subagent.",
          subagentChildToolCallDetail: {
            toolName: "task",
            subagentName: "explore",
            subagentDescription: "nested",
            subagentPrompt: "Try to spawn another subagent.",
          },
        },
      ],
    },
  });

  expect(parsedMessagePart.toolCallDetail).toMatchObject({
    toolName: "task",
    subagentChildToolCalls: [
      {
        subagentChildToolCallId: "call-bash-1",
        subagentChildToolCallStatus: "denied",
        subagentChildToolCallDetail: { toolName: "bash", commandLine: "pwd" },
      },
      {
        subagentChildToolCallId: "call-task-child",
        subagentChildToolCallStatus: "denied",
        subagentChildToolCallDetail: { toolName: "task", subagentName: "explore", subagentDescription: "nested" },
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
      toolName: "task",
      subagentName: "explore",
      subagentDescription: "map runtime flow",
      subagentPrompt: "Inspect runtime and provider flow.",
    }),
  ).toEqual({
    toolName: "task",
    subagentName: "explore",
    subagentDescription: "map runtime flow",
    subagentPrompt: "Inspect runtime and provider flow.",
  });
});

test("tool catalog lists assistant request tools by execution boundary", () => {
  expect(ASSISTANT_TOOL_REQUEST_NAMES).toEqual(["bash", "read", "glob", "grep", "edit", "write", "task"]);
  expect(ASSISTANT_PRESENTATION_FUNCTION_NAMES).toEqual(["present_learning_sequence"]);
  expect(WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES).toEqual(["read", "glob", "grep"]);
  expect(FILE_MUTATION_TOOL_REQUEST_NAMES).toEqual(["edit", "write"]);
  expect(READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES).toEqual(["read", "glob", "grep", "task"]);
  expect(RENDER_ONLY_TOOL_DETAIL_NAMES).toEqual(["todowrite"]);
});

test("tool catalog classifies typed tool requests", () => {
  expect(isAssistantToolRequestName("bash")).toBe(true);
  expect(isAssistantToolRequestName("task")).toBe(true);
  expect(isAssistantToolRequestName("explore")).toBe(false);
  expect(isAssistantToolRequestName("general")).toBe(false);
  expect(isAssistantPresentationFunctionName("present_learning_sequence")).toBe(true);
  expect(isAssistantPresentationFunctionName("bash")).toBe(false);
  expect(isWorkspaceInspectionToolCallRequest({ toolName: "read", readTargetPath: "README.md" })).toBe(true);
  expect(isWorkspaceInspectionToolCallRequest({ toolName: "grep", regexPattern: "ToolCallRequest" })).toBe(true);
  expect(isWorkspaceInspectionToolCallRequest({ toolName: "write", writeTargetPath: "generated.ts", fileContent: "" })).toBe(false);
  expect(isFileMutationToolCallRequest({ toolName: "edit", editTargetPath: "README.md", oldString: "old", newString: "new" })).toBe(true);
  expect(isFileMutationToolCallRequest({ toolName: "read", readTargetPath: "README.md" })).toBe(false);
  expect(isReadOnlyAssistantModeToolRequestName("read")).toBe(true);
  expect(isReadOnlyAssistantModeToolRequestName("task")).toBe(true);
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
    toolName: "task",
    subagentName: "explore",
    subagentDescription: "map runtime",
    subagentPrompt: "Inspect runtime.",
  })).toEqual({
    toolName: "task",
    subagentName: "explore",
    subagentDescription: "map runtime",
    subagentPrompt: "Inspect runtime.",
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

test("AssistantResponseEventSchema rejects user-only parts in assistant events", () => {
  expect(
    AssistantResponseEventSchema.safeParse({
      type: "assistant_message_part_added",
      messageId: "assistant-1",
      part: {
        id: "user-text-1",
        partKind: "user_text",
        text: "This belongs to a user message.",
      },
    }).success,
  ).toBe(false);
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

test("ProviderStreamEventSchema parses learning sequence presentation events", () => {
  expect(
    ProviderStreamEventSchema.parse({
      type: "learning_sequence_presented",
      presentationCallId: "call-learning-sequence-1",
      learningSequence: {
        titleText: "Request flow",
        sequenceItems: [{ labelText: "Prompt accepted" }],
      },
    }).type,
  ).toBe("learning_sequence_presented");
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

test("ConversationSessionEntrySchema parses assistant learning sequence segment history entries", () => {
  expect(
    ConversationSessionEntrySchema.parse({
      entryKind: "assistant_learning_sequence_segment",
      titleText: "Request flow",
      sequenceItems: [
        { labelText: "Prompt accepted" },
        { labelText: "Provider streams", detailText: "Streaming chunks update the transcript." },
      ],
    }),
  ).toEqual({
    entryKind: "assistant_learning_sequence_segment",
    titleText: "Request flow",
    sequenceItems: [
      { labelText: "Prompt accepted" },
      { labelText: "Provider streams", detailText: "Streaming chunks update the transcript." },
    ],
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
    retainedRecentConversationSessionEntryCount: 0,
  });
});

test("ConversationSessionEntrySchema parses a conversation compaction summary with retained recent entries", () => {
  expect(
    ConversationSessionEntrySchema.parse({
      entryKind: "conversation_compaction_summary",
      summaryText: "Goal: continue the implementation.",
      compactedEntryCount: 12,
      retainedRecentConversationSessionEntryCount: 4,
    }),
  ).toEqual({
    entryKind: "conversation_compaction_summary",
    summaryText: "Goal: continue the implementation.",
    compactedEntryCount: 12,
    retainedRecentConversationSessionEntryCount: 4,
  });
});

test("listModelVisibleConversationSessionEntries keeps latest summary, retained recent entries, and new entries", () => {
  const oldPrompt = { entryKind: "user_prompt", promptText: "Old prompt", modelFacingPromptText: "Old prompt" } as const;
  const retainedPrompt = {
    entryKind: "user_prompt",
    promptText: "Retained prompt",
    modelFacingPromptText: "Retained prompt",
  } as const;
  const retainedAnswer = {
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "Retained answer",
  } as const;
  const compactionSummary = {
    entryKind: "conversation_compaction_summary",
    summaryText: "Goal: continue from compacted context.",
    compactedEntryCount: 1,
    retainedRecentConversationSessionEntryCount: 2,
  } as const;
  const nextPrompt = { entryKind: "user_prompt", promptText: "Next prompt", modelFacingPromptText: "Next prompt" } as const;

  expect(
    listModelVisibleConversationSessionEntries([
      oldPrompt,
      retainedPrompt,
      retainedAnswer,
      compactionSummary,
      nextPrompt,
    ]),
  ).toEqual([compactionSummary, retainedPrompt, retainedAnswer, nextPrompt]);
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
