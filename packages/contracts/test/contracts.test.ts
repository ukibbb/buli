import { readFile } from "node:fs/promises";
import { expect, test } from "bun:test";
import {
  ASSISTANT_TOOL_REQUEST_NAMES,
  AssistantOperatingModeSchema,
  AssistantPrimaryAgentNameSchema,
  AssistantResponseEventSchema,
  AssistantSubagentNameSchema,
  ConversationSessionEntrySchema,
  ConversationSessionSnapshotSchema,
  ConversationSessionModelSelectionSchema,
  AssistantBuliStickyNotesConversationMessagePartSchema,
  AssistantToolCallConversationMessagePartSchema,
  BuliStickyNotesConversationSessionEntrySchema,
  ConversationMessagePartSchema,
  ConversationMessageSchema,
  ConversationTurnStatusSchema,
  FILE_MUTATION_TOOL_REQUEST_NAMES,
  MAX_BASH_TOOL_COMMAND_LENGTH,
  MAX_BASH_TOOL_TIMEOUT_MILLISECONDS,
  MAX_CODEBASE_KNOWLEDGE_SYMBOL_NAME_LENGTH,
  MAX_EDIT_MANY_TOOL_EDIT_COUNT,
  MAX_EDIT_TOOL_SEARCH_TEXT_LENGTH,
  MAX_GREP_TOOL_PATTERN_LENGTH,
  MAX_INSPECTION_QUESTION_LENGTH,
  MAX_PATCH_TOOL_PATCH_TEXT_LENGTH,
  MAX_READ_TOOL_LINE_COUNT,
  MAX_TASK_TOOL_PROMPT_LENGTH,
  MAX_TOOL_CALL_PATH_LENGTH,
  MAX_WRITE_TOOL_FILE_CONTENT_LENGTH,
  ModelContextItemSchema,
  PendingToolApprovalRequestSchema,
  ProviderStreamEventSchema,
  READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES,
  RENDER_ONLY_TOOL_DETAIL_NAMES,
  summarizeContextWindowUsageForDiagnostics,
  summarizeTokenUsageForDiagnostics,
  ToolCallRequestSchema,
  ToolCallDetailSchema,
  type BuliDiagnosticLogEvent,
  WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES,
  createStartedToolCallDetailFromRequest,
  emitBuliDiagnosticLogEvent,
  isAssistantToolRequestName,
  isAssistantSubagentName,
  isFileMutationToolCallRequest,
  isLocateCodebaseSymbolsToolCallRequest,
  isReadOnlyAssistantModeToolRequestName,
  isRecordWorkflowHandoffToolCallRequest,
  isSkillToolCallRequest,
  isWorkspaceInspectionToolCallRequest,
  findLatestVisibleWorkflowHandoffCheckpoint,
  findLatestVisibleCompletedAssistantOperatingMode,
  listModelVisibleConversationSessionEntries,
  UserPromptImageAttachmentSchema,
  WorkflowHandoffSchema,
  WorkspacePatchSchema,
  type ConversationSessionEntry,
  type ImplementationWorkflowHandoff,
  type PlanWorkflowHandoff,
  type UnderstandingWorkflowHandoff,
} from "../src/index.ts";

type ContractCompatibilityFixture = {
  assistantResponseEvents: unknown[];
  providerStreamEvents: unknown[];
  conversationSessionEntries: unknown[];
  modelSelection: unknown;
  toolCallRequests: unknown[];
  toolCallDetails: unknown[];
  workspacePatch: unknown;
};

async function readContractCompatibilityFixture(): Promise<ContractCompatibilityFixture> {
  const fixtureText = await readFile(
    new URL("./fixtures/contract-compatibility-v1.json", import.meta.url),
    "utf8",
  );

  return JSON.parse(fixtureText) as ContractCompatibilityFixture;
}

function createContractsTestPlanWorkflowHandoff(agreedGoal: string): PlanWorkflowHandoff {
  return {
    handoffKind: "plan",
    agreedGoal,
    currentStateSummary: "The current session needs a durable checkpoint.",
    chosenApproach: "Store the latest typed handoff of each kind on compaction summaries.",
    targetFiles: [
      {
        filePath: "packages/contracts/src/conversationSessionEntry.ts",
        operationKind: "update",
        reason: "Persist the workflow handoff checkpoint on compaction summaries.",
      },
    ],
    implementationSteps: ["Add contract fields", "Use summary fallback during lookup"],
    verificationCommands: [
      { command: "bun test packages/contracts/test/contracts.test.ts", reason: "Verify handoff checkpoint contracts." },
    ],
    risks: [],
    isReadyForImplementation: true,
    requiredPreApplyReads: [],
  };
}

function createContractsTestUnderstandingWorkflowHandoff(currentUnderstanding: string): UnderstandingWorkflowHandoff {
  return {
    handoffKind: "understanding",
    userGoal: "Understand workflow continuity across compaction.",
    currentUnderstanding,
    importantFindings: ["Compaction hides older completed assistant messages from model-visible history."],
    evidenceReferences: [],
    constraints: ["Keep the checkpoint bounded to one latest handoff of each kind."],
    openQuestions: [],
    recommendedNextStep: "Create an implementation plan.",
  };
}

function createContractsTestImplementationWorkflowHandoff(implementedOutcome: string): ImplementationWorkflowHandoff {
  return {
    handoffKind: "implementation",
    implementedOutcome,
    changedFiles: [
      {
        filePath: "packages/contracts/src/conversationCompactionProjection.ts",
        changeSummary: "Resolved latest handoffs from visible history and summary checkpoint fallback.",
      },
    ],
    verificationResults: [
      { command: "bun test packages/contracts/test/contracts.test.ts", outcomeKind: "passed", summary: "Contract tests passed." },
    ],
    remainingIssues: [],
    recommendedNextStep: "Use the persisted checkpoint in engine workflow context.",
  };
}

test("contract compatibility fixture parses with all public interoperability schemas", async () => {
  const fixture = await readContractCompatibilityFixture();

  expect(AssistantResponseEventSchema.array().parse(fixture.assistantResponseEvents)).toHaveLength(3);
  expect(ProviderStreamEventSchema.array().parse(fixture.providerStreamEvents)).toHaveLength(3);
  expect(ConversationSessionEntrySchema.array().parse(fixture.conversationSessionEntries)).toHaveLength(4);
  expect(ConversationSessionModelSelectionSchema.parse(fixture.modelSelection)).toMatchObject({
    selectedModelId: "gpt-5.5",
  });
  expect(ToolCallRequestSchema.array().parse(fixture.toolCallRequests)).toHaveLength(3);
  expect(ToolCallDetailSchema.array().parse(fixture.toolCallDetails)).toHaveLength(3);
  expect(WorkspacePatchSchema.parse(fixture.workspacePatch)).toMatchObject({
    workspacePatchId: "patch-1",
  });
});

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

test("summarizeContextWindowUsageForDiagnostics reports prefixed token counts", () => {
  expect(summarizeContextWindowUsageForDiagnostics({
    input: 100,
    output: 50,
    reasoning: 20,
    cache: { read: 30, write: 10 },
  })).toEqual({
    contextWindowTotalTokens: 170,
    contextWindowInputTokens: 100,
    contextWindowOutputTokens: 50,
    contextWindowReasoningTokens: 20,
    contextWindowCacheReadTokens: 30,
    contextWindowCacheWriteTokens: 10,
  });

  expect(summarizeContextWindowUsageForDiagnostics(undefined)).toEqual({});
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

test("WorkflowHandoffSchema parses typed workflow handoff artifacts", () => {
  expect(
    WorkflowHandoffSchema.parse({
      handoffKind: "plan",
      agreedGoal: "Record typed workflow handoffs.",
      currentStateSummary: "Strict mode transitions currently reject flexible starts.",
      chosenApproach: "Use a typed record_workflow_handoff tool.",
      targetFiles: [
        {
          filePath: "packages/contracts/src/workflowHandoff.ts",
          operationKind: "add",
          reason: "Define durable handoff contracts.",
        },
      ],
      implementationSteps: ["Add contracts", "Store completed handoffs", "Inject latest handoff context"],
      verificationCommands: [
        { command: "bun test packages/contracts/test/contracts.test.ts", reason: "Verify public contracts." },
      ],
      risks: ["The model may forget to call the handoff tool."],
      isReadyForImplementation: true,
      requiredPreApplyReads: [],
    }),
  ).toMatchObject({
    handoffKind: "plan",
    isReadyForImplementation: true,
  });
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

test("ConversationMessageSchema parses model-context visibility", () => {
  expect(
    ConversationMessageSchema.parse({
      id: "user-1",
      role: "user",
      messageStatus: "completed",
      createdAtMs: 1,
      partIds: ["part-1"],
      modelContextVisibility: "compacted_out_of_model_context",
    }),
  ).toEqual({
    id: "user-1",
    role: "user",
    messageStatus: "completed",
    createdAtMs: 1,
    partIds: ["part-1"],
    modelContextVisibility: "compacted_out_of_model_context",
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

test("ConversationMessagePartSchema parses an assistant BuliStickyNotes audit part", () => {
  const buliStickyNotesContextText = [
    "BuliStickyNotes:",
    "Purpose-aware evidence notes from prior turns:",
    "- Prior task: \"Inspect prompts\"; question: \"Where is context inserted?\"; source: read src/systemPrompt.ts via call_read_1; observed: returned 20 lines; freshness: fresh.",
  ].join("\n");

  const parsedPart = AssistantBuliStickyNotesConversationMessagePartSchema.parse({
    id: "sticky-notes-part-1",
    partKind: "assistant_buli_sticky_notes",
    buliStickyNotesContextText,
  });

  expect(parsedPart).toEqual({
    id: "sticky-notes-part-1",
    partKind: "assistant_buli_sticky_notes",
    buliStickyNotesContextText,
  });
  expect(ConversationMessagePartSchema.parse(parsedPart).partKind).toBe("assistant_buli_sticky_notes");
});

test("ConversationMessagePartSchema parses a compaction separator part", () => {
  expect(
    ConversationMessagePartSchema.parse({
      id: "compaction-separator-1",
      partKind: "assistant_compaction_separator",
      source: "auto",
    }),
  ).toEqual({
    id: "compaction-separator-1",
    partKind: "assistant_compaction_separator",
    source: "auto",
  });
});

test("ProviderStreamEventSchema parses rate-limit retry wait timing", () => {
  expect(
    ProviderStreamEventSchema.parse({
      type: "rate_limit_pending",
      retryAfterSeconds: 3,
      retryWaitStartedAtMs: 1_250,
      retryReason: "rate_limit",
      limitExplanation: "OpenAI request was rate limited. Retrying after 3 seconds.",
    }),
  ).toEqual({
    type: "rate_limit_pending",
    retryAfterSeconds: 3,
    retryWaitStartedAtMs: 1_250,
    retryReason: "rate_limit",
    limitExplanation: "OpenAI request was rate limited. Retrying after 3 seconds.",
  });
});

test("ConversationMessagePartSchema parses retry-pending notice reason", () => {
  expect(
    ConversationMessagePartSchema.parse({
      id: "retry-notice-1",
      partKind: "assistant_rate_limit_notice",
      retryAfterSeconds: 1,
      retryReason: "transport_error",
      limitExplanation: "OpenAI request failed before receiving a response. Retrying after 1 second.",
      noticeStartedAtMs: 1_250,
    }),
  ).toEqual({
    id: "retry-notice-1",
    partKind: "assistant_rate_limit_notice",
    retryAfterSeconds: 1,
    retryReason: "transport_error",
    limitExplanation: "OpenAI request failed before receiving a response. Retrying after 1 second.",
    noticeStartedAtMs: 1_250,
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

test("ToolCallRequestSchema rejects oversized tool request payloads", () => {
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "read",
      readTargetPath: "a".repeat(MAX_TOOL_CALL_PATH_LENGTH + 1),
    })
  ).toThrow();
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "bash",
      shellCommand: "x".repeat(MAX_BASH_TOOL_COMMAND_LENGTH + 1),
      commandDescription: "Run oversized command",
    })
  ).toThrow();
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "grep",
      regexPattern: "x".repeat(MAX_GREP_TOOL_PATTERN_LENGTH + 1),
    })
  ).toThrow();
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "edit",
      editTargetPath: "src/file.ts",
      oldString: "x".repeat(MAX_EDIT_TOOL_SEARCH_TEXT_LENGTH + 1),
      newString: "replacement",
    })
  ).toThrow();
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "edit_many",
      edits: Array.from({ length: MAX_EDIT_MANY_TOOL_EDIT_COUNT + 1 }, () => ({
        editTargetPath: "src/file.ts",
        oldString: "old",
        newString: "new",
      })),
    })
  ).toThrow();
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "patch",
      patchText: "x".repeat(MAX_PATCH_TOOL_PATCH_TEXT_LENGTH + 1),
    })
  ).toThrow();
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "patch_many",
      patchText: "x".repeat(MAX_PATCH_TOOL_PATCH_TEXT_LENGTH + 1),
    })
  ).toThrow();
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "write",
      writeTargetPath: "src/file.ts",
      fileContent: "x".repeat(MAX_WRITE_TOOL_FILE_CONTENT_LENGTH + 1),
    })
  ).toThrow();
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "task",
      subagentName: "explore",
      subagentDescription: "map files",
      subagentPrompt: "x".repeat(MAX_TASK_TOOL_PROMPT_LENGTH + 1),
    })
  ).toThrow();
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "locate_codebase_symbols",
      symbolNames: ["x".repeat(MAX_CODEBASE_KNOWLEDGE_SYMBOL_NAME_LENGTH + 1)],
    })
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
        {
          subagentChildToolCallId: "call-skill-1",
          subagentChildToolCallStatus: "completed",
          subagentChildToolCallStartedAtMs: 5,
          subagentChildToolCallDurationMs: 2,
          subagentChildToolCallDetail: {
            toolName: "skill",
            skillName: "code-review",
            skillDescription: "Review code changes",
            skillSourceKind: "buli",
            skillInstructionFilePath: "/workspace/.buli/skills/code-review/SKILL.md",
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
      {
        subagentChildToolCallId: "call-skill-1",
        subagentChildToolCallStatus: "completed",
        subagentChildToolCallDurationMs: 2,
        subagentChildToolCallDetail: { toolName: "skill", skillName: "code-review" },
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

test("AssistantToolCallConversationMessagePartSchema parses subagent research checkpoints", () => {
  const parsedMessagePart = AssistantToolCallConversationMessagePartSchema.parse({
    id: "tool-part-task-checkpoint",
    partKind: "assistant_tool_call",
    toolCallId: "call-task-checkpoint",
    toolCallStatus: "completed",
    toolCallStartedAtMs: 1,
    durationMs: 25,
    toolCallDetail: {
      toolName: "task",
      subagentName: "explore",
      subagentDescription: "map large runtime",
      subagentPrompt: "Map runtime files and return a checkpoint if research is bounded.",
      subagentResearchCheckpoint: {
        checkpointReason: "child_tool_result_text_length",
        childToolCallCount: 39,
        childToolResultTextLength: 314_820,
        skippedChildToolCallCount: 1,
        elapsedMilliseconds: 42_000,
        softElapsedTimeCheckpointMilliseconds: 120_000,
      },
      subagentResultSummary: "Partial runtime map returned after checkpoint.",
    },
  });

  expect(parsedMessagePart.toolCallDetail).toMatchObject({
    toolName: "task",
    subagentResearchCheckpoint: {
      checkpointReason: "child_tool_result_text_length",
      childToolCallCount: 39,
      childToolResultTextLength: 314_820,
      skippedChildToolCallCount: 1,
      elapsedMilliseconds: 42_000,
      softElapsedTimeCheckpointMilliseconds: 120_000,
    },
  });
});

test("AssistantToolCallConversationMessagePartSchema parses elapsed-time subagent research checkpoints", () => {
  const parsedMessagePart = AssistantToolCallConversationMessagePartSchema.parse({
    id: "tool-part-task-elapsed-checkpoint",
    partKind: "assistant_tool_call",
    toolCallId: "call-task-elapsed-checkpoint",
    toolCallStatus: "completed",
    toolCallStartedAtMs: 1,
    durationMs: 125_000,
    toolCallDetail: {
      toolName: "task",
      subagentName: "explore",
      subagentDescription: "map slow runtime",
      subagentPrompt: "Map runtime files and return a checkpoint if elapsed time is bounded.",
      subagentResearchCheckpoint: {
        checkpointReason: "elapsed_time",
        childToolCallCount: 7,
        childToolResultTextLength: 24_000,
        skippedChildToolCallCount: 2,
        elapsedMilliseconds: 125_000,
        softElapsedTimeCheckpointMilliseconds: 120_000,
      },
      subagentResultSummary: "Partial runtime map returned after elapsed-time checkpoint.",
    },
  });

  expect(parsedMessagePart.toolCallDetail).toMatchObject({
    toolName: "task",
    subagentResearchCheckpoint: {
      checkpointReason: "elapsed_time",
      childToolCallCount: 7,
      childToolResultTextLength: 24_000,
      skippedChildToolCallCount: 2,
      elapsedMilliseconds: 125_000,
      softElapsedTimeCheckpointMilliseconds: 120_000,
    },
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
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "read",
      readTargetPath: "packages/contracts/src/index.ts",
      maximumLineCount: MAX_READ_TOOL_LINE_COUNT + 1,
    })
  ).toThrow();
  expect(
    ToolCallRequestSchema.parse({
      toolName: "read",
      readTargetPath: "packages/contracts/src/index.ts",
      inspectionQuestion: "Which contracts export the tool request schema?",
    }),
  ).toEqual({
    toolName: "read",
    readTargetPath: "packages/contracts/src/index.ts",
    inspectionQuestion: "Which contracts export the tool request schema?",
  });
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "read",
      readTargetPath: "packages/contracts/src/index.ts",
      inspectionQuestion: "x".repeat(MAX_INSPECTION_QUESTION_LENGTH + 1),
    })
  ).toThrow();
  expect(
    ToolCallRequestSchema.parse({
      toolName: "glob",
      globPattern: "**/*.ts",
      searchDirectoryPath: "packages/contracts",
      inspectionQuestion: "Which TypeScript files define contracts?",
    }),
  ).toEqual({
    toolName: "glob",
    globPattern: "**/*.ts",
    searchDirectoryPath: "packages/contracts",
    inspectionQuestion: "Which TypeScript files define contracts?",
  });
  expect(
    ToolCallRequestSchema.parse({
      toolName: "grep",
      regexPattern: "ToolCallRequestSchema",
      searchPath: "packages/contracts",
      includeGlobPattern: "*.ts",
      contextLineCount: 2,
      inspectionQuestion: "Where is ToolCallRequestSchema referenced?",
    }),
  ).toEqual({
    toolName: "grep",
    regexPattern: "ToolCallRequestSchema",
    searchPath: "packages/contracts",
    includeGlobPattern: "*.ts",
    contextLineCount: 2,
    inspectionQuestion: "Where is ToolCallRequestSchema referenced?",
  });
  expect(
    ToolCallRequestSchema.parse({
      toolName: "locate_codebase_symbols",
      symbolNames: ["streamAssistantResponseEventsForRequestedToolCalls"],
      filePaths: ["packages/engine/src/runtimeToolCallExecution.ts"],
    }),
  ).toEqual({
    toolName: "locate_codebase_symbols",
    symbolNames: ["streamAssistantResponseEventsForRequestedToolCalls"],
    filePaths: ["packages/engine/src/runtimeToolCallExecution.ts"],
  });
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "locate_codebase_symbols",
      filePaths: ["packages/engine/src/runtimeToolCallExecution.ts"],
    })
  ).toThrow();
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "locate_codebase_symbols",
      symbolNames: [],
    })
  ).toThrow();
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "locate_codebase_symbols",
      symbolNames: ["streamAssistantResponseEventsForRequestedToolCalls"],
      maximumResultCount: 4,
    })
  ).toThrow();
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
      toolName: "edit_many",
      edits: [
        {
          editTargetPath: "packages/contracts/src/index.ts",
          oldString: "old",
          newString: "new",
          replaceAll: true,
        },
      ],
    }),
  ).toEqual({
    toolName: "edit_many",
    edits: [
      {
        editTargetPath: "packages/contracts/src/index.ts",
        oldString: "old",
        newString: "new",
        replaceAll: true,
      },
    ],
  });
  expect(
    ToolCallRequestSchema.parse({
      toolName: "patch",
      patchText: "*** Begin Patch\n*** Update File: README.md\n@@\n-old\n+new\n*** End Patch",
    }),
  ).toEqual({
    toolName: "patch",
    patchText: "*** Begin Patch\n*** Update File: README.md\n@@\n-old\n+new\n*** End Patch",
  });
  expect(
    ToolCallRequestSchema.parse({
      toolName: "patch_many",
      patchText: "*** Begin Patch\n*** Add File: generated.txt\n+new\n*** End Patch",
    }),
  ).toEqual({
    toolName: "patch_many",
    patchText: "*** Begin Patch\n*** Add File: generated.txt\n+new\n*** End Patch",
  });
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "patch",
      patchText: "*** Begin Patch\n*** Update File: one.txt\n@@\n-old\n+new\n*** Update File: two.txt\n@@\n-old\n+new\n*** End Patch",
    })
  ).toThrow("exactly one file section");
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "patch_many",
      patchText: "*** Begin Patch\n*** End Patch",
    })
  ).toThrow("at least one file section");
  expect(() =>
    ToolCallRequestSchema.parse({
      toolName: "patch_many",
      patchText: "not a patch",
    })
  ).toThrow("Begin Patch");
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
  expect(
    ToolCallRequestSchema.parse({
      toolName: "skill",
      skillName: "code-review",
    }),
  ).toEqual({
    toolName: "skill",
    skillName: "code-review",
  });
  expect(
    ToolCallRequestSchema.parse({
      toolName: "record_workflow_handoff",
      workflowHandoff: {
        handoffKind: "understanding",
        userGoal: "Understand workflow mode continuity.",
        currentUnderstanding: "Previous mode context should be carried by a typed artifact.",
        importantFindings: ["Assistant messages already store operating mode."],
        evidenceReferences: [],
        constraints: ["Read-only modes must stay read-only."],
        openQuestions: [],
        recommendedNextStep: "Create a concrete plan.",
      },
    }),
  ).toMatchObject({
    toolName: "record_workflow_handoff",
    workflowHandoff: { handoffKind: "understanding" },
  });
});

test("tool catalog lists assistant request tools by execution boundary", () => {
  expect(ASSISTANT_TOOL_REQUEST_NAMES).toEqual([
    "bash",
    "read",
    "glob",
    "grep",
    "locate_codebase_symbols",
    "edit",
    "edit_many",
    "patch",
    "patch_many",
    "write",
    "task",
    "skill",
    "record_workflow_handoff",
  ]);
  expect(WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES).toEqual(["read", "glob", "grep", "locate_codebase_symbols"]);
  expect(FILE_MUTATION_TOOL_REQUEST_NAMES).toEqual(["edit", "edit_many", "patch", "patch_many", "write"]);
  expect(READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES).toEqual(["read", "glob", "grep", "locate_codebase_symbols", "task", "skill", "record_workflow_handoff"]);
  expect(RENDER_ONLY_TOOL_DETAIL_NAMES).toEqual(["todowrite"]);
});

test("tool catalog classifies typed tool requests", () => {
  expect(isAssistantToolRequestName("bash")).toBe(true);
  expect(isAssistantToolRequestName("task")).toBe(true);
  expect(isAssistantToolRequestName("skill")).toBe(true);
  expect(isAssistantToolRequestName("locate_codebase_symbols")).toBe(true);
  expect(isAssistantToolRequestName("explore")).toBe(false);
  expect(isAssistantToolRequestName("general")).toBe(false);
  expect(isWorkspaceInspectionToolCallRequest({ toolName: "read", readTargetPath: "README.md" })).toBe(true);
  expect(isWorkspaceInspectionToolCallRequest({ toolName: "grep", regexPattern: "ToolCallRequest" })).toBe(true);
  expect(isWorkspaceInspectionToolCallRequest({ toolName: "locate_codebase_symbols", symbolNames: ["runDispatch"] })).toBe(true);
  expect(isWorkspaceInspectionToolCallRequest({ toolName: "write", writeTargetPath: "generated.ts", fileContent: "" })).toBe(false);
  expect(isFileMutationToolCallRequest({ toolName: "edit", editTargetPath: "README.md", oldString: "old", newString: "new" })).toBe(true);
  expect(isFileMutationToolCallRequest({ toolName: "edit_many", edits: [{ editTargetPath: "README.md", oldString: "old", newString: "new" }] })).toBe(true);
  expect(isFileMutationToolCallRequest({ toolName: "patch", patchText: "*** Begin Patch\n*** Update File: README.md\n@@\n-old\n+new\n*** End Patch" })).toBe(true);
  expect(isFileMutationToolCallRequest({ toolName: "patch_many", patchText: "*** Begin Patch\n*** Add File: generated.txt\n+new\n*** End Patch" })).toBe(true);
  expect(isFileMutationToolCallRequest({ toolName: "read", readTargetPath: "README.md" })).toBe(false);
  expect(isReadOnlyAssistantModeToolRequestName("read")).toBe(true);

  expect(isReadOnlyAssistantModeToolRequestName("locate_codebase_symbols")).toBe(true);
  expect(isReadOnlyAssistantModeToolRequestName("task")).toBe(true);
  expect(isReadOnlyAssistantModeToolRequestName("skill")).toBe(true);
  expect(isReadOnlyAssistantModeToolRequestName("record_workflow_handoff")).toBe(true);
  expect(isReadOnlyAssistantModeToolRequestName("write")).toBe(false);
  expect(isSkillToolCallRequest({ toolName: "skill", skillName: "code-review" })).toBe(true);
  expect(isSkillToolCallRequest({ toolName: "read", readTargetPath: "README.md" })).toBe(false);
  expect(isLocateCodebaseSymbolsToolCallRequest({ toolName: "locate_codebase_symbols", symbolNames: ["runDispatch"] })).toBe(true);
  expect(isLocateCodebaseSymbolsToolCallRequest({ toolName: "read", readTargetPath: "README.md" })).toBe(false);
  expect(isRecordWorkflowHandoffToolCallRequest({
    toolName: "record_workflow_handoff",
    workflowHandoff: {
      handoffKind: "implementation",
      implementedOutcome: "Added handoff recording.",
      changedFiles: [],
      verificationResults: [],
      remainingIssues: [],
      recommendedNextStep: "Run full tests.",
    },
  })).toBe(true);
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
  expect(createStartedToolCallDetailFromRequest({ toolName: "grep", regexPattern: "ToolCallRequest", contextLineCount: 2 })).toEqual({
    toolName: "grep",
    searchPattern: "ToolCallRequest",
    contextLineCount: 2,
  });
  expect(createStartedToolCallDetailFromRequest({
    toolName: "locate_codebase_symbols",
    symbolNames: ["streamAssistantResponseEventsForRequestedToolCalls"],
    filePaths: ["packages/engine/src/runtimeToolCallExecution.ts"],
  })).toEqual({
    toolName: "locate_codebase_symbols",
    symbolNames: ["streamAssistantResponseEventsForRequestedToolCalls"],
    filePaths: ["packages/engine/src/runtimeToolCallExecution.ts"],
  });
  expect(createStartedToolCallDetailFromRequest({ toolName: "edit", editTargetPath: "README.md", oldString: "old", newString: "new" })).toEqual({
    toolName: "edit",
    editedFilePath: "README.md",
  });
  expect(createStartedToolCallDetailFromRequest({ toolName: "edit_many", edits: [{ editTargetPath: "README.md", oldString: "old", newString: "new" }] })).toEqual({
    toolName: "edit_many",
    editCount: 1,
  });
  expect(createStartedToolCallDetailFromRequest({ toolName: "patch", patchText: "*** Begin Patch\n*** Update File: README.md\n@@\n-old\n+new\n*** End Patch" })).toEqual({
    toolName: "patch",
    patchTargetText: "patch",
  });
  expect(createStartedToolCallDetailFromRequest({ toolName: "patch_many", patchText: "*** Begin Patch\n*** Add File: generated.txt\n+new\n*** End Patch" })).toEqual({
    toolName: "patch_many",
    patchTargetText: "patch",
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
  expect(createStartedToolCallDetailFromRequest({ toolName: "skill", skillName: "code-review" })).toEqual({
    toolName: "skill",
    skillName: "code-review",
  });
  expect(createStartedToolCallDetailFromRequest({
    toolName: "record_workflow_handoff",
    workflowHandoff: {
      handoffKind: "plan",
      agreedGoal: "Add typed handoffs.",
      currentStateSummary: "Current runtime has strict mode gates.",
      chosenApproach: "Record durable plan artifacts.",
      targetFiles: [],
      implementationSteps: [],
      verificationCommands: [],
      risks: [],
      isReadyForImplementation: true,
      requiredPreApplyReads: [],
    },
  })).toEqual({
    toolName: "record_workflow_handoff",
    handoffKind: "plan",
    handoffSummary: "Add typed handoffs.",
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
      failureKind: "context_window_overflow",
    }),
  ).toMatchObject({
    type: "assistant_message_failed",
    failureKind: "context_window_overflow",
  });
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
      selectedModelId: "gpt-5.4",
      assistantOperatingMode: "implementation",
      turnDurationMs: 1200,
      usage: { total: 10, input: 4, output: 5, reasoning: 1, cache: { read: 0, write: 0 } },
      workflowHandoff: {
        handoffKind: "implementation",
        implementedOutcome: "Stored workflow handoff on the completed assistant message.",
        changedFiles: [{ filePath: "packages/contracts/src/conversationSessionEntry.ts", changeSummary: "Added workflowHandoff." }],
        verificationResults: [{ command: "bun test", outcomeKind: "passed", summary: "Contracts passed." }],
        remainingIssues: [],
        recommendedNextStep: "Use the handoff in the next turn.",
      },
    }),
  ).toEqual({
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "Done.",
    selectedModelId: "gpt-5.4",
    assistantOperatingMode: "implementation",
    turnDurationMs: 1200,
    usage: { total: 10, input: 4, output: 5, reasoning: 1, cache: { read: 0, write: 0 } },
    workflowHandoff: {
      handoffKind: "implementation",
      implementedOutcome: "Stored workflow handoff on the completed assistant message.",
      changedFiles: [{ filePath: "packages/contracts/src/conversationSessionEntry.ts", changeSummary: "Added workflowHandoff." }],
      verificationResults: [{ command: "bun test", outcomeKind: "passed", summary: "Contracts passed." }],
      remainingIssues: [],
      recommendedNextStep: "Use the handoff in the next turn.",
    },
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

test("ConversationSessionEntrySchema parses BuliStickyNotes history entries", () => {
  const buliStickyNotesContextText = [
    "BuliStickyNotes:",
    "Purpose-aware evidence notes from prior turns:",
    "Use these as source pointers, not active memory.",
  ].join("\n");

  const parsedEntry = BuliStickyNotesConversationSessionEntrySchema.parse({
    entryKind: "buli_sticky_notes",
    buliStickyNotesContextText,
  });

  expect(parsedEntry).toEqual({
    entryKind: "buli_sticky_notes",
    buliStickyNotesContextText,
  });
  expect(ConversationSessionEntrySchema.parse(parsedEntry).entryKind).toBe("buli_sticky_notes");
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
      latestCompletedAssistantOperatingMode: "plan",
    }),
  ).toEqual({
    entryKind: "conversation_compaction_summary",
    summaryText: "Goal: continue the implementation.",
    compactedEntryCount: 12,
    retainedRecentConversationSessionEntryCount: 4,
    latestCompletedAssistantOperatingMode: "plan",
  });
});

test("ConversationSessionEntrySchema parses a conversation compaction summary with workflow handoff checkpoints", () => {
  const latestPlanWorkflowHandoff = createContractsTestPlanWorkflowHandoff("Carry the compacted plan forward.");

  expect(
    ConversationSessionEntrySchema.parse({
      entryKind: "conversation_compaction_summary",
      summaryText: "Goal: execute the compacted plan.",
      compactedEntryCount: 12,
      retainedRecentConversationSessionEntryCount: 0,
      latestCompletedAssistantOperatingMode: "plan",
      latestPlanWorkflowHandoff,
    }),
  ).toEqual({
    entryKind: "conversation_compaction_summary",
    summaryText: "Goal: execute the compacted plan.",
    compactedEntryCount: 12,
    retainedRecentConversationSessionEntryCount: 0,
    latestCompletedAssistantOperatingMode: "plan",
    latestPlanWorkflowHandoff,
  });
});

test("listModelVisibleConversationSessionEntries keeps only latest summary and new entries", () => {
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
  ).toEqual([compactionSummary, nextPrompt]);
});

test("findLatestVisibleCompletedAssistantOperatingMode prefers newer completed turns after compaction summaries", () => {
  const conversationSessionEntries = [
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Old understanding.",
      assistantOperatingMode: "understand",
    },
    {
      entryKind: "conversation_compaction_summary",
      summaryText: "Goal: continue from compacted context.",
      compactedEntryCount: 1,
      retainedRecentConversationSessionEntryCount: 0,
      latestCompletedAssistantOperatingMode: "plan",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Implementation completed.",
      assistantOperatingMode: "implementation",
    },
  ] as const;

  expect(findLatestVisibleCompletedAssistantOperatingMode(conversationSessionEntries)).toBe("implementation");
});

test("findLatestVisibleCompletedAssistantOperatingMode falls back to compaction summary metadata", () => {
  const conversationSessionEntries = [
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Old plan.",
      assistantOperatingMode: "plan",
    },
    {
      entryKind: "conversation_compaction_summary",
      summaryText: "Goal: continue from compacted plan.",
      compactedEntryCount: 1,
      retainedRecentConversationSessionEntryCount: 0,
      latestCompletedAssistantOperatingMode: "plan",
    },
    {
      entryKind: "user_prompt",
      promptText: "Execute the plan.",
      modelFacingPromptText: "Execute the plan.",
      assistantOperatingMode: "implementation",
    },
  ] as const;

  expect(findLatestVisibleCompletedAssistantOperatingMode(conversationSessionEntries)).toBe("plan");
});

test("findLatestVisibleWorkflowHandoffCheckpoint uses summary checkpoints and newer completed-message handoffs per kind", () => {
  const compactedUnderstandingWorkflowHandoff = createContractsTestUnderstandingWorkflowHandoff(
    "Compacted understanding remains relevant.",
  );
  const compactedPlanWorkflowHandoff = createContractsTestPlanWorkflowHandoff("Compacted plan.");
  const compactedImplementationWorkflowHandoff = createContractsTestImplementationWorkflowHandoff(
    "Compacted implementation result.",
  );
  const newerPlanWorkflowHandoff = createContractsTestPlanWorkflowHandoff("New visible plan.");
  const newerImplementationWorkflowHandoff = createContractsTestImplementationWorkflowHandoff(
    "New visible implementation result.",
  );
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Hidden old plan.",
      assistantOperatingMode: "plan",
      workflowHandoff: createContractsTestPlanWorkflowHandoff("Hidden old plan."),
    },
    {
      entryKind: "conversation_compaction_summary",
      summaryText: "Goal: continue from compacted context.",
      compactedEntryCount: 1,
      retainedRecentConversationSessionEntryCount: 0,
      latestUnderstandingWorkflowHandoff: compactedUnderstandingWorkflowHandoff,
      latestPlanWorkflowHandoff: compactedPlanWorkflowHandoff,
      latestImplementationWorkflowHandoff: compactedImplementationWorkflowHandoff,
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Implementation completed after compaction.",
      assistantOperatingMode: "implementation",
      workflowHandoff: newerImplementationWorkflowHandoff,
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "New plan after compaction.",
      assistantOperatingMode: "plan",
      workflowHandoff: newerPlanWorkflowHandoff,
    },
  ];

  expect(findLatestVisibleWorkflowHandoffCheckpoint(conversationSessionEntries)).toEqual({
    latestUnderstandingWorkflowHandoff: compactedUnderstandingWorkflowHandoff,
    latestPlanWorkflowHandoff: newerPlanWorkflowHandoff,
    latestImplementationWorkflowHandoff: newerImplementationWorkflowHandoff,
  });
});

test("ModelContextItemSchema parses a compaction summary", () => {
  expect(
    ModelContextItemSchema.parse({
      itemKind: "compaction_summary",
      summaryText: "Goal: continue the implementation.",
      latestCompletedAssistantOperatingMode: "plan",
    }),
  ).toEqual({
    itemKind: "compaction_summary",
    summaryText: "Goal: continue the implementation.",
    latestCompletedAssistantOperatingMode: "plan",
  });
});

test("ModelContextItemSchema parses assistant operating mode on user and assistant messages", () => {
  expect(
    ModelContextItemSchema.parse({
      itemKind: "user_message",
      messageText: "Research compaction.",
      assistantOperatingMode: "understand",
    }),
  ).toEqual({
    itemKind: "user_message",
    messageText: "Research compaction.",
    assistantOperatingMode: "understand",
  });

  expect(
    ModelContextItemSchema.parse({
      itemKind: "assistant_message",
      messageText: "Compaction starts at the latest summary.",
      assistantOperatingMode: "understand",
    }),
  ).toEqual({
    itemKind: "assistant_message",
    messageText: "Compaction starts at the latest summary.",
    assistantOperatingMode: "understand",
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
      failureKind: "context_window_overflow",
      failureExplanation: "Provider failed mid-turn",
    }),
  ).toEqual({
    entryKind: "assistant_message",
    assistantMessageStatus: "failed",
    assistantMessageText: "Partial unsafe answer",
    failureKind: "context_window_overflow",
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
