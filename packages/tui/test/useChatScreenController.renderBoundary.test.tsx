import { expect, test } from "bun:test";
import type { ConversationSessionEntry } from "@buli/contracts";
import type { AssistantConversationRunner } from "@buli/engine";
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

const chatScreenMainAreaPropKeys = [
  "isCommandHelpModalVisible",
  "isReasoningSummaryVisible",
  "inputPanelAccentColor",
  "availableCommandHelpModalRowCount",
  "terminalSizeTierForChatScreen",
  "terminalColumnCount",
  "availableChatSlashCommands",
  "orderedConversationMessages",
  "conversationMessagePartsById",
  "hiddenOlderConversationMessageCount",
  "olderConversationMessageRevealCount",
  "conversationMessageScrollBoxRef",
  "onRevealOlderConversationMessages",
  "onCommandHelpCloseRequested",
] as const satisfies readonly (keyof ChatScreenMainAreaProps)[];

type RenderedChatScreenControllerHook = {
  readCurrentController: () => UseChatScreenControllerResult;
  renderOnce: () => Promise<void>;
};

async function renderChatScreenControllerHook(): Promise<RenderedChatScreenControllerHook> {
  let latestController: UseChatScreenControllerResult | undefined;
  const renderedHook = await testRender(
    <ChatScreenControllerHookProbe
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
  observeController: (controller: UseChatScreenControllerResult) => void;
}) {
  const chatScreenProps = {
    selectedModelId: "gpt-5.5",
    initialConversationSessionEntries,
    loadAvailableAssistantModels: async () => [],
    loadPromptContextCandidates: async () => [],
    assistantConversationRunner: neverEmittingAssistantConversationRunner,
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

function areChatScreenMainAreaPropsShallowEqual(
  previousProps: ChatScreenMainAreaProps,
  nextProps: ChatScreenMainAreaProps,
): boolean {
  return chatScreenMainAreaPropKeys.every((propKey) => Object.is(previousProps[propKey], nextProps[propKey]));
}

test("useChatScreenController keeps main area props stable across prompt-only edits", async () => {
  const renderedHook = await renderChatScreenControllerHook();
  const previousController = renderedHook.readCurrentController();
  const previousMainAreaProps = previousController.mainAreaProps;
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
  expect(nextController.liveInteractionChromeProps.promptComposerProps.promptDraft).toBe("Queued follow-up");
  expect(nextController.liveInteractionChromeProps.promptComposerProps).not.toBe(previousPromptComposerProps);
  expect(nextController.liveInteractionChromeProps.statusStackProps).toBe(previousStatusStackProps);
  expect(areChatScreenMainAreaPropsShallowEqual(previousMainAreaProps, nextController.mainAreaProps)).toBe(true);
});
