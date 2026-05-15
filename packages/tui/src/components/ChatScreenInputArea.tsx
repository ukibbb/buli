import type { ChatSessionState } from "@buli/chat-session-state";
import { chatScreenTheme, type ChatScreenTheme } from "@buli/assistant-design-tokens";
import type { ReactNode } from "react";
import { ConversationSessionSelectionPane } from "./ConversationSessionSelectionPane.tsx";
import { InputPanel } from "./InputPanel.tsx";
import { MinimumHeightPromptStrip } from "./MinimumHeightPromptStrip.tsx";
import { PromptContextSelectionPane } from "./PromptContextSelectionPane.tsx";
import type { PromptTextareaEdit } from "./PromptTextarea.tsx";
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
  inputPanelAccentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"];
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
};

export function ChatScreenInputArea(props: ChatScreenInputAreaProps): ReactNode {
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
      {renderSlashCommandSelectionPane(props)}
      {renderPromptContextSelectionPane(props)}
      <box flexDirection="column" flexShrink={0} width="100%">
        {props.shouldRenderMinimumHeightPromptStrip ? (
          <box paddingX={2} width="100%">
            <MinimumHeightPromptStrip
              promptDraft={props.chatSessionState.promptDraft}
              promptDraftCursorOffset={props.chatSessionState.promptDraftCursorOffset}
              pendingPromptImageAttachments={props.chatSessionState.pendingPromptImageAttachments}
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
            pendingPromptImageAttachments={props.chatSessionState.pendingPromptImageAttachments}
            selectedPromptContextReferenceTexts={props.chatSessionState.selectedPromptContextReferenceTexts}
            isPromptInputDisabled={props.isPromptInputDisabled}
            {...(props.promptInputHintOverride !== undefined ? { promptInputHintOverride: props.promptInputHintOverride } : {})}
            accentColor={props.inputPanelAccentColor}
            modeLabel={props.modeLabel}
            modelIdentifier={props.chatSessionState.selectedModelId}
            reasoningEffortLabel={props.reasoningEffortLabel}
            assistantResponseStatus={props.chatSessionState.conversationTurnStatus}
            isActiveTurnInterruptConfirmationArmed={props.isActiveTurnInterruptConfirmationArmed}
            totalContextTokensUsed={props.totalContextTokensUsed}
            contextWindowTokenCapacity={props.contextWindowTokenCapacity}
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
    <box
      borderStyle="rounded"
      borderColor={props.inputPanelAccentColor}
      backgroundColor={chatScreenTheme.surfaceOne}
      flexDirection="column"
      flexShrink={0}
      marginX={2}
      paddingX={1}
    >
      <text fg={chatScreenTheme.textMuted}>Sessions</text>
      <text fg={chatScreenTheme.textSecondary}>Loading sessions...</text>
    </box>
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
      accentColor={props.inputPanelAccentColor}
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

function renderSlashCommandSelectionPane(props: ChatScreenInputAreaProps): ReactNode {
  return props.chatSessionState.slashCommandSelectionState.step === "showing_slash_commands" ? (
    <SlashCommandSelectionPane
      availableSlashCommands={props.chatSessionState.slashCommandSelectionState.availableSlashCommands}
      highlightedSlashCommandIndex={props.chatSessionState.slashCommandSelectionState.highlightedSlashCommandIndex}
      accentColor={props.inputPanelAccentColor}
    />
  ) : null;
}
