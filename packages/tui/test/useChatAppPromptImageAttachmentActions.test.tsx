import { expect, test } from "bun:test";
import type { UserPromptImageAttachment } from "@buli/contracts";
import {
  appendPromptImageAttachmentToDraft,
  createInitialChatSessionState,
  type ChatSessionState,
} from "@buli/chat-session-state";
import {
  useChatAppPromptImageAttachmentActions,
  type UseChatAppPromptImageAttachmentActionsResult,
} from "@buli/chat-app-controller";
import { act, useRef, type SetStateAction } from "react";
import { testRender } from "./testRenderWithCleanup.ts";

const pastedImageAttachment: UserPromptImageAttachment = {
  attachmentId: "image-1",
  mimeType: "image/png",
  dataUrl: "data:image/png;base64,aGVsbG8=",
  fileName: "clipboard.png",
};

type PromptImageAttachmentActionsHarness = {
  readChatSessionState: () => ChatSessionState;
  actions: UseChatAppPromptImageAttachmentActionsResult;
};

test("useChatAppPromptImageAttachmentActions does not remove image placeholders while command help owns interaction", async () => {
  const chatSessionStateWithImage = appendPromptImageAttachmentToDraft(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    pastedImageAttachment,
  );
  const chatSessionStateWithCommandHelpAndImage = {
    ...chatSessionStateWithImage,
    isCommandHelpModalVisible: true,
  };
  const renderedHarness = await renderPromptImageAttachmentActionsHarness(chatSessionStateWithCommandHelpAndImage);

  const removalResult = await act(() =>
    renderedHarness.readCurrentHarness().actions.removePromptImageAttachmentPlaceholderBeforeCursorFromChatApp()
  );

  expect(removalResult.didRemovePromptImageAttachmentPlaceholder).toBe(false);
  expect(renderedHarness.readCurrentHarness().readChatSessionState().promptDraft).toContain("[Image 1]");
  expect(renderedHarness.readCurrentHarness().readChatSessionState().pendingPromptImageAttachments).toHaveLength(1);
});

async function renderPromptImageAttachmentActionsHarness(
  initialChatSessionState: ChatSessionState,
): Promise<{ readCurrentHarness: () => PromptImageAttachmentActionsHarness }> {
  let latestHarness: PromptImageAttachmentActionsHarness | undefined;
  await testRender(
    <PromptImageAttachmentActionsProbe
      initialChatSessionState={initialChatSessionState}
      observeHarness={(harness) => {
        latestHarness = harness;
      }}
    />,
  );

  return {
    readCurrentHarness() {
      if (!latestHarness) {
        throw new Error("Prompt image attachment actions harness did not render.");
      }

      return latestHarness;
    },
  };
}

function PromptImageAttachmentActionsProbe(props: {
  initialChatSessionState: ChatSessionState;
  observeHarness: (harness: PromptImageAttachmentActionsHarness) => void;
}) {
  const latestChatSessionStateRef = useRef(props.initialChatSessionState);
  const setChatSessionState = (chatSessionStateAction: SetStateAction<ChatSessionState>): void => {
    latestChatSessionStateRef.current = typeof chatSessionStateAction === "function"
      ? chatSessionStateAction(latestChatSessionStateRef.current)
      : chatSessionStateAction;
  };
  const actions = useChatAppPromptImageAttachmentActions({
    latestChatSessionStateRef,
    conversationSessionCompactionStatus: { step: "idle" },
    setChatSessionState,
  });

  props.observeHarness({
    readChatSessionState: () => latestChatSessionStateRef.current,
    actions,
  });

  return <box />;
}
