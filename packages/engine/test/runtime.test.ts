import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelContextItem, ProviderStreamEvent, ProviderTurnReplay } from "@buli/contracts";
import type {
  ConversationTurnProvider,
  ProviderConversationTurn,
  ProviderConversationTurnRequest,
  WorkspaceShellCommandExecutor,
} from "../src/index.ts";
import { AssistantConversationRuntime } from "../src/index.ts";

class ScriptedProviderTurn implements ProviderConversationTurn {
  readonly beforeToolResultEvents: ProviderStreamEvent[];
  readonly afterToolResultEvents: ProviderStreamEvent[];
  readonly providerTurnReplay: ProviderTurnReplay | undefined;
  submittedToolResults: Array<{ toolCallId: string; toolResultText: string }> = [];
  pendingToolResultPromise: Promise<void> | undefined;
  resolvePendingToolResult: (() => void) | undefined;
  hasReceivedToolResultSubmission = false;

  constructor(input: {
    beforeToolResultEvents: ProviderStreamEvent[];
    afterToolResultEvents?: ProviderStreamEvent[];
    providerTurnReplay?: ProviderTurnReplay;
  }) {
    this.beforeToolResultEvents = input.beforeToolResultEvents;
    this.afterToolResultEvents = input.afterToolResultEvents ?? [];
    this.providerTurnReplay = input.providerTurnReplay;
  }

  async *streamProviderEvents(): AsyncGenerator<ProviderStreamEvent> {
    for (const providerStreamEvent of this.beforeToolResultEvents) {
      yield providerStreamEvent;
    }

    if (this.afterToolResultEvents.length === 0) {
      return;
    }

    this.pendingToolResultPromise = new Promise<void>((resolvePendingToolResult) => {
      this.resolvePendingToolResult = resolvePendingToolResult;
    });
    if (this.hasReceivedToolResultSubmission) {
      this.resolvePendingToolResult?.();
    }
    await this.pendingToolResultPromise;

    for (const providerStreamEvent of this.afterToolResultEvents) {
      yield providerStreamEvent;
    }
  }

  async submitToolResult(input: { toolCallId: string; toolResultText: string }): Promise<void> {
    this.submittedToolResults.push(input);
    this.hasReceivedToolResultSubmission = true;
    this.resolvePendingToolResult?.();
  }

  getProviderTurnReplay(): ProviderTurnReplay | undefined {
    return this.providerTurnReplay;
  }
}

class ThrowingToolResultProviderTurn extends ScriptedProviderTurn {
  override async submitToolResult(input: { toolCallId: string; toolResultText: string }): Promise<void> {
    await super.submitToolResult(input);
    throw new Error("tool result submission failed");
  }
}

class RecordingConversationTurnProvider implements ConversationTurnProvider {
  readonly startedTurnRequests: ProviderConversationTurnRequest[] = [];
  readonly scriptedProviderTurns: ScriptedProviderTurn[];

  constructor(scriptedProviderTurns: ScriptedProviderTurn[]) {
    this.scriptedProviderTurns = [...scriptedProviderTurns];
  }

  startConversationTurn(input: ProviderConversationTurnRequest): ProviderConversationTurn {
    this.startedTurnRequests.push(input);
    const scriptedProviderTurn = this.scriptedProviderTurns.shift();
    if (!scriptedProviderTurn) {
      throw new Error("No scripted provider turn was configured");
    }

    return scriptedProviderTurn;
  }
}

class ThrowingOnceConversationTurnProvider implements ConversationTurnProvider {
  readonly fallbackProviderTurn: ScriptedProviderTurn;
  readonly startedTurnRequests: ProviderConversationTurnRequest[] = [];
  startedTurnCount = 0;

  constructor(fallbackProviderTurn: ScriptedProviderTurn) {
    this.fallbackProviderTurn = fallbackProviderTurn;
  }

  startConversationTurn(input: ProviderConversationTurnRequest): ProviderConversationTurn {
    this.startedTurnRequests.push(input);
    this.startedTurnCount += 1;
    if (this.startedTurnCount === 1) {
      throw new Error("provider start failed");
    }

    return this.fallbackProviderTurn;
  }
}

class AbortAwareProviderTurn implements ProviderConversationTurn {
  readonly abortSignal: AbortSignal;

  constructor(abortSignal: AbortSignal) {
    this.abortSignal = abortSignal;
  }

  async *streamProviderEvents(): AsyncGenerator<ProviderStreamEvent> {
    yield { type: "text_chunk", text: "Partial" };
    if (this.abortSignal.aborted) {
      throw new Error("provider aborted");
    }

    await new Promise<void>((_resolve, reject) => {
      this.abortSignal.addEventListener("abort", () => reject(new Error("provider aborted")), { once: true });
    });
  }

  async submitToolResult(): Promise<void> {}

  getProviderTurnReplay(): ProviderTurnReplay | undefined {
    return undefined;
  }
}

class AbortAwareConversationTurnProvider implements ConversationTurnProvider {
  startedTurnRequest: ProviderConversationTurnRequest | undefined;

  startConversationTurn(input: ProviderConversationTurnRequest): ProviderConversationTurn {
    this.startedTurnRequest = input;
    if (!input.abortSignal) {
      throw new Error("expected abort signal");
    }

    return new AbortAwareProviderTurn(input.abortSignal);
  }
}

async function collectAssistantEvents(activeConversationTurn: ReturnType<AssistantConversationRuntime["startConversationTurn"]>) {
  const emittedAssistantEvents = [];
  for await (const assistantResponseEvent of activeConversationTurn.streamAssistantResponseEvents()) {
    emittedAssistantEvents.push(assistantResponseEvent);
  }
  return emittedAssistantEvents;
}

test("AssistantConversationRuntime emits a message-part turn for streamed text", async () => {
  const providerTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      { type: "text_chunk", text: "Hello" },
      { type: "text_chunk", text: " world" },
      {
        type: "completed",
        usage: {
          total: 180,
          input: 100,
          output: 50,
          reasoning: 30,
          cache: { read: 20, write: 0 },
        },
      },
    ],
  });
  const provider = new RecordingConversationTurnProvider([providerTurn]);
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath: process.cwd(),
  });

  const emittedAssistantEvents = await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "Say hello",
      selectedModelId: "gpt-5.4",
      selectedReasoningEffort: "high",
    }),
  );

  expect(provider.startedTurnRequests).toHaveLength(1);
  expect(provider.startedTurnRequests[0]?.modelContextItems).toEqual([{ itemKind: "user_message", messageText: "Say hello" }]);
  expect(emittedAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_turn_started",
    "assistant_message_part_added",
    "assistant_message_part_updated",
    "assistant_message_part_added",
    "assistant_message_part_updated",
    "assistant_message_completed",
  ]);
});

test("AssistantConversationRuntime injects the plan mode system reminder", async () => {
  const providerTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      { type: "text_chunk", text: "Plan only." },
      { type: "completed", usage: { total: 10, input: 5, output: 5, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
  });
  const provider = new RecordingConversationTurnProvider([providerTurn]);
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath: process.cwd(),
  });

  await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "Create a plan",
      assistantOperatingMode: "plan",
      selectedModelId: "gpt-5.4",
    }),
  );

  expect(provider.startedTurnRequests[0]?.systemPromptText).toContain("Plan Mode - System Reminder");
  expect(provider.startedTurnRequests[0]?.systemPromptText).toContain("READ-ONLY phase");
});

test("AssistantConversationRuntime blocks mutating bash tool calls in plan mode", async () => {
  const providerTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      {
        type: "tool_call_requested",
        toolCallId: "call_bash_1",
        toolCallRequest: {
          toolName: "bash",
          shellCommand: "mkdir blocked-test",
          commandDescription: "Try to mutate files",
        },
      },
    ],
    afterToolResultEvents: [
      { type: "text_chunk", text: "Blocked acknowledged." },
      { type: "completed", usage: { total: 20, input: 10, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
  });
  const provider = new RecordingConversationTurnProvider([providerTurn]);
  const executedShellCommands: string[] = [];
  const workspaceShellCommandExecutor = {
    workspaceRootPath: process.cwd(),
    shellExecutablePath: process.env.SHELL ?? "/bin/zsh",
    async runShellCommand(input) {
      executedShellCommands.push(input.shellCommand);
      return {
        exitCode: 0,
        stdoutText: "mutated\n",
        stderrText: "",
      };
    },
  } satisfies WorkspaceShellCommandExecutor;
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath: process.cwd(),
    workspaceShellCommandExecutor,
  });

  const emittedAssistantEvents = await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "Plan this change",
      assistantOperatingMode: "plan",
      selectedModelId: "gpt-5.4",
    }),
  );
  const deniedToolCallEvent = emittedAssistantEvents.find(
    (assistantResponseEvent) =>
      assistantResponseEvent.type === "assistant_message_part_added" &&
      assistantResponseEvent.part.partKind === "assistant_tool_call" &&
      assistantResponseEvent.part.toolCallStatus === "denied",
  );

  expect(emittedAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).not.toContain(
    "assistant_pending_tool_approval_requested",
  );
  expect(executedShellCommands).toEqual([]);
  expect(deniedToolCallEvent).toBeDefined();
  expect(providerTurn.submittedToolResults[0]?.toolResultText).toContain("Plan mode is read-only");
});

test("AssistantConversationRuntime emits failure and releases the active turn when provider start fails", async () => {
  const recoveryProviderTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      { type: "text_chunk", text: "Recovered" },
      { type: "completed", usage: { total: 10, input: 5, output: 5, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
  });
  const provider = new ThrowingOnceConversationTurnProvider(recoveryProviderTurn);
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath: process.cwd(),
  });

  const failedAssistantEvents = await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "First prompt",
      selectedModelId: "gpt-5.4",
    }),
  );
  const recoveredAssistantEvents = await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "Second prompt",
      selectedModelId: "gpt-5.4",
    }),
  );

  expect(failedAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_turn_started",
    "assistant_message_failed",
  ]);
  expect(failedAssistantEvents.at(-1)).toMatchObject({
    type: "assistant_message_failed",
    errorText: "provider start failed",
  });
  expect(recoveredAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toContain(
    "assistant_message_completed",
  );
  expect(provider.startedTurnRequests[1]?.modelContextItems).toEqual<ModelContextItem[]>([
    { itemKind: "user_message", messageText: "Second prompt" },
  ]);
  expect(runtime.conversationHistory.listConversationSessionEntries()).toMatchObject([
    {
      entryKind: "user_prompt",
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "failed",
      assistantMessageText: "",
      failureExplanation: "provider start failed",
    },
    {
      entryKind: "user_prompt",
      promptText: "Second prompt",
      modelFacingPromptText: "Second prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Recovered",
    },
  ]);
});

test("AssistantConversationRuntime emits failure when the provider stream ends without completion", async () => {
  const providerTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      { type: "text_chunk", text: "Partial" },
    ],
  });
  const provider = new RecordingConversationTurnProvider([providerTurn]);
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath: process.cwd(),
  });

  const emittedAssistantEvents = await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "Try abrupt stream",
      selectedModelId: "gpt-5.4",
    }),
  );

  expect(emittedAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_turn_started",
    "assistant_message_part_added",
    "assistant_message_failed",
  ]);
  expect(emittedAssistantEvents.at(-1)).toMatchObject({
    type: "assistant_message_failed",
    errorText: "Provider stream ended before completion",
  });
  expect(runtime.conversationHistory.listConversationSessionEntries().slice(0, 2)).toMatchObject([
    {
      entryKind: "user_prompt",
      promptText: "Try abrupt stream",
      modelFacingPromptText: "Try abrupt stream",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "failed",
      assistantMessageText: "Partial",
      failureExplanation: "Provider stream ended before completion",
    },
  ]);
  expect(runtime.conversationHistory.listModelContextItems()).toEqual<ModelContextItem[]>([]);
});

test("AssistantConversationRuntime emits incomplete as a terminal turn and releases the runtime", async () => {
  const firstProviderTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      { type: "text_chunk", text: "Partial" },
      { type: "incomplete", incompleteReason: "max_output_tokens", usage: { total: 10, input: 5, output: 4, reasoning: 1, cache: { read: 0, write: 0 } } },
    ],
  });
  const secondProviderTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      { type: "text_chunk", text: "Next" },
      { type: "completed", usage: { total: 8, input: 4, output: 4, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
  });
  const provider = new RecordingConversationTurnProvider([firstProviderTurn, secondProviderTurn]);
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath: process.cwd(),
  });

  const incompleteAssistantEvents = await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "Try incomplete stream",
      selectedModelId: "gpt-5.4",
    }),
  );
  const recoveredAssistantEvents = await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "Next prompt",
      selectedModelId: "gpt-5.4",
    }),
  );

  expect(incompleteAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toContain(
    "assistant_message_incomplete",
  );
  expect(recoveredAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toContain(
    "assistant_message_completed",
  );
  expect(provider.startedTurnRequests[1]?.modelContextItems).toEqual<ModelContextItem[]>([
    { itemKind: "user_message", messageText: "Try incomplete stream" },
    { itemKind: "assistant_message", messageText: "Partial" },
    { itemKind: "user_message", messageText: "Next prompt" },
  ]);
  expect(runtime.conversationHistory.listConversationSessionEntries().slice(0, 2)).toMatchObject([
    {
      entryKind: "user_prompt",
      promptText: "Try incomplete stream",
      modelFacingPromptText: "Try incomplete stream",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "incomplete",
      assistantMessageText: "Partial",
      incompleteReason: "max_output_tokens",
    },
  ]);
});

test("AssistantConversationRuntime interrupts an active provider stream", async () => {
  const provider = new AbortAwareConversationTurnProvider();
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath: process.cwd(),
  });
  const activeConversationTurn = runtime.startConversationTurn({
    userPromptText: "Start and stop",
    selectedModelId: "gpt-5.4",
  });
  const assistantEventIterator = activeConversationTurn.streamAssistantResponseEvents()[Symbol.asyncIterator]();
  const emittedAssistantEvents = [];

  emittedAssistantEvents.push((await assistantEventIterator.next()).value);
  emittedAssistantEvents.push((await assistantEventIterator.next()).value);
  activeConversationTurn.interrupt();

  while (true) {
    const nextAssistantEvent = await assistantEventIterator.next();
    if (nextAssistantEvent.done) {
      break;
    }

    emittedAssistantEvents.push(nextAssistantEvent.value);
  }

  expect(provider.startedTurnRequest?.abortSignal?.aborted).toBe(true);
  expect(emittedAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_turn_started",
    "assistant_message_part_added",
    "assistant_message_interrupted",
  ]);
  expect(runtime.conversationHistory.listConversationSessionEntries()).toMatchObject([
    {
      entryKind: "user_prompt",
      promptText: "Start and stop",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "interrupted",
      assistantMessageText: "Partial",
      interruptionReason: "Interrupted by user.",
    },
  ]);
});

test("AssistantConversationRuntime persists prompt when interrupted before provider start", async () => {
  const provider: ConversationTurnProvider = {
    startConversationTurn() {
      throw new Error("provider should not start after interruption");
    },
  };
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath: process.cwd(),
  });
  const activeConversationTurn = runtime.startConversationTurn({
    userPromptText: "Start and stop before provider",
    selectedModelId: "gpt-5.4",
  });
  const assistantEventIterator = activeConversationTurn.streamAssistantResponseEvents()[Symbol.asyncIterator]();
  const emittedAssistantEvents = [];

  emittedAssistantEvents.push((await assistantEventIterator.next()).value);
  activeConversationTurn.interrupt();

  while (true) {
    const nextAssistantEvent = await assistantEventIterator.next();
    if (nextAssistantEvent.done) {
      break;
    }

    emittedAssistantEvents.push(nextAssistantEvent.value);
  }

  expect(emittedAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_turn_started",
    "assistant_message_interrupted",
  ]);
  expect(runtime.conversationHistory.listConversationSessionEntries()).toMatchObject([
    {
      entryKind: "user_prompt",
      promptText: "Start and stop before provider",
      modelFacingPromptText: "Start and stop before provider",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "interrupted",
      assistantMessageText: "",
      interruptionReason: "Interrupted by user.",
    },
  ]);
});

test("AssistantConversationRuntime interrupts a pending tool approval", async () => {
  const providerTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      {
        type: "tool_call_requested",
        toolCallId: "call_bash_1",
        toolCallRequest: {
          toolName: "bash",
          shellCommand: "mkdir interrupted-approval-test",
          commandDescription: "Show interrupted approval flow",
        },
      },
    ],
  });
  const provider = new RecordingConversationTurnProvider([providerTurn]);
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath: process.cwd(),
    bashToolApprovalMode: "risk_based",
  });
  const activeConversationTurn = runtime.startConversationTurn({
    userPromptText: "Try interrupted approval",
    selectedModelId: "gpt-5.4",
  });
  const assistantEventIterator = activeConversationTurn.streamAssistantResponseEvents()[Symbol.asyncIterator]();
  const emittedAssistantEvents = [];

  emittedAssistantEvents.push((await assistantEventIterator.next()).value);
  emittedAssistantEvents.push((await assistantEventIterator.next()).value);
  emittedAssistantEvents.push((await assistantEventIterator.next()).value);
  activeConversationTurn.interrupt();

  while (true) {
    const nextAssistantEvent = await assistantEventIterator.next();
    if (nextAssistantEvent.done) {
      break;
    }

    emittedAssistantEvents.push(nextAssistantEvent.value);
  }

  expect(emittedAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_turn_started",
    "assistant_message_part_added",
    "assistant_pending_tool_approval_requested",
    "assistant_pending_tool_approval_cleared",
    "assistant_message_interrupted",
  ]);
  expect(providerTurn.submittedToolResults).toEqual([]);
  expect(runtime.conversationHistory.listConversationSessionEntries().at(-1)).toMatchObject({
    entryKind: "assistant_message",
    assistantMessageStatus: "interrupted",
  });
});

test("AssistantConversationRuntime interrupts a running bash tool call", async () => {
  const providerTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      {
        type: "tool_call_requested",
        toolCallId: "call_bash_1",
        toolCallRequest: {
          toolName: "bash",
          shellCommand: "sleep 10",
          commandDescription: "Wait until interrupted",
        },
      },
    ],
  });
  const provider = new RecordingConversationTurnProvider([providerTurn]);
  let receivedAbortSignal: AbortSignal | undefined;
  let resolveShellStarted: (() => void) | undefined;
  const shellStartedPromise = new Promise<void>((resolve) => {
    resolveShellStarted = resolve;
  });
  const workspaceShellCommandExecutor = {
    workspaceRootPath: process.cwd(),
    shellExecutablePath: process.env.SHELL ?? "/bin/zsh",
    async runShellCommand(input) {
      receivedAbortSignal = input.abortSignal;
      resolveShellStarted?.();
      if (input.abortSignal?.aborted) {
        throw new Error("bash aborted");
      }

      await new Promise<void>((_resolve, reject) => {
        input.abortSignal?.addEventListener("abort", () => reject(new Error("bash aborted")), { once: true });
      });
      return {
        exitCode: 0,
        stdoutText: "",
        stderrText: "",
      };
    },
  } satisfies WorkspaceShellCommandExecutor;
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath: process.cwd(),
    workspaceShellCommandExecutor,
  });
  const activeConversationTurn = runtime.startConversationTurn({
    userPromptText: "Try interrupted bash",
    selectedModelId: "gpt-5.4",
  });
  const assistantEventIterator = activeConversationTurn.streamAssistantResponseEvents()[Symbol.asyncIterator]();
  const emittedAssistantEvents = [];

  emittedAssistantEvents.push((await assistantEventIterator.next()).value);
  emittedAssistantEvents.push((await assistantEventIterator.next()).value);
  const pendingInterruptedAssistantEvent = assistantEventIterator.next();
  await shellStartedPromise;
  activeConversationTurn.interrupt();
  emittedAssistantEvents.push((await pendingInterruptedAssistantEvent).value);

  while (true) {
    const nextAssistantEvent = await assistantEventIterator.next();
    if (nextAssistantEvent.done) {
      break;
    }

    emittedAssistantEvents.push(nextAssistantEvent.value);
  }

  expect(receivedAbortSignal?.aborted).toBe(true);
  expect(emittedAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_turn_started",
    "assistant_message_part_added",
    "assistant_message_interrupted",
  ]);
});

test("AssistantConversationRuntime emits a dedicated pending approval event and denied tool part update", async () => {
  const providerTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      {
        type: "tool_call_requested",
        toolCallId: "call_bash_1",
        toolCallRequest: {
          toolName: "bash",
          shellCommand: "mkdir denied-test",
          commandDescription: "Show denied flow",
        },
      },
    ],
    afterToolResultEvents: [
      { type: "text_chunk", text: "Denied acknowledged." },
      { type: "completed", usage: { total: 20, input: 10, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
  });
  const provider = new RecordingConversationTurnProvider([providerTurn]);
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath: process.cwd(),
    bashToolApprovalMode: "risk_based",
  });
  const activeConversationTurn = runtime.startConversationTurn({
    userPromptText: "Try denied bash",
    selectedModelId: "gpt-5.4",
  });
  const assistantEventIterator = activeConversationTurn.streamAssistantResponseEvents()[Symbol.asyncIterator]();
  const emittedAssistantEvents = [];

  emittedAssistantEvents.push((await assistantEventIterator.next()).value);
  emittedAssistantEvents.push((await assistantEventIterator.next()).value);
  const approvalEventResult = await assistantEventIterator.next();
  emittedAssistantEvents.push(approvalEventResult.value);
  if (approvalEventResult.value?.type !== "assistant_pending_tool_approval_requested") {
    throw new Error("expected assistant_pending_tool_approval_requested");
  }

  await activeConversationTurn.denyPendingToolCall(approvalEventResult.value.approvalRequest.approvalId);

  while (true) {
    const nextAssistantEvent = await assistantEventIterator.next();
    if (nextAssistantEvent.done) {
      break;
    }

    emittedAssistantEvents.push(nextAssistantEvent.value);
  }

  expect(emittedAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_turn_started",
    "assistant_message_part_added",
    "assistant_pending_tool_approval_requested",
    "assistant_pending_tool_approval_cleared",
    "assistant_message_part_updated",
    "assistant_message_part_added",
    "assistant_message_part_added",
    "assistant_message_part_updated",
    "assistant_message_completed",
  ]);
  expect(providerTurn.submittedToolResults).toEqual([
    {
      toolCallId: "call_bash_1",
      toolResultText: "The user denied this bash command, so it was not executed.",
    },
  ]);
});

test("AssistantConversationRuntime approves a pending bash tool call and continues the turn", async () => {
  const providerTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      {
        type: "tool_call_requested",
        toolCallId: "call_bash_1",
        toolCallRequest: {
          toolName: "bash",
          shellCommand: "mkdir approved-test",
          commandDescription: "Show approved flow",
        },
      },
    ],
    afterToolResultEvents: [
      { type: "text_chunk", text: "Approved acknowledged." },
      { type: "completed", usage: { total: 20, input: 10, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
  });
  const provider = new RecordingConversationTurnProvider([providerTurn]);
  const executedShellCommands: string[] = [];
  const workspaceShellCommandExecutor = {
    workspaceRootPath: process.cwd(),
    shellExecutablePath: process.env.SHELL ?? "/bin/zsh",
    async runShellCommand(input) {
      executedShellCommands.push(input.shellCommand);
      return {
        exitCode: 0,
        stdoutText: "approved\n",
        stderrText: "",
      };
    },
  } satisfies WorkspaceShellCommandExecutor;
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath: process.cwd(),
    workspaceShellCommandExecutor,
    bashToolApprovalMode: "risk_based",
  });
  const activeConversationTurn = runtime.startConversationTurn({
    userPromptText: "Try approved bash",
    selectedModelId: "gpt-5.4",
  });
  const assistantEventIterator = activeConversationTurn.streamAssistantResponseEvents()[Symbol.asyncIterator]();
  const emittedAssistantEvents = [];

  emittedAssistantEvents.push((await assistantEventIterator.next()).value);
  emittedAssistantEvents.push((await assistantEventIterator.next()).value);
  const approvalEventResult = await assistantEventIterator.next();
  emittedAssistantEvents.push(approvalEventResult.value);
  if (approvalEventResult.value?.type !== "assistant_pending_tool_approval_requested") {
    throw new Error("expected assistant_pending_tool_approval_requested");
  }

  await activeConversationTurn.approvePendingToolCall(approvalEventResult.value.approvalRequest.approvalId);

  while (true) {
    const nextAssistantEvent = await assistantEventIterator.next();
    if (nextAssistantEvent.done) {
      break;
    }

    emittedAssistantEvents.push(nextAssistantEvent.value);
  }

  expect(emittedAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_turn_started",
    "assistant_message_part_added",
    "assistant_pending_tool_approval_requested",
    "assistant_pending_tool_approval_cleared",
    "assistant_message_part_updated",
    "assistant_message_part_updated",
    "assistant_message_part_added",
    "assistant_message_part_added",
    "assistant_message_part_updated",
    "assistant_message_completed",
  ]);
  expect(executedShellCommands).toEqual(["mkdir approved-test"]);
  expect(providerTurn.submittedToolResults[0]?.toolResultText).toContain("approved");
});

test("AssistantConversationRuntime auto-runs bash tool calls by default", async () => {
  const providerTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      {
        type: "tool_call_requested",
        toolCallId: "call_bash_1",
        toolCallRequest: {
          toolName: "bash",
          shellCommand: 'bash -lc "printf trusted"',
          commandDescription: "Show trusted flow",
        },
      },
    ],
    afterToolResultEvents: [
      { type: "text_chunk", text: "Trusted acknowledged." },
      { type: "completed", usage: { total: 20, input: 10, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
  });
  const provider = new RecordingConversationTurnProvider([providerTurn]);
  const executedShellCommands: string[] = [];
  const workspaceShellCommandExecutor = {
    workspaceRootPath: process.cwd(),
    shellExecutablePath: process.env.SHELL ?? "/bin/zsh",
    async runShellCommand(input) {
      executedShellCommands.push(input.shellCommand);
      return {
        exitCode: 0,
        stdoutText: "trusted\n",
        stderrText: "",
      };
    },
  } satisfies WorkspaceShellCommandExecutor;
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath: process.cwd(),
    workspaceShellCommandExecutor,
  });

  const emittedAssistantEvents = await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "Try trusted bash",
      selectedModelId: "gpt-5.4",
    }),
  );

  expect(emittedAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).not.toContain(
    "assistant_pending_tool_approval_requested",
  );
  expect(executedShellCommands).toEqual(['bash -lc "printf trusted"']);
  expect(providerTurn.submittedToolResults).toHaveLength(1);
  expect(providerTurn.submittedToolResults[0]?.toolResultText).toContain("trusted");
});

test("AssistantConversationRuntime auto-runs read-only tool calls without approval", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-runtime-read-tool-"));
  await writeFile(join(workspaceRootPath, "notes.txt"), "alpha\nbeta\n", "utf8");
  const providerTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      {
        type: "tool_call_requested",
        toolCallId: "call_read_1",
        toolCallRequest: {
          toolName: "read",
          readTargetPath: "notes.txt",
        },
      },
    ],
    afterToolResultEvents: [
      { type: "text_chunk", text: "Read acknowledged." },
      { type: "completed", usage: { total: 20, input: 10, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
  });
  const provider = new RecordingConversationTurnProvider([providerTurn]);
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath,
    promptContextBrowseRootPath: workspaceRootPath,
  });

  const emittedAssistantEvents = await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "Read notes",
      selectedModelId: "gpt-5.4",
    }),
  );

  expect(emittedAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).not.toContain(
    "assistant_pending_tool_approval_requested",
  );
  expect(providerTurn.submittedToolResults[0]?.toolResultText).toContain("1: alpha");
  expect(runtime.conversationHistory.listConversationSessionEntries()).toMatchObject([
    { entryKind: "user_prompt" },
    { entryKind: "tool_call", toolCallId: "call_read_1" },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_read_1",
      toolCallDetail: { toolName: "read", readFilePath: "notes.txt" },
    },
    { entryKind: "assistant_message", assistantMessageStatus: "completed" },
  ]);
});

test("AssistantConversationRuntime submits failed read-only tool results back to the provider", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-runtime-failed-grep-tool-"));
  await writeFile(join(workspaceRootPath, "notes.txt"), "alpha\n", "utf8");
  const providerTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      {
        type: "tool_call_requested",
        toolCallId: "call_grep_1",
        toolCallRequest: {
          toolName: "grep",
          regexPattern: "[",
        },
      },
    ],
    afterToolResultEvents: [
      { type: "text_chunk", text: "Failure acknowledged." },
      { type: "completed", usage: { total: 20, input: 10, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
  });
  const provider = new RecordingConversationTurnProvider([providerTurn]);
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath,
    promptContextBrowseRootPath: workspaceRootPath,
  });

  const emittedAssistantEvents = await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "Search notes",
      selectedModelId: "gpt-5.4",
    }),
  );
  const failedToolCallEvent = emittedAssistantEvents.find(
    (assistantResponseEvent) =>
      assistantResponseEvent.type === "assistant_message_part_updated" &&
      assistantResponseEvent.part.partKind === "assistant_tool_call" &&
      assistantResponseEvent.part.toolCallStatus === "failed",
  );

  expect(failedToolCallEvent).toBeDefined();
  expect(providerTurn.submittedToolResults).toEqual([
    {
      toolCallId: "call_grep_1",
      toolResultText: expect.stringContaining("Grep failed: Invalid regular expression"),
    },
  ]);
  expect(runtime.conversationHistory.listConversationSessionEntries()).toMatchObject([
    { entryKind: "user_prompt" },
    { entryKind: "tool_call", toolCallId: "call_grep_1" },
    { entryKind: "failed_tool_result", toolCallId: "call_grep_1" },
    { entryKind: "assistant_message", assistantMessageStatus: "completed" },
  ]);
});

test("AssistantConversationRuntime submits failed bash tool results back to the provider", async () => {
  const providerTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      {
        type: "tool_call_requested",
        toolCallId: "call_bash_1",
        toolCallRequest: {
          toolName: "bash",
          shellCommand: "pwd",
          commandDescription: "Show failed tool flow",
        },
      },
    ],
    afterToolResultEvents: [
      { type: "text_chunk", text: "Failure acknowledged." },
      { type: "completed", usage: { total: 20, input: 10, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
  });
  const provider = new RecordingConversationTurnProvider([providerTurn]);
  const workspaceShellCommandExecutor = {
    workspaceRootPath: process.cwd(),
    shellExecutablePath: process.env.SHELL ?? "/bin/zsh",
    async runShellCommand() {
      throw new Error("executor failed");
    },
  } satisfies WorkspaceShellCommandExecutor;
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath: process.cwd(),
    workspaceShellCommandExecutor,
  });

  const emittedAssistantEvents = await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "Try failed bash",
      selectedModelId: "gpt-5.4",
    }),
  );
  const failedToolCallEvent = emittedAssistantEvents.find(
    (assistantResponseEvent) =>
      assistantResponseEvent.type === "assistant_message_part_updated" &&
      assistantResponseEvent.part.partKind === "assistant_tool_call" &&
      assistantResponseEvent.part.toolCallStatus === "failed",
  );

  expect(failedToolCallEvent).toBeDefined();
  expect(providerTurn.submittedToolResults[0]?.toolResultText).toContain(
    "Command execution failed before completion: executor failed",
  );
});

test("AssistantConversationRuntime marks the turn failed when tool result submission fails", async () => {
  const providerTurn = new ThrowingToolResultProviderTurn({
    beforeToolResultEvents: [
      {
        type: "tool_call_requested",
        toolCallId: "call_bash_1",
        toolCallRequest: {
          toolName: "bash",
          shellCommand: "pwd",
          commandDescription: "Show tool submission failure",
        },
      },
    ],
  });
  const provider = new RecordingConversationTurnProvider([providerTurn]);
  const workspaceShellCommandExecutor = {
    workspaceRootPath: process.cwd(),
    shellExecutablePath: process.env.SHELL ?? "/bin/zsh",
    async runShellCommand() {
      return {
        exitCode: 0,
        stdoutText: "ok\n",
        stderrText: "",
      };
    },
  } satisfies WorkspaceShellCommandExecutor;
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath: process.cwd(),
    workspaceShellCommandExecutor,
  });

  const emittedAssistantEvents = await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "Try submission failure",
      selectedModelId: "gpt-5.4",
    }),
  );

  expect(emittedAssistantEvents.at(-1)).toMatchObject({
    type: "assistant_message_failed",
    errorText: "tool result submission failed",
  });
  expect(runtime.conversationHistory.listConversationSessionEntries()).toMatchObject([
    {
      entryKind: "user_prompt",
      promptText: "Try submission failure",
      modelFacingPromptText: "Try submission failure",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_bash_1",
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_bash_1",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "failed",
      assistantMessageText: "",
      failureExplanation: "tool result submission failed",
    },
  ]);
  expect(runtime.conversationHistory.listModelContextItems()).toEqual<ModelContextItem[]>([]);
});

test("AssistantConversationRuntime reuses prior user and assistant messages on the next turn", async () => {
  const firstProviderTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      { type: "text_chunk", text: "First answer" },
      { type: "completed", usage: { total: 10, input: 5, output: 5, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
  });
  const secondProviderTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      { type: "text_chunk", text: "Second answer" },
      { type: "completed", usage: { total: 12, input: 6, output: 6, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
  });
  const provider = new RecordingConversationTurnProvider([firstProviderTurn, secondProviderTurn]);
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath: process.cwd(),
  });

  await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "First prompt",
      selectedModelId: "gpt-5.4",
    }),
  );
  await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "Second prompt",
      selectedModelId: "gpt-5.4",
    }),
  );

  expect(provider.startedTurnRequests[1]?.modelContextItems).toEqual<ModelContextItem[]>([
    { itemKind: "user_message", messageText: "First prompt" },
    { itemKind: "assistant_message", messageText: "First answer" },
    { itemKind: "user_message", messageText: "Second prompt" },
  ]);
});
