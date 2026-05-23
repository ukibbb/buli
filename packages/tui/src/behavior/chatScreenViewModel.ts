import type { AssistantOperatingMode, ConversationMessage } from "@buli/contracts";
import type { ConversationSessionCompactionStatus } from "@buli/chat-app-controller";
import {
  buildChatSlashCommands,
  resolveNextAssistantOperatingMode,
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
import { INPUT_STATUS_STRIP_ROW_COUNT } from "../components/InputStatusStrip.tsx";
import { MINIMUM_HEIGHT_PROMPT_STRIP_ROW_COUNT } from "../components/MinimumHeightPromptStrip.tsx";
import { TOP_BAR_NATURAL_ROW_COUNT } from "../components/TopBar.tsx";
import {
  buildConversationTranscriptMessageIndexWindow,
  type ConversationTranscriptWindow,
} from "./conversationTranscriptWindow.ts";

const CHAT_SCREEN_MIDDLE_AREA_TOP_PADDING_ROW_COUNT = 1;

export type ChatScreenViewModel = {
  isPromptInputDisabled: boolean;
  availableChatSlashCommands: readonly ChatSlashCommand[];
  modeLabel: string;
  shortModeLabel: string;
  nextShortModeLabel: string;
  nextModeAccentColor: ChatScreenViewModel["inputPanelAccentColor"];
  inputPanelAccentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"] | ChatScreenTheme["accentPink"];
  promptInputHintOverride: string | undefined;
  reasoningEffortLabel: string;
  inputRegionRowCount: number;
  availableCommandHelpModalRowCount: number;
  totalContextTokensUsed: number | undefined;
  contextWindowTokenCapacity: number | undefined;
  conversationTranscriptWindow: ConversationTranscriptWindow;
  orderedConversationMessagePartCount: number;
  shouldRenderMinimumHeightPromptStrip: boolean;
};

export function buildChatScreenViewModel(input: {
  chatSessionState: ChatSessionState;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  terminalRowCount: number;
  terminalColumnCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
  requestedVisibleConversationMessageCount?: number | undefined;
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
      : INPUT_PANEL_MAX_ROW_COUNT + INPUT_STATUS_STRIP_ROW_COUNT;
  const totalContextTokensUsed = input.chatSessionState.latestContextWindowUsage
    ? calculateContextTokensUsedFromTokenUsage(input.chatSessionState.latestContextWindowUsage)
    : undefined;
  const orderedConversationSummary = summarizeOrderedConversationMessages(input.chatSessionState);
  const conversationTranscriptMessageIndexWindow = buildConversationTranscriptMessageIndexWindow({
    totalConversationMessageCount: orderedConversationSummary.conversationMessageCount,
    requestedVisibleConversationMessageCount: input.requestedVisibleConversationMessageCount,
  });
  const visibleConversationMessages = listVisibleOrderedConversationMessages({
    chatSessionState: input.chatSessionState,
    firstVisibleConversationMessageIndex: conversationTranscriptMessageIndexWindow.firstVisibleConversationMessageIndex,
    visibleConversationMessageCount: conversationTranscriptMessageIndexWindow.visibleConversationMessageCount,
  });

  const nextAssistantOperatingMode = resolveNextAssistantOperatingMode(input.chatSessionState.selectedAssistantOperatingMode);

  return {
    isPromptInputDisabled,
    availableChatSlashCommands,
    modeLabel: formatAssistantOperatingModeLabel(input.chatSessionState.selectedAssistantOperatingMode),
    shortModeLabel: formatAssistantOperatingModeShortLabel(input.chatSessionState.selectedAssistantOperatingMode),
    nextShortModeLabel: formatAssistantOperatingModeShortLabel(nextAssistantOperatingMode),
    nextModeAccentColor: resolveAssistantOperatingModeAccentColor(nextAssistantOperatingMode),
    inputPanelAccentColor: resolveAssistantOperatingModeAccentColor(input.chatSessionState.selectedAssistantOperatingMode),
    // Mode hint text was needed when the input frame had no visible mode chips.
    // InputStatusStrip now surfaces the active mode + destination + tab keycap
    // directly, so the legacy hint would be redundant. Leave the prop as a
    // future escape hatch for transient prompts (e.g., interrupt confirmation).
    promptInputHintOverride: undefined,
    reasoningEffortLabel:
      input.chatSessionState.selectedReasoningEffort ?? input.chatSessionState.selectedModelDefaultReasoningEffort ?? "default",
    inputRegionRowCount,
    availableCommandHelpModalRowCount: Math.max(
      0,
      input.terminalRowCount - TOP_BAR_NATURAL_ROW_COUNT - CHAT_SCREEN_MIDDLE_AREA_TOP_PADDING_ROW_COUNT - inputRegionRowCount,
    ),
    totalContextTokensUsed,
    contextWindowTokenCapacity: lookupContextWindowTokenCapacityForModel(input.chatSessionState.selectedModelId),
    conversationTranscriptWindow: {
      visibleConversationMessages,
      totalConversationMessageCount: conversationTranscriptMessageIndexWindow.totalConversationMessageCount,
      visibleConversationMessageCount: conversationTranscriptMessageIndexWindow.visibleConversationMessageCount,
      hiddenOlderConversationMessageCount: conversationTranscriptMessageIndexWindow.hiddenOlderConversationMessageCount,
      olderConversationMessageRevealCount: conversationTranscriptMessageIndexWindow.olderConversationMessageRevealCount,
    },
    orderedConversationMessagePartCount: orderedConversationSummary.conversationMessagePartCount,
    shouldRenderMinimumHeightPromptStrip: input.terminalSizeTierForChatScreen === minimumTerminalSizeTier,
  };
}

type OrderedConversationSummary = {
  conversationMessageCount: number;
  conversationMessagePartCount: number;
};

function summarizeOrderedConversationMessages(chatSessionState: ChatSessionState): OrderedConversationSummary {
  return chatSessionState.orderedConversationMessageIds.reduce<OrderedConversationSummary>(
    (orderedConversationSummary, conversationMessageId) => {
      const conversationMessage = chatSessionState.conversationMessagesById[conversationMessageId];
      if (!conversationMessage) {
        return orderedConversationSummary;
      }

      return {
        conversationMessageCount: orderedConversationSummary.conversationMessageCount + 1,
        conversationMessagePartCount:
          orderedConversationSummary.conversationMessagePartCount + conversationMessage.partIds.length,
      };
    },
    { conversationMessageCount: 0, conversationMessagePartCount: 0 },
  );
}

function listVisibleOrderedConversationMessages(input: {
  chatSessionState: ChatSessionState;
  firstVisibleConversationMessageIndex: number;
  visibleConversationMessageCount: number;
}): ConversationMessage[] {
  const visibleConversationMessages: ConversationMessage[] = [];
  const firstHiddenAfterVisibleConversationMessageIndex = input.firstVisibleConversationMessageIndex +
    input.visibleConversationMessageCount;
  let currentConversationMessageIndex = 0;

  for (const conversationMessageId of input.chatSessionState.orderedConversationMessageIds) {
    const conversationMessage = input.chatSessionState.conversationMessagesById[conversationMessageId];
    if (!conversationMessage) {
      continue;
    }

    if (currentConversationMessageIndex >= input.firstVisibleConversationMessageIndex) {
      visibleConversationMessages.push(conversationMessage);
    }
    currentConversationMessageIndex += 1;

    if (currentConversationMessageIndex >= firstHiddenAfterVisibleConversationMessageIndex) {
      break;
    }
  }

  return visibleConversationMessages;
}

function formatAssistantOperatingModeLabel(assistantOperatingMode: AssistantOperatingMode): string {
  return assistantOperatingMode === "understand"
    ? "Understand Agent"
    : assistantOperatingMode === "plan"
    ? "Plan Agent"
    : "Implementation Agent";
}

function formatAssistantOperatingModeShortLabel(assistantOperatingMode: AssistantOperatingMode): string {
  return assistantOperatingMode === "understand"
    ? "Understand"
    : assistantOperatingMode === "plan"
    ? "Plan"
    : "Implementation";
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
