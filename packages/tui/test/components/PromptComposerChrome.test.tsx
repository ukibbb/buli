import { expect, test } from "bun:test";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import {
  buildChatAppRenderStoreChangeSetFromChatSessionStateChange,
  createChatAppRenderStore,
  type ChatAppRenderStore,
} from "@buli/chat-app-controller";
import { createInitialChatSessionState, replacePromptDraftFromEditor } from "@buli/chat-session-state";
import { act } from "react";
import { PromptComposerChrome, type PromptComposerChromeProps } from "../../src/components/PromptComposerChrome.tsx";
import { testRender } from "../testRenderWithCleanup.ts";

const noopPromptDraftEdited: PromptComposerChromeProps["onPromptDraftEdited"] = () => {};
const noopPromptSubmitted: PromptComposerChromeProps["onPromptSubmitted"] = () => {};
const noopClipboardPasteRequested: PromptComposerChromeProps["onNativeClipboardPasteRequested"] = () => {};
const noopSummarizedPromptTextPasted: PromptComposerChromeProps["onSummarizedPromptTextPasted"] = () => {};

function createStoreBackedPromptComposerProps(
  input: { chatAppRenderStore: ChatAppRenderStore },
): PromptComposerChromeProps {
  return {
    chatAppRenderStore: input.chatAppRenderStore,
    conversationSessionCompactionStatus: { step: "idle" },
    shouldRenderMinimumHeightPromptStrip: false,
    isPromptInputDisabled: false,
    queuedPromptCount: 0,
    isActiveTurnInterruptConfirmationArmed: false,
    inputPanelAccentColor: chatScreenTheme.accentGreen,
    promptInputHintOverride: undefined,
    shortModeLabel: "chat",
    nextShortModeLabel: "plan",
    nextModeAccentColor: chatScreenTheme.accentAmber,
    reasoningEffortLabel: "default",
    totalContextTokensUsed: undefined,
    contextMeterTokenLimit: undefined,
    onPromptDraftEdited: noopPromptDraftEdited,
    onPromptSubmitted: noopPromptSubmitted,
    onNativeClipboardPasteRequested: noopClipboardPasteRequested,
    onSummarizedPromptTextPasted: noopSummarizedPromptTextPasted,
  };
}

test("PromptComposerChrome renders prompt draft updates from the chat app render store", async () => {
  const initialChatSessionState = replacePromptDraftFromEditor({
    chatSessionState: createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    promptDraft: "Initial store draft",
    promptDraftCursorOffset: "Initial store draft".length,
  });
  const chatAppRenderStore = createChatAppRenderStore({ initialChatSessionState });
  const { captureCharFrame, renderOnce } = await testRender(
    <PromptComposerChrome {...createStoreBackedPromptComposerProps({ chatAppRenderStore })} />,
    { width: 100, height: 10 },
  );
  await renderOnce();

  expect(captureCharFrame()).toContain("Initial store draft");

  const nextChatSessionState = replacePromptDraftFromEditor({
    chatSessionState: initialChatSessionState,
    promptDraft: "Updated store draft",
    promptDraftCursorOffset: "Updated store draft".length,
  });
  await act(async () => {
    chatAppRenderStore.replaceChatSessionState({
      nextChatSessionState,
      changeSet: buildChatAppRenderStoreChangeSetFromChatSessionStateChange({
        previousChatSessionState: initialChatSessionState,
        nextChatSessionState,
      }),
    });
  });
  await renderOnce();

  expect(captureCharFrame()).toContain("Updated store draft");
  expect(captureCharFrame()).not.toContain("Initial store draft");
});
