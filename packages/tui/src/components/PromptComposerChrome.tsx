import type { ChatSessionState } from "@buli/chat-session-state";
import type { ChatScreenTheme } from "@buli/assistant-design-tokens";
import type { ReactNode } from "react";
import { InputPanel } from "./InputPanel.tsx";
import { InputStatusStrip } from "./InputStatusStrip.tsx";
import { MinimumHeightPromptStrip } from "./MinimumHeightPromptStrip.tsx";
import type { PromptTextareaEdit } from "./PromptTextarea.tsx";

export type PromptComposerChromeProps = {
  chatSessionState: ChatSessionState;
  shouldRenderMinimumHeightPromptStrip: boolean;
  isPromptInputDisabled: boolean;
  isActiveTurnInterruptConfirmationArmed: boolean;
  inputPanelAccentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"] | ChatScreenTheme["accentPink"];
  promptInputHintOverride: string | undefined;
  shortModeLabel: string;
  nextShortModeLabel: string;
  nextModeAccentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"] | ChatScreenTheme["accentPink"];
  reasoningEffortLabel: string;
  totalContextTokensUsed: number | undefined;
  contextWindowTokenCapacity: number | undefined;
  onPromptDraftEdited: (promptTextareaEdit: PromptTextareaEdit) => void;
  onPromptSubmitted: () => void;
  onNativeClipboardPasteRequested: () => void | Promise<void>;
};

export function PromptComposerChrome(props: PromptComposerChromeProps): ReactNode {
  const promptImageAttachmentPlaceholderTexts = props.chatSessionState.pendingPromptImageAttachments.map(
    (pendingPromptImageAttachment) => pendingPromptImageAttachment.promptDraftPlaceholderText,
  );

  return (
    <box flexDirection="column" flexShrink={0} width="100%">
      {props.shouldRenderMinimumHeightPromptStrip ? (
        <box paddingX={2} width="100%">
          <MinimumHeightPromptStrip
            promptDraft={props.chatSessionState.promptDraft}
            promptDraftCursorOffset={props.chatSessionState.promptDraftCursorOffset}
            promptImageAttachmentPlaceholderTexts={promptImageAttachmentPlaceholderTexts}
            selectedPromptContextReferenceTexts={props.chatSessionState.selectedPromptContextReferenceTexts}
            isPromptInputDisabled={props.isPromptInputDisabled}
            accentColor={props.inputPanelAccentColor}
            assistantResponseStatus={props.chatSessionState.conversationTurnStatus}
            isActiveTurnInterruptConfirmationArmed={props.isActiveTurnInterruptConfirmationArmed}
            onPromptDraftEdited={props.onPromptDraftEdited}
            onPromptSubmitted={props.onPromptSubmitted}
            onNativeClipboardPasteRequested={props.onNativeClipboardPasteRequested}
          />
        </box>
      ) : (
        <box flexDirection="column" flexShrink={0} width="100%">
          <InputPanel
            promptDraft={props.chatSessionState.promptDraft}
            promptDraftCursorOffset={props.chatSessionState.promptDraftCursorOffset}
            promptImageAttachmentPlaceholderTexts={promptImageAttachmentPlaceholderTexts}
            selectedPromptContextReferenceTexts={props.chatSessionState.selectedPromptContextReferenceTexts}
            isPromptInputDisabled={props.isPromptInputDisabled}
            accentColor={props.inputPanelAccentColor}
            onPromptDraftEdited={props.onPromptDraftEdited}
            onPromptSubmitted={props.onPromptSubmitted}
            onNativeClipboardPasteRequested={props.onNativeClipboardPasteRequested}
          />
          <InputStatusStrip
            assistantResponseStatus={props.chatSessionState.conversationTurnStatus}
            pendingPromptImageAttachmentCount={props.chatSessionState.pendingPromptImageAttachments.length}
            {...(props.promptInputHintOverride !== undefined ? { promptInputHintOverride: props.promptInputHintOverride } : {})}
            accentColor={props.inputPanelAccentColor}
            shortModeLabel={props.shortModeLabel}
            nextShortModeLabel={props.nextShortModeLabel}
            nextModeAccentColor={props.nextModeAccentColor}
            modelIdentifier={props.chatSessionState.selectedModelId}
            reasoningEffortLabel={props.reasoningEffortLabel}
            totalContextTokensUsed={props.totalContextTokensUsed}
            contextWindowTokenCapacity={props.contextWindowTokenCapacity}
          />
        </box>
      )}
    </box>
  );
}
