import { expect, test } from "bun:test";
import type { ConversationSessionEntry, UserPromptImageAttachment } from "@buli/contracts";
import type { AssistantConversationRunner } from "@buli/engine";
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
  flushHookEffects: () => Promise<void>;
};

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
    async flushHookEffects(): Promise<void> {
      await act(async () => {
        await Promise.resolve();
      });
      await renderedHook.renderOnce();
    },
  };
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
