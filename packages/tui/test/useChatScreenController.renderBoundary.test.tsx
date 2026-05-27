import { expect, test } from "bun:test";
import type { AssistantResponseEvent, ConversationSessionEntry, TokenUsage } from "@buli/contracts";
import type { AssistantConversationRunner, ConversationTurnRequest } from "@buli/engine";
import { act } from "react";
import {
  useChatScreenController,
  type UseChatScreenControllerResult,
} from "../src/behavior/useChatScreenController.ts";
import type { ChatScreenProps } from "../src/ChatScreen.tsx";
import type { ChatScreenMainAreaProps } from "../src/components/ChatScreenMainArea.tsx";
import { testRender } from "./testRenderWithCleanup.ts";

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

const initialConversationSessionEntries = [
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
] as const satisfies readonly ConversationSessionEntry[];

const zeroTokenUsage = {
  input: 0,
  output: 0,
  reasoning: 0,
  total: undefined,
  cache: { read: 0, write: 0 },
} satisfies TokenUsage;

const chatScreenMainAreaPropKeys = [
  "isCommandHelpModalVisible",
  "reasoningSummaryDisplayMode",
  "inputPanelAccentColor",
  "availableCommandHelpModalRowCount",
  "terminalSizeTierForChatScreen",
  "terminalColumnCount",
  "availableChatSlashCommands",
  "chatAppRenderStore",
  "visibleConversationMessageIds",
  "hiddenOlderConversationMessageCount",
  "olderConversationMessageRevealCount",
  "pendingToolApprovalDecision",
  "conversationMessageScrollBoxRef",
  "onRevealOlderConversationMessages",
  "onCommandHelpCloseRequested",
] as const satisfies readonly (keyof ChatScreenMainAreaProps)[];

type RenderedChatScreenControllerHook = {
  readCurrentController: () => UseChatScreenControllerResult;
  renderOnce: () => Promise<void>;
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

async function renderChatScreenControllerHook(input: {
  assistantConversationRunner?: AssistantConversationRunner | undefined;
} = {}): Promise<RenderedChatScreenControllerHook> {
  let latestController: UseChatScreenControllerResult | undefined;
  const renderedHook = await testRender(
    <ChatScreenControllerHookProbe
      assistantConversationRunner={input.assistantConversationRunner}
      observeController={(controller) => {
        latestController = controller;
      }}
    />,
  );

  return {
    readCurrentController() {
      if (!latestController) {
        throw new Error("Chat screen controller hook did not render.");
      }

      return latestController;
    },
    renderOnce: renderedHook.renderOnce,
  };
}

function ChatScreenControllerHookProbe(props: {
  assistantConversationRunner?: AssistantConversationRunner | undefined;
  observeController: (controller: UseChatScreenControllerResult) => void;
}) {
  const chatScreenProps = {
    selectedModelId: "gpt-5.5",
    initialConversationSessionEntries,
    loadAvailableAssistantModels: async () => [],
    loadPromptContextCandidates: async () => [],
    assistantConversationRunner: props.assistantConversationRunner ?? neverEmittingAssistantConversationRunner,
  } satisfies ChatScreenProps;
  const controller = useChatScreenController({
    chatScreenProps,
    terminalRowCount: 32,
    terminalColumnCount: 120,
    terminalSizeTierForChatScreen: "comfortable",
  });

  props.observeController(controller);
  return <box />;
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

async function waitForExternallyDrivenStartedTurnCount(input: {
  renderedHook: RenderedChatScreenControllerHook;
  externallyDrivenRunner: ExternallyDrivenAssistantConversationRunner;
  expectedStartedTurnCount: number;
}): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await input.renderedHook.renderOnce();
    if (input.externallyDrivenRunner.startedTurnRequests.length >= input.expectedStartedTurnCount) {
      return;
    }
  }

  throw new Error(`Expected ${input.expectedStartedTurnCount} externally driven started turns.`);
}

function areChatScreenMainAreaPropsShallowEqual(
  previousProps: ChatScreenMainAreaProps,
  nextProps: ChatScreenMainAreaProps,
): boolean {
  return chatScreenMainAreaPropKeys.every((propKey) => Object.is(previousProps[propKey], nextProps[propKey]));
}

function readPromptComposerStoreSnapshot(
  promptComposerProps: UseChatScreenControllerResult["liveInteractionChromeProps"]["promptComposerProps"],
) {
  const chatAppRenderStore = promptComposerProps.chatAppRenderStore;
  if (!chatAppRenderStore) {
    throw new Error("Expected prompt composer props to be backed by the chat app render store.");
  }

  return chatAppRenderStore.readPromptComposerSnapshot();
}

function readInteractionStatusStoreSnapshot(
  promptComposerProps: UseChatScreenControllerResult["liveInteractionChromeProps"]["promptComposerProps"],
) {
  const chatAppRenderStore = promptComposerProps.chatAppRenderStore;
  if (!chatAppRenderStore) {
    throw new Error("Expected prompt composer props to be backed by the chat app render store.");
  }

  return chatAppRenderStore.readInteractionStatusSnapshot();
}

test("useChatScreenController keeps main area props stable across prompt-only edits", async () => {
  const renderedHook = await renderChatScreenControllerHook();
  const previousController = renderedHook.readCurrentController();
  const previousMainAreaProps = previousController.mainAreaProps;
  const previousLiveInteractionChromeProps = previousController.liveInteractionChromeProps;
  const previousStatusStackProps = previousController.liveInteractionChromeProps.statusStackProps;
  const previousPromptComposerProps = previousController.liveInteractionChromeProps.promptComposerProps;

  await act(async () => {
    previousPromptComposerProps.onPromptDraftEdited({
      promptDraft: "Queued follow-up",
      promptDraftCursorOffset: "Queued follow-up".length,
    });
  });
  await renderedHook.renderOnce();

  const nextController = renderedHook.readCurrentController();
  expect(readPromptComposerStoreSnapshot(nextController.liveInteractionChromeProps.promptComposerProps).promptDraft).toBe(
    "Queued follow-up",
  );
  expect(nextController.liveInteractionChromeProps.promptComposerProps).toBe(previousPromptComposerProps);
  expect(nextController.liveInteractionChromeProps.statusStackProps).toBe(previousStatusStackProps);
  expect(nextController.liveInteractionChromeProps).toBe(previousLiveInteractionChromeProps);
  expect(areChatScreenMainAreaPropsShallowEqual(previousMainAreaProps, nextController.mainAreaProps)).toBe(true);
});

test("useChatScreenController keeps live interaction props stable when prompt edits open slash command selection", async () => {
  const renderedHook = await renderChatScreenControllerHook();
  const previousController = renderedHook.readCurrentController();
  const previousMainAreaProps = previousController.mainAreaProps;
  const previousLiveInteractionChromeProps = previousController.liveInteractionChromeProps;
  const previousPromptComposerProps = previousController.liveInteractionChromeProps.promptComposerProps;

  await act(async () => {
    previousPromptComposerProps.onPromptDraftEdited({
      promptDraft: "/he",
      promptDraftCursorOffset: "/he".length,
    });
  });
  await renderedHook.renderOnce();

  const nextController = renderedHook.readCurrentController();
  expect(readPromptComposerStoreSnapshot(nextController.liveInteractionChromeProps.promptComposerProps).promptDraft).toBe("/he");
  expect(
    readInteractionStatusStoreSnapshot(nextController.liveInteractionChromeProps.promptComposerProps).slashCommandSelectionState.step,
  ).toBe("showing_slash_commands");
  expect(nextController.liveInteractionChromeProps).toBe(previousLiveInteractionChromeProps);
  expect(nextController.liveInteractionChromeProps.promptComposerProps).toBe(previousPromptComposerProps);
  expect(areChatScreenMainAreaPropsShallowEqual(previousMainAreaProps, nextController.mainAreaProps)).toBe(true);
});

test("useChatScreenController keeps main area props stable across row-only transcript updates", async () => {
  const externallyDrivenRunner = createExternallyDrivenAssistantConversationRunner();
  const renderedHook = await renderChatScreenControllerHook({
    assistantConversationRunner: externallyDrivenRunner.assistantConversationRunner,
  });
  const promptComposerProps = renderedHook.readCurrentController().liveInteractionChromeProps.promptComposerProps;

  await act(async () => {
    promptComposerProps.onPromptDraftEdited({
      promptDraft: "Stream next answer",
      promptDraftCursorOffset: "Stream next answer".length,
    });
  });
  await renderedHook.renderOnce();
  await act(async () => {
    renderedHook.readCurrentController().liveInteractionChromeProps.promptComposerProps.onPromptSubmitted();
  });
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
  await renderedHook.renderOnce();
  const previousMainAreaProps = renderedHook.readCurrentController().mainAreaProps;

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
  await renderedHook.renderOnce();

  expect(areChatScreenMainAreaPropsShallowEqual(previousMainAreaProps, renderedHook.readCurrentController().mainAreaProps)).toBe(true);

  await act(async () => {
    externallyDrivenRunner.emitAssistantResponseEvent({
      type: "assistant_message_completed",
      messageId: "assistant-streamed-1",
      usage: zeroTokenUsage,
    });
  });
});
