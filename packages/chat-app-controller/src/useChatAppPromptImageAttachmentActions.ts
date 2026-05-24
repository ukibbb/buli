import type { UserPromptImageAttachment } from "@buli/contracts";
import {
  appendPromptImageAttachmentToDraft,
  removePromptImageAttachmentPlaceholderAtCursor,
  removePromptImageAttachmentPlaceholderBeforeCursor,
  type ChatSessionState,
} from "@buli/chat-session-state";
import { useEffectEvent, type Dispatch, type SetStateAction } from "react";
import { canChatAppPromptDraftBeEdited } from "./chatAppPromptDraftEditability.ts";

type MutableValueRef<T> = { current: T };

export type ReadChatAppPromptImageAttachment = () => Promise<UserPromptImageAttachment | undefined>;

export type ChatAppPromptImageAttachmentRemovalResult = {
  didRemovePromptImageAttachmentPlaceholder: boolean;
};

export type PasteClipboardImageAttachmentIntoChatAppPromptInput = {
  readClipboardImageAttachment: ReadChatAppPromptImageAttachment;
};

export type UseChatAppPromptImageAttachmentActionsInput = {
  latestChatSessionStateRef: MutableValueRef<ChatSessionState>;
  isConversationCompactionInFlightRef: MutableValueRef<boolean>;
  setChatSessionState: Dispatch<SetStateAction<ChatSessionState>>;
};

export type UseChatAppPromptImageAttachmentActionsResult = {
  removePromptImageAttachmentPlaceholderBeforeCursorFromChatApp: () => ChatAppPromptImageAttachmentRemovalResult;
  removePromptImageAttachmentPlaceholderAtCursorFromChatApp: () => ChatAppPromptImageAttachmentRemovalResult;
  pasteClipboardImageAttachmentIntoChatAppPrompt: (
    input: PasteClipboardImageAttachmentIntoChatAppPromptInput,
  ) => Promise<void>;
};

export function useChatAppPromptImageAttachmentActions(
  input: UseChatAppPromptImageAttachmentActionsInput,
): UseChatAppPromptImageAttachmentActionsResult {
  const removePromptImageAttachmentPlaceholderBeforeCursorFromChatApp = useEffectEvent(
    (): ChatAppPromptImageAttachmentRemovalResult => {
      return removePromptImageAttachmentPlaceholderFromChatApp({
        actionInput: input,
        removePromptImageAttachmentPlaceholder: removePromptImageAttachmentPlaceholderBeforeCursor,
      });
    },
  );

  const removePromptImageAttachmentPlaceholderAtCursorFromChatApp = useEffectEvent(
    (): ChatAppPromptImageAttachmentRemovalResult => {
      return removePromptImageAttachmentPlaceholderFromChatApp({
        actionInput: input,
        removePromptImageAttachmentPlaceholder: removePromptImageAttachmentPlaceholderAtCursor,
      });
    },
  );

  const pasteClipboardImageAttachmentIntoChatAppPrompt = useEffectEvent(
    async (pasteInput: PasteClipboardImageAttachmentIntoChatAppPromptInput): Promise<void> => {
      const previousChatSessionState = input.latestChatSessionStateRef.current;
      if (!canChatAppPromptDraftBeEdited({
        chatSessionState: previousChatSessionState,
        isConversationCompactionInFlight: input.isConversationCompactionInFlightRef.current,
      })) {
        return;
      }

      const clipboardImageAttachment = await pasteInput.readClipboardImageAttachment().catch(() => undefined);
      if (!clipboardImageAttachment) {
        return;
      }

      const latestChatSessionStateAfterClipboardRead = input.latestChatSessionStateRef.current;
      if (didPromptSubmissionStartDuringClipboardImageRead({
        previousChatSessionState,
        latestChatSessionStateAfterClipboardRead,
      })) {
        return;
      }

      if (!canChatAppPromptDraftBeEdited({
        chatSessionState: latestChatSessionStateAfterClipboardRead,
        isConversationCompactionInFlight: input.isConversationCompactionInFlightRef.current,
      })) {
        return;
      }

      const nextChatSessionState = appendPromptImageAttachmentToDraft(
        latestChatSessionStateAfterClipboardRead,
        clipboardImageAttachment,
      );
      input.latestChatSessionStateRef.current = nextChatSessionState;
      input.setChatSessionState(nextChatSessionState);
    },
  );

  return {
    removePromptImageAttachmentPlaceholderBeforeCursorFromChatApp,
    removePromptImageAttachmentPlaceholderAtCursorFromChatApp,
    pasteClipboardImageAttachmentIntoChatAppPrompt,
  };
}

function didPromptSubmissionStartDuringClipboardImageRead(input: {
  previousChatSessionState: ChatSessionState;
  latestChatSessionStateAfterClipboardRead: ChatSessionState;
}): boolean {
  return input.previousChatSessionState.conversationTurnStatus === "waiting_for_user_input" &&
    input.latestChatSessionStateAfterClipboardRead.conversationTurnStatus !== "waiting_for_user_input";
}

function removePromptImageAttachmentPlaceholderFromChatApp(input: {
  actionInput: UseChatAppPromptImageAttachmentActionsInput;
  removePromptImageAttachmentPlaceholder: (chatSessionState: ChatSessionState) => ChatSessionState;
}): ChatAppPromptImageAttachmentRemovalResult {
  const previousChatSessionState = input.actionInput.latestChatSessionStateRef.current;
  const nextChatSessionState = input.removePromptImageAttachmentPlaceholder(previousChatSessionState);

  if (nextChatSessionState === previousChatSessionState) {
    return { didRemovePromptImageAttachmentPlaceholder: false };
  }

  input.actionInput.latestChatSessionStateRef.current = nextChatSessionState;
  input.actionInput.setChatSessionState(nextChatSessionState);
  return { didRemovePromptImageAttachmentPlaceholder: true };
}
