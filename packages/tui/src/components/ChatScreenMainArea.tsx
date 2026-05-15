import type { ChatSessionState, ChatSlashCommand } from "@buli/chat-session-state";
import type { ChatScreenTheme, TerminalSizeTierForChatScreen } from "@buli/assistant-design-tokens";
import type { ConversationMessage, ConversationMessagePart } from "@buli/contracts";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ReactNode, RefObject } from "react";
import { CommandHelpModal } from "./CommandHelpModal.tsx";
import { ConversationMessageList } from "./ConversationMessageList.tsx";
import { ModelAndReasoningSelectionPane } from "./ModelAndReasoningSelectionPane.tsx";
import { ErrorBannerBlock } from "./behavior/ErrorBannerBlock.tsx";

export type ChatScreenMainAreaProps = {
  chatSessionState: ChatSessionState;
  inputPanelAccentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"] | ChatScreenTheme["accentPink"];
  availableCommandHelpModalRowCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
  availableChatSlashCommands: readonly ChatSlashCommand[];
  orderedConversationMessages: readonly ConversationMessage[];
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  resolveConversationMessageParts: (messageId: string) => readonly ConversationMessagePart[];
  onCommandHelpCloseRequested: () => void;
};

export function ChatScreenMainArea(props: ChatScreenMainAreaProps): ReactNode {
  const modelAndReasoningSelectionPane = renderModelAndReasoningSelectionPane(props);

  if (props.chatSessionState.isCommandHelpModalVisible) {
    return (
      <box alignItems="center" flexGrow={1} justifyContent="center">
        <CommandHelpModal
          onCloseRequested={props.onCommandHelpCloseRequested}
          availableModalRowCount={props.availableCommandHelpModalRowCount}
          terminalSizeTierForChatScreen={props.terminalSizeTierForChatScreen}
          availableSlashCommands={props.availableChatSlashCommands}
        />
      </box>
    );
  }

  return modelAndReasoningSelectionPane ?? (
    <ConversationMessageList
      conversationMessages={props.orderedConversationMessages}
      isReasoningSummaryVisible={props.chatSessionState.isReasoningSummaryVisible}
      resolveConversationMessageParts={props.resolveConversationMessageParts}
      conversationMessageScrollBoxRef={props.conversationMessageScrollBoxRef}
      horizontalRuleColor={props.inputPanelAccentColor}
    />
  );
}

function renderModelAndReasoningSelectionPane(props: ChatScreenMainAreaProps): ReactNode {
  return props.chatSessionState.modelAndReasoningSelectionState.step === "loading_available_models" ? (
    <box alignItems="center" flexGrow={1} justifyContent="center">
      <text fg={props.inputPanelAccentColor}>Loading models...</text>
    </box>
  ) : props.chatSessionState.modelAndReasoningSelectionState.step === "showing_model_loading_error" ? (
    <ErrorBannerBlock
      titleText="Could not load models"
      errorText={props.chatSessionState.modelAndReasoningSelectionState.errorMessage}
    />
  ) : props.chatSessionState.modelAndReasoningSelectionState.step === "showing_available_models" ? (
    <ModelAndReasoningSelectionPane
      visibleChoices={props.chatSessionState.modelAndReasoningSelectionState.availableModels.map(
        (availableAssistantModel) => availableAssistantModel.displayName,
      )}
      highlightedChoiceIndex={props.chatSessionState.modelAndReasoningSelectionState.highlightedModelIndex}
      headingText="Choose model"
      accentColor={props.inputPanelAccentColor}
    />
  ) : props.chatSessionState.modelAndReasoningSelectionState.step === "showing_reasoning_effort_choices" ? (
    <ModelAndReasoningSelectionPane
      visibleChoices={props.chatSessionState.modelAndReasoningSelectionState.availableReasoningEffortChoices.map(
        (availableReasoningEffortChoice) => availableReasoningEffortChoice.displayLabel,
      )}
      highlightedChoiceIndex={
        props.chatSessionState.modelAndReasoningSelectionState.highlightedReasoningEffortChoiceIndex
      }
      headingText={`Choose reasoning for ${props.chatSessionState.modelAndReasoningSelectionState.selectedModel.displayName}`}
      accentColor={props.inputPanelAccentColor}
    />
  ) : null;
}
