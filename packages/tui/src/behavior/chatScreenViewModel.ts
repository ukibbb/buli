import {
  calculateContextTokensUsedFromTokenUsage,
  lookupContextWindowTokenCapacityForModel,
  type AssistantOperatingMode,
  type ConversationMessage,
  type ConversationMessagePart,
} from "@buli/contracts";
import type { ConversationSessionCompactionStatus } from "@buli/chat-app-controller";
import {
  buildChatSlashCommands,
  resolveNextAssistantOperatingMode,
  type ChatSessionState,
  type ChatSlashCommand,
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
const CHAT_SLASH_COMMANDS_WITH_REASONING_SUMMARY_VISIBLE = buildChatSlashCommands({ isReasoningSummaryVisible: true });
const CHAT_SLASH_COMMANDS_WITH_REASONING_SUMMARY_HIDDEN = buildChatSlashCommands({ isReasoningSummaryVisible: false });

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
  conversationTranscriptWindow: ConversationTranscriptWindow;
  visibleConversationMessageRows: readonly VisibleConversationMessageRow[];
  orderedConversationMessagePartCount: number;
  visibleConversationMessagePartCount: number;
};

export type VisibleConversationMessageRow = {
  conversationMessage: ConversationMessage;
  conversationMessageParts: readonly ConversationMessagePart[];
};

export type ChatScreenViewModel = ChatScreenInteractionViewModel & ChatScreenTranscriptViewModel;

type ChatScreenTranscriptState = Pick<
  ChatSessionState,
  "conversationMessagesById" | "conversationMessagePartsById" | "orderedConversationMessageIds" | "conversationMessagePartCount"
>;

export type ChatScreenTranscriptViewModelCache = {
  chatSessionState: ChatScreenTranscriptState;
  requestedVisibleConversationMessageCount: number | undefined;
  transcriptViewModel: ChatScreenTranscriptViewModel;
  visibleConversationMessageRowCacheByMessageId: ReadonlyMap<string, VisibleConversationMessageRowCache>;
};

type VisibleConversationMessageRowCache = {
  conversationMessage: ConversationMessage;
  conversationMessagePartIds: readonly string[];
  conversationMessageParts: readonly ConversationMessagePart[];
  visibleConversationMessageRow: VisibleConversationMessageRow;
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
    input.promptState.isInitialConversationSessionHydrationPending === true ||
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
  return buildChatScreenTranscriptViewModelWithRowCache(input).transcriptViewModel;
}

function buildChatScreenTranscriptViewModelWithRowCache(input: {
  chatSessionState: ChatScreenTranscriptState;
  requestedVisibleConversationMessageCount?: number | undefined;
  previousVisibleConversationMessageRowCacheByMessageId?: ReadonlyMap<string, VisibleConversationMessageRowCache> | undefined;
}): {
  transcriptViewModel: ChatScreenTranscriptViewModel;
  visibleConversationMessageRowCacheByMessageId: ReadonlyMap<string, VisibleConversationMessageRowCache>;
} {
  const conversationTranscriptMessageIndexWindow = buildConversationTranscriptMessageIndexWindow({
    totalConversationMessageCount: input.chatSessionState.orderedConversationMessageIds.length,
    requestedVisibleConversationMessageCount: input.requestedVisibleConversationMessageCount,
  });
  const visibleConversationMessageRowBuildResult = listVisibleOrderedConversationMessageRows({
    chatSessionState: input.chatSessionState,
    firstVisibleConversationMessageIndex: conversationTranscriptMessageIndexWindow.firstVisibleConversationMessageIndex,
    visibleConversationMessageCount: conversationTranscriptMessageIndexWindow.visibleConversationMessageCount,
    previousVisibleConversationMessageRowCacheByMessageId: input.previousVisibleConversationMessageRowCacheByMessageId,
  });
  const visibleConversationMessageRows = visibleConversationMessageRowBuildResult.visibleConversationMessageRows;
  const visibleConversationMessages = visibleConversationMessageRows.map(
    (visibleConversationMessageRow) => visibleConversationMessageRow.conversationMessage,
  );

  return {
    transcriptViewModel: {
      conversationTranscriptWindow: {
        visibleConversationMessages,
        totalConversationMessageCount: conversationTranscriptMessageIndexWindow.totalConversationMessageCount,
        visibleConversationMessageCount: conversationTranscriptMessageIndexWindow.visibleConversationMessageCount,
        hiddenOlderConversationMessageCount: conversationTranscriptMessageIndexWindow.hiddenOlderConversationMessageCount,
        olderConversationMessageRevealCount: conversationTranscriptMessageIndexWindow.olderConversationMessageRevealCount,
      },
      visibleConversationMessageRows,
      orderedConversationMessagePartCount: input.chatSessionState.conversationMessagePartCount,
      visibleConversationMessagePartCount: countVisibleConversationMessageParts(visibleConversationMessageRows),
    },
    visibleConversationMessageRowCacheByMessageId: visibleConversationMessageRowBuildResult.visibleConversationMessageRowCacheByMessageId,
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

  const transcriptViewModelBuildResult = buildChatScreenTranscriptViewModelWithRowCache({
    chatSessionState: input.chatSessionState,
    requestedVisibleConversationMessageCount: input.requestedVisibleConversationMessageCount,
    previousVisibleConversationMessageRowCacheByMessageId: input.previousCache?.visibleConversationMessageRowCacheByMessageId,
  });
  const stableTranscriptViewModel = selectStableChatScreenTranscriptViewModel({
    previousTranscriptViewModel: input.previousCache?.transcriptViewModel,
    nextTranscriptViewModel: transcriptViewModelBuildResult.transcriptViewModel,
  });
  const visibleConversationMessageRowCacheByMessageId = stableTranscriptViewModel === input.previousCache?.transcriptViewModel
    ? input.previousCache.visibleConversationMessageRowCacheByMessageId
    : transcriptViewModelBuildResult.visibleConversationMessageRowCacheByMessageId;
  return {
    transcriptViewModel: stableTranscriptViewModel,
    nextCache: {
      chatSessionState: {
        conversationMessagesById: input.chatSessionState.conversationMessagesById,
        conversationMessagePartsById: input.chatSessionState.conversationMessagePartsById,
        orderedConversationMessageIds: input.chatSessionState.orderedConversationMessageIds,
        conversationMessagePartCount: input.chatSessionState.conversationMessagePartCount,
      },
      requestedVisibleConversationMessageCount: input.requestedVisibleConversationMessageCount,
      transcriptViewModel: stableTranscriptViewModel,
      visibleConversationMessageRowCacheByMessageId,
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
    input.previousCache.chatSessionState.conversationMessagePartsById === input.chatSessionState.conversationMessagePartsById &&
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
    areVisibleConversationMessageRowsEqual(
      input.previousTranscriptViewModel.visibleConversationMessageRows,
      input.nextTranscriptViewModel.visibleConversationMessageRows,
    )
  ) {
    return input.previousTranscriptViewModel;
  }

  return input.nextTranscriptViewModel;
}

function areVisibleConversationMessageRowsEqual(
  previousVisibleConversationMessageRows: readonly VisibleConversationMessageRow[],
  nextVisibleConversationMessageRows: readonly VisibleConversationMessageRow[],
): boolean {
  if (previousVisibleConversationMessageRows.length !== nextVisibleConversationMessageRows.length) {
    return false;
  }

  return previousVisibleConversationMessageRows.every((previousVisibleConversationMessageRow, rowIndex) => {
    const nextVisibleConversationMessageRow = nextVisibleConversationMessageRows[rowIndex];
    return nextVisibleConversationMessageRow !== undefined &&
      previousVisibleConversationMessageRow.conversationMessage === nextVisibleConversationMessageRow.conversationMessage &&
      areConversationMessagePartReferencesEqual(
        previousVisibleConversationMessageRow.conversationMessageParts,
        nextVisibleConversationMessageRow.conversationMessageParts,
      );
  });
}

function areConversationMessagePartReferencesEqual(
  previousConversationMessageParts: readonly ConversationMessagePart[],
  nextConversationMessageParts: readonly ConversationMessagePart[],
): boolean {
  if (previousConversationMessageParts.length !== nextConversationMessageParts.length) {
    return false;
  }

  return previousConversationMessageParts.every(
    (conversationMessagePart, partIndex) => conversationMessagePart === nextConversationMessageParts[partIndex],
  );
}

function listStableChatSlashCommands(isReasoningSummaryVisible: boolean): readonly ChatSlashCommand[] {
  return isReasoningSummaryVisible
    ? CHAT_SLASH_COMMANDS_WITH_REASONING_SUMMARY_VISIBLE
    : CHAT_SLASH_COMMANDS_WITH_REASONING_SUMMARY_HIDDEN;
}

function listVisibleOrderedConversationMessageRows(input: {
  chatSessionState: ChatScreenTranscriptState;
  firstVisibleConversationMessageIndex: number;
  visibleConversationMessageCount: number;
  previousVisibleConversationMessageRowCacheByMessageId?: ReadonlyMap<string, VisibleConversationMessageRowCache> | undefined;
}): {
  visibleConversationMessageRows: VisibleConversationMessageRow[];
  visibleConversationMessageRowCacheByMessageId: ReadonlyMap<string, VisibleConversationMessageRowCache>;
} {
  const firstHiddenAfterVisibleConversationMessageIndex = input.firstVisibleConversationMessageIndex +
    input.visibleConversationMessageCount;
  const visibleConversationMessageIds = input.chatSessionState.orderedConversationMessageIds.slice(
    input.firstVisibleConversationMessageIndex,
    firstHiddenAfterVisibleConversationMessageIndex,
  );

  const visibleConversationMessageRows: VisibleConversationMessageRow[] = [];
  const visibleConversationMessageRowCacheByMessageId = new Map<string, VisibleConversationMessageRowCache>();
  for (const conversationMessageId of visibleConversationMessageIds) {
    const conversationMessage = input.chatSessionState.conversationMessagesById[conversationMessageId];
    if (!conversationMessage) {
      continue;
    }

    const selectedVisibleConversationMessageRow = selectVisibleConversationMessageRow({
      conversationMessage,
      conversationMessagePartsById: input.chatSessionState.conversationMessagePartsById,
      previousVisibleConversationMessageRowCache: input.previousVisibleConversationMessageRowCacheByMessageId?.get(conversationMessageId),
    });
    visibleConversationMessageRows.push(selectedVisibleConversationMessageRow.visibleConversationMessageRow);
    visibleConversationMessageRowCacheByMessageId.set(conversationMessageId, selectedVisibleConversationMessageRow.nextCache);
  }

  return {
    visibleConversationMessageRows,
    visibleConversationMessageRowCacheByMessageId,
  };
}

function selectVisibleConversationMessageRow(input: {
  conversationMessage: ConversationMessage;
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
  previousVisibleConversationMessageRowCache: VisibleConversationMessageRowCache | undefined;
}): {
  visibleConversationMessageRow: VisibleConversationMessageRow;
  nextCache: VisibleConversationMessageRowCache;
} {
  if (
    input.previousVisibleConversationMessageRowCache &&
    canReuseVisibleConversationMessageRowCache({
      conversationMessage: input.conversationMessage,
      conversationMessagePartsById: input.conversationMessagePartsById,
      previousVisibleConversationMessageRowCache: input.previousVisibleConversationMessageRowCache,
    })
  ) {
    return {
      visibleConversationMessageRow: input.previousVisibleConversationMessageRowCache.visibleConversationMessageRow,
      nextCache: input.previousVisibleConversationMessageRowCache,
    };
  }

  const conversationMessageParts = listConversationMessageParts({
    conversationMessage: input.conversationMessage,
    conversationMessagePartsById: input.conversationMessagePartsById,
  });
  const visibleConversationMessageRow = {
    conversationMessage: input.conversationMessage,
    conversationMessageParts,
  };
  return {
    visibleConversationMessageRow,
    nextCache: {
      conversationMessage: input.conversationMessage,
      conversationMessagePartIds: input.conversationMessage.partIds,
      conversationMessageParts,
      visibleConversationMessageRow,
    },
  };
}

function canReuseVisibleConversationMessageRowCache(input: {
  conversationMessage: ConversationMessage;
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
  previousVisibleConversationMessageRowCache: VisibleConversationMessageRowCache;
}): boolean {
  if (
    input.previousVisibleConversationMessageRowCache.conversationMessage !== input.conversationMessage ||
    input.previousVisibleConversationMessageRowCache.conversationMessagePartIds !== input.conversationMessage.partIds ||
    input.previousVisibleConversationMessageRowCache.conversationMessageParts.length !== input.conversationMessage.partIds.length
  ) {
    return false;
  }

  return input.conversationMessage.partIds.every((conversationMessagePartId, conversationMessagePartIndex) =>
    input.conversationMessagePartsById[conversationMessagePartId] ===
      input.previousVisibleConversationMessageRowCache.conversationMessageParts[conversationMessagePartIndex]
  );
}

function listConversationMessageParts(input: {
  conversationMessage: ConversationMessage;
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
}): ConversationMessagePart[] {
  const conversationMessageParts: ConversationMessagePart[] = [];
  for (const conversationMessagePartId of input.conversationMessage.partIds) {
    const conversationMessagePart = input.conversationMessagePartsById[conversationMessagePartId];
    if (conversationMessagePart) {
      conversationMessageParts.push(conversationMessagePart);
    }
  }

  return conversationMessageParts;
}

function countVisibleConversationMessageParts(
  visibleConversationMessageRows: readonly VisibleConversationMessageRow[],
): number {
  return visibleConversationMessageRows.reduce(
    (visibleConversationMessagePartCount, visibleConversationMessageRow) =>
      visibleConversationMessagePartCount + visibleConversationMessageRow.conversationMessageParts.length,
    0,
  );
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
