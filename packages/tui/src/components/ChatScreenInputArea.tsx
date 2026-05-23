import type { ChatSessionState } from "@buli/chat-session-state";
import { chatScreenTheme, type ChatScreenTheme } from "@buli/assistant-design-tokens";
import type { ReactNode } from "react";
import { ConversationSessionSelectionPane } from "./ConversationSessionSelectionPane.tsx";
import { InputPanel } from "./InputPanel.tsx";
import { MinimumHeightPromptStrip } from "./MinimumHeightPromptStrip.tsx";
import { ModelAndReasoningSelectionPane } from "./ModelAndReasoningSelectionPane.tsx";
import { PromptContextSelectionPane } from "./PromptContextSelectionPane.tsx";
import type { PromptTextareaEdit } from "./PromptTextarea.tsx";
import { SelectionPaneFrame } from "./SelectionPaneFrame.tsx";
import { SlashCommandSelectionPane } from "./SlashCommandSelectionPane.tsx";
import { ErrorBannerBlock } from "./behavior/ErrorBannerBlock.tsx";
import { ToolApprovalRequestBlock } from "./behavior/ToolApprovalRequestBlock.tsx";
import type { ConversationSessionCompactionStatus, ConversationSessionExportStatus } from "../behavior/chatScreenConversationSessionStatus.ts";

export type ChatScreenInputAreaProps = {
  chatSessionState: ChatSessionState;
  conversationSessionExportStatus: ConversationSessionExportStatus;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  shouldRenderMinimumHeightPromptStrip: boolean;
  isPromptInputDisabled: boolean;
  isActiveTurnInterruptConfirmationArmed: boolean;
  inputPanelAccentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"] | ChatScreenTheme["accentPink"];
  promptInputHintOverride: string | undefined;
  modeLabel: string;
  reasoningEffortLabel: string;
  totalContextTokensUsed: number | undefined;
  contextWindowTokenCapacity: number | undefined;
  onPendingToolApprovalApproved: () => void;
  onPendingToolApprovalDenied: () => void;
  onPromptDraftEdited: (promptTextareaEdit: PromptTextareaEdit) => void;
  onPromptSubmitted: () => void;
  onNativeClipboardPasteRequested: () => void | Promise<void>;
  onConversationSessionDeletionRequested: (conversationSessionId: string) => void | Promise<void>;
};

export function ChatScreenInputArea(props: ChatScreenInputAreaProps): ReactNode {
  const promptImageAttachmentPlaceholderTexts = props.chatSessionState.pendingPromptImageAttachments.map(
    (pendingPromptImageAttachment) => pendingPromptImageAttachment.promptDraftPlaceholderText,
  );

  return (
    <box flexDirection="column" flexShrink={0}>
      {props.chatSessionState.pendingToolApprovalRequest ? (
        <box paddingX={2}>
          <ToolApprovalRequestBlock
            riskExplanation={props.chatSessionState.pendingToolApprovalRequest.riskExplanation}
            onApprove={props.onPendingToolApprovalApproved}
            onDeny={props.onPendingToolApprovalDenied}
          />
        </box>
      ) : null}
      {renderConversationSessionExportStatusPane(props.conversationSessionExportStatus)}
      {renderConversationSessionCompactionStatusPane(props.conversationSessionCompactionStatus)}
      {renderConversationSessionSelectionPane(props)}
      {renderModelAndReasoningSelectionPane(props)}
      {renderSlashCommandSelectionPane(props)}
      {renderPromptContextSelectionPane(props)}
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
        )}
      </box>
    </box>
  );
}

function renderConversationSessionExportStatusPane(conversationSessionExportStatus: ConversationSessionExportStatus): ReactNode {
  return conversationSessionExportStatus.step === "failed" ? (
    <box paddingX={2} marginBottom={1}>
      <ErrorBannerBlock titleText="Could not export session" errorText={conversationSessionExportStatus.errorMessage} />
    </box>
  ) : null;
}

function renderConversationSessionCompactionStatusPane(
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus,
): ReactNode {
  return conversationSessionCompactionStatus.step === "failed" ? (
    <box paddingX={2} marginBottom={1}>
      <ErrorBannerBlock titleText="Could not compact session" errorText={conversationSessionCompactionStatus.errorMessage} />
    </box>
  ) : conversationSessionCompactionStatus.step === "compacting" ? (
    <box paddingX={2} marginBottom={1}>
      <text fg={chatScreenTheme.textMuted}>
        {conversationSessionCompactionStatus.source === "auto" ? "Auto-compacting context..." : "Compacting session..."}
      </text>
    </box>
  ) : null;
}

function renderConversationSessionSelectionPane(props: ChatScreenInputAreaProps): ReactNode {
  return props.chatSessionState.conversationSessionSelectionState.step === "loading_conversation_sessions" ? (
    <SelectionPaneFrame accentColor={props.inputPanelAccentColor}>
      <text fg={chatScreenTheme.textSecondary}>Loading sessions...</text>
    </SelectionPaneFrame>
  ) : props.chatSessionState.conversationSessionSelectionState.step === "showing_session_loading_error" ? (
    <box paddingX={2}>
      <ErrorBannerBlock
        titleText="Could not load sessions"
        errorText={props.chatSessionState.conversationSessionSelectionState.errorMessage}
      />
    </box>
  ) : props.chatSessionState.conversationSessionSelectionState.step === "showing_conversation_sessions" ? (
    <ConversationSessionSelectionPane
      conversationSessions={props.chatSessionState.conversationSessionSelectionState.conversationSessions}
      highlightedConversationSessionIndex={
        props.chatSessionState.conversationSessionSelectionState.highlightedConversationSessionIndex
      }
      activeConversationSessionId={props.chatSessionState.conversationSessionSelectionState.activeConversationSessionId}
      pendingDeletionConversationSessionId={
        props.chatSessionState.conversationSessionSelectionState.pendingDeletionConversationSessionId
      }
      accentColor={props.inputPanelAccentColor}
      onConversationSessionDeletionRequested={props.onConversationSessionDeletionRequested}
    />
  ) : null;
}

function renderPromptContextSelectionPane(props: ChatScreenInputAreaProps): ReactNode {
  return props.chatSessionState.promptContextSelectionState.step === "showing_prompt_context_candidates" ? (
    <PromptContextSelectionPane
      promptContextCandidates={props.chatSessionState.promptContextSelectionState.promptContextCandidates}
      highlightedPromptContextCandidateIndex={
        props.chatSessionState.promptContextSelectionState.highlightedPromptContextCandidateIndex
      }
      accentColor={props.inputPanelAccentColor}
    />
  ) : null;
}

function renderModelAndReasoningSelectionPane(props: ChatScreenInputAreaProps): ReactNode {
  const modelAndReasoningSelectionState = props.chatSessionState.modelAndReasoningSelectionState;
  return modelAndReasoningSelectionState.step === "loading_available_models" ? (
    <SelectionPaneFrame accentColor={props.inputPanelAccentColor}>
      <text fg={chatScreenTheme.textSecondary}>Loading models...</text>
    </SelectionPaneFrame>
  ) : modelAndReasoningSelectionState.step === "showing_model_loading_error" ? (
    <box paddingX={2}>
      <ErrorBannerBlock titleText="Could not load models" errorText={modelAndReasoningSelectionState.errorMessage} />
    </box>
  ) : modelAndReasoningSelectionState.step === "showing_available_models" ? (
    <ModelAndReasoningSelectionPane
      visibleChoices={modelAndReasoningSelectionState.availableModels.map(
        (availableAssistantModel) => availableAssistantModel.displayName,
      )}
      highlightedChoiceIndex={modelAndReasoningSelectionState.highlightedModelIndex}
      accentColor={props.inputPanelAccentColor}
    />
  ) : modelAndReasoningSelectionState.step === "showing_reasoning_effort_choices" ? (
    <ModelAndReasoningSelectionPane
      visibleChoices={modelAndReasoningSelectionState.availableReasoningEffortChoices.map(
        (availableReasoningEffortChoice) => availableReasoningEffortChoice.displayLabel,
      )}
      highlightedChoiceIndex={modelAndReasoningSelectionState.highlightedReasoningEffortChoiceIndex}
      accentColor={props.inputPanelAccentColor}
    />
  ) : null;
}

function renderSlashCommandSelectionPane(props: ChatScreenInputAreaProps): ReactNode {
  return props.chatSessionState.slashCommandSelectionState.step === "showing_slash_commands" ? (
    <SlashCommandSelectionPane
      availableSlashCommands={props.chatSessionState.slashCommandSelectionState.availableSlashCommands}
      highlightedSlashCommandIndex={props.chatSessionState.slashCommandSelectionState.highlightedSlashCommandIndex}
      accentColor={props.inputPanelAccentColor}
    />
  ) : null;
}
