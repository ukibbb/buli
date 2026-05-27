import type { PendingPromptImageAttachment, PendingPromptTextPaste } from "@buli/chat-session-state";
import type { ConversationTurnStatus } from "@buli/contracts";
import type {
  ChatAppRenderStore,
  ConversationSessionCompactionStatus,
} from "@buli/chat-app-controller";
import type { ChatScreenTheme } from "@buli/assistant-design-tokens";
import { memo, useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { InputPanel } from "./InputPanel.tsx";
import { InputStatusStrip } from "./InputStatusStrip.tsx";
import { MinimumHeightPromptStrip } from "./MinimumHeightPromptStrip.tsx";
import type { PromptTextareaEdit, PromptTextareaSummarizedPaste } from "./PromptTextarea.tsx";

export type PromptComposerChromeProps = PromptComposerChromeCommonProps & (
  | StoreBackedPromptComposerChromeStateProps
  | DirectPromptComposerChromeStateProps
);

type PromptComposerChromeCommonProps = {
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
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
  contextMeterTokenLimit: number | undefined;
  onPromptDraftEdited: (promptTextareaEdit: PromptTextareaEdit) => void;
  onPromptSubmitted: () => void;
  onNativeClipboardPasteRequested: () => void | Promise<void>;
  onSummarizedPromptTextPasted: (summarizedPromptTextPaste: PromptTextareaSummarizedPaste) => void;
};

type StoreBackedPromptComposerChromeStateProps = {
  chatAppRenderStore: ChatAppRenderStore;
};

type DirectPromptComposerChromeStateProps = PromptComposerChromeRenderState & {
  chatAppRenderStore?: undefined;
};

type PromptComposerChromeRenderState = {
  conversationTurnStatus: ConversationTurnStatus;
  promptDraft: string;
  promptDraftCursorOffset: number;
  pendingPromptImageAttachments: readonly PendingPromptImageAttachment[];
  pendingPromptTextPastes: readonly PendingPromptTextPaste[];
  selectedPromptContextReferenceTexts: readonly string[];
  selectedModelId: string;
};

const emptyPromptPlaceholderTexts: readonly string[] = [];

function PromptComposerChromeComponent(props: PromptComposerChromeProps): ReactNode {
  if (props.chatAppRenderStore) {
    return <StoreBackedPromptComposerChrome {...props} chatAppRenderStore={props.chatAppRenderStore} />;
  }

  return <PromptComposerChromeLayout {...props} promptComposerRenderState={props} />;
}

function StoreBackedPromptComposerChrome(
  props: PromptComposerChromeCommonProps & StoreBackedPromptComposerChromeStateProps,
): ReactNode {
  const subscribeToPromptComposer = useCallback(
    (listener: () => void) => props.chatAppRenderStore.subscribePromptComposer(listener),
    [props.chatAppRenderStore],
  );
  const readPromptComposerSnapshot = useCallback(
    () => props.chatAppRenderStore.readPromptComposerSnapshot(),
    [props.chatAppRenderStore],
  );
  const promptComposerRenderState = useSyncExternalStore(
    subscribeToPromptComposer,
    readPromptComposerSnapshot,
    readPromptComposerSnapshot,
  );

  return <PromptComposerChromeLayout {...props} promptComposerRenderState={promptComposerRenderState} />;
}

function PromptComposerChromeLayout(
  props: PromptComposerChromeCommonProps & { promptComposerRenderState: PromptComposerChromeRenderState },
): ReactNode {
  const promptComposerRenderState = props.promptComposerRenderState;
  const promptImageAttachmentPlaceholderTexts = useMemo(
    () =>
      promptComposerRenderState.pendingPromptImageAttachments.length === 0
        ? emptyPromptPlaceholderTexts
        : promptComposerRenderState.pendingPromptImageAttachments.map(
            (pendingPromptImageAttachment) => pendingPromptImageAttachment.promptDraftPlaceholderText,
          ),
    [promptComposerRenderState.pendingPromptImageAttachments],
  );
  const promptTextPastePlaceholderTexts = useMemo(
    () =>
      promptComposerRenderState.pendingPromptTextPastes.length === 0
        ? emptyPromptPlaceholderTexts
        : promptComposerRenderState.pendingPromptTextPastes.map(
            (pendingPromptTextPaste) => pendingPromptTextPaste.promptDraftPlaceholderText,
          ),
    [promptComposerRenderState.pendingPromptTextPastes],
  );

  return (
    <box flexDirection="column" flexShrink={0} width="100%">
      {props.shouldRenderMinimumHeightPromptStrip ? (
        <box paddingX={2} width="100%">
          <MinimumHeightPromptStrip
            promptDraft={promptComposerRenderState.promptDraft}
            promptDraftCursorOffset={promptComposerRenderState.promptDraftCursorOffset}
            promptImageAttachmentPlaceholderTexts={promptImageAttachmentPlaceholderTexts}
            promptTextPastePlaceholderTexts={promptTextPastePlaceholderTexts}
            selectedPromptContextReferenceTexts={promptComposerRenderState.selectedPromptContextReferenceTexts}
            isPromptInputDisabled={props.isPromptInputDisabled}
            accentColor={props.inputPanelAccentColor}
            assistantResponseStatus={promptComposerRenderState.conversationTurnStatus}
            conversationSessionCompactionStatus={props.conversationSessionCompactionStatus}
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
            promptDraft={promptComposerRenderState.promptDraft}
            promptDraftCursorOffset={promptComposerRenderState.promptDraftCursorOffset}
            promptImageAttachmentPlaceholderTexts={promptImageAttachmentPlaceholderTexts}
            promptTextPastePlaceholderTexts={promptTextPastePlaceholderTexts}
            selectedPromptContextReferenceTexts={promptComposerRenderState.selectedPromptContextReferenceTexts}
            selectedModelId={promptComposerRenderState.selectedModelId}
            isPromptInputDisabled={props.isPromptInputDisabled}
            accentColor={props.inputPanelAccentColor}
            onPromptDraftEdited={props.onPromptDraftEdited}
            onPromptSubmitted={props.onPromptSubmitted}
            onNativeClipboardPasteRequested={props.onNativeClipboardPasteRequested}
            onSummarizedPromptTextPasted={props.onSummarizedPromptTextPasted}
          />
          <InputStatusStrip
            assistantResponseStatus={promptComposerRenderState.conversationTurnStatus}
            conversationSessionCompactionStatus={props.conversationSessionCompactionStatus}
            queuedPromptCount={props.queuedPromptCount}
            {...(props.promptInputHintOverride !== undefined ? { promptInputHintOverride: props.promptInputHintOverride } : {})}
            accentColor={props.inputPanelAccentColor}
            shortModeLabel={props.shortModeLabel}
            nextShortModeLabel={props.nextShortModeLabel}
            nextModeAccentColor={props.nextModeAccentColor}
            modelIdentifier={promptComposerRenderState.selectedModelId}
            reasoningEffortLabel={props.reasoningEffortLabel}
            totalContextTokensUsed={props.totalContextTokensUsed}
            contextMeterTokenLimit={props.contextMeterTokenLimit}
          />
        </box>
      )}
    </box>
  );
}

function arePromptComposerChromePropsEqual(
  previousProps: PromptComposerChromeProps,
  nextProps: PromptComposerChromeProps,
): boolean {
  if (previousProps.chatAppRenderStore || nextProps.chatAppRenderStore) {
    return previousProps.chatAppRenderStore !== undefined &&
      nextProps.chatAppRenderStore !== undefined &&
      arePromptComposerChromeCommonPropsEqual(previousProps, nextProps) &&
      previousProps.chatAppRenderStore === nextProps.chatAppRenderStore;
  }

  return arePromptComposerChromeCommonPropsEqual(previousProps, nextProps) &&
    previousProps.conversationTurnStatus === nextProps.conversationTurnStatus &&
    previousProps.promptDraft === nextProps.promptDraft &&
    previousProps.promptDraftCursorOffset === nextProps.promptDraftCursorOffset &&
    previousProps.pendingPromptImageAttachments === nextProps.pendingPromptImageAttachments &&
    previousProps.pendingPromptTextPastes === nextProps.pendingPromptTextPastes &&
    previousProps.selectedPromptContextReferenceTexts === nextProps.selectedPromptContextReferenceTexts &&
    previousProps.selectedModelId === nextProps.selectedModelId;
}

function arePromptComposerChromeCommonPropsEqual(
  previousProps: PromptComposerChromeCommonProps,
  nextProps: PromptComposerChromeCommonProps,
): boolean {
  return previousProps.conversationSessionCompactionStatus === nextProps.conversationSessionCompactionStatus &&
    previousProps.shouldRenderMinimumHeightPromptStrip === nextProps.shouldRenderMinimumHeightPromptStrip &&
    previousProps.isPromptInputDisabled === nextProps.isPromptInputDisabled &&
    previousProps.queuedPromptCount === nextProps.queuedPromptCount &&
    previousProps.isActiveTurnInterruptConfirmationArmed === nextProps.isActiveTurnInterruptConfirmationArmed &&
    previousProps.inputPanelAccentColor === nextProps.inputPanelAccentColor &&
    previousProps.promptInputHintOverride === nextProps.promptInputHintOverride &&
    previousProps.shortModeLabel === nextProps.shortModeLabel &&
    previousProps.nextShortModeLabel === nextProps.nextShortModeLabel &&
    previousProps.nextModeAccentColor === nextProps.nextModeAccentColor &&
    previousProps.reasoningEffortLabel === nextProps.reasoningEffortLabel &&
    previousProps.totalContextTokensUsed === nextProps.totalContextTokensUsed &&
    previousProps.contextMeterTokenLimit === nextProps.contextMeterTokenLimit &&
    previousProps.onPromptDraftEdited === nextProps.onPromptDraftEdited &&
    previousProps.onPromptSubmitted === nextProps.onPromptSubmitted &&
    previousProps.onNativeClipboardPasteRequested === nextProps.onNativeClipboardPasteRequested &&
    previousProps.onSummarizedPromptTextPasted === nextProps.onSummarizedPromptTextPasted;
}

export const PromptComposerChrome = memo(PromptComposerChromeComponent, arePromptComposerChromePropsEqual);
