import {
  type BuliDiagnosticLogger,
  type UserPromptImageAttachment,
} from "@buli/contracts";
import type { ChatSessionKeyboardInput } from "@buli/chat-session-state";
import {
  type PasteClipboardImageAttachmentIntoChatAppPromptInput,
  type UseChatAppControllerResult,
} from "@buli/chat-app-controller";
import { type KeyEvent, type PasteEvent } from "@opentui/core";
import { useKeyboard, usePaste } from "@opentui/react";
import { useEffectEvent } from "react";
import { readNativeClipboardImageAttachment } from "../clipboard/readNativeClipboardImageAttachment.ts";
import type { PromptTextareaEdit } from "../components/PromptTextarea.tsx";
import { logTuiDiagnosticEvent as logChatScreenDiagnosticEvent } from "../diagnostics/logTuiDiagnosticEvent.ts";
import {
  canPromptTextareaEditChatScreenInput,
  isPromptInteractionKeyboardInput,
  shouldPromptTextareaHandleKeyboardInput,
} from "./chatScreenPromptTextareaKeyboardOwnership.ts";
import {
  normalizeOpenTuiPasteEventText,
  readOpenTuiNonTextPasteMetadata,
} from "./normalizeOpenTuiPasteEventText.ts";
import { normalizeOpenTuiKeyEventForChatSession } from "./openTuiKeyboardInputAdapter.ts";

type OpenTuiConsumableInputEvent = Pick<KeyEvent, "preventDefault" | "stopPropagation">;

export type UseChatScreenKeyboardInputActionsInput = {
  readClipboardImageAttachment?: (() => Promise<UserPromptImageAttachment | undefined>) | undefined;
  readLatestChatSessionState: UseChatAppControllerResult["readLatestChatSessionState"];
  readIsConversationCompactionInFlight: UseChatAppControllerResult["readIsConversationCompactionInFlight"];
  applyChatAppKeyboardInput: UseChatAppControllerResult["applyChatAppKeyboardInput"];
  applyPromptDraftEditToChatApp: UseChatAppControllerResult["applyPromptDraftEditToChatApp"];
  removePromptImageAttachmentPlaceholderBeforeCursorFromChatApp:
    UseChatAppControllerResult["removePromptImageAttachmentPlaceholderBeforeCursorFromChatApp"];
  removePromptImageAttachmentPlaceholderAtCursorFromChatApp:
    UseChatAppControllerResult["removePromptImageAttachmentPlaceholderAtCursorFromChatApp"];
  pasteClipboardImageAttachmentIntoChatAppPrompt: (
    input: PasteClipboardImageAttachmentIntoChatAppPromptInput,
  ) => Promise<void>;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type UseChatScreenKeyboardInputActionsResult = {
  applyPromptTextareaEditToChatScreen: (promptTextareaEdit: PromptTextareaEdit) => void;
  submitPromptDraftFromPromptTextarea: () => void;
  pasteClipboardImageAttachmentIntoPrompt: () => Promise<void>;
};

export function useChatScreenKeyboardInputActions(
  input: UseChatScreenKeyboardInputActionsInput,
): UseChatScreenKeyboardInputActionsResult {
  const applyKeyboardInputToChatScreen = useEffectEvent((keyboardInput: {
    chatSessionKeyboardInput: ChatSessionKeyboardInput;
    inputEvent?: OpenTuiConsumableInputEvent;
    shouldRespectPromptTextareaOwnership?: boolean;
  }) => {
    const previousChatSessionState = input.readLatestChatSessionState();
    if (keyboardInput.chatSessionKeyboardInput.keyName === "paste") {
      keyboardInput.inputEvent?.preventDefault();
      keyboardInput.inputEvent?.stopPropagation();
      void pasteClipboardImageAttachmentIntoPrompt();
      return;
    }

    if (
      input.readIsConversationCompactionInFlight() &&
      isPromptInteractionKeyboardInput(keyboardInput.chatSessionKeyboardInput)
    ) {
      keyboardInput.inputEvent?.preventDefault();
      keyboardInput.inputEvent?.stopPropagation();
      return;
    }

    const imageAttachmentRemovalResult = keyboardInput.chatSessionKeyboardInput.keyName === "backspace"
      ? input.removePromptImageAttachmentPlaceholderBeforeCursorFromChatApp()
      : keyboardInput.chatSessionKeyboardInput.keyName === "delete"
        ? input.removePromptImageAttachmentPlaceholderAtCursorFromChatApp()
        : undefined;
    if (imageAttachmentRemovalResult?.didRemovePromptImageAttachmentPlaceholder) {
      keyboardInput.inputEvent?.preventDefault();
      keyboardInput.inputEvent?.stopPropagation();
      return;
    }

    if (
      keyboardInput.shouldRespectPromptTextareaOwnership !== false &&
      shouldPromptTextareaHandleKeyboardInput({
        chatSessionState: previousChatSessionState,
        chatSessionKeyboardInput: keyboardInput.chatSessionKeyboardInput,
      })
    ) {
      return;
    }

    const keyboardInputApplication = input.applyChatAppKeyboardInput({
      chatSessionKeyboardInput: keyboardInput.chatSessionKeyboardInput,
    });

    if (keyboardInputApplication.shouldConsumeKeyboardInput) {
      keyboardInput.inputEvent?.preventDefault();
      keyboardInput.inputEvent?.stopPropagation();
    }
  });

  const applyPromptTextareaEditToChatScreen = useEffectEvent((promptTextareaEdit: PromptTextareaEdit) =>
    input.applyPromptDraftEditToChatApp(promptTextareaEdit)
  );

  const submitPromptDraftFromPromptTextarea = useEffectEvent(() => {
    applyKeyboardInputToChatScreen({
      chatSessionKeyboardInput: {
        keyName: "return",
        textInput: undefined,
        isCtrlPressed: false,
        isMetaPressed: false,
      },
      shouldRespectPromptTextareaOwnership: false,
    });
  });

  const pasteClipboardImageAttachmentIntoPrompt = useEffectEvent(async () => {
    const readClipboardImageAttachment = input.readClipboardImageAttachment ?? readNativeClipboardImageAttachment;
    await input.pasteClipboardImageAttachmentIntoChatAppPrompt({
      readClipboardImageAttachment,
    });
  });

  const handlePasteOutsidePromptTextarea = useEffectEvent((pasteEvent: PasteEvent) => {
    if (canPromptTextareaEditChatScreenInput({
      chatSessionState: input.readLatestChatSessionState(),
      isConversationCompactionInFlight: input.readIsConversationCompactionInFlight(),
    })) {
      return;
    }

    pasteEvent.preventDefault();
    pasteEvent.stopPropagation();

    const nonTextPasteMetadata = readOpenTuiNonTextPasteMetadata(pasteEvent);
    if (nonTextPasteMetadata) {
      logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.non_text_paste_ignored", {
        conversationTurnStatus: input.readLatestChatSessionState().conversationTurnStatus,
        pasteKind: nonTextPasteMetadata.pasteKind,
        mimeType: nonTextPasteMetadata.mimeType ?? null,
        pastedByteLength: pasteEvent.bytes.length,
      });
      return;
    }

    const pastedText = normalizeOpenTuiPasteEventText(pasteEvent);
    if (pastedText.length === 0) {
      return;
    }

    logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.paste_ignored", {
      conversationTurnStatus: input.readLatestChatSessionState().conversationTurnStatus,
      pastedTextLength: pastedText.length,
    });
  });

  usePaste(handlePasteOutsidePromptTextarea);

  useKeyboard((keyEvent: KeyEvent) => {
    applyKeyboardInputToChatScreen({
      chatSessionKeyboardInput: normalizeOpenTuiKeyEventForChatSession(keyEvent),
      inputEvent: keyEvent,
    });
  });

  return {
    applyPromptTextareaEditToChatScreen,
    submitPromptDraftFromPromptTextarea,
    pasteClipboardImageAttachmentIntoPrompt,
  };
}
