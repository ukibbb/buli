import type { PendingPromptImageAttachment, PendingPromptTextPaste } from "@buli/chat-session-state";
import type { ConversationTurnStatus } from "@buli/contracts";
import type { ChatScreenTheme } from "@buli/assistant-design-tokens";
import { memo, type ReactNode } from "react";
import { InputPanel } from "./InputPanel.tsx";
import { InputStatusStrip } from "./InputStatusStrip.tsx";
import { MinimumHeightPromptStrip } from "./MinimumHeightPromptStrip.tsx";
import type { PromptTextareaEdit, PromptTextareaSummarizedPaste } from "./PromptTextarea.tsx";

export type PromptComposerChromeProps = {
  conversationTurnStatus: ConversationTurnStatus;
  isConversationCompactionRunning: boolean;
  promptDraft: string;
  promptDraftCursorOffset: number;
  pendingPromptImageAttachments: readonly PendingPromptImageAttachment[];
  pendingPromptTextPastes: readonly PendingPromptTextPaste[];
  selectedPromptContextReferenceTexts: readonly string[];
  selectedModelId: string;
  shouldRenderMinimumHeightPromptStrip: boolean;
  isPromptInputDisabled: boolean;
  queuedPromptCount: number;
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
  onSummarizedPromptTextPasted: (summarizedPromptTextPaste: PromptTextareaSummarizedPaste) => void;
};

function PromptComposerChromeComponent(props: PromptComposerChromeProps): ReactNode {
  const promptImageAttachmentPlaceholderTexts = props.pendingPromptImageAttachments.map(
    (pendingPromptImageAttachment) => pendingPromptImageAttachment.promptDraftPlaceholderText,
  );
  const promptTextPastePlaceholderTexts = props.pendingPromptTextPastes.map(
    (pendingPromptTextPaste) => pendingPromptTextPaste.promptDraftPlaceholderText,
  );

  return (
    <box flexDirection="column" flexShrink={0} width="100%">
      {props.shouldRenderMinimumHeightPromptStrip ? (
        <box paddingX={2} width="100%">
          <MinimumHeightPromptStrip
            promptDraft={props.promptDraft}
            promptDraftCursorOffset={props.promptDraftCursorOffset}
            promptImageAttachmentPlaceholderTexts={promptImageAttachmentPlaceholderTexts}
            promptTextPastePlaceholderTexts={promptTextPastePlaceholderTexts}
            selectedPromptContextReferenceTexts={props.selectedPromptContextReferenceTexts}
            isPromptInputDisabled={props.isPromptInputDisabled}
            queuedPromptCount={props.queuedPromptCount}
            accentColor={props.inputPanelAccentColor}
            assistantResponseStatus={props.conversationTurnStatus}
            isConversationCompactionRunning={props.isConversationCompactionRunning}
            isActiveTurnInterruptConfirmationArmed={props.isActiveTurnInterruptConfirmationArmed}
            onPromptDraftEdited={props.onPromptDraftEdited}
            onPromptSubmitted={props.onPromptSubmitted}
            onNativeClipboardPasteRequested={props.onNativeClipboardPasteRequested}
            onSummarizedPromptTextPasted={props.onSummarizedPromptTextPasted}
          />
        </box>
      ) : (
        <box flexDirection="column" flexShrink={0} width="100%">
          <InputPanel
            promptDraft={props.promptDraft}
            promptDraftCursorOffset={props.promptDraftCursorOffset}
            promptImageAttachmentPlaceholderTexts={promptImageAttachmentPlaceholderTexts}
            promptTextPastePlaceholderTexts={promptTextPastePlaceholderTexts}
            selectedPromptContextReferenceTexts={props.selectedPromptContextReferenceTexts}
            isPromptInputDisabled={props.isPromptInputDisabled}
            accentColor={props.inputPanelAccentColor}
            onPromptDraftEdited={props.onPromptDraftEdited}
            onPromptSubmitted={props.onPromptSubmitted}
            onNativeClipboardPasteRequested={props.onNativeClipboardPasteRequested}
            onSummarizedPromptTextPasted={props.onSummarizedPromptTextPasted}
          />
          <InputStatusStrip
            assistantResponseStatus={props.conversationTurnStatus}
            queuedPromptCount={props.queuedPromptCount}
            {...(props.promptInputHintOverride !== undefined ? { promptInputHintOverride: props.promptInputHintOverride } : {})}
            accentColor={props.inputPanelAccentColor}
            shortModeLabel={props.shortModeLabel}
            nextShortModeLabel={props.nextShortModeLabel}
            nextModeAccentColor={props.nextModeAccentColor}
            modelIdentifier={props.selectedModelId}
            reasoningEffortLabel={props.reasoningEffortLabel}
            totalContextTokensUsed={props.totalContextTokensUsed}
            contextWindowTokenCapacity={props.contextWindowTokenCapacity}
          />
        </box>
      )}
    </box>
  );
}

export const PromptComposerChrome = memo(PromptComposerChromeComponent);
