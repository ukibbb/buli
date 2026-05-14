import { expect, test } from "bun:test";
import type { AssistantOperatingMode, AssistantResponseEvent, ProviderStreamEvent, ProviderTurnReplay } from "@buli/contracts";
import { InMemoryConversationHistory } from "../src/conversationHistory.ts";
import type { ProviderConversationTurn, ProviderToolResultSubmission } from "../src/provider.ts";
import { streamAssistantResponseEventsForBashToolCall } from "../src/runtimeBashToolCallExecution.ts";
import type { RuntimePendingToolApproval, RuntimePendingToolApprovalInput } from "../src/runtimeToolApproval.ts";
import { RuntimeToolResultSessionRecorder } from "../src/runtimeToolResultSessionRecorder.ts";
import type { BashToolApprovalMode } from "../src/tools/bashToolApprovalPolicy.ts";
import type { WorkspaceShellCommandExecutor } from "../src/tools/workspaceShellCommandExecutor.ts";

class RecordingProviderConversationTurn implements ProviderConversationTurn {
  readonly submittedToolResults: ProviderToolResultSubmission[] = [];

  async *streamProviderEvents(): AsyncGenerator<ProviderStreamEvent> {}

  async submitToolResult(input: ProviderToolResultSubmission): Promise<void> {
    this.submittedToolResults.push(input);
  }

  getProviderTurnReplay(): ProviderTurnReplay | undefined {
    return undefined;
  }
}

function createConversationHistoryWithToolCall(shellCommand: string): InMemoryConversationHistory {
  return new InMemoryConversationHistory({
    initialConversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Run command",
        modelFacingPromptText: "Run command",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call_bash_1",
        toolCallRequest: {
          toolName: "bash",
          shellCommand,
          commandDescription: "Run command",
        },
      },
    ],
  });
}

async function collectBashToolCallEvents(input: {
  shellCommand: string;
  assistantOperatingMode?: AssistantOperatingMode | undefined;
  bashToolApprovalMode?: BashToolApprovalMode | undefined;
  workspaceShellCommandExecutor?: WorkspaceShellCommandExecutor | undefined;
  createPendingToolApproval?: ((input: RuntimePendingToolApprovalInput) => RuntimePendingToolApproval) | undefined;
  providerConversationTurn?: RecordingProviderConversationTurn | undefined;
  conversationHistory?: InMemoryConversationHistory | undefined;
}): Promise<{
  assistantResponseEvents: AssistantResponseEvent[];
  providerConversationTurn: RecordingProviderConversationTurn;
  conversationHistory: InMemoryConversationHistory;
}> {
  const providerConversationTurn = input.providerConversationTurn ?? new RecordingProviderConversationTurn();
  const conversationHistory = input.conversationHistory ?? createConversationHistoryWithToolCall(input.shellCommand);
  const workspaceShellCommandExecutor = input.workspaceShellCommandExecutor ?? createSuccessfulWorkspaceShellCommandExecutor("ok\n");
  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({ conversationHistory });
  const assistantResponseEvents: AssistantResponseEvent[] = [];

  for await (const assistantResponseEvent of streamAssistantResponseEventsForBashToolCall({
    assistantResponseMessageId: "assistant-message-1",
    providerConversationTurn,
    toolCallId: "call_bash_1",
    bashToolCallRequest: {
      toolName: "bash",
      shellCommand: input.shellCommand,
      commandDescription: "Run command",
    },
    assistantOperatingMode: input.assistantOperatingMode ?? "implementation",
    bashToolApprovalMode: input.bashToolApprovalMode ?? "trusted",
    workspaceRootPath: process.cwd(),
    workspaceShellCommandExecutor,
    toolResultSessionRecorder,
    abortSignal: new AbortController().signal,
    createPendingToolApproval: input.createPendingToolApproval ?? (() => {
      throw new Error("approval should not be requested");
    }),
    throwIfConversationTurnInterrupted: () => {},
  })) {
    assistantResponseEvents.push(assistantResponseEvent);
  }

  return { assistantResponseEvents, providerConversationTurn, conversationHistory };
}

function createSuccessfulWorkspaceShellCommandExecutor(stdoutText: string): WorkspaceShellCommandExecutor {
  return {
    workspaceRootPath: process.cwd(),
    shellExecutablePath: process.env.SHELL ?? "/bin/zsh",
    async runShellCommand() {
      return {
        exitCode: 0,
        stdoutText,
        stderrText: "",
      };
    },
  } satisfies WorkspaceShellCommandExecutor;
}

function createFailingWorkspaceShellCommandExecutor(): WorkspaceShellCommandExecutor {
  return {
    workspaceRootPath: process.cwd(),
    shellExecutablePath: process.env.SHELL ?? "/bin/zsh",
    async runShellCommand() {
      throw new Error("executor failed");
    },
  } satisfies WorkspaceShellCommandExecutor;
}

test("streamAssistantResponseEventsForBashToolCall blocks mutating bash commands in plan mode", async () => {
  const { assistantResponseEvents, providerConversationTurn, conversationHistory } = await collectBashToolCallEvents({
    shellCommand: "mkdir blocked-test",
    assistantOperatingMode: "plan",
    bashToolApprovalMode: "trusted",
  });

  expect(assistantResponseEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_message_part_added",
  ]);
  expect(assistantResponseEvents[0]).toMatchObject({
    type: "assistant_message_part_added",
    part: {
      partKind: "assistant_tool_call",
      toolCallStatus: "denied",
      denialText: expect.stringContaining("Plan mode is read-only"),
    },
  });
  expect(providerConversationTurn.submittedToolResults).toEqual([
    {
      toolCallId: "call_bash_1",
      toolResultText: expect.stringContaining("Plan mode is read-only"),
    },
  ]);
  expect(conversationHistory.listConversationSessionEntries().at(-1)).toMatchObject({
    entryKind: "denied_tool_result",
    toolCallId: "call_bash_1",
    toolResultText: expect.stringContaining("Plan mode is read-only"),
  });
});

test("streamAssistantResponseEventsForBashToolCall records user-denied bash approvals", async () => {
  const pendingApprovalInputs: RuntimePendingToolApprovalInput[] = [];
  const { assistantResponseEvents, providerConversationTurn, conversationHistory } = await collectBashToolCallEvents({
    shellCommand: "mkdir denied-test",
    bashToolApprovalMode: "risk_based",
    createPendingToolApproval: (pendingToolApprovalInput) => {
      pendingApprovalInputs.push(pendingToolApprovalInput);
      return {
        approvalId: "approval_1",
        approvalDecisionPromise: Promise.resolve("denied"),
      };
    },
  });

  expect(pendingApprovalInputs).toEqual<RuntimePendingToolApprovalInput[]>([
    {
      toolCallId: "call_bash_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "mkdir denied-test",
        commandDescription: "Run command",
      },
    },
  ]);
  expect(assistantResponseEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_message_part_added",
    "assistant_pending_tool_approval_requested",
    "assistant_pending_tool_approval_cleared",
    "assistant_message_part_updated",
  ]);
  expect(assistantResponseEvents.at(-1)).toMatchObject({
    type: "assistant_message_part_updated",
    part: {
      partKind: "assistant_tool_call",
      toolCallStatus: "denied",
      denialText: "The user denied this bash command, so it was not executed.",
    },
  });
  expect(providerConversationTurn.submittedToolResults).toEqual([
    {
      toolCallId: "call_bash_1",
      toolResultText: "The user denied this bash command, so it was not executed.",
    },
  ]);
  expect(conversationHistory.listConversationSessionEntries().at(-1)).toMatchObject({
    entryKind: "denied_tool_result",
    toolCallId: "call_bash_1",
    denialExplanation: "The user denied this bash command, so it was not executed.",
  });
});

test("streamAssistantResponseEventsForBashToolCall records auto-run bash success", async () => {
  const { assistantResponseEvents, providerConversationTurn, conversationHistory } = await collectBashToolCallEvents({
    shellCommand: "pwd",
    workspaceShellCommandExecutor: createSuccessfulWorkspaceShellCommandExecutor("/repo\n"),
  });

  expect(assistantResponseEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_message_part_added",
    "assistant_message_part_updated",
  ]);
  expect(assistantResponseEvents.at(-1)).toMatchObject({
    type: "assistant_message_part_updated",
    part: {
      partKind: "assistant_tool_call",
      toolCallStatus: "completed",
      toolCallDetail: {
        toolName: "bash",
        commandLine: "pwd",
        exitCode: 0,
      },
    },
  });
  expect(providerConversationTurn.submittedToolResults).toEqual([
    {
      toolCallId: "call_bash_1",
      toolResultText: expect.stringContaining("Stdout:\n/repo"),
    },
  ]);
  expect(conversationHistory.listConversationSessionEntries().at(-1)).toMatchObject({
    entryKind: "completed_tool_result",
    toolCallId: "call_bash_1",
    toolCallDetail: {
      toolName: "bash",
      commandLine: "pwd",
      exitCode: 0,
    },
  });
});

test("streamAssistantResponseEventsForBashToolCall records failed bash execution", async () => {
  const { assistantResponseEvents, providerConversationTurn, conversationHistory } = await collectBashToolCallEvents({
    shellCommand: "pwd",
    workspaceShellCommandExecutor: createFailingWorkspaceShellCommandExecutor(),
  });

  expect(assistantResponseEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_message_part_added",
    "assistant_message_part_updated",
  ]);
  expect(assistantResponseEvents.at(-1)).toMatchObject({
    type: "assistant_message_part_updated",
    part: {
      partKind: "assistant_tool_call",
      toolCallStatus: "failed",
      errorText: "executor failed",
    },
  });
  expect(providerConversationTurn.submittedToolResults).toEqual([
    {
      toolCallId: "call_bash_1",
      toolResultText: "Command execution failed before completion: executor failed",
    },
  ]);
  expect(conversationHistory.listConversationSessionEntries().at(-1)).toMatchObject({
    entryKind: "failed_tool_result",
    toolCallId: "call_bash_1",
    failureExplanation: "executor failed",
  });
});
