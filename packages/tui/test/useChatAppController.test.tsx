import { expect, test } from "bun:test";
import type { ConversationSessionEntry, TokenUsage, UserPromptImageAttachment } from "@buli/contracts";
import type { AssistantConversationRunner, ConversationTurnRequest } from "@buli/engine";
import {
  useChatAppController,
  type UseChatAppControllerInput,
  type UseChatAppControllerResult,
} from "@buli/chat-app-controller";
import { act } from "react";
import { testRender } from "./testRenderWithCleanup.ts";

type RenderedChatAppControllerHook = {
  readCurrentController: () => UseChatAppControllerResult;
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
  const renderedHook = await testRender(
    <ChatAppControllerHookProbe
      controllerInput={input}
      observeController={(controller) => {
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

  await act(async () => {
    previousController.applyPromptDraftEditToChatApp({
      promptDraft: "Next prompt",
      promptDraftCursorOffset: "Next prompt".length,
    });
  });
  await renderedHook.flushHookEffects();

  const nextController = renderedHook.readCurrentController();
  expect(nextController.promptComposerState.promptDraft).toBe("Next prompt");
  expect(nextController.promptComposerState).not.toBe(previousController.promptComposerState);
  expect(nextController.transcriptState).toBe(previousController.transcriptState);
  expect(nextController.interactionStatusState).toBe(previousController.interactionStatusState);
  expect(nextController.selectionState).toBe(previousController.selectionState);
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
    compactCurrentConversationSession: async () => compactionPromise,
  });

  await renderedHook.typeText("/compact");
  await renderedHook.pressReturn();
  await renderedHook.flushHookEffects();
  expect(renderedHook.readCurrentController().conversationSessionCompactionStatus).toEqual({
    step: "compacting",
    source: "manual",
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
