import { expect, test } from "bun:test";
import type { ModelContextItem, ProviderStreamEvent, ProviderTurnReplay } from "@buli/contracts";
import type { ConversationTurnProvider, ProviderConversationTurn, ProviderConversationTurnRequest } from "../src/index.ts";
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
