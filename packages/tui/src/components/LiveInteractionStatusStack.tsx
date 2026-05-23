import type { ChatSessionState } from "@buli/chat-session-state";
import type {
  ConversationSessionCompactionStatus,
  ConversationSessionExportStatus,
} from "@buli/chat-app-controller";
import { chatScreenTheme, type ChatScreenTheme } from "@buli/assistant-design-tokens";
import type { ReactNode } from "react";
import { ConversationSessionSelectionPane } from "./ConversationSessionSelectionPane.tsx";
import { ModelAndReasoningSelectionPane } from "./ModelAndReasoningSelectionPane.tsx";
import { PromptContextSelectionPane } from "./PromptContextSelectionPane.tsx";
import { SelectionPaneFrame } from "./SelectionPaneFrame.tsx";
import { SlashCommandSelectionPane } from "./SlashCommandSelectionPane.tsx";
import { ErrorBannerBlock } from "./behavior/ErrorBannerBlock.tsx";
import { ToolApprovalRequestBlock } from "./behavior/ToolApprovalRequestBlock.tsx";

export type LiveInteractionStatusStackProps = {
  chatSessionState: ChatSessionState;
  conversationSessionExportStatus: ConversationSessionExportStatus;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  inputPanelAccentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"] | ChatScreenTheme["accentPink"];
  onPendingToolApprovalApproved: () => void;
  onPendingToolApprovalDenied: () => void;
  onConversationSessionDeletionRequested: (conversationSessionId: string) => void | Promise<void>;
};

export function LiveInteractionStatusStack(props: LiveInteractionStatusStackProps): ReactNode {
  return (
    <>
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
    </>
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

function renderConversationSessionSelectionPane(props: LiveInteractionStatusStackProps): ReactNode {
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

function renderPromptContextSelectionPane(props: LiveInteractionStatusStackProps): ReactNode {
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

function renderModelAndReasoningSelectionPane(props: LiveInteractionStatusStackProps): ReactNode {
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

function renderSlashCommandSelectionPane(props: LiveInteractionStatusStackProps): ReactNode {
  return props.chatSessionState.slashCommandSelectionState.step === "showing_slash_commands" ? (
    <SlashCommandSelectionPane
      availableSlashCommands={props.chatSessionState.slashCommandSelectionState.availableSlashCommands}
      highlightedSlashCommandIndex={props.chatSessionState.slashCommandSelectionState.highlightedSlashCommandIndex}
      accentColor={props.inputPanelAccentColor}
    />
  ) : null;
}
