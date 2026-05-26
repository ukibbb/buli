import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AssistantOperatingMode, AssistantResponseEvent, BuliDiagnosticLogEvent, ProviderStreamEvent, ProviderTurnReplay } from "@buli/contracts";
import { InMemoryConversationHistory } from "../src/conversationHistory.ts";
import type { ProviderConversationTurn, ProviderToolResultSubmission } from "../src/provider.ts";
import { streamAssistantResponseEventsForBashToolCall } from "../src/runtimeBashToolCallExecution.ts";
import type { RuntimePendingToolApproval, RuntimePendingToolApprovalInput } from "../src/runtimeToolApproval.ts";
import { RuntimeToolResultSessionRecorder } from "../src/runtimeToolResultSessionRecorder.ts";
import type { BashToolApprovalMode } from "../src/tools/bashToolApprovalPolicy.ts";
import type { WorkspaceShellCommandExecutor } from "../src/tools/workspaceShellCommandExecutor.ts";
import { PrivateGitWorkspaceSnapshotStore } from "../src/workspaceSnapshot/privateGitWorkspaceSnapshotStore.ts";
import type { WorkspaceSnapshotStore } from "../src/workspaceSnapshot/workspaceSnapshotStore.ts";

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
  workspaceRootPath?: string | undefined;
  workspaceSnapshotStore?: WorkspaceSnapshotStore | undefined;
  workspaceShellCommandExecutor?: WorkspaceShellCommandExecutor | undefined;
  createPendingToolApproval?: ((input: RuntimePendingToolApprovalInput) => RuntimePendingToolApproval) | undefined;
  providerConversationTurn?: RecordingProviderConversationTurn | undefined;
  conversationHistory?: InMemoryConversationHistory | undefined;
  diagnosticEvents?: BuliDiagnosticLogEvent[] | undefined;
}): Promise<{
  assistantResponseEvents: AssistantResponseEvent[];
  providerConversationTurn: RecordingProviderConversationTurn;
  conversationHistory: InMemoryConversationHistory;
}> {
  const providerConversationTurn = input.providerConversationTurn ?? new RecordingProviderConversationTurn();
  const conversationHistory = input.conversationHistory ?? createConversationHistoryWithToolCall(input.shellCommand);
  const workspaceRootPath = input.workspaceRootPath ?? process.cwd();
  const workspaceShellCommandExecutor = input.workspaceShellCommandExecutor ?? createSuccessfulWorkspaceShellCommandExecutor("ok\n");
  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({ conversationHistory });
  const assistantResponseEvents: AssistantResponseEvent[] = [];

  for await (const assistantResponseEvent of streamAssistantResponseEventsForBashToolCall({
    assistantResponseMessageId: "assistant-message-1",
    conversationTurnId: "conversation-turn-1",
    providerConversationTurn,
    toolCallId: "call_bash_1",
    bashToolCallRequest: {
      toolName: "bash",
      shellCommand: input.shellCommand,
      commandDescription: "Run command",
    },
    assistantOperatingMode: input.assistantOperatingMode ?? "implementation",
    bashToolApprovalMode: input.bashToolApprovalMode ?? "trusted",
    workspaceRootPath,
    workspaceSnapshotStore: input.workspaceSnapshotStore,
    workspaceShellCommandExecutor,
    toolResultSessionRecorder,
    abortSignal: new AbortController().signal,
    createPendingToolApproval: input.createPendingToolApproval ?? (() => {
      throw new Error("approval should not be requested");
    }),
    throwIfConversationTurnInterrupted: () => {},
    ...(input.diagnosticEvents
      ? {
          diagnosticLogger: (diagnosticEvent) => {
            input.diagnosticEvents?.push(diagnosticEvent);
          },
        }
      : {}),
  })) {
    assistantResponseEvents.push(assistantResponseEvent);
  }

  return { assistantResponseEvents, providerConversationTurn, conversationHistory };
}

function createSuccessfulWorkspaceShellCommandExecutor(stdoutText: string): WorkspaceShellCommandExecutor {
  return {
    workspaceRootPath: process.cwd(),
    shellExecutablePath: process.env["SHELL"] ?? "/bin/zsh",
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
    shellExecutablePath: process.env["SHELL"] ?? "/bin/zsh",
    async runShellCommand() {
      throw new Error("executor failed");
    },
  } satisfies WorkspaceShellCommandExecutor;
}

test("streamAssistantResponseEventsForBashToolCall blocks all bash commands in plan mode", async () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const executedShellCommands: string[] = [];
  const { assistantResponseEvents, providerConversationTurn, conversationHistory } = await collectBashToolCallEvents({
    shellCommand: "pwd",
    assistantOperatingMode: "plan",
    bashToolApprovalMode: "trusted",
    workspaceShellCommandExecutor: {
      workspaceRootPath: process.cwd(),
      shellExecutablePath: process.env["SHELL"] ?? "/bin/zsh",
      async runShellCommand(input) {
        executedShellCommands.push(input.shellCommand);
        return {
          exitCode: 0,
          stdoutText: "should not run\n",
          stderrText: "",
        };
      },
    },
    diagnosticEvents,
  });

  expect(executedShellCommands).toEqual([]);
  expect(assistantResponseEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_message_part_added",
  ]);
  expect(assistantResponseEvents[0]).toMatchObject({
    type: "assistant_message_part_added",
    part: {
      partKind: "assistant_tool_call",
      toolCallStatus: "denied",
      denialText: expect.stringContaining("Plan Agent is read-only"),
    },
  });
  expect(providerConversationTurn.submittedToolResults).toEqual([
    {
      toolCallId: "call_bash_1",
      toolResultText: expect.stringContaining("Plan Agent is read-only"),
    },
  ]);
  expect(conversationHistory.listConversationSessionEntries().at(-1)).toMatchObject({
    entryKind: "denied_tool_result",
    toolCallId: "call_bash_1",
    toolResultText: expect.stringContaining("Plan Agent is read-only"),
  });
  expect(diagnosticEvents.filter((diagnosticEvent) => diagnosticEvent.eventName === "provider_turn.tool_result_submitted"))
    .toEqual([
      expect.objectContaining({
        subsystem: "engine",
        fields: expect.objectContaining({
          toolCallId: "call_bash_1",
          toolResultKind: "denied",
          toolResultTextLength: providerConversationTurn.submittedToolResults[0]?.toolResultText.length,
        }),
      }),
    ]);
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

test("streamAssistantResponseEventsForBashToolCall records workspace patches from bash side effects", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-bash-workspace-patch-"));
  const privateGitDirectoryPath = await mkdtemp(join(tmpdir(), "buli-bash-workspace-patch-git-"));
  const workspaceSnapshotStore = new PrivateGitWorkspaceSnapshotStore({
    workspaceRootPath,
    privateGitDirectoryPath,
    createWorkspacePatchId: () => "patch-1",
    nowMs: () => 1234,
  });
  const workspaceShellCommandExecutor = {
    workspaceRootPath,
    shellExecutablePath: process.env["SHELL"] ?? "/bin/zsh",
    async runShellCommand() {
      await writeFile(join(workspaceRootPath, "generated.txt"), "hello\n", "utf8");
      return {
        exitCode: 0,
        stdoutText: "created\n",
        stderrText: "",
      };
    },
  } satisfies WorkspaceShellCommandExecutor;

  const { assistantResponseEvents, providerConversationTurn, conversationHistory } = await collectBashToolCallEvents({
    shellCommand: "printf hello > generated.txt",
    workspaceRootPath,
    workspaceSnapshotStore,
    workspaceShellCommandExecutor,
  });

  expect(assistantResponseEvents).toContainEqual(expect.objectContaining({
    type: "assistant_message_part_added",
    part: expect.objectContaining({
      partKind: "assistant_workspace_patch",
      workspacePatch: expect.objectContaining({
        workspacePatchId: "patch-1",
        toolCallId: "call_bash_1",
        changedFileCount: 1,
        changedFiles: [expect.objectContaining({ filePath: "generated.txt", changeKind: "added" })],
      }),
    }),
  }));
  expect(conversationHistory.listConversationSessionEntries()).toContainEqual(expect.objectContaining({
    entryKind: "workspace_patch",
    workspacePatch: expect.objectContaining({ workspacePatchId: "patch-1" }),
  }));
  expect(providerConversationTurn.submittedToolResults[0]?.toolResultText).toContain("Workspace changes:");
  expect(providerConversationTurn.submittedToolResults[0]?.toolResultText).toContain("added generated.txt");
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
