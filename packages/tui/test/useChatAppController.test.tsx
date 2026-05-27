import { expect, test } from "bun:test";
import type { AssistantResponseEvent, ConversationSessionEntry, TokenUsage, UserPromptImageAttachment } from "@buli/contracts";
import type { AssistantConversationRunner, ConversationAutoCompactionResult, ConversationTurnRequest } from "@buli/engine";
import {
  useChatAppController,
  type UseChatAppControllerInput,
  type UseChatAppControllerResult,
} from "@buli/chat-app-controller";
import { act } from "react";
import { testRender } from "./testRenderWithCleanup.ts";

type RenderedChatAppControllerHook = {
  readCurrentController: () => UseChatAppControllerResult;
  readRenderCount: () => number;
  typeText: (text: string) => Promise<void>;
  pressReturn: () => Promise<void>;
  pressEscape: () => Promise<void>;
  flushHookEffects: () => Promise<void>;
  cleanup: () => Promise<void>;
};

type ControlledAssistantTurn = {
  conversationTurnRequest: ConversationTurnRequest;
  complete: () => void;
  interrupt: () => void;
  readWasInterrupted: () => boolean;
};

type ControlledAssistantConversationRunner = {
  assistantConversationRunner: AssistantConversationRunner;
  startedTurns: ControlledAssistantTurn[];
};

type ExternallyDrivenAssistantResponseEventStream = {
  queuedAssistantResponseEvents: AssistantResponseEvent[];
  isClosed: boolean;
  resumeAssistantResponseEventStream: (() => void) | undefined;
};

type ExternallyDrivenAssistantConversationRunner = {
  assistantConversationRunner: AssistantConversationRunner;
  startedTurnRequests: ConversationTurnRequest[];
  emitAssistantResponseEvent: (assistantResponseEvent: AssistantResponseEvent) => void;
};

const zeroTokenUsage = {
  input: 0,
  output: 0,
  reasoning: 0,
  total: undefined,
  cache: { read: 0, write: 0 },
} satisfies TokenUsage;

const neverEmittingAssistantConversationRunner: AssistantConversationRunner = {
  startConversationTurn() {
    return {
      async *streamAssistantResponseEvents() {
        return;
      },
      async approvePendingToolCall() {},
      async denyPendingToolCall() {},
      interrupt() {},
    };
  },
};

async function renderChatAppControllerHook(
  input: Partial<UseChatAppControllerInput> = {},
): Promise<RenderedChatAppControllerHook> {
  let latestController: UseChatAppControllerResult | undefined;
  let renderCount = 0;
  const renderedHook = await testRender(
    <ChatAppControllerHookProbe
      controllerInput={input}
      observeController={(controller) => {
        renderCount += 1;
        latestController = controller;
      }}
    />,
  );

  const readCurrentController = (): UseChatAppControllerResult => {
    if (!latestController) {
      throw new Error("Chat app controller hook did not render.");
    }

    return latestController;
  };

  return {
    readCurrentController,
    readRenderCount: () => renderCount,
    async typeText(text: string): Promise<void> {
      for (const character of text) {
        await act(async () => {
          readCurrentController().applyChatAppKeyboardInput({
            chatSessionKeyboardInput: {
              keyName: undefined,
              textInput: character,
              isCtrlPressed: false,
              isMetaPressed: false,
            },
          });
        });
        await renderedHook.renderOnce();
      }
    },
    async pressReturn(): Promise<void> {
      await act(async () => {
        readCurrentController().applyChatAppKeyboardInput({
          chatSessionKeyboardInput: {
            keyName: "return",
            textInput: undefined,
            isCtrlPressed: false,
            isMetaPressed: false,
          },
        });
      });
      await renderedHook.renderOnce();
    },
    async pressEscape(): Promise<void> {
      await act(async () => {
        readCurrentController().applyChatAppKeyboardInput({
          chatSessionKeyboardInput: {
            keyName: "escape",
            textInput: undefined,
            isCtrlPressed: false,
            isMetaPressed: false,
          },
        });
      });
      await renderedHook.renderOnce();
    },
    async flushHookEffects(): Promise<void> {
      await act(async () => {
        await Promise.resolve();
      });
      await renderedHook.renderOnce();
    },
    cleanup: renderedHook.cleanup,
  };
}

function createControlledAssistantConversationRunner(): ControlledAssistantConversationRunner {
  const startedTurns: ControlledAssistantTurn[] = [];

  return {
    startedTurns,
    assistantConversationRunner: {
      startConversationTurn(conversationTurnRequest) {
        const turnIndex = startedTurns.length;
        const messageId = `assistant-${turnIndex}`;
        let wasInterrupted = false;
        let wasSettled = false;
        let settleTurn: (outcome: "completed" | "interrupted") => void = () => {};
        const turnOutcomePromise = new Promise<"completed" | "interrupted">((resolve) => {
          settleTurn = resolve;
        });
        const settleOnce = (outcome: "completed" | "interrupted"): void => {
          if (wasSettled) {
            return;
          }

          wasSettled = true;
          settleTurn(outcome);
        };

        const controlledAssistantTurn: ControlledAssistantTurn = {
          conversationTurnRequest,
          complete: () => settleOnce("completed"),
          interrupt: () => {
            wasInterrupted = true;
            settleOnce("interrupted");
          },
          readWasInterrupted: () => wasInterrupted,
        };
        startedTurns.push(controlledAssistantTurn);

        return {
          async *streamAssistantResponseEvents() {
            yield { type: "assistant_turn_started" as const, messageId, startedAtMs: turnIndex };
            const turnOutcome = await turnOutcomePromise;
            if (turnOutcome === "completed") {
              yield { type: "assistant_message_completed" as const, messageId, usage: zeroTokenUsage };
              return;
            }

            yield {
              type: "assistant_message_interrupted" as const,
              messageId,
              interruptionReason: "Interrupted by test.",
            };
          },
          async approvePendingToolCall() {},
          async denyPendingToolCall() {},
          interrupt: controlledAssistantTurn.interrupt,
        };
      },
    },
  };
}

function createExternallyDrivenAssistantConversationRunner(): ExternallyDrivenAssistantConversationRunner {
  const startedTurnRequests: ConversationTurnRequest[] = [];
  let activeAssistantResponseEventStream: ExternallyDrivenAssistantResponseEventStream | undefined;

  const wakeActiveAssistantResponseEventStream = (): void => {
    const resumeAssistantResponseEventStream = activeAssistantResponseEventStream?.resumeAssistantResponseEventStream;
    if (activeAssistantResponseEventStream) {
      activeAssistantResponseEventStream.resumeAssistantResponseEventStream = undefined;
    }
    resumeAssistantResponseEventStream?.();
  };

  return {
    startedTurnRequests,
    emitAssistantResponseEvent(assistantResponseEvent) {
      if (!activeAssistantResponseEventStream) {
        throw new Error("Assistant response event stream has not started.");
      }

      activeAssistantResponseEventStream.queuedAssistantResponseEvents.push(assistantResponseEvent);
      if (isTerminalAssistantResponseEventForTest(assistantResponseEvent)) {
        activeAssistantResponseEventStream.isClosed = true;
      }
      wakeActiveAssistantResponseEventStream();
    },
    assistantConversationRunner: {
      startConversationTurn(conversationTurnRequest) {
        startedTurnRequests.push(conversationTurnRequest);
        const assistantResponseEventStream: ExternallyDrivenAssistantResponseEventStream = {
          queuedAssistantResponseEvents: [],
          isClosed: false,
          resumeAssistantResponseEventStream: undefined,
        };
        activeAssistantResponseEventStream = assistantResponseEventStream;

        return {
          async *streamAssistantResponseEvents() {
            while (true) {
              const nextAssistantResponseEvent = assistantResponseEventStream.queuedAssistantResponseEvents.shift();
              if (nextAssistantResponseEvent) {
                yield nextAssistantResponseEvent;
                continue;
              }

              if (assistantResponseEventStream.isClosed) {
                return;
              }

              await new Promise<void>((resolve) => {
                assistantResponseEventStream.resumeAssistantResponseEventStream = resolve;
              });
            }
          },
          async approvePendingToolCall() {},
          async denyPendingToolCall() {},
          interrupt() {
            assistantResponseEventStream.isClosed = true;
            wakeActiveAssistantResponseEventStream();
          },
        };
      },
    },
  };
}

function isTerminalAssistantResponseEventForTest(assistantResponseEvent: AssistantResponseEvent): boolean {
  return assistantResponseEvent.type === "assistant_message_completed" ||
    assistantResponseEvent.type === "assistant_message_incomplete" ||
    assistantResponseEvent.type === "assistant_message_failed" ||
    assistantResponseEvent.type === "assistant_message_interrupted";
}

async function waitForStartedTurnCount(input: {
  renderedHook: RenderedChatAppControllerHook;
  controlledRunner: ControlledAssistantConversationRunner;
  expectedStartedTurnCount: number;
}): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await input.renderedHook.flushHookEffects();
    if (input.controlledRunner.startedTurns.length >= input.expectedStartedTurnCount) {
      return;
    }
  }

  throw new Error(`Expected ${input.expectedStartedTurnCount} started turns.`);
}

async function waitForExternallyDrivenStartedTurnCount(input: {
  renderedHook: RenderedChatAppControllerHook;
  externallyDrivenRunner: ExternallyDrivenAssistantConversationRunner;
  expectedStartedTurnCount: number;
}): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await input.renderedHook.flushHookEffects();
    if (input.externallyDrivenRunner.startedTurnRequests.length >= input.expectedStartedTurnCount) {
      return;
    }
  }

  throw new Error(`Expected ${input.expectedStartedTurnCount} externally driven started turns.`);
}

async function waitForConversationTurnStatus(input: {
  renderedHook: RenderedChatAppControllerHook;
  conversationTurnStatus: UseChatAppControllerResult["chatSessionState"]["conversationTurnStatus"];
}): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await input.renderedHook.flushHookEffects();
    if (input.renderedHook.readCurrentController().chatSessionState.conversationTurnStatus === input.conversationTurnStatus) {
      return;
    }
  }

  throw new Error(`Expected conversation turn status ${input.conversationTurnStatus}.`);
}

async function waitForConversationSessionCompactionStatus(input: {
  renderedHook: RenderedChatAppControllerHook;
  conversationSessionCompactionStatus: UseChatAppControllerResult["conversationSessionCompactionStatus"];
}): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await input.renderedHook.flushHookEffects();
    if (
      JSON.stringify(input.renderedHook.readCurrentController().conversationSessionCompactionStatus) ===
        JSON.stringify(input.conversationSessionCompactionStatus)
    ) {
      return;
    }
  }

  throw new Error(`Expected conversation compaction status ${JSON.stringify(input.conversationSessionCompactionStatus)}.`);
}

function ChatAppControllerHookProbe(props: {
  controllerInput: Partial<UseChatAppControllerInput>;
  observeController: (controller: UseChatAppControllerResult) => void;
}) {
  const controller = useChatAppController({
    selectedModelId: "gpt-5.4",
    loadAvailableAssistantModels: async () => [],
    loadPromptContextCandidates: async () => [],
    assistantConversationRunner: neverEmittingAssistantConversationRunner,
    scrollConversationMessagesToBottom() {},
    scrollConversationMessagesByPage() {},
    ...props.controllerInput,
  });

  props.observeController(controller);
  return <box />;
}

test("useChatAppController hydrates initial entries and closes command help", async () => {
  const renderedHook = await renderChatAppControllerHook({
    initialConversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Initial prompt",
        modelFacingPromptText: "Initial prompt",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "Initial answer",
      },
    ],
  });

  expect(renderedHook.readCurrentController().chatSessionState.orderedConversationMessageIds).toHaveLength(2);

  await renderedHook.typeText("/help");
  await renderedHook.pressReturn();
  expect(renderedHook.readCurrentController().chatSessionState.isCommandHelpModalVisible).toBe(true);

  await act(async () => {
    renderedHook.readCurrentController().hideCommandHelpModalInChatApp();
  });
  await renderedHook.flushHookEffects();

  expect(renderedHook.readCurrentController().chatSessionState.isCommandHelpModalVisible).toBe(false);
});

test("useChatAppController ignores prompt editor changes while command help owns interaction", async () => {
  const renderedHook = await renderChatAppControllerHook();

  await renderedHook.typeText("/help");
  await renderedHook.pressReturn();
  expect(renderedHook.readCurrentController().chatSessionState.isCommandHelpModalVisible).toBe(true);

  await act(async () => {
    renderedHook.readCurrentController().applyPromptDraftEditToChatApp({
      promptDraft: "hidden edit",
      promptDraftCursorOffset: "hidden edit".length,
    });
  });
  await renderedHook.flushHookEffects();

  expect(renderedHook.readCurrentController().chatSessionState.promptDraft).toBe("");
});

test("useChatAppController hydrates lazy initial session entries before prompt submission", async () => {
  const controlledRunner = createControlledAssistantConversationRunner();
  const initialConversationSessionEntries: readonly ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Initial prompt",
      modelFacingPromptText: "Initial prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Initial answer",
    },
  ];
  let initialConversationSessionEntryLoadCount = 0;
  const hydratedConversationSessionEntryCounts: number[] = [];
  const renderedHook = await renderChatAppControllerHook({
    initialConversationSessionId: "session-a",
    loadInitialConversationSessionEntries: () => {
      initialConversationSessionEntryLoadCount += 1;
      return {
        conversationSessionId: "session-a",
        conversationSessionEntries: initialConversationSessionEntries,
      };
    },
    onInitialConversationSessionEntriesHydrated: (initialConversationSessionEntriesLoadResult) => {
      hydratedConversationSessionEntryCounts.push(
        initialConversationSessionEntriesLoadResult.conversationSessionEntries.length,
      );
    },
    assistantConversationRunner: controlledRunner.assistantConversationRunner,
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await renderedHook.flushHookEffects();
    if (!renderedHook.readCurrentController().promptComposerState.isInitialConversationSessionHydrationPending) {
      break;
    }
  }

  expect(renderedHook.readCurrentController().promptComposerState.isInitialConversationSessionHydrationPending).toBe(false);
  expect(renderedHook.readCurrentController().chatSessionState.orderedConversationMessageIds).toHaveLength(2);
  expect(initialConversationSessionEntryLoadCount).toBe(1);
  expect(hydratedConversationSessionEntryCounts).toEqual([2]);

  await renderedHook.typeText("After hydration");
  await renderedHook.pressReturn();
  await waitForStartedTurnCount({ renderedHook, controlledRunner, expectedStartedTurnCount: 1 });

  expect(controlledRunner.startedTurns[0]?.conversationTurnRequest.userPromptText).toBe("After hydration");

  controlledRunner.startedTurns[0]?.complete();
  await waitForConversationTurnStatus({ renderedHook, conversationTurnStatus: "waiting_for_user_input" });
  expect(initialConversationSessionEntryLoadCount).toBe(1);
});

test("useChatAppController keeps non-prompt slices stable across prompt-only edits", async () => {
  const renderedHook = await renderChatAppControllerHook({
    initialConversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Initial prompt",
        modelFacingPromptText: "Initial prompt",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "Initial answer",
      },
    ],
  });
  const previousController = renderedHook.readCurrentController();
  const previousRenderCount = renderedHook.readRenderCount();

  await act(async () => {
    previousController.applyPromptDraftEditToChatApp({
      promptDraft: "Next prompt",
      promptDraftCursorOffset: "Next prompt".length,
    });
  });
  await renderedHook.flushHookEffects();

  const nextController = renderedHook.readCurrentController();
  expect(renderedHook.readRenderCount()).toBe(previousRenderCount);
  expect(nextController.promptComposerState).toBe(previousController.promptComposerState);
  expect(nextController.chatAppRenderStore.readPromptComposerSnapshot().promptDraft).toBe("Next prompt");
  expect(nextController.readLatestChatSessionState().promptDraft).toBe("Next prompt");
  expect(nextController.transcriptState).toBe(previousController.transcriptState);
  expect(nextController.interactionStatusState).toBe(previousController.interactionStatusState);
  expect(nextController.selectionState).toBe(previousController.selectionState);
});

test("useChatAppController keeps render store prompt snapshot current without notifying rows for prompt-only edits", async () => {
  const renderedHook = await renderChatAppControllerHook({
    initialConversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Initial prompt",
        modelFacingPromptText: "Initial prompt",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "Initial answer",
      },
    ],
  });
  const previousController = renderedHook.readCurrentController();
  const existingConversationMessageId = previousController.chatSessionState.orderedConversationMessageIds.at(-1);
  if (!existingConversationMessageId) {
    throw new Error("Expected an initial conversation message.");
  }

  let rowNotificationCount = 0;
  let promptNotificationCount = 0;
  previousController.chatAppRenderStore.subscribeConversationMessageRow(existingConversationMessageId, () => {
    rowNotificationCount += 1;
  });
  previousController.chatAppRenderStore.subscribePromptComposer(() => {
    promptNotificationCount += 1;
  });
  const previousRenderCount = renderedHook.readRenderCount();

  await act(async () => {
    previousController.applyPromptDraftEditToChatApp({
      promptDraft: "Next prompt",
      promptDraftCursorOffset: "Next prompt".length,
    });
  });
  await renderedHook.flushHookEffects();

  const nextController = renderedHook.readCurrentController();
  expect(rowNotificationCount).toBe(0);
  expect(promptNotificationCount).toBe(1);
  expect(renderedHook.readRenderCount()).toBe(previousRenderCount);
  expect(nextController.chatAppRenderStore).toBe(previousController.chatAppRenderStore);
  expect(nextController.chatAppRenderStore.readPromptComposerSnapshot().promptDraft).toBe("Next prompt");
  expect(nextController.chatAppRenderStore.readChatSessionState().promptDraft).toBe("Next prompt");
  expect(nextController.chatSessionState.promptDraft).toBe("");
  expect(nextController.readLatestChatSessionState().promptDraft).toBe("Next prompt");
});

test("useChatAppController keeps summarized paste updates prompt-local", async () => {
  const renderedHook = await renderChatAppControllerHook();
  const previousController = renderedHook.readCurrentController();
  const previousRenderCount = renderedHook.readRenderCount();
  let promptNotificationCount = 0;
  previousController.chatAppRenderStore.subscribePromptComposer(() => {
    promptNotificationCount += 1;
  });

  await act(async () => {
    previousController.insertSummarizedPastedTextIntoChatAppPrompt({
      pastedText: ["first pasted line", "second pasted line", "third pasted line"].join("\n"),
    });
  });
  await renderedHook.flushHookEffects();

  const nextController = renderedHook.readCurrentController();
  const promptComposerSnapshot = nextController.chatAppRenderStore.readPromptComposerSnapshot();
  expect(renderedHook.readRenderCount()).toBe(previousRenderCount);
  expect(nextController.promptComposerState).toBe(previousController.promptComposerState);
  expect(promptNotificationCount).toBe(1);
  expect(promptComposerSnapshot.promptDraft).toBe("[Pasted ~3 lines] ");
  expect(promptComposerSnapshot.pendingPromptTextPastes).toMatchObject([
    { pastedText: "first pasted line\nsecond pasted line\nthird pasted line", promptDraftPlaceholderText: "[Pasted ~3 lines]" },
  ]);
  expect(nextController.chatSessionState.promptDraft).toBe("");
  expect(nextController.readLatestChatSessionState().promptDraft).toBe("[Pasted ~3 lines] ");
});

test("useChatAppController routes assistant response events through render store row subscriptions", async () => {
  const externallyDrivenRunner = createExternallyDrivenAssistantConversationRunner();
  const renderedHook = await renderChatAppControllerHook({
    initialConversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Initial prompt",
        modelFacingPromptText: "Initial prompt",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "Initial answer",
      },
    ],
    assistantConversationRunner: externallyDrivenRunner.assistantConversationRunner,
  });
  const existingConversationMessageId = renderedHook.readCurrentController().chatSessionState.orderedConversationMessageIds.at(-1);
  if (!existingConversationMessageId) {
    throw new Error("Expected an initial conversation message.");
  }

  await renderedHook.typeText("Stream a fresh answer");
  await renderedHook.pressReturn();
  await waitForExternallyDrivenStartedTurnCount({
    renderedHook,
    externallyDrivenRunner,
    expectedStartedTurnCount: 1,
  });

  await act(async () => {
    externallyDrivenRunner.emitAssistantResponseEvent({
      type: "assistant_turn_started",
      messageId: "assistant-streamed-1",
      startedAtMs: 1,
    });
  });
  await renderedHook.flushHookEffects();

  let existingRowNotificationCount = 0;
  let streamedRowNotificationCount = 0;
  const chatAppRenderStore = renderedHook.readCurrentController().chatAppRenderStore;
  chatAppRenderStore.subscribeConversationMessageRow(existingConversationMessageId, () => {
    existingRowNotificationCount += 1;
  });
  chatAppRenderStore.subscribeConversationMessageRow("assistant-streamed-1", () => {
    streamedRowNotificationCount += 1;
  });

  await act(async () => {
    externallyDrivenRunner.emitAssistantResponseEvent({
      type: "assistant_message_part_added",
      messageId: "assistant-streamed-1",
      part: {
        id: "assistant-streamed-text-1",
        partKind: "assistant_text",
        partStatus: "streaming",
        rawMarkdownText: "Partial streamed answer",
      },
    });
  });
  await renderedHook.flushHookEffects();

  expect(existingRowNotificationCount).toBe(0);
  expect(streamedRowNotificationCount).toBe(1);
  expect(chatAppRenderStore.readConversationMessageRowSnapshot("assistant-streamed-1")?.conversationMessageParts).toMatchObject([
    { rawMarkdownText: "Partial streamed answer" },
  ]);

  const controllerRenderCountAfterPartAdded = renderedHook.readRenderCount();
  await act(async () => {
    externallyDrivenRunner.emitAssistantResponseEvent({
      type: "assistant_message_part_updated",
      messageId: "assistant-streamed-1",
      part: {
        id: "assistant-streamed-text-1",
        partKind: "assistant_text",
        partStatus: "streaming",
        rawMarkdownText: "Updated streamed answer",
      },
    });
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
  await renderedHook.flushHookEffects();

  expect(streamedRowNotificationCount).toBe(2);
  expect(renderedHook.readRenderCount()).toBe(controllerRenderCountAfterPartAdded);
  expect(chatAppRenderStore.readConversationMessageRowSnapshot("assistant-streamed-1")?.conversationMessageParts).toMatchObject([
    { rawMarkdownText: "Updated streamed answer" },
  ]);
  expect(
    renderedHook.readCurrentController().readLatestChatSessionState().conversationMessagePartsById["assistant-streamed-text-1"],
  ).toMatchObject({ rawMarkdownText: "Updated streamed answer" });

  await act(async () => {
    externallyDrivenRunner.emitAssistantResponseEvent({
      type: "assistant_message_completed",
      messageId: "assistant-streamed-1",
      usage: zeroTokenUsage,
    });
  });
  await waitForConversationTurnStatus({ renderedHook, conversationTurnStatus: "waiting_for_user_input" });
});

test("useChatAppController switches to a selected conversation session from keyboard actions", async () => {
  const switchedConversationSessionEntries: readonly ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Switched prompt",
      modelFacingPromptText: "Switched prompt",
    },
  ];
  const renderedHook = await renderChatAppControllerHook({
    initialConversationSessionId: "session-a",
    loadConversationSessions: async () => [
      {
        sessionId: "session-b",
        title: "Session B",
        createdAtMs: Date.UTC(2026, 4, 23),
        updatedAtMs: Date.UTC(2026, 4, 23),
        conversationSessionEntryCount: 1,
      },
    ],
    switchConversationSession: async (conversationSessionId) => ({
      conversationSessionId,
      conversationSessionEntries: switchedConversationSessionEntries,
    }),
  });

  await renderedHook.typeText("/sessions");
  await renderedHook.pressReturn();
  await renderedHook.flushHookEffects();
  expect(renderedHook.readCurrentController().chatSessionState.conversationSessionSelectionState.step).toBe(
    "showing_conversation_sessions",
  );

  await renderedHook.pressReturn();
  await renderedHook.flushHookEffects();

  expect(renderedHook.readCurrentController().activeConversationSessionId).toBe("session-b");
  expect(renderedHook.readCurrentController().chatSessionState.orderedConversationMessageIds).toHaveLength(1);
});

test("useChatAppController exposes compaction status while compacting from keyboard actions", async () => {
  let resolveCompaction: ((entries: { conversationSessionEntries: readonly ConversationSessionEntry[] }) => void) | undefined;
  const compactionPromise = new Promise<{ conversationSessionEntries: readonly ConversationSessionEntry[] }>((resolve) => {
    resolveCompaction = resolve;
  });
  const renderedHook = await renderChatAppControllerHook({
    initialConversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Before compaction",
        modelFacingPromptText: "Before compaction",
      },
    ],
    compactCurrentConversationSession: async (compactionRequest) => {
      compactionRequest.onCompactionSummaryTextUpdated?.("Goal: streaming compaction summary.");
      return compactionPromise;
    },
  });

  await renderedHook.typeText("/compact");
  await renderedHook.pressReturn();
  await renderedHook.flushHookEffects();
  expect(renderedHook.readCurrentController().conversationSessionCompactionStatus).toEqual({
    step: "compacting",
    source: "manual",
  });
  const streamingCompactionMessageId = renderedHook.readCurrentController().chatSessionState.orderedConversationMessageIds.at(-1);
  expect(streamingCompactionMessageId).toBe("active-conversation-compaction");
  expect(
    streamingCompactionMessageId
      ? renderedHook.readCurrentController().chatSessionState.conversationMessagePartsById[
          "active-conversation-compaction-separator"
        ]
      : undefined,
  ).toEqual({
    id: "active-conversation-compaction-separator",
    partKind: "assistant_compaction_separator",
    source: "manual",
  });
  expect(
    renderedHook.readCurrentController().chatSessionState.conversationMessagePartsById[
      "active-conversation-compaction-summary"
    ],
  ).toMatchObject({
    partKind: "assistant_text",
    partStatus: "streaming",
    rawMarkdownText: "Goal: streaming compaction summary.",
  });

  await act(async () => {
    resolveCompaction?.({
      conversationSessionEntries: [
        {
          entryKind: "conversation_compaction_summary",
          summaryText: "Compacted context summary.",
          compactedEntryCount: 1,
          retainedRecentConversationSessionEntryCount: 0,
        },
      ],
    });
    await compactionPromise;
  });
  await renderedHook.flushHookEffects();

  expect(renderedHook.readCurrentController().conversationSessionCompactionStatus).toEqual({ step: "idle" });
  expect(renderedHook.readCurrentController().chatSessionState.orderedConversationMessageIds).toHaveLength(1);
});

test("useChatAppController ignores delayed clipboard images after prompt submission starts", async () => {
  let resolveClipboardImageRead: ((imageAttachment: UserPromptImageAttachment | undefined) => void) | undefined;
  let resolveAssistantTurn: (() => void) | undefined;
  const clipboardImageReadPromise = new Promise<UserPromptImageAttachment | undefined>((resolve) => {
    resolveClipboardImageRead = resolve;
  });
  const assistantTurnPromise = new Promise<void>((resolve) => {
    resolveAssistantTurn = resolve;
  });
  const renderedHook = await renderChatAppControllerHook({
    assistantConversationRunner: {
      startConversationTurn() {
        return {
          async *streamAssistantResponseEvents() {
            await assistantTurnPromise;
          },
          async approvePendingToolCall() {},
          async denyPendingToolCall() {},
          interrupt() {},
        };
      },
    },
  });

  await act(async () => {
    renderedHook.readCurrentController().applyPromptDraftEditToChatApp({
      promptDraft: "Describe this",
      promptDraftCursorOffset: "Describe this".length,
    });
  });
  await renderedHook.flushHookEffects();

  const pasteImagePromise = renderedHook.readCurrentController().pasteClipboardImageAttachmentIntoChatAppPrompt({
    readClipboardImageAttachment: () => clipboardImageReadPromise,
  });
  await renderedHook.pressReturn();

  await act(async () => {
    resolveClipboardImageRead?.({
      attachmentId: "image-1",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,aGVsbG8=",
      fileName: "clipboard.png",
    });
    await pasteImagePromise;
  });
  await renderedHook.flushHookEffects();

  expect(renderedHook.readCurrentController().chatSessionState.pendingPromptImageAttachments).toEqual([]);
  expect(renderedHook.readCurrentController().chatSessionState.orderedConversationMessageIds).toHaveLength(1);

  await act(async () => {
    resolveAssistantTurn?.();
    await assistantTurnPromise;
  });
});

test("useChatAppController queues prompts typed while streaming and drains them FIFO", async () => {
  const controlledRunner = createControlledAssistantConversationRunner();
  const renderedHook = await renderChatAppControllerHook({
    assistantConversationRunner: controlledRunner.assistantConversationRunner,
  });

  await renderedHook.typeText("First prompt");
  await renderedHook.pressReturn();
  await waitForStartedTurnCount({ renderedHook, controlledRunner, expectedStartedTurnCount: 1 });

  await renderedHook.typeText("Second prompt");
  await renderedHook.pressReturn();
  expect(renderedHook.readCurrentController().queuedPromptCount).toBe(1);
  expect(renderedHook.readCurrentController().queuedPromptPreviews).toMatchObject([
    { submittedPromptText: "Second prompt", submittedPromptImageAttachmentCount: 0 },
  ]);
  expect(renderedHook.readCurrentController().chatSessionState.promptDraft).toBe("");

  await renderedHook.typeText("Third prompt");
  await renderedHook.pressReturn();
  expect(renderedHook.readCurrentController().queuedPromptCount).toBe(2);
  expect(renderedHook.readCurrentController().queuedPromptPreviews).toMatchObject([
    { submittedPromptText: "Second prompt", submittedPromptImageAttachmentCount: 0 },
    { submittedPromptText: "Third prompt", submittedPromptImageAttachmentCount: 0 },
  ]);
  expect(controlledRunner.startedTurns.map((startedTurn) => startedTurn.conversationTurnRequest.userPromptText)).toEqual([
    "First prompt",
  ]);

  await act(async () => {
    controlledRunner.startedTurns[0]?.complete();
  });
  await waitForStartedTurnCount({ renderedHook, controlledRunner, expectedStartedTurnCount: 2 });
  expect(renderedHook.readCurrentController().queuedPromptCount).toBe(1);
  expect(renderedHook.readCurrentController().queuedPromptPreviews).toMatchObject([
    { submittedPromptText: "Third prompt", submittedPromptImageAttachmentCount: 0 },
  ]);
  expect(controlledRunner.startedTurns.map((startedTurn) => startedTurn.conversationTurnRequest.userPromptText)).toEqual([
    "First prompt",
    "Second prompt",
  ]);

  await act(async () => {
    controlledRunner.startedTurns[1]?.complete();
  });
  await waitForStartedTurnCount({ renderedHook, controlledRunner, expectedStartedTurnCount: 3 });
  expect(renderedHook.readCurrentController().queuedPromptCount).toBe(0);
  expect(renderedHook.readCurrentController().queuedPromptPreviews).toEqual([]);
  expect(controlledRunner.startedTurns.map((startedTurn) => startedTurn.conversationTurnRequest.userPromptText)).toEqual([
    "First prompt",
    "Second prompt",
    "Third prompt",
  ]);

  await act(async () => {
    controlledRunner.startedTurns[2]?.complete();
  });
  await waitForConversationTurnStatus({ renderedHook, conversationTurnStatus: "waiting_for_user_input" });
});

test("useChatAppController keeps prompt editable and queues prompts during auto-compaction", async () => {
  const controlledRunner = createControlledAssistantConversationRunner();
  let resolveAutoCompaction: ((result: ConversationAutoCompactionResult) => void) | undefined;
  const autoCompactionPromise = new Promise<ConversationAutoCompactionResult>((resolve) => {
    resolveAutoCompaction = resolve;
  });
  const renderedHook = await renderChatAppControllerHook({
    assistantConversationRunner: controlledRunner.assistantConversationRunner,
    autoCompactCurrentConversationSession: () => autoCompactionPromise,
  });

  await renderedHook.typeText("Prompt before compaction");
  await renderedHook.pressReturn();
  await waitForStartedTurnCount({ renderedHook, controlledRunner, expectedStartedTurnCount: 1 });

  await act(async () => {
    controlledRunner.startedTurns[0]?.complete();
  });
  await waitForConversationSessionCompactionStatus({
    renderedHook,
    conversationSessionCompactionStatus: { step: "compacting", source: "auto" },
  });

  await renderedHook.typeText("Queued during compaction");
  expect(renderedHook.readCurrentController().chatSessionState.promptDraft).toBe("Queued during compaction");

  await renderedHook.pressReturn();
  expect(renderedHook.readCurrentController().queuedPromptCount).toBe(1);
  expect(renderedHook.readCurrentController().queuedPromptPreviews).toMatchObject([
    { submittedPromptText: "Queued during compaction", submittedPromptImageAttachmentCount: 0 },
  ]);
  expect(renderedHook.readCurrentController().chatSessionState.promptDraft).toBe("");
  expect(controlledRunner.startedTurns.map((startedTurn) => startedTurn.conversationTurnRequest.userPromptText)).toEqual([
    "Prompt before compaction",
  ]);

  await act(async () => {
    resolveAutoCompaction?.(createSkippedAutoCompactionResult());
    await autoCompactionPromise;
  });
  await waitForStartedTurnCount({ renderedHook, controlledRunner, expectedStartedTurnCount: 2 });

  expect(renderedHook.readCurrentController().queuedPromptCount).toBe(0);
  expect(controlledRunner.startedTurns.map((startedTurn) => startedTurn.conversationTurnRequest.userPromptText)).toEqual([
    "Prompt before compaction",
    "Queued during compaction",
  ]);

  await act(async () => {
    controlledRunner.startedTurns[1]?.complete();
  });
  await waitForConversationTurnStatus({ renderedHook, conversationTurnStatus: "waiting_for_user_input" });
});

test("useChatAppController drains queued prompts after confirmed interruption settles", async () => {
  const controlledRunner = createControlledAssistantConversationRunner();
  const renderedHook = await renderChatAppControllerHook({
    assistantConversationRunner: controlledRunner.assistantConversationRunner,
  });

  await renderedHook.typeText("Interruptible prompt");
  await renderedHook.pressReturn();
  await waitForStartedTurnCount({ renderedHook, controlledRunner, expectedStartedTurnCount: 1 });

  await renderedHook.typeText("Continue after interrupt");
  await renderedHook.pressReturn();
  expect(renderedHook.readCurrentController().queuedPromptCount).toBe(1);
  expect(renderedHook.readCurrentController().queuedPromptPreviews).toMatchObject([
    { submittedPromptText: "Continue after interrupt", submittedPromptImageAttachmentCount: 0 },
  ]);

  await renderedHook.pressEscape();
  expect(renderedHook.readCurrentController().isActiveTurnInterruptConfirmationArmed).toBe(true);
  await renderedHook.pressEscape();

  await waitForStartedTurnCount({ renderedHook, controlledRunner, expectedStartedTurnCount: 2 });
  expect(controlledRunner.startedTurns[0]?.readWasInterrupted()).toBe(true);
  expect(renderedHook.readCurrentController().queuedPromptCount).toBe(0);
  expect(renderedHook.readCurrentController().queuedPromptPreviews).toEqual([]);
  expect(controlledRunner.startedTurns.map((startedTurn) => startedTurn.conversationTurnRequest.userPromptText)).toEqual([
    "Interruptible prompt",
    "Continue after interrupt",
  ]);

  await act(async () => {
    controlledRunner.startedTurns[1]?.complete();
  });
  await waitForConversationTurnStatus({ renderedHook, conversationTurnStatus: "waiting_for_user_input" });
});

test("useChatAppController does not drain queued prompts after unmount", async () => {
  const controlledRunner = createControlledAssistantConversationRunner();
  const renderedHook = await renderChatAppControllerHook({
    assistantConversationRunner: controlledRunner.assistantConversationRunner,
  });

  await renderedHook.typeText("First prompt");
  await renderedHook.pressReturn();
  await waitForStartedTurnCount({ renderedHook, controlledRunner, expectedStartedTurnCount: 1 });

  await renderedHook.typeText("Queued after unmount");
  await renderedHook.pressReturn();
  expect(renderedHook.readCurrentController().queuedPromptCount).toBe(1);

  await renderedHook.cleanup();

  await act(async () => {
    controlledRunner.startedTurns[0]?.complete();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(controlledRunner.startedTurns.map((startedTurn) => startedTurn.conversationTurnRequest.userPromptText)).toEqual([
    "First prompt",
  ]);
});

function createSkippedAutoCompactionResult(): ConversationAutoCompactionResult {
  return {
    didCompact: false,
    decision: {
      shouldCompact: false,
      reason: "context_usage_below_threshold",
      selectedModelId: "gpt-5.4",
      contextTokensUsed: 0,
      contextUsageRatio: undefined,
      contextWindowTokenCapacity: undefined,
      contextCompactionTriggerTokenCount: undefined,
      reservedTokenCount: undefined,
      thresholdRatio: 0.8,
      triggerKind: undefined,
      sessionEntryCountAfterLatestCompactionSummary: 2,
    },
  };
}
