import type { BuliDiagnosticLogger, UserPromptImageAttachment } from "@buli/contracts";
import {
  appendPromptImageAttachmentToDraft,
  removePromptImageAttachmentPlaceholderAtCursor,
  removePromptImageAttachmentPlaceholderBeforeCursor,
  type ChatSessionState,
} from "@buli/chat-session-state";
import { useEffectEvent, type Dispatch, type SetStateAction } from "react";
import { canChatAppPromptDraftBeEdited } from "./chatAppPromptDraftEditability.ts";
import { logChatAppControllerDiagnosticEvent } from "./diagnostics.ts";

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
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
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
        logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.clipboard_image_paste_ignored", {
          conversationTurnStatus: previousChatSessionState.conversationTurnStatus,
          reason: input.isConversationCompactionInFlightRef.current ? "conversation_compaction_in_flight" : "prompt_not_editable",
        });
        return;
      }

      const clipboardImageAttachment = await pasteInput.readClipboardImageAttachment().catch(() => undefined);
      if (!clipboardImageAttachment) {
        logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.clipboard_image_paste_no_image");
        return;
      }

      const latestChatSessionStateAfterClipboardRead = input.latestChatSessionStateRef.current;
      if (didPromptSubmissionStartDuringClipboardImageRead({
        previousChatSessionState,
        latestChatSessionStateAfterClipboardRead,
      })) {
        logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.clipboard_image_paste_ignored", {
          conversationTurnStatus: latestChatSessionStateAfterClipboardRead.conversationTurnStatus,
          reason: "prompt_submitted_during_clipboard_read",
        });
        return;
      }

      if (!canChatAppPromptDraftBeEdited({
        chatSessionState: latestChatSessionStateAfterClipboardRead,
        isConversationCompactionInFlight: input.isConversationCompactionInFlightRef.current,
      })) {
        logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.clipboard_image_paste_ignored", {
          conversationTurnStatus: latestChatSessionStateAfterClipboardRead.conversationTurnStatus,
          reason: input.isConversationCompactionInFlightRef.current ? "conversation_compaction_in_flight" : "prompt_not_editable",
        });
        return;
      }

      const nextChatSessionState = appendPromptImageAttachmentToDraft(
        latestChatSessionStateAfterClipboardRead,
        clipboardImageAttachment,
      );
      input.latestChatSessionStateRef.current = nextChatSessionState;
      input.setChatSessionState(nextChatSessionState);
      logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.clipboard_image_pasted", {
        pendingPromptImageAttachmentCount: nextChatSessionState.pendingPromptImageAttachments.length,
        mimeType: clipboardImageAttachment.mimeType,
        dataUrlLength: clipboardImageAttachment.dataUrl.length,
      });
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
