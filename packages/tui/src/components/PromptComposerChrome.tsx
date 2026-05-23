import type { PendingPromptImageAttachment } from "@buli/chat-session-state";
import type { ConversationTurnStatus } from "@buli/contracts";
import type { ChatScreenTheme } from "@buli/assistant-design-tokens";
import { memo, type ReactNode } from "react";
import { InputPanel } from "./InputPanel.tsx";
import { InputStatusStrip } from "./InputStatusStrip.tsx";
import { MinimumHeightPromptStrip } from "./MinimumHeightPromptStrip.tsx";
import type { PromptTextareaEdit } from "./PromptTextarea.tsx";

export type PromptComposerChromeProps = {
  conversationTurnStatus: ConversationTurnStatus;
  promptDraft: string;
  promptDraftCursorOffset: number;
  pendingPromptImageAttachments: readonly PendingPromptImageAttachment[];
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
};

function PromptComposerChromeComponent(props: PromptComposerChromeProps): ReactNode {
  const promptImageAttachmentPlaceholderTexts = props.pendingPromptImageAttachments.map(
    (pendingPromptImageAttachment) => pendingPromptImageAttachment.promptDraftPlaceholderText,
  );

  return (
    <box flexDirection="column" flexShrink={0} width="100%">
      {props.shouldRenderMinimumHeightPromptStrip ? (
        <box paddingX={2} width="100%">
          <MinimumHeightPromptStrip
            promptDraft={props.promptDraft}
            promptDraftCursorOffset={props.promptDraftCursorOffset}
            promptImageAttachmentPlaceholderTexts={promptImageAttachmentPlaceholderTexts}
            selectedPromptContextReferenceTexts={props.selectedPromptContextReferenceTexts}
            isPromptInputDisabled={props.isPromptInputDisabled}
            queuedPromptCount={props.queuedPromptCount}
            accentColor={props.inputPanelAccentColor}
            assistantResponseStatus={props.conversationTurnStatus}
            isActiveTurnInterruptConfirmationArmed={props.isActiveTurnInterruptConfirmationArmed}
            onPromptDraftEdited={props.onPromptDraftEdited}
            onPromptSubmitted={props.onPromptSubmitted}
            onNativeClipboardPasteRequested={props.onNativeClipboardPasteRequested}
          />
        </box>
      ) : (
        <box flexDirection="column" flexShrink={0} width="100%">
          <InputPanel
            promptDraft={props.promptDraft}
            promptDraftCursorOffset={props.promptDraftCursorOffset}
            promptImageAttachmentPlaceholderTexts={promptImageAttachmentPlaceholderTexts}
            selectedPromptContextReferenceTexts={props.selectedPromptContextReferenceTexts}
            isPromptInputDisabled={props.isPromptInputDisabled}
            accentColor={props.inputPanelAccentColor}
            onPromptDraftEdited={props.onPromptDraftEdited}
            onPromptSubmitted={props.onPromptSubmitted}
            onNativeClipboardPasteRequested={props.onNativeClipboardPasteRequested}
          />
          <InputStatusStrip
            assistantResponseStatus={props.conversationTurnStatus}
            pendingPromptImageAttachmentCount={props.pendingPromptImageAttachments.length}
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
