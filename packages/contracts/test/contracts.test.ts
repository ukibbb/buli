import { expect, test } from "bun:test";
import {
  AssistantPlanProposedEventSchema,
  AssistantRateLimitPendingEventSchema,
  AssistantReasoningSummaryCompletedEventSchema,
  AssistantReasoningSummaryStartedEventSchema,
  AssistantReasoningSummaryTextChunkEventSchema,
  AssistantResponseEventSchema,
  AssistantToolApprovalRequestedEventSchema,
  AssistantToolCallCompletedEventSchema,
  AssistantToolCallFailedEventSchema,
  AssistantToolCallStartedEventSchema,
  AssistantTurnCompletedEventSchema,
  AvailableAssistantModelSchema,
  PlanStepSchema,
  ProviderCompletedEventSchema,
  ProviderPlanProposedEventSchema,
  ProviderRateLimitPendingEventSchema,
  ProviderReasoningSummaryCompletedEventSchema,
  ProviderReasoningSummaryStartedEventSchema,
  ProviderReasoningSummaryTextChunkEventSchema,
  ProviderStreamEventSchema,
  ProviderToolApprovalRequestedEventSchema,
  ProviderToolCallCompletedEventSchema,
  ProviderToolCallFailedEventSchema,
  ProviderToolCallStartedEventSchema,
  ProviderTurnCompletedEventSchema,
  ReasoningEffortSchema,
  ToolCallDetailSchema,
  TokenUsageSchema,
} from "../src/index.ts";

test("ReasoningEffortSchema parses supported effort values", () => {
  expect(ReasoningEffortSchema.parse("minimal")).toBe("minimal");
  expect(ReasoningEffortSchema.parse("xhigh")).toBe("xhigh");
});

test("AvailableAssistantModelSchema parses a model with reasoning metadata", () => {
  const model = AvailableAssistantModelSchema.parse({
    id: "gpt-5.4",
    displayName: "GPT-5.4",
    defaultReasoningEffort: "medium",
    supportedReasoningEfforts: ["low", "medium", "high"],
  });

  expect(model.id).toBe("gpt-5.4");
  expect(model.displayName).toBe("GPT-5.4");
  expect(model.defaultReasoningEffort).toBe("medium");
  expect(model.supportedReasoningEfforts).toEqual(["low", "medium", "high"]);
});

test("AvailableAssistantModelSchema parses a model without reasoning metadata", () => {
  const model = AvailableAssistantModelSchema.parse({
    id: "gpt-4.1-mini",
    displayName: "gpt-4.1-mini",
    supportedReasoningEfforts: [],
  });

  expect(model.displayName).toBe("gpt-4.1-mini");
  expect(model.defaultReasoningEffort).toBeUndefined();
  expect(model.supportedReasoningEfforts).toEqual([]);
});

test("TokenUsageSchema parses reasoning token usage", () => {
  const usage = TokenUsageSchema.parse({
    total: 171,
    input: 100,
    output: 40,
    reasoning: 21,
    cache: {
      read: 10,
      write: 0,
    },
  });

  expect(usage.total).toBe(171);
  expect(usage.reasoning).toBe(21);
  expect(usage.cache.read).toBe(10);
});

test("ProviderCompletedEventSchema parses final usage", () => {
  const event = ProviderCompletedEventSchema.parse({
    type: "completed",
    usage: {
      total: 220,
      input: 120,
      output: 60,
      reasoning: 40,
      cache: {
        read: 15,
        write: 0,
      },
    },
  });

  expect(event.usage.output).toBe(60);
  expect(event.usage.reasoning).toBe(40);
});

test("AssistantResponseEventSchema parses a completed assistant response", () => {
  const event = AssistantResponseEventSchema.parse({
    type: "assistant_response_completed",
    message: {
      id: "msg_1",
      role: "assistant",
      text: "Hello from the model",
    },
    usage: {
      total: 90,
      input: 50,
      output: 30,
      reasoning: 10,
      cache: {
        read: 0,
        write: 0,
      },
    },
  });

  expect(event.type).toBe("assistant_response_completed");
  if (event.type !== "assistant_response_completed") {
    throw new Error("expected assistant_response_completed event");
  }

  expect(event.message.role).toBe("assistant");
  expect(event.usage.reasoning).toBe(10);
});

test("AssistantReasoningSummaryStartedEventSchema parses a started event", () => {
  const event = AssistantReasoningSummaryStartedEventSchema.parse({
    type: "assistant_reasoning_summary_started",
  });
  expect(event.type).toBe("assistant_reasoning_summary_started");
});

test("AssistantReasoningSummaryTextChunkEventSchema parses a text chunk event", () => {
  const event = AssistantReasoningSummaryTextChunkEventSchema.parse({
    type: "assistant_reasoning_summary_text_chunk",
    text: "thinking about neo4j…",
  });
  expect(event.text).toBe("thinking about neo4j…");
});

test("AssistantReasoningSummaryTextChunkEventSchema rejects a chunk with missing text", () => {
  expect(() =>
    AssistantReasoningSummaryTextChunkEventSchema.parse({
      type: "assistant_reasoning_summary_text_chunk",
    }),
  ).toThrow();
});

test("AssistantReasoningSummaryCompletedEventSchema parses a completed event", () => {
  const event = AssistantReasoningSummaryCompletedEventSchema.parse({
    type: "assistant_reasoning_summary_completed",
    reasoningDurationMs: 3200,
  });
  expect(event.reasoningDurationMs).toBe(3200);
});

test("AssistantReasoningSummaryCompletedEventSchema rejects a negative duration", () => {
  expect(() =>
    AssistantReasoningSummaryCompletedEventSchema.parse({
      type: "assistant_reasoning_summary_completed",
      reasoningDurationMs: -1,
    }),
  ).toThrow();
});

test("AssistantResponseEventSchema accepts the three new reasoning summary arms", () => {
  expect(
    AssistantResponseEventSchema.parse({ type: "assistant_reasoning_summary_started" }).type,
  ).toBe("assistant_reasoning_summary_started");
  expect(
    AssistantResponseEventSchema.parse({
      type: "assistant_reasoning_summary_text_chunk",
      text: "x",
    }).type,
  ).toBe("assistant_reasoning_summary_text_chunk");
  expect(
    AssistantResponseEventSchema.parse({
      type: "assistant_reasoning_summary_completed",
      reasoningDurationMs: 0,
    }).type,
  ).toBe("assistant_reasoning_summary_completed");
});

test("ProviderReasoningSummaryStartedEventSchema parses a started event", () => {
  expect(
    ProviderReasoningSummaryStartedEventSchema.parse({ type: "reasoning_summary_started" }).type,
  ).toBe("reasoning_summary_started");
});

test("ProviderReasoningSummaryTextChunkEventSchema parses a text chunk event", () => {
  expect(
    ProviderReasoningSummaryTextChunkEventSchema.parse({
      type: "reasoning_summary_text_chunk",
      text: "abc",
    }).text,
  ).toBe("abc");
});

test("ProviderReasoningSummaryTextChunkEventSchema rejects a chunk with missing text", () => {
  expect(() =>
    ProviderReasoningSummaryTextChunkEventSchema.parse({
      type: "reasoning_summary_text_chunk",
    }),
  ).toThrow();
});

test("ProviderReasoningSummaryCompletedEventSchema parses a completed event", () => {
  expect(
    ProviderReasoningSummaryCompletedEventSchema.parse({
      type: "reasoning_summary_completed",
      reasoningDurationMs: 1200,
    }).reasoningDurationMs,
  ).toBe(1200);
});

test("ProviderReasoningSummaryCompletedEventSchema rejects a negative duration", () => {
  expect(() =>
    ProviderReasoningSummaryCompletedEventSchema.parse({
      type: "reasoning_summary_completed",
      reasoningDurationMs: -1,
    }),
  ).toThrow();
});

test("ProviderStreamEventSchema accepts the three new reasoning arms", () => {
  expect(
    ProviderStreamEventSchema.parse({ type: "reasoning_summary_started" }).type,
  ).toBe("reasoning_summary_started");
  expect(
    ProviderStreamEventSchema.parse({
      type: "reasoning_summary_text_chunk",
      text: "x",
    }).type,
  ).toBe("reasoning_summary_text_chunk");
  expect(
    ProviderStreamEventSchema.parse({
      type: "reasoning_summary_completed",
      reasoningDurationMs: 0,
    }).type,
  ).toBe("reasoning_summary_completed");
});

test("ToolCallDetailSchema parses each tool's detail arm", () => {
  expect(
    ToolCallDetailSchema.parse({
      toolName: "read",
      readFilePath: "apps/api/indexer.py",
      readLineCount: 46,
      readByteCount: 1820,
      previewLines: [
        { lineNumber: 38, lineText: "from __future__ import annotations" },
      ],
    }).toolName,
  ).toBe("read");
  expect(
    ToolCallDetailSchema.parse({
      toolName: "grep",
      searchPattern: "GraphSyncService",
      matchedFileCount: 4,
      totalMatchCount: 14,
      matchHits: [
        { matchFilePath: "atlas/sync.py", matchLineNumber: 14, matchSnippet: "class GraphSyncService:" },
      ],
    }).toolName,
  ).toBe("grep");
  expect(
    ToolCallDetailSchema.parse({
      toolName: "edit",
      editedFilePath: "atlas/infrastructure/sync.py",
      addedLineCount: 3,
      removedLineCount: 1,
      diffLines: [
        { lineNumber: 42, lineKind: "context", lineText: "async def sync(...)" },
        { lineNumber: 43, lineKind: "removal", lineText: "fingerprints = self._collect(project_id)" },
        { lineNumber: 43, lineKind: "addition", lineText: "fingerprints = await self._collect_async(project_id)" },
      ],
    }).toolName,
  ).toBe("edit");
  expect(
    ToolCallDetailSchema.parse({
      toolName: "bash",
      commandLine: "atlas sync --project novibe",
      exitCode: 0,
      outputLines: [
        { lineKind: "prompt", lineText: "$ atlas sync --project novibe" },
        { lineKind: "stdout", lineText: "ok" },
      ],
    }).toolName,
  ).toBe("bash");
  expect(
    ToolCallDetailSchema.parse({
      toolName: "todowrite",
      todoItems: [
        { todoItemTitle: "Wire schema", todoItemStatus: "in_progress" },
        { todoItemTitle: "Cover tests", todoItemStatus: "pending" },
      ],
    }).toolName,
  ).toBe("todowrite");
  expect(
    ToolCallDetailSchema.parse({
      toolName: "task",
      subagentDescription: "Map the codebase",
      subagentPrompt: "Summarize engine + contracts",
      subagentResultSummary: "Map shipped",
    }).toolName,
  ).toBe("task");
});

test("ToolCallDetailSchema rejects an unknown toolName", () => {
  expect(() =>
    ToolCallDetailSchema.parse({ toolName: "made_up", anything: 1 }),
  ).toThrow();
});

test("PlanStepSchema rejects an empty stepTitle", () => {
  expect(() =>
    PlanStepSchema.parse({ stepIndex: 0, stepTitle: "", stepStatus: "pending" }),
  ).toThrow();
});

test("AssistantToolCallStartedEventSchema parses a started event with a read detail", () => {
  const event = AssistantToolCallStartedEventSchema.parse({
    type: "assistant_tool_call_started",
    toolCallId: "tc_1",
    toolCallDetail: { toolName: "read", readFilePath: "apps/api/indexer.py" },
  });
  expect(event.toolCallId).toBe("tc_1");
  expect(event.toolCallDetail.toolName).toBe("read");
});

test("AssistantToolCallCompletedEventSchema requires a non-negative durationMs", () => {
  expect(() =>
    AssistantToolCallCompletedEventSchema.parse({
      type: "assistant_tool_call_completed",
      toolCallId: "tc_1",
      toolCallDetail: { toolName: "read", readFilePath: "a" },
      durationMs: -1,
    }),
  ).toThrow();
});

test("AssistantToolCallFailedEventSchema parses a failed grep event", () => {
  const event = AssistantToolCallFailedEventSchema.parse({
    type: "assistant_tool_call_failed",
    toolCallId: "tc_2",
    toolCallDetail: { toolName: "grep", searchPattern: "foo" },
    errorText: "ripgrep missing",
    durationMs: 10,
  });
  expect(event.errorText).toBe("ripgrep missing");
});

test("AssistantTurnCompletedEventSchema parses a turn summary", () => {
  const event = AssistantTurnCompletedEventSchema.parse({
    type: "assistant_turn_completed",
    turnDurationMs: 2500,
    modelDisplayName: "GPT-5.4",
    usage: { input: 10, output: 5, reasoning: 3, cache: { read: 0, write: 0 } },
  });
  expect(event.turnDurationMs).toBe(2500);
  expect(event.modelDisplayName).toBe("GPT-5.4");
});

test("AssistantRateLimitPendingEventSchema parses a rate-limit notice", () => {
  const event = AssistantRateLimitPendingEventSchema.parse({
    type: "assistant_rate_limit_pending",
    retryAfterSeconds: 60,
    limitExplanation: "Hourly token cap reached",
  });
  expect(event.retryAfterSeconds).toBe(60);
});

test("AssistantToolApprovalRequestedEventSchema parses an approval request", () => {
  const event = AssistantToolApprovalRequestedEventSchema.parse({
    type: "assistant_tool_approval_requested",
    approvalId: "apv_1",
    pendingToolCallId: "tc_3",
    pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
    riskExplanation: "Destructive command outside the project tree",
  });
  expect(event.approvalId).toBe("apv_1");
});

test("AssistantPlanProposedEventSchema parses a plan with at least one step", () => {
  const event = AssistantPlanProposedEventSchema.parse({
    type: "assistant_plan_proposed",
    planId: "plan_1",
    planTitle: "Wire atlas stream export",
    planSteps: [
      { stepIndex: 0, stepTitle: "Expose the stream endpoint", stepStatus: "pending" },
      { stepIndex: 1, stepTitle: "Cover it with an integration test", stepStatus: "pending" },
    ],
  });
  expect(event.planSteps.length).toBe(2);
});

test("AssistantResponseEventSchema accepts every new tool-call arm", () => {
  expect(
    AssistantResponseEventSchema.parse({
      type: "assistant_tool_call_started",
      toolCallId: "tc",
      toolCallDetail: { toolName: "read", readFilePath: "a" },
    }).type,
  ).toBe("assistant_tool_call_started");
  expect(
    AssistantResponseEventSchema.parse({
      type: "assistant_tool_call_completed",
      toolCallId: "tc",
      toolCallDetail: { toolName: "read", readFilePath: "a" },
      durationMs: 1,
    }).type,
  ).toBe("assistant_tool_call_completed");
  expect(
    AssistantResponseEventSchema.parse({
      type: "assistant_tool_call_failed",
      toolCallId: "tc",
      toolCallDetail: { toolName: "read", readFilePath: "a" },
      errorText: "nope",
      durationMs: 1,
    }).type,
  ).toBe("assistant_tool_call_failed");
});

test("ProviderStreamEventSchema accepts every new provider-level arm", () => {
  expect(
    ProviderStreamEventSchema.parse({
      type: "tool_call_started",
      toolCallId: "tc",
      toolCallDetail: { toolName: "bash", commandLine: "ls" },
    }).type,
  ).toBe("tool_call_started");
  expect(
    ProviderStreamEventSchema.parse({
      type: "tool_call_completed",
      toolCallId: "tc",
      toolCallDetail: { toolName: "bash", commandLine: "ls" },
      durationMs: 5,
    }).type,
  ).toBe("tool_call_completed");
  expect(
    ProviderStreamEventSchema.parse({
      type: "tool_call_failed",
      toolCallId: "tc",
      toolCallDetail: { toolName: "bash", commandLine: "ls" },
      errorText: "oom",
      durationMs: 3,
    }).type,
  ).toBe("tool_call_failed");
  expect(
    ProviderStreamEventSchema.parse({
      type: "turn_completed",
      turnDurationMs: 100,
      modelDisplayName: "GPT-5.4",
    }).type,
  ).toBe("turn_completed");
  expect(
    ProviderStreamEventSchema.parse({
      type: "rate_limit_pending",
      retryAfterSeconds: 10,
      limitExplanation: "x",
    }).type,
  ).toBe("rate_limit_pending");
  expect(
    ProviderStreamEventSchema.parse({
      type: "tool_approval_requested",
      approvalId: "a",
      pendingToolCallId: "tc",
      pendingToolCallDetail: { toolName: "bash", commandLine: "ls" },
      riskExplanation: "shell",
    }).type,
  ).toBe("tool_approval_requested");
  expect(
    ProviderStreamEventSchema.parse({
      type: "plan_proposed",
      planId: "p",
      planTitle: "Do the thing",
      planSteps: [{ stepIndex: 0, stepTitle: "Step 1", stepStatus: "pending" }],
    }).type,
  ).toBe("plan_proposed");
});

test("Provider tool-call schemas validate independently of the discriminated union", () => {
  expect(
    ProviderToolCallStartedEventSchema.parse({
      type: "tool_call_started",
      toolCallId: "tc",
      toolCallDetail: { toolName: "edit", editedFilePath: "a.py" },
    }).toolCallId,
  ).toBe("tc");
  expect(
    ProviderToolCallCompletedEventSchema.parse({
      type: "tool_call_completed",
      toolCallId: "tc",
      toolCallDetail: { toolName: "edit", editedFilePath: "a.py" },
      durationMs: 2,
    }).durationMs,
  ).toBe(2);
  expect(
    ProviderToolCallFailedEventSchema.parse({
      type: "tool_call_failed",
      toolCallId: "tc",
      toolCallDetail: { toolName: "edit", editedFilePath: "a.py" },
      errorText: "missing",
      durationMs: 1,
    }).errorText,
  ).toBe("missing");
  expect(
    ProviderTurnCompletedEventSchema.parse({
      type: "turn_completed",
      turnDurationMs: 0,
      modelDisplayName: "m",
    }).type,
  ).toBe("turn_completed");
  expect(
    ProviderRateLimitPendingEventSchema.parse({
      type: "rate_limit_pending",
      retryAfterSeconds: 0,
      limitExplanation: "x",
    }).retryAfterSeconds,
  ).toBe(0);
  expect(
    ProviderToolApprovalRequestedEventSchema.parse({
      type: "tool_approval_requested",
      approvalId: "a",
      pendingToolCallId: "tc",
      pendingToolCallDetail: { toolName: "bash", commandLine: "ls" },
      riskExplanation: "sh",
    }).approvalId,
  ).toBe("a");
  expect(
    ProviderPlanProposedEventSchema.parse({
      type: "plan_proposed",
      planId: "p",
      planTitle: "t",
      planSteps: [{ stepIndex: 0, stepTitle: "s", stepStatus: "pending" }],
    }).planSteps.length,
  ).toBe(1);
});
