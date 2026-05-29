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
        requestInputItemCount: 2,
        requestFunctionCallOutputTextLength: 90,
        requestHistoricalFunctionCallOutputTextLength: 30,
        requestCurrentTurnFunctionCallOutputTextLength: 60,
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
  expect(reportMarkdown).toContain("## Tool Attribution");
  expect(reportMarkdown).toContain("read");
  expect(reportMarkdown).toContain("Total approval wait: 13 ms");
  expect(reportMarkdown).toContain("## Tool Result Duplication");
  expect(reportMarkdown).toContain("Duplicate result entries: 1");
  expect(reportMarkdown).toContain("## Task Subagent Attribution");
  expect(reportMarkdown).toContain("Per-call task execution total: 89 ms");
  expect(reportMarkdown).toContain("Per-call parent tool-result wait total: 21 ms");
  expect(reportMarkdown).toContain("Task-only concurrent group wall time: 89 ms");
  expect(reportMarkdown).toContain("explore (1)");
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
