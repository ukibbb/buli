import {
  calculateContextTokensUsedFromTokenUsage,
  lookupContextWindowTokenCapacityForModel,
  type AssistantOperatingMode,
  type ConversationMessage,
  type ConversationMessagePart,
} from "@buli/contracts";
import {
  isConversationSessionCompactionBlockingPromptInput,
  type ConversationSessionCompactionStatus,
} from "@buli/chat-app-controller";
import {
  buildChatSlashCommands,
  canChatSessionPromptDraftBeEdited,
  resolveNextAssistantOperatingMode,
  type ChatSessionState,
  type ChatSlashCommand,
  type ChatSlashCommandSkill,
  type ReasoningSummaryDisplayMode,
} from "@buli/chat-session-state";
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
const CHAT_SLASH_COMMANDS_WITH_REASONING_SUMMARY_EXPANDED = buildChatSlashCommands({
  reasoningSummaryDisplayMode: "expanded",
});
const CHAT_SLASH_COMMANDS_WITH_REASONING_SUMMARY_COLLAPSED = buildChatSlashCommands({
  reasoningSummaryDisplayMode: "collapsed",
});

export type ChatScreenInteractionViewModel = {
  isPromptInputDisabled: boolean;
  availableChatSlashCommands: readonly ChatSlashCommand[];
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
  conversationTranscriptWindow: ChatScreenConversationTranscriptWindow;
  visibleConversationMessageIds: readonly string[];
  orderedConversationMessagePartCount: number;
  visibleConversationMessagePartCount: number;
};

export type ChatScreenConversationTranscriptWindow = Omit<
  ConversationTranscriptWindow,
  "visibleConversationMessages"
>;

export type VisibleConversationMessageRow = {
  conversationMessage: ConversationMessage;
  conversationMessageParts: readonly ConversationMessagePart[];
};

export type ChatScreenViewModel = ChatScreenInteractionViewModel & ChatScreenTranscriptViewModel;

type ChatScreenTranscriptState = Pick<
  ChatSessionState,
  "conversationMessagesById" | "orderedConversationMessageIds" | "conversationMessagePartCount"
>;

export type ChatScreenTranscriptViewModelCache = {
  chatSessionState: Pick<ChatScreenTranscriptState, "orderedConversationMessageIds" | "conversationMessagePartCount">;
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
> & {
  isInitialConversationSessionHydrationPending?: boolean | undefined;
};

type ChatScreenInteractionSelectionState = Pick<
  ChatSessionState,
  | "conversationSessionSelectionState"
  | "modelAndReasoningSelectionState"
  | "slashCommandSelectionState"
  | "promptContextSelectionState"
  | "isCommandHelpModalVisible"
>;

export function buildChatScreenViewModel(input: {
  chatSessionState: ChatSessionState;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  availableSkills?: readonly ChatSlashCommandSkill[] | undefined;
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
      reasoningSummaryDisplayMode: input.chatSessionState.reasoningSummaryDisplayMode,
      availableSkills: input.availableSkills,
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
  reasoningSummaryDisplayMode: ReasoningSummaryDisplayMode;
  availableSkills?: readonly ChatSlashCommandSkill[] | undefined;
  terminalRowCount: number;
  terminalColumnCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
}): ChatScreenInteractionViewModel {
  const isPromptInputDisabled =
    isConversationSessionCompactionBlockingPromptInput(input.conversationSessionCompactionStatus) ||
    input.promptState.isInitialConversationSessionHydrationPending === true ||
    !canChatSessionPromptDraftBeEdited({
      ...input.promptState,
      ...input.selectionState,
    });
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
    availableChatSlashCommands: listStableChatSlashCommands(input.reasoningSummaryDisplayMode, input.availableSkills),
    shortModeLabel: formatAssistantOperatingModeShortLabel(input.promptState.selectedAssistantOperatingMode),
    nextShortModeLabel: formatAssistantOperatingModeShortLabel(nextAssistantOperatingMode),
    nextModeAccentColor: resolveAssistantOperatingModeAccentColor(nextAssistantOperatingMode),
    inputPanelAccentColor: resolveAssistantOperatingModeAccentColor(input.promptState.selectedAssistantOperatingMode),
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
  return buildChatScreenTranscriptViewModelWithStableVisibleIds(input).transcriptViewModel;
}

function buildChatScreenTranscriptViewModelWithStableVisibleIds(input: {
  chatSessionState: ChatScreenTranscriptState;
  requestedVisibleConversationMessageCount?: number | undefined;
  previousVisibleConversationMessageIds?: readonly string[] | undefined;
}): {
  transcriptViewModel: ChatScreenTranscriptViewModel;
} {
  const conversationTranscriptMessageIndexWindow = buildConversationTranscriptMessageIndexWindow({
    totalConversationMessageCount: input.chatSessionState.orderedConversationMessageIds.length,
    requestedVisibleConversationMessageCount: input.requestedVisibleConversationMessageCount,
  });
  const nextVisibleConversationMessageIds = input.chatSessionState.orderedConversationMessageIds.slice(
    conversationTranscriptMessageIndexWindow.firstVisibleConversationMessageIndex,
    conversationTranscriptMessageIndexWindow.firstVisibleConversationMessageIndex +
      conversationTranscriptMessageIndexWindow.visibleConversationMessageCount,
  );
  const visibleConversationMessageIds = selectStableConversationMessageIds({
    previousConversationMessageIds: input.previousVisibleConversationMessageIds,
    nextConversationMessageIds: nextVisibleConversationMessageIds,
  });

  return {
    transcriptViewModel: {
      conversationTranscriptWindow: {
        totalConversationMessageCount: conversationTranscriptMessageIndexWindow.totalConversationMessageCount,
        visibleConversationMessageCount: conversationTranscriptMessageIndexWindow.visibleConversationMessageCount,
        hiddenOlderConversationMessageCount: conversationTranscriptMessageIndexWindow.hiddenOlderConversationMessageCount,
        olderConversationMessageRevealCount: conversationTranscriptMessageIndexWindow.olderConversationMessageRevealCount,
      },
      visibleConversationMessageIds,
      orderedConversationMessagePartCount: input.chatSessionState.conversationMessagePartCount,
      visibleConversationMessagePartCount: countVisibleConversationMessageParts({
        chatSessionState: input.chatSessionState,
        visibleConversationMessageIds,
      }),
    },
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

  const transcriptViewModelBuildResult = buildChatScreenTranscriptViewModelWithStableVisibleIds({
    chatSessionState: input.chatSessionState,
    requestedVisibleConversationMessageCount: input.requestedVisibleConversationMessageCount,
    previousVisibleConversationMessageIds: input.previousCache?.transcriptViewModel.visibleConversationMessageIds,
  });
  const stableTranscriptViewModel = selectStableChatScreenTranscriptViewModel({
    previousTranscriptViewModel: input.previousCache?.transcriptViewModel,
    nextTranscriptViewModel: transcriptViewModelBuildResult.transcriptViewModel,
  });
  return {
    transcriptViewModel: stableTranscriptViewModel,
    nextCache: {
      chatSessionState: {
        orderedConversationMessageIds: input.chatSessionState.orderedConversationMessageIds,
        conversationMessagePartCount: input.chatSessionState.conversationMessagePartCount,
      },
      requestedVisibleConversationMessageCount: input.requestedVisibleConversationMessageCount,
      transcriptViewModel: stableTranscriptViewModel,
    },
  };
}

function canReuseChatScreenTranscriptViewModelCache(input: {
  chatSessionState: ChatScreenTranscriptState;
  requestedVisibleConversationMessageCount?: number | undefined;
  previousCache: ChatScreenTranscriptViewModelCache | undefined;
}): input is typeof input & { previousCache: ChatScreenTranscriptViewModelCache } {
  return input.previousCache !== undefined &&
    input.previousCache.chatSessionState.orderedConversationMessageIds === input.chatSessionState.orderedConversationMessageIds &&
    input.previousCache.chatSessionState.conversationMessagePartCount === input.chatSessionState.conversationMessagePartCount &&
    input.previousCache.requestedVisibleConversationMessageCount === input.requestedVisibleConversationMessageCount;
}

function selectStableChatScreenTranscriptViewModel(input: {
  previousTranscriptViewModel: ChatScreenTranscriptViewModel | undefined;
  nextTranscriptViewModel: ChatScreenTranscriptViewModel;
}): ChatScreenTranscriptViewModel {
  if (
    input.previousTranscriptViewModel &&
    input.previousTranscriptViewModel.conversationTranscriptWindow.totalConversationMessageCount ===
      input.nextTranscriptViewModel.conversationTranscriptWindow.totalConversationMessageCount &&
    input.previousTranscriptViewModel.conversationTranscriptWindow.visibleConversationMessageCount ===
      input.nextTranscriptViewModel.conversationTranscriptWindow.visibleConversationMessageCount &&
    input.previousTranscriptViewModel.conversationTranscriptWindow.hiddenOlderConversationMessageCount ===
      input.nextTranscriptViewModel.conversationTranscriptWindow.hiddenOlderConversationMessageCount &&
    input.previousTranscriptViewModel.conversationTranscriptWindow.olderConversationMessageRevealCount ===
      input.nextTranscriptViewModel.conversationTranscriptWindow.olderConversationMessageRevealCount &&
    input.previousTranscriptViewModel.orderedConversationMessagePartCount ===
      input.nextTranscriptViewModel.orderedConversationMessagePartCount &&
    input.previousTranscriptViewModel.visibleConversationMessagePartCount ===
      input.nextTranscriptViewModel.visibleConversationMessagePartCount &&
    areConversationMessageIdsEqual(
      input.previousTranscriptViewModel.visibleConversationMessageIds,
      input.nextTranscriptViewModel.visibleConversationMessageIds,
    )
  ) {
    return input.previousTranscriptViewModel;
  }

  return input.nextTranscriptViewModel;
}

function selectStableConversationMessageIds(input: {
  previousConversationMessageIds: readonly string[] | undefined;
  nextConversationMessageIds: readonly string[];
}): readonly string[] {
  return input.previousConversationMessageIds &&
      areConversationMessageIdsEqual(input.previousConversationMessageIds, input.nextConversationMessageIds)
    ? input.previousConversationMessageIds
    : input.nextConversationMessageIds;
}

function areConversationMessageIdsEqual(
  previousConversationMessageIds: readonly string[],
  nextConversationMessageIds: readonly string[],
): boolean {
  if (previousConversationMessageIds.length !== nextConversationMessageIds.length) {
    return false;
  }

  return previousConversationMessageIds.every(
    (conversationMessageId, messageIndex) => conversationMessageId === nextConversationMessageIds[messageIndex],
  );
}

function listStableChatSlashCommands(
  reasoningSummaryDisplayMode: ReasoningSummaryDisplayMode,
  availableSkills: readonly ChatSlashCommandSkill[] | undefined,
): readonly ChatSlashCommand[] {
  if (availableSkills !== undefined && availableSkills.length > 0) {
    return buildChatSlashCommands({ reasoningSummaryDisplayMode, availableSkills });
  }

  return reasoningSummaryDisplayMode === "expanded"
    ? CHAT_SLASH_COMMANDS_WITH_REASONING_SUMMARY_EXPANDED
    : CHAT_SLASH_COMMANDS_WITH_REASONING_SUMMARY_COLLAPSED;
}

function countVisibleConversationMessageParts(input: {
  chatSessionState: ChatScreenTranscriptState;
  visibleConversationMessageIds: readonly string[];
}): number {
  return input.visibleConversationMessageIds.reduce((visibleConversationMessagePartCount, conversationMessageId) => {
    const conversationMessage = input.chatSessionState.conversationMessagesById[conversationMessageId];
    return visibleConversationMessagePartCount + (conversationMessage?.partIds.length ?? 0);
  }, 0);
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
