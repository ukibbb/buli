import { expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelContextItem, ProviderStreamEvent, ProviderTurnReplay } from "@buli/contracts";
import type { ConversationTurnProvider, ProviderConversationTurn, ProviderConversationTurnRequest } from "../src/index.ts";
import { AssistantConversationRuntime, WorkspaceShellCommandExecutor } from "../src/index.ts";

function toPortablePath(pathText: string): string {
  return pathText.replaceAll("\\", "/");
}

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

async function collectAssistantEvents(activeConversationTurn: ReturnType<AssistantConversationRuntime["startConversationTurn"]>) {
  const emittedAssistantEvents = [];
  for await (const assistantResponseEvent of activeConversationTurn.streamAssistantResponseEvents()) {
    emittedAssistantEvents.push(assistantResponseEvent);
  }
  return emittedAssistantEvents;
}

test("AssistantConversationRuntime emits started, streamed text, turn footer, and completed response events", async () => {
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
  expect(emittedAssistantEvents).toEqual([
    { type: "assistant_response_started", model: "gpt-5.4", messageId: expect.any(String) },
    {
      type: "assistant_response_stream_projection_updated",
      messageId: expect.any(String),
      textDelta: "Hello",
      projection: {
        fullResponseText: "Hello",
        completedContentParts: [],
        openContentPart: { kind: "streaming_markdown_text", text: "Hello" },
      },
    },
    {
      type: "assistant_response_stream_projection_updated",
      messageId: expect.any(String),
      textDelta: " world",
      projection: {
        fullResponseText: "Hello world",
        completedContentParts: [],
        openContentPart: { kind: "streaming_markdown_text", text: "Hello world" },
      },
    },
    {
      type: "assistant_turn_completed",
      turnDurationMs: expect.any(Number),
      modelDisplayName: "gpt-5.4",
    },
    {
      type: "assistant_response_completed",
      message: {
        id: expect.any(String),
        role: "assistant",
        text: "Hello world",
        assistantContentParts: expect.any(Array),
      },
      usage: {
        total: 180,
        input: 100,
        output: 50,
        reasoning: 30,
        cache: { read: 20, write: 0 },
      },
    },
  ]);
});

test("AssistantConversationRuntime reuses prior user and assistant messages on the next turn", async () => {
  const firstProviderTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      { type: "text_chunk", text: "First answer" },
      { type: "completed", usage: { total: 10, input: 5, output: 5, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
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

  const secondTurnModelContextItems = provider.startedTurnRequests[1]?.modelContextItems;
  expect(secondTurnModelContextItems).toEqual<ModelContextItem[]>([
    { itemKind: "user_message", messageText: "First prompt" },
    { itemKind: "assistant_message", messageText: "First answer" },
    { itemKind: "user_message", messageText: "Second prompt" },
  ]);
  expect(provider.startedTurnRequests[1]?.conversationSessionEntries).toContainEqual({
    entryKind: "assistant_message",
    assistantMessageText: "First answer",
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
  });
});

test("AssistantConversationRuntime emits explicit denied-tool events and stores denied tool results in history", async () => {
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
  });
  const activeConversationTurn = runtime.startConversationTurn({
    userPromptText: "Try denied bash",
    selectedModelId: "gpt-5.4",
  });
  const assistantEventIterator = activeConversationTurn.streamAssistantResponseEvents()[Symbol.asyncIterator]();
  const emittedAssistantEvents = [];

  emittedAssistantEvents.push((await assistantEventIterator.next()).value);
  const approvalEventResult = await assistantEventIterator.next();
  emittedAssistantEvents.push(approvalEventResult.value);
  if (approvalEventResult.value?.type !== "assistant_tool_approval_requested") {
    throw new Error("expected assistant_tool_approval_requested");
  }

  await activeConversationTurn.denyPendingToolCall(approvalEventResult.value.approvalId);

  while (true) {
    const nextAssistantEvent = await assistantEventIterator.next();
    if (nextAssistantEvent.done) {
      break;
    }

    emittedAssistantEvents.push(nextAssistantEvent.value);
  }

  expect(emittedAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_response_started",
    "assistant_tool_approval_requested",
    "assistant_tool_call_denied",
    "assistant_response_stream_projection_updated",
    "assistant_turn_completed",
    "assistant_response_completed",
  ]);
  expect(providerTurn.submittedToolResults).toEqual([
    {
      toolCallId: "call_bash_1",
      toolResultText: "The user denied this bash command, so it was not executed.",
    },
  ]);
  expect(runtime.conversationHistory.listConversationSessionEntries()).toContainEqual({
    entryKind: "denied_tool_result",
    toolCallId: "call_bash_1",
    toolCallDetail: {
      toolName: "bash",
      commandLine: "mkdir denied-test",
      commandDescription: "Show denied flow",
    },
    toolResultText: "The user denied this bash command, so it was not executed.",
    denialExplanation: "The user denied this bash command, so it was not executed.",
  });
});

test("AssistantConversationRuntime auto-runs clearly non-destructive bash commands without approval", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-engine-runtime-"));
  const providerTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      {
        type: "tool_call_requested",
        toolCallId: "call_bash_1",
        toolCallRequest: {
          toolName: "bash",
          shellCommand: "pwd",
          commandDescription: "Print working directory",
        },
      },
    ],
    afterToolResultEvents: [
      { type: "text_chunk", text: "Ran pwd." },
      { type: "completed", usage: { total: 18, input: 9, output: 9, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
  });
  const provider = new RecordingConversationTurnProvider([providerTurn]);
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath,
    promptContextBrowseRootPath: workspaceRootPath,
    workspaceShellCommandExecutor: new WorkspaceShellCommandExecutor({ workspaceRootPath, shellExecutablePath: "/bin/zsh" }),
  });

  const emittedAssistantEvents = await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "Run pwd",
      selectedModelId: "gpt-5.4",
    }),
  );

  expect(emittedAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_response_started",
    "assistant_tool_call_started",
    "assistant_tool_call_completed",
    "assistant_response_stream_projection_updated",
    "assistant_turn_completed",
    "assistant_response_completed",
  ]);
  expect(providerTurn.submittedToolResults).toHaveLength(1);
  expect(providerTurn.submittedToolResults[0]?.toolResultText).toContain(`Working directory: ${workspaceRootPath}`);
});

test("AssistantConversationRuntime executes approved destructive bash tool calls and carries tool history into the next turn", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-engine-runtime-"));
  const firstProviderTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      {
        type: "tool_call_requested",
        toolCallId: "call_bash_1",
        toolCallRequest: {
          toolName: "bash",
          shellCommand: "mkdir created-by-buli",
          commandDescription: "Create a test directory",
        },
      },
    ],
    afterToolResultEvents: [
      { type: "text_chunk", text: "Created the directory." },
      { type: "completed", usage: { total: 18, input: 9, output: 9, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
  });
  const secondProviderTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      { type: "text_chunk", text: "Remembered." },
      { type: "completed", usage: { total: 16, input: 8, output: 8, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
  });
  const provider = new RecordingConversationTurnProvider([firstProviderTurn, secondProviderTurn]);
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath,
    promptContextBrowseRootPath: workspaceRootPath,
    workspaceShellCommandExecutor: new WorkspaceShellCommandExecutor({ workspaceRootPath, shellExecutablePath: "/bin/zsh" }),
  });
  const activeConversationTurn = runtime.startConversationTurn({
    userPromptText: "Create a directory",
    selectedModelId: "gpt-5.4",
  });
  const assistantEventIterator = activeConversationTurn.streamAssistantResponseEvents()[Symbol.asyncIterator]();
  const emittedAssistantEvents = [];

  emittedAssistantEvents.push((await assistantEventIterator.next()).value);
  const approvalEventResult = await assistantEventIterator.next();
  emittedAssistantEvents.push(approvalEventResult.value);
  if (approvalEventResult.value?.type !== "assistant_tool_approval_requested") {
    throw new Error("expected assistant_tool_approval_requested");
  }

  await activeConversationTurn.approvePendingToolCall(approvalEventResult.value.approvalId);

  while (true) {
    const nextAssistantEvent = await assistantEventIterator.next();
    if (nextAssistantEvent.done) {
      break;
    }

    emittedAssistantEvents.push(nextAssistantEvent.value);
  }

  expect(emittedAssistantEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_response_started",
    "assistant_tool_approval_requested",
    "assistant_tool_call_started",
    "assistant_tool_call_completed",
    "assistant_response_stream_projection_updated",
    "assistant_turn_completed",
    "assistant_response_completed",
  ]);
  expect(firstProviderTurn.submittedToolResults).toHaveLength(1);
  expect(firstProviderTurn.submittedToolResults[0]?.toolResultText).toContain("Command: mkdir created-by-buli");
  await realpath(join(workspaceRootPath, "created-by-buli"));

  await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "What command did you run earlier?",
      selectedModelId: "gpt-5.4",
    }),
  );

  expect(provider.startedTurnRequests[1]?.modelContextItems).toEqual<ModelContextItem[]>([
    { itemKind: "user_message", messageText: "Create a directory" },
    {
      itemKind: "tool_call",
      toolCallId: "call_bash_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "mkdir created-by-buli",
        commandDescription: "Create a test directory",
      },
    },
    {
      itemKind: "tool_result",
      toolCallId: "call_bash_1",
      toolResultText: expect.stringContaining("Command: mkdir created-by-buli"),
    },
    { itemKind: "assistant_message", messageText: "Created the directory." },
    { itemKind: "user_message", messageText: "What command did you run earlier?" },
  ]);
});

test("AssistantConversationRuntime replays the stored model-facing prompt snapshot even after the referenced file changes", async () => {
  const promptContextBrowseRootPath = await mkdtemp(join(tmpdir(), "buli-prompt-context-history-"));
  const referencedFilePath = join(promptContextBrowseRootPath, "notes.txt");
  await Bun.write(referencedFilePath, "first file contents");
  const realReferencedFilePath = await realpath(referencedFilePath);

  const firstProviderTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      { type: "text_chunk", text: "Stored the context." },
      { type: "completed", usage: { total: 8, input: 4, output: 4, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
  });
  const secondProviderTurn = new ScriptedProviderTurn({
    beforeToolResultEvents: [
      { type: "text_chunk", text: "Remembered the old file." },
      { type: "completed", usage: { total: 8, input: 4, output: 4, reasoning: 0, cache: { read: 0, write: 0 } } },
    ],
  });
  const provider = new RecordingConversationTurnProvider([firstProviderTurn, secondProviderTurn]);
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath,
  });

  await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "Inspect @notes.txt",
      selectedModelId: "gpt-5.4",
    }),
  );
  await Bun.write(referencedFilePath, "second file contents");

  await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "What did the earlier notes say?",
      selectedModelId: "gpt-5.4",
    }),
  );

  expect(provider.startedTurnRequests[0]?.modelContextItems).toEqual<ModelContextItem[]>([
    {
      itemKind: "user_message",
      messageText:
        `Inspect @notes.txt\n\nAttached prompt context:\n\n<context_file path=\"${toPortablePath(realReferencedFilePath)}\">\nfirst file contents\n</context_file>`,
    },
  ]);
  expect(provider.startedTurnRequests[1]?.modelContextItems).toEqual<ModelContextItem[]>([
    {
      itemKind: "user_message",
      messageText:
        `Inspect @notes.txt\n\nAttached prompt context:\n\n<context_file path=\"${toPortablePath(realReferencedFilePath)}\">\nfirst file contents\n</context_file>`,
    },
    { itemKind: "assistant_message", messageText: "Stored the context." },
    { itemKind: "user_message", messageText: "What did the earlier notes say?" },
  ]);
  expect(runtime.conversationHistory.listConversationSessionEntries()[0]).toEqual({
    entryKind: "user_prompt",
    promptText: "Inspect @notes.txt",
    modelFacingPromptText:
      `Inspect @notes.txt\n\nAttached prompt context:\n\n<context_file path=\"${toPortablePath(realReferencedFilePath)}\">\nfirst file contents\n</context_file>`,
  });
});

test("AssistantConversationRuntime resolves prompt-context references from the configured starting directory", async () => {
  const promptContextBrowseRootPath = await mkdtemp(join(tmpdir(), "buli-runtime-parent-context-"));
  const repositoryPath = join(promptContextBrowseRootPath, "repo");
  await mkdir(repositoryPath);
  await Bun.write(join(promptContextBrowseRootPath, "shared.txt"), "outside repo");

  const provider = new RecordingConversationTurnProvider([
    new ScriptedProviderTurn({
      beforeToolResultEvents: [
        { type: "completed", usage: { total: 4, input: 2, output: 2, reasoning: 0, cache: { read: 0, write: 0 } } },
      ],
    }),
  ]);
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: repositoryPath,
    promptContextBrowseRootPath,
    promptContextStartingDirectoryPath: repositoryPath,
  });
  const realSharedFilePath = await realpath(join(promptContextBrowseRootPath, "shared.txt"));

  await collectAssistantEvents(
    runtime.startConversationTurn({
      userPromptText: "Inspect @../shared.txt",
      selectedModelId: "gpt-5.4",
    }),
  );

  expect(provider.startedTurnRequests[0]?.modelContextItems).toEqual<ModelContextItem[]>([
    {
      itemKind: "user_message",
      messageText:
        `Inspect @../shared.txt\n\nAttached prompt context:\n\n<context_file path=\"${toPortablePath(realSharedFilePath)}\">\noutside repo\n</context_file>`,
    },
  ]);
});
