import { expect, test } from "bun:test";
import { parseBuliProfileJsonl } from "../src/profileLog/readBuliProfileJsonl.ts";
import { summarizeBuliProfileRun } from "../src/profileLog/summarizeBuliProfileRun.ts";
import { formatBuliProfileRunReportMarkdown } from "../src/reportBuliProfileRun.ts";
import {
  createManualBuliProfileRuntimeArgs,
  resolveManualBuliProfileExitCode,
  shouldGenerateManualBuliProfileReport,
} from "../src/runManualBuliProfile.ts";

test("parseBuliProfileJsonl reads profile events and summary highlights durations and samples", () => {
  const profileEvents = parseBuliProfileJsonl([
    JSON.stringify({ type: "profile_started", atMs: 1_000, profileFilePath: "profile.jsonl", sampleIntervalMs: 250 }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_010,
      subsystem: "engine",
      eventName: "prompt_context.candidates_loaded",
      fields: { durationMs: 12, scannedEntryCount: 100 },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_020,
      subsystem: "engine",
      eventName: "prompt_context.candidates_loaded",
      fields: { durationMs: 4, scannedEntryCount: 100 },
    }),
    JSON.stringify({
      type: "process_sample",
      atMs: 1_030,
      activeConversationTurnId: "conversation-turn-1",
      activeConversationTurnCount: 1,
      rssBytes: 200,
      heapTotalBytes: 100,
      heapUsedBytes: 80,
      externalBytes: 4,
      arrayBuffersBytes: 2,
      cpuUserMicros: 10,
      cpuSystemMicros: 5,
      cpuUserDeltaMicros: 3,
      cpuSystemDeltaMicros: 2,
      eventLoopUtilization: 0.5,
      eventLoopDelayMeanMs: 1,
      eventLoopDelayMaxMs: 7,
      eventLoopDelayP95Ms: 6,
    }),
    JSON.stringify({
      type: "profile_logger_summary",
      atMs: 1_040,
      profileFilePath: "profile.jsonl",
      sampleIntervalMs: 250,
      recordedEventCount: 4,
      writtenEventCount: 4,
      failedWriteEventCount: 0,
      flushCount: 2,
      failedFlushCount: 0,
      bytesWritten: 1_024,
      bufferedEventCount: 0,
      maxBufferedEventCount: 3,
      totalFlushDurationMs: 6,
      maxFlushDurationMs: 4,
      hasActiveFlush: false,
    }),
    JSON.stringify({ type: "profile_stopped", atMs: 1_050, profileFilePath: "profile.jsonl", sampleIntervalMs: 250 }),
  ].join("\n"));

  expect(profileEvents).toHaveLength(6);
  expect(summarizeBuliProfileRun(profileEvents)).toEqual({
    profileStartedAtMs: 1_000,
    profileStoppedAtMs: 1_050,
    elapsedMs: 50,
    diagnosticEventCounts: [{ eventKey: "engine:prompt_context.candidates_loaded", count: 2 }],
    diagnosticDurationSummaries: [
      {
        eventKey: "engine:prompt_context.candidates_loaded",
        count: 2,
        maxDurationMs: 12,
        meanDurationMs: 8,
      },
    ],
    processSampleCount: 1,
    profileLoggerSummary: {
      type: "profile_logger_summary",
      atMs: 1_040,
      profileFilePath: "profile.jsonl",
      sampleIntervalMs: 250,
      recordedEventCount: 4,
      writtenEventCount: 4,
      failedWriteEventCount: 0,
      flushCount: 2,
      failedFlushCount: 0,
      bytesWritten: 1_024,
      bufferedEventCount: 0,
      maxBufferedEventCount: 3,
      totalFlushDurationMs: 6,
      maxFlushDurationMs: 4,
      hasActiveFlush: false,
    },
    maxRssBytes: 200,
    maxHeapUsedBytes: 80,
    maxCpuUserDeltaMicros: 3,
    maxCpuSystemDeltaMicros: 2,
    maxEventLoopDelayMs: 7,
    maxEventLoopUtilization: 0.5,
  });
  expect(profileEvents).toContainEqual(expect.objectContaining({
    type: "process_sample",
    activeConversationTurnId: "conversation-turn-1",
    activeConversationTurnCount: 1,
  }));
});

test("parseBuliProfileJsonl rejects unknown event shapes", () => {
  expect(() => parseBuliProfileJsonl('{"type":"unknown","atMs":1}\n')).toThrow("Invalid Buli profile event at line 1.");
});

test("formatBuliProfileRunReportMarkdown highlights provider and storage summaries", () => {
  const profileEvents = parseBuliProfileJsonl([
    JSON.stringify({ type: "profile_started", atMs: 1_000, profileFilePath: "profile.jsonl", sampleIntervalMs: 250 }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_010,
      subsystem: "openai",
      eventName: "response_step.summary",
      fields: {
        conversationTurnId: "conversation-turn-1",
        providerTurnKind: "assistant",
        selectedModelId: "gpt-5.5",
        selectedReasoningEffort: "xhigh",
        responseStepIndex: 1,
        terminalKind: "tool_calls_requested",
        durationMs: 20,
        httpWaitDurationMs: 8,
        streamDurationMs: 10,
        toolResultWaitDurationMs: 2,
        requestConstructionDurationMs: 3,
        requestObjectBuildDurationMs: 1,
        requestSerializationDurationMs: 2,
        requestBodyTextLength: 300,
        requestInputItemCount: 3,
        requestFunctionCallOutputTextLength: 150,
        requestHistoricalFunctionCallOutputTextLength: 30,
        requestCurrentTurnFunctionCallOutputTextLength: 120,
        requestCurrentTurnFunctionCallOutputOriginalTextLength: 180,
        requestCurrentTurnFunctionCallOutputProjectedTextLength: 120,
        requestCurrentTurnFunctionCallOutputSavedCharacterCount: 60,
        requestCurrentTurnCompactedFunctionCallOutputCount: 1,
        requestCurrentTurnExactWorkingSetFunctionCallOutputCount: 1,
        requestCurrentTurnExactWorkingSetFunctionCallOutputTextLength: 60,
        requestWorkingSetInputItemCount: 3,
        requestWorkingSetExactInputItemCount: 2,
        requestWorkingSetCompactedInputItemCount: 1,
        requestWorkingSetOriginalTextLength: 240,
        requestWorkingSetProjectedTextLength: 180,
        requestWorkingSetSavedCharacterCount: 60,
        requestWorkingSetOriginalSerializedByteLength: 220,
        requestWorkingSetProjectedSerializedByteLength: 160,
        requestWorkingSetSavedSerializedByteLength: 60,
        requestWorkingSetUnclassifiedInputItemCount: 0,
        requestWorkingSetProjectionKinds: ["exact", "duplicate_reference"],
        requestWorkingSetProjectionKindInputItemCounts: [2, 1],
        requestWorkingSetProjectionKindOriginalTextLengths: [120, 120],
        requestWorkingSetProjectionKindProjectedTextLengths: [120, 60],
        requestWorkingSetProjectionKindSavedCharacterCounts: [0, 60],
        requestWorkingSetProjectionKindOriginalSerializedByteLengths: [130, 90],
        requestWorkingSetProjectionKindProjectedSerializedByteLengths: [130, 30],
        requestWorkingSetProjectionKindSavedSerializedByteLengths: [0, 60],
        requestWorkingSetVisibilityReasons: ["active_user_intent", "current_turn_evidence"],
        requestWorkingSetVisibilityReasonInputItemCounts: [1, 2],
        requestWorkingSetVisibilityReasonTextLengths: [60, 120],
        requestWorkingSetVisibilityReasonSerializedByteLengths: [70, 90],
        requestWorkingSetLargestInputItemIndexes: [1, 2, 0],
        requestWorkingSetLargestInputItemVisibilityReasons: ["current_turn_evidence", "current_turn_evidence", "active_user_intent"],
        requestWorkingSetLargestInputItemProjectionKinds: ["exact", "duplicate_reference", "exact"],
        requestWorkingSetLargestInputItemEvidenceIds: ["tool_result:call_read_exact", "tool_result:call_read", null],
        requestWorkingSetLargestInputItemTextLengths: [60, 60, 60],
        requestWorkingSetLargestInputItemSerializedByteLengths: [90, 70, 70],
        requestWorkingSetLargestInputItemCurrentTurnFlags: [true, true, false],
        requestStableSerializedByteLength: 180,
        requestInputSerializedByteLength: 120,
        requestLargestContributorKinds: ["request_tools", "input_function_call_output"],
        requestLargestContributorInputItemIndexes: [-1, 1],
        requestLargestContributorSerializedByteLengths: [100, 80],
        requestLargestContributorTextLengths: [0, 60],
        toolResultTextLength: 120,
        inputTokens: 40,
        cacheReadTokens: 1,
        cacheWriteTokens: 0,
        requestAttemptCount: 1,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_015,
      subsystem: "openai",
      eventName: "response_step.summary",
      fields: {
        conversationTurnId: "conversation-turn-1",
        providerTurnKind: "task_subagent",
        parentTaskToolCallId: "tool-call-task",
        subagentName: "explore",
        selectedModelId: "gpt-5.4",
        selectedReasoningEffort: "medium",
        responseStepIndex: 2,
        terminalKind: "message_completed",
        durationMs: 50,
        httpWaitDurationMs: 30,
        streamDurationMs: 15,
        toolResultWaitDurationMs: 5,
        requestConstructionDurationMs: 4,
        requestObjectBuildDurationMs: 1,
        requestSerializationDurationMs: 3,
        requestBodyTextLength: 900,
        requestInputItemCount: 6,
        requestFunctionCallOutputTextLength: 420,
        requestHistoricalFunctionCallOutputTextLength: 420,
        requestCurrentTurnFunctionCallOutputTextLength: 0,
        requestCurrentTurnFunctionCallOutputOriginalTextLength: 0,
        requestCurrentTurnFunctionCallOutputProjectedTextLength: 0,
        requestCurrentTurnFunctionCallOutputSavedCharacterCount: 0,
        requestCurrentTurnCompactedFunctionCallOutputCount: 0,
        requestCurrentTurnExactWorkingSetFunctionCallOutputCount: 0,
        requestCurrentTurnExactWorkingSetFunctionCallOutputTextLength: 0,
        requestWorkingSetInputItemCount: 6,
        requestWorkingSetExactInputItemCount: 6,
        requestWorkingSetCompactedInputItemCount: 0,
        requestWorkingSetOriginalTextLength: 700,
        requestWorkingSetProjectedTextLength: 700,
        requestWorkingSetSavedCharacterCount: 0,
        requestWorkingSetOriginalSerializedByteLength: 800,
        requestWorkingSetProjectedSerializedByteLength: 800,
        requestWorkingSetSavedSerializedByteLength: 0,
        requestWorkingSetUnclassifiedInputItemCount: 0,
        requestWorkingSetProjectionKinds: ["exact"],
        requestWorkingSetProjectionKindInputItemCounts: [6],
        requestWorkingSetProjectionKindOriginalTextLengths: [700],
        requestWorkingSetProjectionKindProjectedTextLengths: [700],
        requestWorkingSetProjectionKindSavedCharacterCounts: [0],
        requestWorkingSetProjectionKindOriginalSerializedByteLengths: [800],
        requestWorkingSetProjectionKindProjectedSerializedByteLengths: [800],
        requestWorkingSetProjectionKindSavedSerializedByteLengths: [0],
        requestWorkingSetVisibilityReasons: ["active_user_intent", "recent_decision_context", "current_turn_evidence"],
        requestWorkingSetVisibilityReasonInputItemCounts: [1, 4, 1],
        requestWorkingSetVisibilityReasonTextLengths: [100, 180, 420],
        requestWorkingSetVisibilityReasonSerializedByteLengths: [120, 168, 512],
        requestWorkingSetLargestInputItemIndexes: [4, 5, 0],
        requestWorkingSetLargestInputItemVisibilityReasons: ["current_turn_evidence", "recent_decision_context", "active_user_intent"],
        requestWorkingSetLargestInputItemProjectionKinds: ["exact", "exact", "exact"],
        requestWorkingSetLargestInputItemEvidenceIds: ["tool_result:call_task_result", null, null],
        requestWorkingSetLargestInputItemTextLengths: [420, 100, 100],
        requestWorkingSetLargestInputItemSerializedByteLengths: [512, 128, 120],
        requestWorkingSetLargestInputItemCurrentTurnFlags: [true, false, false],
        requestStableSerializedByteLength: 220,
        requestInputSerializedByteLength: 680,
        requestLargestContributorKinds: ["input_function_call_output", "request_instructions"],
        requestLargestContributorInputItemIndexes: [4, -1],
        requestLargestContributorSerializedByteLengths: [512, 128],
        requestLargestContributorTextLengths: [420, 100],
        toolResultTextLength: 300,
        inputTokens: 140,
        cacheReadTokens: 2,
        cacheWriteTokens: 1,
        requestAttemptCount: 2,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_015,
      subsystem: "openai",
      eventName: "provider_turn.summary",
      fields: {
        conversationTurnId: "conversation-turn-1",
        providerTurnKind: "assistant",
        selectedModelId: "gpt-5.5",
        selectedReasoningEffort: "xhigh",
        terminalKind: "completed",
        responseStepCount: 1,
        requestedToolCallCount: 1,
        durationMs: 20,
        maxRequestBodyTextLength: 300,
        totalToolResultTextLength: 120,
        inputTokens: 40,
        outputTokens: 6,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_015,
      subsystem: "openai",
      eventName: "provider_turn.summary",
      fields: {
        conversationTurnId: "conversation-turn-1",
        providerTurnKind: "task_subagent",
        parentTaskToolCallId: "tool-call-task",
        subagentName: "explore",
        selectedModelId: "gpt-5.4",
        selectedReasoningEffort: "medium",
        terminalKind: "completed",
        responseStepCount: 1,
        requestedToolCallCount: 0,
        durationMs: 50,
        maxRequestBodyTextLength: 900,
        totalToolResultTextLength: 300,
        inputTokens: 140,
        outputTokens: 12,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_016,
      subsystem: "openai",
      eventName: "response_step.transport_retry_scheduled",
      fields: {
        conversationTurnId: "conversation-turn-1",
        responseStepIndex: 2,
        responseStepRequestAttemptIndex: 1,
        maxResponseStepHttpRetryCount: 2,
        retryDelayMilliseconds: 500,
        transportErrorName: "TimeoutError",
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_021,
      subsystem: "engine",
      eventName: "conversation_history.entry_appended",
      fields: {
        conversationTurnId: "conversation-turn-1",
        entryKind: "completed_tool_result",
        toolCallId: "tool-call-read-duplicate",
        toolName: "read",
        toolResultTextLength: 64,
        duplicateToolResultTextPreviousCount: 1,
        duplicateToolResultTextSameToolNamePreviousCount: 1,
        duplicateToolResultFirstToolCallId: "tool-call-read",
        duplicateToolResultFirstToolName: "read",
        conversationSessionEntryCount: 12,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_017,
      subsystem: "openai",
      eventName: "response_step.transport_retry_succeeded",
      fields: {
        conversationTurnId: "conversation-turn-1",
        responseStepIndex: 2,
        responseStepRequestAttemptIndex: 2,
        transportRetryAttemptCount: 1,
        status: 200,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_018,
      subsystem: "openai",
      eventName: "response_step.response_received",
      fields: {
        conversationTurnId: "conversation-turn-1",
        responseStepIndex: 2,
        responseStepRequestAttemptIndex: 2,
        status: 200,
        rateLimitRequestsRemaining: 9,
        rateLimitTokensRemaining: 1000,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_019,
      subsystem: "openai",
      eventName: "response_step.continuation_context_guard_triggered",
      fields: {
        conversationTurnId: "conversation-turn-1",
        responseStepIndex: 2,
        reason: "context_window_near_limit",
        contextTokensUsed: 252000,
        promptInputTokensUsed: 252000,
        contextWindowTokenCapacity: 1050000,
        inputTokenCapacity: null,
        preferredContextPerformanceBudgetTokenCount: 272000,
        continuationTriggerTokenCount: 252000,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_020,
      subsystem: "engine",
      eventName: "tool_call.requested",
      fields: {
        conversationTurnId: "conversation-turn-1",
        toolCallId: "tool-call-read",
        toolName: "read",
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_021,
      subsystem: "engine",
      eventName: "provider_turn.tool_result_submitted",
      fields: {
        conversationTurnId: "conversation-turn-1",
        toolCallId: "tool-call-read",
        toolResultKind: "completed",
        toolResultTextLength: 64,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_022,
      subsystem: "openai",
      eventName: "tool_result_submission.resolved_pending_wait",
      fields: {
        conversationTurnId: "conversation-turn-1",
        toolCallId: "tool-call-read",
        toolResultTextLength: 64,
        waitDurationMs: 7,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_023,
      subsystem: "engine",
      eventName: "tool_call.execution_finished",
      fields: {
        conversationTurnId: "conversation-turn-1",
        toolCallId: "tool-call-read",
        toolName: "read",
        outcomeKind: "completed",
        durationMs: 11,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_024,
      subsystem: "engine",
      eventName: "tool_call.bash_approval_wait_finished",
      fields: {
        conversationTurnId: "conversation-turn-1",
        toolCallId: "tool-call-bash",
        approvalDecision: "approved",
        durationMs: 13,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_025,
      subsystem: "engine",
      eventName: "tool_call.requested",
      fields: {
        conversationTurnId: "conversation-turn-1",
        toolCallId: "tool-call-task",
        toolName: "task",
        subagentName: "explore",
        subagentDescriptionLength: 12,
        subagentPromptLength: 80,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_026,
      subsystem: "engine",
      eventName: "subagent_conversation_limiter.slot_acquired",
      fields: {
        toolCallId: "tool-call-task",
        toolName: "task",
        subagentName: "explore",
        waitDurationMs: 3,
        activeSubagentConversationCount: 1,
        pendingSubagentConversationCount: 0,
        maximumConcurrentSubagentConversations: 8,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_027,
      subsystem: "engine",
      eventName: "provider_turn.tool_result_submitted",
      fields: {
        conversationTurnId: "conversation-turn-1",
        toolCallId: "tool-call-task",
        toolResultKind: "completed",
        toolResultTextLength: 128,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_028,
      subsystem: "openai",
      eventName: "tool_result_submission.resolved_pending_wait",
      fields: {
        conversationTurnId: "conversation-turn-1",
        toolCallId: "tool-call-task",
        toolResultTextLength: 128,
        waitDurationMs: 21,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_029,
      subsystem: "engine",
      eventName: "tool_call.execution_finished",
      fields: {
        conversationTurnId: "conversation-turn-1",
        toolCallId: "tool-call-task",
        toolName: "task",
        subagentName: "explore",
        outcomeKind: "completed",
        durationMs: 89,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_029.1,
      subsystem: "engine",
      eventName: "tool_call.requested",
      fields: {
        conversationTurnId: "conversation-turn-1",
        toolCallId: "tool-call-task-failed",
        toolName: "task",
        subagentName: "explore",
        subagentDescriptionLength: 12,
        subagentPromptLength: 96,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_029.2,
      subsystem: "engine",
      eventName: "tool_call.task_subagent_model_selection_resolved",
      fields: {
        conversationTurnId: "conversation-turn-1",
        toolCallId: "tool-call-task-failed",
        subagentName: "explore",
        parentAssistantProviderName: "openai",
        parentSelectedModelId: "gpt-5.5",
        parentSelectedReasoningEffort: "xhigh",
        taskSubagentSelectedModelId: "gpt-5.4",
        taskSubagentSelectedReasoningEffort: "medium",
        modelSelectionReason: "known_openai_high_tier_default_downgrade",
        reasoningEffortSelectionReason: "clamped_to_policy_maximum",
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_029.3,
      subsystem: "engine",
      eventName: "tool_call.task_subagent_research_checkpoint_requested",
      fields: {
        conversationTurnId: "conversation-turn-1",
        toolCallId: "tool-call-task-failed",
        parentTaskToolCallId: "tool-call-task-failed",
        subagentName: "explore",
        taskSubagentSelectedModelId: "gpt-5.4",
        taskSubagentSelectedReasoningEffort: "medium",
        checkpointReason: "child_tool_call_count",
        childToolCallCount: 36,
        childToolResultTextLength: 161_239,
        skippedChildToolCallCount: 1,
        elapsedMilliseconds: 133_298,
        softElapsedTimeCheckpointMilliseconds: 120_000,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_029.4,
      subsystem: "engine",
      eventName: "provider_turn.tool_result_submitted",
      fields: {
        conversationTurnId: "conversation-turn-1",
        toolCallId: "tool-call-task-failed",
        toolResultKind: "failed",
        toolResultTextLength: 2_048,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_029.5,
      subsystem: "engine",
      eventName: "conversation_history.entry_appended",
      fields: {
        conversationTurnId: "conversation-turn-1",
        entryKind: "failed_tool_result",
        toolCallId: "tool-call-task-failed",
        toolName: "task",
        toolResultTextLength: 2_048,
        failureExplanation: "Explorer continued requesting tools after the research checkpoint instead of returning a summary.",
        conversationSessionEntryCount: 24,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_029.6,
      subsystem: "openai",
      eventName: "tool_result_submission.resolved_pending_wait",
      fields: {
        conversationTurnId: "conversation-turn-1",
        toolCallId: "tool-call-task-failed",
        toolResultTextLength: 2_048,
        waitDurationMs: 34,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_029.7,
      subsystem: "engine",
      eventName: "tool_call.execution_finished",
      fields: {
        conversationTurnId: "conversation-turn-1",
        toolCallId: "tool-call-task-failed",
        toolName: "task",
        subagentName: "explore",
        outcomeKind: "completed",
        durationMs: 133,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_030,
      subsystem: "engine",
      eventName: "tool_call.concurrent_group_finished",
      fields: {
        conversationTurnId: "conversation-turn-1",
        toolCallCount: 1,
        toolCallIds: ["tool-call-task"],
        toolNames: ["task"],
        outcomeKind: "completed",
        durationMs: 89,
      },
    }),
    JSON.stringify({
      type: "process_sample",
      atMs: 1_031,
      activeConversationTurnId: "conversation-turn-1",
      activeConversationTurnCount: 1,
      rssBytes: 2_000,
      heapTotalBytes: 1_000,
      heapUsedBytes: 800,
      externalBytes: 4,
      arrayBuffersBytes: 2,
      cpuUserMicros: 10,
      cpuSystemMicros: 5,
      cpuUserDeltaMicros: 3,
      cpuSystemDeltaMicros: 2,
      eventLoopUtilization: 0.5,
      eventLoopDelayMeanMs: 1,
      eventLoopDelayMaxMs: 9,
      eventLoopDelayP95Ms: 6,
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_032,
      subsystem: "cli",
      eventName: "conversation_session_storage.operation_summary",
      fields: {
        operationName: "append_entry",
        operationStatus: "completed",
        transactionKind: "write",
        durationMs: 5,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_033,
      subsystem: "tui",
      eventName: "chat_screen.react_render_commit",
      fields: {
        profilerId: "chat-screen",
        renderPhase: "update",
        actualDurationMs: 4,
        baseDurationMs: 6,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_034,
      subsystem: "tui",
      eventName: "chat_screen.react_render_summary",
      fields: {
        commitCount: 3,
        mountCommitCount: 1,
        updateCommitCount: 2,
        totalActualDurationMs: 15,
        maxActualDurationMs: 9,
        meanActualDurationMs: 5,
        totalBaseDurationMs: 20,
        maxBaseDurationMs: 10,
        firstCommitAtMs: 1_001,
        lastCommitAtMs: 1_034,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_035,
      subsystem: "engine",
      eventName: "codebase_knowledge.changed_files_refresh_completed",
      fields: {
        workspaceRootPath: "/workspace",
        durationMs: 42,
        requestedChangedFileCount: 1,
        uniqueChangedFileCount: 1,
        refreshedFileCount: 1,
        skippedGeneratedFileCount: 0,
        replacedFileRecordCount: 1,
        removedFileRecordCount: 0,
        outputRecordCount: 3,
        memoryDeltaRssBytes: 2_048,
        memoryDeltaHeapUsedBytes: 512,
        memoryDeltaExternalBytes: 128,
        memoryDeltaArrayBuffersBytes: 64,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_036,
      subsystem: "engine",
      eventName: "codebase_knowledge.changed_file_refresh_completed",
      fields: {
        workspaceRootPath: "/workspace",
        changedFilePath: "src/runtime.ts",
        displayPath: "src/runtime.ts",
        action: "replace_file_records",
        status: "indexed",
        durationMs: 38,
        lstatDurationMs: 1,
        structureIndexerLoadDurationMs: 2,
        fileReadDurationMs: 3,
        fileIndexDurationMs: 4,
        repositoryReplaceDurationMs: 30,
        repositoryRemoveDurationMs: 0,
        sourceFileSizeBytes: 120,
        outputRecordCount: 3,
        memoryDeltaRssBytes: 1_024,
        memoryDeltaHeapUsedBytes: 256,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_037,
      subsystem: "engine",
      eventName: "codebase_knowledge.repository_step_completed",
      fields: {
        operationName: "load_records",
        stepName: "read_file",
        storedFileRole: "records",
        operationStatus: "completed",
        durationMs: 7,
        memoryDeltaRssBytes: 4_096,
        memoryDeltaHeapUsedBytes: 2_048,
        memoryDeltaExternalBytes: 256,
        memoryDeltaArrayBuffersBytes: 128,
        fileTextByteLength: 12_000,
        recordCount: 12,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_038,
      subsystem: "engine",
      eventName: "codebase_knowledge.repository_step_completed",
      fields: {
        operationName: "load_records",
        stepName: "json_parse",
        storedFileRole: "records",
        operationStatus: "completed",
        durationMs: 6,
        memoryDeltaRssBytes: 8_192,
        memoryDeltaHeapUsedBytes: 4_096,
        memoryDeltaExternalBytes: 512,
        memoryDeltaArrayBuffersBytes: 256,
        recordCount: 12,
      },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_039,
      subsystem: "engine",
      eventName: "codebase_knowledge.repository_step_completed",
      fields: {
        operationName: "write_records",
        stepName: "json_stringify",
        storedFileRole: "records",
        operationStatus: "completed",
        durationMs: 8,
        memoryDeltaRssBytes: 2_048,
        memoryDeltaHeapUsedBytes: 1_024,
        memoryDeltaExternalBytes: 64,
        memoryDeltaArrayBuffersBytes: 32,
        serializedJsonByteLength: 12_400,
        recordCount: 12,
      },
    }),
    JSON.stringify({ type: "profile_stopped", atMs: 1_040, profileFilePath: "profile.jsonl", sampleIntervalMs: 250 }),
  ].join("\n"));

  const reportMarkdown = formatBuliProfileRunReportMarkdown({
    profileFilePath: "profile.jsonl",
    profileEvents,
  });

  expect(reportMarkdown).toContain("## OpenAI Response Steps");
  expect(reportMarkdown).toContain("Total cache read tokens: 3");
  expect(reportMarkdown).toContain("## OpenAI Provider Turn Kind Attribution");
  expect(reportMarkdown).toContain("task_subagent");
  expect(reportMarkdown).toContain("gpt-5.4");
  expect(reportMarkdown).toContain("medium");
  expect(reportMarkdown).toContain("## OpenAI Retries And Timeouts");
  expect(reportMarkdown).toContain("Timeout transport retries scheduled: 1");
  expect(reportMarkdown).toContain("Transport retry error names: TimeoutError (1)");
  expect(reportMarkdown).toContain("## OpenAI Request Construction");
  expect(reportMarkdown).toContain("Total request construction: 7 ms");
  expect(reportMarkdown).toContain("## OpenAI Request Size Contributors");
  expect(reportMarkdown).toContain("input_function_call_output");
  expect(reportMarkdown).toContain("512 B");
  expect(reportMarkdown).toContain("## OpenAI Replay Input Age");
  expect(reportMarkdown).toContain("Historical function-output text: 450 B");
  expect(reportMarkdown).toContain("## OpenAI Working-Set Visibility");
  expect(reportMarkdown).toContain("duplicate-reference projection is request-local only");
  expect(reportMarkdown).toContain("Raw evidence and stored provider-turn replay stayed exact");
  expect(reportMarkdown).toContain("cross-step evidence replay aggregation is still off by default");
  expect(reportMarkdown).toContain("Text original/projected/saved: 940 B / 880 B / 60 B");
  expect(reportMarkdown).toContain("Serialized original/projected/saved: 1,020 B / 960 B / 60 B");
  expect(reportMarkdown).toContain("Current-turn function-output original/projected/saved: 180 B / 120 B / 60 B");
  expect(reportMarkdown).toContain("Projection kinds:");
  expect(reportMarkdown).toContain("| duplicate_reference | 1 | 120 B | 60 B | 60 B | 90 B | 30 B | 60 B |");
  expect(reportMarkdown).toContain("current_turn_evidence");
  expect(reportMarkdown).toContain("tool_result:call_read");
  expect(reportMarkdown).toContain("tool_result:call_task_result");
  expect(reportMarkdown).toContain("## Tool Attribution");
  expect(reportMarkdown).toContain("read");
  expect(reportMarkdown).toContain("Total approval wait: 13 ms");
  expect(reportMarkdown).toContain("## Tool Result Duplication");
  expect(reportMarkdown).toContain("Duplicate result entries: 1");
  expect(reportMarkdown).toContain("## Task Subagent Attribution");
  expect(reportMarkdown).toContain("Task calls: 2");
  expect(reportMarkdown).toContain("Parent-visible failed task results: 1");
  expect(reportMarkdown).toContain("Parent-visible result kinds: failed (1), completed (1)");
  expect(reportMarkdown).toContain("Per-call task execution total: 222 ms");
  expect(reportMarkdown).toContain("Per-call parent tool-result wait total: 55 ms");
  expect(reportMarkdown).toContain("Task-only concurrent group wall time: 89 ms");
  expect(reportMarkdown).toContain("| Turn | Tool Call | Subagent | Model | Effort | Executor | Parent Result | Duration | Parent Wait | Result Text |");
  expect(reportMarkdown).toContain("| `conversa` | `tool-cal` | explore | gpt-5.4 | medium | completed | failed | 133 ms | 34 ms | 2 KiB |");
  expect(reportMarkdown).toContain("Largest task results:");
  expect(reportMarkdown).toContain("2 KiB");
  expect(reportMarkdown).toContain("Checkpoint / Failure details:");
  expect(reportMarkdown).toContain("requested_tools_after_checkpoint");
  expect(reportMarkdown).toContain("child_tool_call_count");
  expect(reportMarkdown).toContain("157.46 KiB");
  expect(reportMarkdown).toContain("Explorer continued requesting tools after the research checkpoint");
  expect(reportMarkdown).toContain("explore (2)");
  expect(reportMarkdown).toContain("## OpenAI Context Guard");
  expect(reportMarkdown).toContain("Performance Budget");
  expect(reportMarkdown).toContain("272,000");
  expect(reportMarkdown).toContain("## Suspected Bottlenecks");
  expect(reportMarkdown).toContain("OpenAI response steps");
  expect(reportMarkdown).toContain("## Process Sample Attribution");
  expect(reportMarkdown).toContain("Samples with one active conversation turn: 1");
  expect(reportMarkdown).toContain("## Request And Context Growth");
  expect(reportMarkdown).toContain("Request body growth: 600 B");
  expect(reportMarkdown).toContain("`conversa`");
  expect(reportMarkdown).toContain("## TUI Render");
  expect(reportMarkdown).toContain("Commit count: 3");
  expect(reportMarkdown).toContain("Max actual duration: 9 ms");
  expect(reportMarkdown).toContain("Mean actual duration: 5 ms");
  expect(reportMarkdown).toContain("## SQLite Storage");
  expect(reportMarkdown).toContain("append_entry");
  expect(reportMarkdown).toContain("## Codebase Knowledge");
  expect(reportMarkdown).toContain("Changed-file refresh operations: 1");
  expect(reportMarkdown).toContain("Requested/refreshed files: 1 / 1");
  expect(reportMarkdown).toContain("Replaced/removed file record sets: 1 / 0");
  expect(reportMarkdown).toContain("Total refresh duration: 42 ms");
  expect(reportMarkdown).toContain("Changed-file refresh by action/status:");
  expect(reportMarkdown).toContain("| replace_file_records | indexed | 1 | 38 ms | 38 ms | 1 KiB | 256 B | 3 |");
  expect(reportMarkdown).toContain("Repository operation steps:");
  expect(reportMarkdown).toContain("| write_records | json_stringify | records | completed | 1 | 8 ms | 8 ms |");
  expect(reportMarkdown).toContain("| load_records | json_parse | records | completed | 1 | 6 ms | 6 ms |");
});

test("createManualBuliProfileRuntimeArgs adds Bun CPU and heap profiler args only when requested", () => {
  expect(createManualBuliProfileRuntimeArgs({
    outputDirectoryPath: "profile-runs/manual",
    shouldCollectBunProfiles: false,
    buliCliArgs: ["--model", "gpt-5.5"],
  })).toEqual(["apps/cli/src/cli.ts", "--model", "gpt-5.5"]);

  expect(createManualBuliProfileRuntimeArgs({
    outputDirectoryPath: "profile-runs/manual",
    shouldCollectBunProfiles: true,
    buliCliArgs: ["--model", "gpt-5.5"],
  })).toEqual([
    "--cpu-prof",
    "--cpu-prof-md",
    "--cpu-prof-dir=profile-runs/manual",
    "--cpu-prof-name=manual.cpuprofile",
    "--heap-prof",
    "--heap-prof-md",
    "--heap-prof-dir=profile-runs/manual",
    "--heap-prof-name=manual.heapsnapshot",
    "apps/cli/src/cli.ts",
    "--model",
    "gpt-5.5",
  ]);
});

test("shouldGenerateManualBuliProfileReport requires both report option and written profile JSONL", () => {
  expect(shouldGenerateManualBuliProfileReport({
    shouldWriteReport: true,
    profileJsonlFileWasWritten: true,
  })).toBe(true);
  expect(shouldGenerateManualBuliProfileReport({
    shouldWriteReport: true,
    profileJsonlFileWasWritten: false,
  })).toBe(false);
  expect(shouldGenerateManualBuliProfileReport({
    shouldWriteReport: false,
    profileJsonlFileWasWritten: true,
  })).toBe(false);
});

test("resolveManualBuliProfileExitCode fails when no profile JSONL was written", () => {
  expect(resolveManualBuliProfileExitCode({
    childExitCode: 0,
    profileJsonlFileWasWritten: false,
  })).toBe(1);
  expect(resolveManualBuliProfileExitCode({
    childExitCode: 7,
    profileJsonlFileWasWritten: false,
  })).toBe(7);
  expect(resolveManualBuliProfileExitCode({
    childExitCode: 0,
    profileJsonlFileWasWritten: true,
  })).toBe(0);
});
