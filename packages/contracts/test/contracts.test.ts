import { expect, test } from "bun:test";
import {
  AssistantResponseEventSchema,
  AssistantToolApprovalRequestedEventSchema,
  AssistantToolCallDeniedEventSchema,
  AvailableAssistantModelSchema,
  BashToolCallRequestSchema,
  CompletedToolResultConversationSessionEntrySchema,
  ConversationSessionEntrySchema,
  ModelContextItemSchema,
  OpenAiProviderTurnReplaySchema,
  PlanStepSchema,
  ProviderCompletedEventSchema,
  ProviderIncompleteEventSchema,
  ProviderPlanProposedEventSchema,
  ProviderRateLimitPendingEventSchema,
  ProviderReasoningSummaryCompletedEventSchema,
  ProviderReasoningSummaryStartedEventSchema,
  ProviderReasoningSummaryTextChunkEventSchema,
  ProviderStreamEventSchema,
  ProviderToolCallRequestedEventSchema,
  ReasoningEffortSchema,
  ToolCallBashDetailSchema,
  ToolCallDetailSchema,
  TokenUsageSchema,
  UserPromptConversationSessionEntrySchema,
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

  expect(model.supportedReasoningEfforts).toEqual(["low", "medium", "high"]);
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

  expect(usage.reasoning).toBe(21);
  expect(usage.cache.read).toBe(10);
});

test("BashToolCallRequestSchema parses the first real tool contract", () => {
  expect(
    BashToolCallRequestSchema.parse({
      toolName: "bash",
      shellCommand: "pwd",
      commandDescription: "Print the working directory",
      workingDirectoryPath: "src",
      timeoutMilliseconds: 10_000,
    }),
  ).toEqual({
    toolName: "bash",
    shellCommand: "pwd",
    commandDescription: "Print the working directory",
    workingDirectoryPath: "src",
    timeoutMilliseconds: 10_000,
  });
});

test("ToolCallDetailSchema parses the richer bash detail arm", () => {
  expect(
    ToolCallDetailSchema.parse({
      toolName: "bash",
      commandLine: "pwd",
      commandDescription: "Print the working directory",
      workingDirectoryPath: "/repo",
      timeoutMilliseconds: 5_000,
      exitCode: 0,
      outputLines: [
        { lineKind: "prompt", lineText: "$ pwd" },
        { lineKind: "stdout", lineText: "/repo" },
      ],
    }),
  ).toEqual({
    toolName: "bash",
    commandLine: "pwd",
    commandDescription: "Print the working directory",
    workingDirectoryPath: "/repo",
    timeoutMilliseconds: 5_000,
    exitCode: 0,
    outputLines: [
      { lineKind: "prompt", lineText: "$ pwd" },
      { lineKind: "stdout", lineText: "/repo" },
    ],
  });
});

test("ConversationSessionEntrySchema parses completed tool results", () => {
  const completedToolResultConversationSessionEntry = CompletedToolResultConversationSessionEntrySchema.parse({
    entryKind: "completed_tool_result",
    toolCallId: "call_1",
    toolCallDetail: {
      toolName: "bash",
      commandLine: "pwd",
      exitCode: 0,
    },
    toolResultText: "Command: pwd\nExit code: 0",
  });

  expect(ConversationSessionEntrySchema.parse(completedToolResultConversationSessionEntry).entryKind).toBe("completed_tool_result");
});

test("ConversationSessionEntrySchema parses assistant messages with provider replay state", () => {
  expect(
    ConversationSessionEntrySchema.parse({
      entryKind: "assistant_message",
      assistantMessageText: "Done.",
      providerTurnReplay: {
        provider: "openai",
        inputItems: [
          {
            type: "reasoning",
            id: "rs_1",
            encrypted_content: "encrypted-reasoning",
            summary: [{ type: "summary_text", text: "I should inspect the directory first." }],
          },
          {
            type: "function_call",
            id: "fc_1",
            call_id: "call_1",
            name: "bash",
            arguments: '{"command":"pwd","description":"Print working directory"}',
          },
          {
            type: "function_call_output",
            call_id: "call_1",
            output: "Working directory: /tmp/demo",
          },
        ],
      },
    }).entryKind,
  ).toBe("assistant_message");
});

test("UserPromptConversationSessionEntrySchema parses raw and model-facing prompt text", () => {
  expect(
    UserPromptConversationSessionEntrySchema.parse({
      entryKind: "user_prompt",
      promptText: 'Summarize @"Desktop Notes/todo.txt"',
      modelFacingPromptText: "Summarize the attached context file.",
    }),
  ).toEqual({
    entryKind: "user_prompt",
    promptText: 'Summarize @"Desktop Notes/todo.txt"',
    modelFacingPromptText: "Summarize the attached context file.",
  });
});

test("ModelContextItemSchema parses tool-call and tool-result replay items", () => {
  expect(
    ModelContextItemSchema.parse({
      itemKind: "tool_call",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print the working directory",
      },
    }).itemKind,
  ).toBe("tool_call");
  expect(
    ModelContextItemSchema.parse({
      itemKind: "tool_result",
      toolCallId: "call_1",
      toolResultText: "Command: pwd\nExit code: 0",
    }).itemKind,
  ).toBe("tool_result");
});

test("AssistantResponseEventSchema accepts the explicit denied-tool arm", () => {
  expect(
    AssistantResponseEventSchema.parse({
      type: "assistant_tool_call_denied",
      toolCallId: "call_1",
      toolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
      denialText: "The user denied this bash command, so it was not executed.",
    }).type,
  ).toBe("assistant_tool_call_denied");
});

test("AssistantToolApprovalRequestedEventSchema parses approval requests", () => {
  expect(
    AssistantToolApprovalRequestedEventSchema.parse({
      type: "assistant_tool_approval_requested",
      approvalId: "approval_1",
      pendingToolCallId: "call_1",
      pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
      riskExplanation: "This bash command will run inside the current workspace.",
    }).approvalId,
  ).toBe("approval_1");
});

test("AssistantToolCallDeniedEventSchema parses denial payloads", () => {
  expect(
    AssistantToolCallDeniedEventSchema.parse({
      type: "assistant_tool_call_denied",
      toolCallId: "call_1",
      toolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
      denialText: "The user denied this bash command, so it was not executed.",
    }).denialText,
  ).toContain("denied");
});

test("ProviderStreamEventSchema accepts tool intent, reasoning, completion, and planning arms", () => {
  expect(
    ProviderStreamEventSchema.parse({
      type: "tool_call_requested",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print the working directory",
      },
    }).type,
  ).toBe("tool_call_requested");
  expect(ProviderStreamEventSchema.parse({ type: "reasoning_summary_started" }).type).toBe("reasoning_summary_started");
  expect(
    ProviderStreamEventSchema.parse({
      type: "reasoning_summary_text_chunk",
      text: "Thinking...",
    }).type,
  ).toBe("reasoning_summary_text_chunk");
  expect(
    ProviderStreamEventSchema.parse({
      type: "reasoning_summary_completed",
      reasoningDurationMs: 1200,
    }).type,
  ).toBe("reasoning_summary_completed");
  expect(
    ProviderStreamEventSchema.parse({
      type: "completed",
      usage: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
    }).type,
  ).toBe("completed");
  expect(
    ProviderStreamEventSchema.parse({
      type: "incomplete",
      incompleteReason: "max_output_tokens",
      usage: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
    }).type,
  ).toBe("incomplete");
  expect(
    ProviderStreamEventSchema.parse({
      type: "rate_limit_pending",
      retryAfterSeconds: 30,
      limitExplanation: "hourly tokens",
    }).type,
  ).toBe("rate_limit_pending");
  expect(
    ProviderStreamEventSchema.parse({
      type: "plan_proposed",
      planId: "plan_1",
      planTitle: "Wire bash loop",
      planSteps: [{ stepIndex: 0, stepTitle: "Start the turn", stepStatus: "pending" }],
    }).type,
  ).toBe("plan_proposed");
});

test("Provider schemas validate independently", () => {
  expect(
    ProviderToolCallRequestedEventSchema.parse({
      type: "tool_call_requested",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print the working directory",
      },
    }).toolCallId,
  ).toBe("call_1");
  expect(
    ProviderCompletedEventSchema.parse({
      type: "completed",
      usage: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
    }).type,
  ).toBe("completed");
  expect(
    ProviderIncompleteEventSchema.parse({
      type: "incomplete",
      incompleteReason: "max_output_tokens",
      usage: { input: 1, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    }).incompleteReason,
  ).toBe("max_output_tokens");
  expect(ProviderReasoningSummaryStartedEventSchema.parse({ type: "reasoning_summary_started" }).type).toBe("reasoning_summary_started");
  expect(
    ProviderReasoningSummaryTextChunkEventSchema.parse({
      type: "reasoning_summary_text_chunk",
      text: "abc",
    }).text,
  ).toBe("abc");
  expect(
    ProviderReasoningSummaryCompletedEventSchema.parse({
      type: "reasoning_summary_completed",
      reasoningDurationMs: 10,
    }).reasoningDurationMs,
  ).toBe(10);
  expect(
    ProviderRateLimitPendingEventSchema.parse({
      type: "rate_limit_pending",
      retryAfterSeconds: 5,
      limitExplanation: "limit",
    }).retryAfterSeconds,
  ).toBe(5);
  expect(
    ProviderPlanProposedEventSchema.parse({
      type: "plan_proposed",
      planId: "plan_1",
      planTitle: "Do work",
      planSteps: [{ stepIndex: 0, stepTitle: "Step 1", stepStatus: "pending" }],
    }).planSteps.length,
  ).toBe(1);
  expect(
    OpenAiProviderTurnReplaySchema.parse({
      provider: "openai",
      inputItems: [
        {
          type: "reasoning",
          id: "rs_1",
          encrypted_content: "encrypted-reasoning",
          summary: [{ type: "summary_text", text: "I should inspect the directory first." }],
        },
        {
          type: "function_call",
          id: "fc_1",
          call_id: "call_1",
          name: "bash",
          arguments: '{"command":"pwd","description":"Print working directory"}',
        },
        {
          type: "function_call_output",
          call_id: "call_1",
          output: "Working directory: /tmp/demo",
        },
      ],
    }).provider,
  ).toBe("openai");
});

test("PlanStepSchema rejects an empty stepTitle", () => {
  expect(() => PlanStepSchema.parse({ stepIndex: 0, stepTitle: "", stepStatus: "pending" })).toThrow();
});

test("ToolCallBashDetailSchema rejects invalid output line kinds", () => {
  expect(() =>
    ToolCallBashDetailSchema.parse({
      toolName: "bash",
      commandLine: "pwd",
      outputLines: [{ lineKind: "bogus", lineText: "x" }],
    }),
  ).toThrow();
});
