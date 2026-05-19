import type { AssistantOperatingMode, ConversationMessage } from "@buli/contracts";
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
import { INPUT_PANEL_MAX_ROW_COUNT } from "../components/InputPanel.tsx";
import { MINIMUM_HEIGHT_PROMPT_STRIP_ROW_COUNT } from "../components/MinimumHeightPromptStrip.tsx";
import { TOP_BAR_NATURAL_ROW_COUNT } from "../components/TopBar.tsx";
import type { ConversationSessionCompactionStatus } from "./chatScreenConversationSessionStatus.ts";

const CHAT_SCREEN_MIDDLE_AREA_TOP_PADDING_ROW_COUNT = 1;

export type ChatScreenViewModel = {
  isPromptInputDisabled: boolean;
  availableChatSlashCommands: readonly ChatSlashCommand[];
  modeLabel: string;
  inputPanelAccentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"] | ChatScreenTheme["accentPink"];
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
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  terminalRowCount: number;
  terminalColumnCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
}): ChatScreenViewModel {
  const isConversationCompactionRunning = input.conversationSessionCompactionStatus.step === "compacting";
  const isPromptInputDisabled =
    isConversationCompactionRunning ||
    input.chatSessionState.conversationTurnStatus === "streaming_assistant_response" ||
    input.chatSessionState.conversationTurnStatus === "waiting_for_tool_approval" ||
    input.chatSessionState.modelAndReasoningSelectionState.step !== "hidden" ||
    input.chatSessionState.conversationSessionSelectionState.step !== "hidden";
  const availableChatSlashCommands = buildChatSlashCommands({
    isReasoningSummaryVisible: input.chatSessionState.isReasoningSummaryVisible,
  });
  const inputRegionRowCount =
    input.terminalSizeTierForChatScreen === minimumTerminalSizeTier
      ? MINIMUM_HEIGHT_PROMPT_STRIP_ROW_COUNT
      : INPUT_PANEL_MAX_ROW_COUNT;
  const totalContextTokensUsed = input.chatSessionState.latestTokenUsage
    ? calculateContextTokensUsedFromTokenUsage(input.chatSessionState.latestTokenUsage)
    : undefined;
  const orderedConversationMessages = listOrderedConversationMessages(input.chatSessionState);

  return {
    isPromptInputDisabled,
    availableChatSlashCommands,
    modeLabel: formatAssistantOperatingModeLabel(input.chatSessionState.selectedAssistantOperatingMode),
    inputPanelAccentColor: resolveAssistantOperatingModeAccentColor(input.chatSessionState.selectedAssistantOperatingMode),
    promptInputHintOverride: isPromptInputDisabled
      ? undefined
      : resolveAssistantOperatingModePromptHint(input.chatSessionState.selectedAssistantOperatingMode),
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

function formatAssistantOperatingModeLabel(assistantOperatingMode: AssistantOperatingMode): string {
  return assistantOperatingMode === "understand"
    ? "Understand Agent"
    : assistantOperatingMode === "plan"
    ? "Plan Agent"
    : "Implementation Agent";
}

function resolveAssistantOperatingModeAccentColor(
  assistantOperatingMode: AssistantOperatingMode,
): ChatScreenViewModel["inputPanelAccentColor"] {
  return assistantOperatingMode === "understand"
    ? chatScreenTheme.accentPink
    : assistantOperatingMode === "plan"
    ? chatScreenTheme.accentAmber
    : chatScreenTheme.accentGreen;
}

function resolveAssistantOperatingModePromptHint(assistantOperatingMode: AssistantOperatingMode): string | undefined {
  return assistantOperatingMode === "understand"
    ? "read-only understand agent · tab to Plan Agent"
    : assistantOperatingMode === "plan"
    ? "read-only plan agent · tab to Implementation Agent"
    : "implementation agent · tab to Understand Agent";
}
