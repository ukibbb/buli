import type { ConversationMessage } from "@buli/contracts";
import {
  buildChatSlashCommands,
  listOrderedConversationMessages,
  type ChatSessionState,
  type ChatSlashCommand,
} from "@buli/chat-session-state";
import { calculateContextTokensUsedFromTokenUsage, lookupContextWindowTokenCapacityForModel } from "@buli/engine";
import {
  chatScreenTheme,
  minimumTerminalSizeTier,
  type ChatScreenTheme,
  type TerminalSizeTierForChatScreen,
} from "@buli/assistant-design-tokens";
import { INPUT_PANEL_NATURAL_ROW_COUNT } from "../components/InputPanel.tsx";
import { MINIMUM_HEIGHT_PROMPT_STRIP_ROW_COUNT } from "../components/MinimumHeightPromptStrip.tsx";
import { TOP_BAR_NATURAL_ROW_COUNT } from "../components/TopBar.tsx";

const CHAT_SCREEN_MIDDLE_AREA_TOP_PADDING_ROW_COUNT = 1;

export type ChatScreenViewModel = {
  isPromptInputDisabled: boolean;
  availableChatSlashCommands: readonly ChatSlashCommand[];
  modeLabel: string;
  inputPanelAccentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"];
  promptInputHintOverride: string | undefined;
  reasoningEffortLabel: string;
  inputRegionRowCount: number;
  availableCommandHelpModalRowCount: number;
  totalContextTokensUsed: number | undefined;
  contextWindowTokenCapacity: number | undefined;
  orderedConversationMessages: readonly ConversationMessage[];
  orderedConversationMessagePartCount: number;
  shouldRenderMinimumHeightPromptStrip: boolean;
};

export function buildChatScreenViewModel(input: {
  chatSessionState: ChatSessionState;
  terminalRowCount: number;
  terminalColumnCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
}): ChatScreenViewModel {
  const isPromptInputDisabled =
    input.chatSessionState.conversationTurnStatus === "streaming_assistant_response" ||
    input.chatSessionState.conversationTurnStatus === "waiting_for_tool_approval" ||
    input.chatSessionState.modelAndReasoningSelectionState.step !== "hidden" ||
    input.chatSessionState.conversationSessionSelectionState.step !== "hidden";
  const availableChatSlashCommands = buildChatSlashCommands({
    isReasoningSummaryVisible: input.chatSessionState.isReasoningSummaryVisible,
    selectedAssistantOperatingMode: input.chatSessionState.selectedAssistantOperatingMode,
  });
  const inputRegionRowCount =
    input.terminalSizeTierForChatScreen === minimumTerminalSizeTier
      ? MINIMUM_HEIGHT_PROMPT_STRIP_ROW_COUNT
      : INPUT_PANEL_NATURAL_ROW_COUNT;
  const totalContextTokensUsed = input.chatSessionState.latestTokenUsage
    ? calculateContextTokensUsedFromTokenUsage(input.chatSessionState.latestTokenUsage)
    : undefined;
  const orderedConversationMessages = listOrderedConversationMessages(input.chatSessionState);

  return {
    isPromptInputDisabled,
    availableChatSlashCommands,
    modeLabel: input.chatSessionState.selectedAssistantOperatingMode,
    inputPanelAccentColor: input.chatSessionState.selectedAssistantOperatingMode === "plan"
      ? chatScreenTheme.accentAmber
      : chatScreenTheme.accentGreen,
    promptInputHintOverride: input.chatSessionState.selectedAssistantOperatingMode === "plan"
      ? "read-only planning mode · tab to implementation"
      : undefined,
    reasoningEffortLabel:
      input.chatSessionState.selectedReasoningEffort ?? input.chatSessionState.selectedModelDefaultReasoningEffort ?? "default",
    inputRegionRowCount,
    availableCommandHelpModalRowCount: Math.max(
      0,
      input.terminalRowCount - TOP_BAR_NATURAL_ROW_COUNT - CHAT_SCREEN_MIDDLE_AREA_TOP_PADDING_ROW_COUNT - inputRegionRowCount,
    ),
    totalContextTokensUsed,
    contextWindowTokenCapacity: lookupContextWindowTokenCapacityForModel(input.chatSessionState.selectedModelId),
    orderedConversationMessages,
    orderedConversationMessagePartCount: orderedConversationMessages.reduce(
      (conversationMessagePartCount, conversationMessage) => conversationMessagePartCount + conversationMessage.partIds.length,
      0,
    ),
    shouldRenderMinimumHeightPromptStrip: input.terminalSizeTierForChatScreen === minimumTerminalSizeTier,
  };
}
