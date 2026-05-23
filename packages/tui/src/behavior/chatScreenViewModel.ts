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
const CHAT_SLASH_COMMANDS_WITH_REASONING_SUMMARY_VISIBLE = buildChatSlashCommands({ isReasoningSummaryVisible: true });
const CHAT_SLASH_COMMANDS_WITH_REASONING_SUMMARY_HIDDEN = buildChatSlashCommands({ isReasoningSummaryVisible: false });

export type ChatScreenInteractionViewModel = {
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
  shouldRenderMinimumHeightPromptStrip: boolean;
};

export type ChatScreenTranscriptViewModel = {
  conversationTranscriptWindow: ConversationTranscriptWindow;
  orderedConversationMessagePartCount: number;
};

export type ChatScreenViewModel = ChatScreenInteractionViewModel & ChatScreenTranscriptViewModel;

type ChatScreenTranscriptState = Pick<
  ChatSessionState,
  "conversationMessagesById" | "orderedConversationMessageIds" | "conversationMessagePartCount"
>;

export type ChatScreenTranscriptViewModelCache = {
  chatSessionState: ChatScreenTranscriptState;
  requestedVisibleConversationMessageCount: number | undefined;
  transcriptViewModel: ChatScreenTranscriptViewModel;
};

type ChatScreenInteractionPromptState = Pick<
  ChatSessionState,
  | "conversationTurnStatus"
  | "selectedAssistantOperatingMode"
  | "selectedModelId"
  | "selectedModelDefaultReasoningEffort"
  | "selectedReasoningEffort"
  | "latestContextWindowUsage"
>;

type ChatScreenInteractionSelectionState = Pick<
  ChatSessionState,
  "conversationSessionSelectionState" | "modelAndReasoningSelectionState"
>;

export function buildChatScreenViewModel(input: {
  chatSessionState: ChatSessionState;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  terminalRowCount: number;
  terminalColumnCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
  requestedVisibleConversationMessageCount?: number | undefined;
}): ChatScreenViewModel {
  return {
    ...buildChatScreenInteractionViewModel({
      promptState: input.chatSessionState,
      selectionState: input.chatSessionState,
      conversationSessionCompactionStatus: input.conversationSessionCompactionStatus,
      isReasoningSummaryVisible: input.chatSessionState.isReasoningSummaryVisible,
      terminalRowCount: input.terminalRowCount,
      terminalColumnCount: input.terminalColumnCount,
      terminalSizeTierForChatScreen: input.terminalSizeTierForChatScreen,
    }),
    ...buildChatScreenTranscriptViewModel({
      chatSessionState: input.chatSessionState,
      requestedVisibleConversationMessageCount: input.requestedVisibleConversationMessageCount,
    }),
  };
}

export function buildChatScreenInteractionViewModel(input: {
  promptState: ChatScreenInteractionPromptState;
  selectionState: ChatScreenInteractionSelectionState;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  isReasoningSummaryVisible: boolean;
  terminalRowCount: number;
  terminalColumnCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
}): ChatScreenInteractionViewModel {
  const isConversationCompactionRunning = input.conversationSessionCompactionStatus.step === "compacting";
  const isPromptInputDisabled =
    isConversationCompactionRunning ||
    input.promptState.conversationTurnStatus === "waiting_for_tool_approval" ||
    input.selectionState.modelAndReasoningSelectionState.step !== "hidden" ||
    input.selectionState.conversationSessionSelectionState.step !== "hidden";
  const inputRegionRowCount =
    input.terminalSizeTierForChatScreen === minimumTerminalSizeTier
      ? MINIMUM_HEIGHT_PROMPT_STRIP_ROW_COUNT
      : INPUT_PANEL_MAX_ROW_COUNT + INPUT_STATUS_STRIP_ROW_COUNT;
  const totalContextTokensUsed = input.promptState.latestContextWindowUsage
    ? calculateContextTokensUsedFromTokenUsage(input.promptState.latestContextWindowUsage)
    : undefined;

  const nextAssistantOperatingMode = resolveNextAssistantOperatingMode(input.promptState.selectedAssistantOperatingMode);

  return {
    isPromptInputDisabled,
    availableChatSlashCommands: listStableChatSlashCommands(input.isReasoningSummaryVisible),
    modeLabel: formatAssistantOperatingModeLabel(input.promptState.selectedAssistantOperatingMode),
    shortModeLabel: formatAssistantOperatingModeShortLabel(input.promptState.selectedAssistantOperatingMode),
    nextShortModeLabel: formatAssistantOperatingModeShortLabel(nextAssistantOperatingMode),
    nextModeAccentColor: resolveAssistantOperatingModeAccentColor(nextAssistantOperatingMode),
    inputPanelAccentColor: resolveAssistantOperatingModeAccentColor(input.promptState.selectedAssistantOperatingMode),
    // Mode hint text was needed when the input frame had no visible mode chips.
    // InputStatusStrip now surfaces the active mode + destination + tab keycap
    // directly, so the legacy hint would be redundant. Leave the prop as a
    // future escape hatch for transient prompts (e.g., interrupt confirmation).
    promptInputHintOverride: undefined,
    reasoningEffortLabel:
      input.promptState.selectedReasoningEffort ?? input.promptState.selectedModelDefaultReasoningEffort ?? "default",
    inputRegionRowCount,
    availableCommandHelpModalRowCount: Math.max(
      0,
      input.terminalRowCount - TOP_BAR_NATURAL_ROW_COUNT - CHAT_SCREEN_MIDDLE_AREA_TOP_PADDING_ROW_COUNT - inputRegionRowCount,
    ),
    totalContextTokensUsed,
    contextWindowTokenCapacity: lookupContextWindowTokenCapacityForModel(input.promptState.selectedModelId),
    shouldRenderMinimumHeightPromptStrip: input.terminalSizeTierForChatScreen === minimumTerminalSizeTier,
  };
}

export function buildChatScreenTranscriptViewModel(input: {
  chatSessionState: ChatScreenTranscriptState;
  requestedVisibleConversationMessageCount?: number | undefined;
}): ChatScreenTranscriptViewModel {
  const conversationTranscriptMessageIndexWindow = buildConversationTranscriptMessageIndexWindow({
    totalConversationMessageCount: input.chatSessionState.orderedConversationMessageIds.length,
    requestedVisibleConversationMessageCount: input.requestedVisibleConversationMessageCount,
  });
  const visibleConversationMessages = listVisibleOrderedConversationMessages({
    chatSessionState: input.chatSessionState,
    firstVisibleConversationMessageIndex: conversationTranscriptMessageIndexWindow.firstVisibleConversationMessageIndex,
    visibleConversationMessageCount: conversationTranscriptMessageIndexWindow.visibleConversationMessageCount,
  });

  return {
    conversationTranscriptWindow: {
      visibleConversationMessages,
      totalConversationMessageCount: conversationTranscriptMessageIndexWindow.totalConversationMessageCount,
      visibleConversationMessageCount: conversationTranscriptMessageIndexWindow.visibleConversationMessageCount,
      hiddenOlderConversationMessageCount: conversationTranscriptMessageIndexWindow.hiddenOlderConversationMessageCount,
      olderConversationMessageRevealCount: conversationTranscriptMessageIndexWindow.olderConversationMessageRevealCount,
    },
    orderedConversationMessagePartCount: input.chatSessionState.conversationMessagePartCount,
  };
}

export function buildStableChatScreenTranscriptViewModel(input: {
  chatSessionState: ChatScreenTranscriptState;
  requestedVisibleConversationMessageCount?: number | undefined;
  previousCache: ChatScreenTranscriptViewModelCache | undefined;
}): {
  transcriptViewModel: ChatScreenTranscriptViewModel;
  nextCache: ChatScreenTranscriptViewModelCache;
} {
  if (canReuseChatScreenTranscriptViewModelCache(input)) {
    return {
      transcriptViewModel: input.previousCache.transcriptViewModel,
      nextCache: input.previousCache,
    };
  }

  const transcriptViewModel = buildChatScreenTranscriptViewModel(input);
  return {
    transcriptViewModel,
    nextCache: {
      chatSessionState: {
        conversationMessagesById: input.chatSessionState.conversationMessagesById,
        orderedConversationMessageIds: input.chatSessionState.orderedConversationMessageIds,
        conversationMessagePartCount: input.chatSessionState.conversationMessagePartCount,
      },
      requestedVisibleConversationMessageCount: input.requestedVisibleConversationMessageCount,
      transcriptViewModel,
    },
  };
}

function canReuseChatScreenTranscriptViewModelCache(input: {
  chatSessionState: ChatScreenTranscriptState;
  requestedVisibleConversationMessageCount?: number | undefined;
  previousCache: ChatScreenTranscriptViewModelCache | undefined;
}): input is typeof input & { previousCache: ChatScreenTranscriptViewModelCache } {
  return input.previousCache !== undefined &&
    input.previousCache.chatSessionState.conversationMessagesById === input.chatSessionState.conversationMessagesById &&
    input.previousCache.chatSessionState.orderedConversationMessageIds === input.chatSessionState.orderedConversationMessageIds &&
    input.previousCache.chatSessionState.conversationMessagePartCount === input.chatSessionState.conversationMessagePartCount &&
    input.previousCache.requestedVisibleConversationMessageCount === input.requestedVisibleConversationMessageCount;
}

function listStableChatSlashCommands(isReasoningSummaryVisible: boolean): readonly ChatSlashCommand[] {
  return isReasoningSummaryVisible
    ? CHAT_SLASH_COMMANDS_WITH_REASONING_SUMMARY_VISIBLE
    : CHAT_SLASH_COMMANDS_WITH_REASONING_SUMMARY_HIDDEN;
}

function listVisibleOrderedConversationMessages(input: {
  chatSessionState: ChatScreenTranscriptState;
  firstVisibleConversationMessageIndex: number;
  visibleConversationMessageCount: number;
}): ConversationMessage[] {
  const firstHiddenAfterVisibleConversationMessageIndex = input.firstVisibleConversationMessageIndex +
    input.visibleConversationMessageCount;
  const visibleConversationMessageIds = input.chatSessionState.orderedConversationMessageIds.slice(
    input.firstVisibleConversationMessageIndex,
    firstHiddenAfterVisibleConversationMessageIndex,
  );

  const visibleConversationMessages: ConversationMessage[] = [];
  for (const conversationMessageId of visibleConversationMessageIds) {
    const conversationMessage = input.chatSessionState.conversationMessagesById[conversationMessageId];
    if (!conversationMessage) {
      continue;
    }

    visibleConversationMessages.push(conversationMessage);
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
