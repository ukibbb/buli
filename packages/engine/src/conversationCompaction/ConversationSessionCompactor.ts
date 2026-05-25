import {
  redactSensitiveText,
  type BuliDiagnosticLogger,
} from "@buli/contracts";
import type { InMemoryConversationHistory } from "../conversationHistory.ts";
import type {
  ConversationCompactionRequest,
  ConversationCompactionResult,
  ConversationTurnProvider,
} from "../provider.ts";
import { logEngineDiagnosticEvent } from "../runtimeDiagnostics.ts";
import { collectConversationCompactionSummaryText } from "./collectConversationCompactionSummaryText.ts";
import {
  decideConversationAutoCompaction,
  type ConversationAutoCompactionRequest,
  type ConversationAutoCompactionResult,
} from "./conversationAutoCompactionPolicy.ts";
import {
  buildConversationCompactionSystemPrompt,
  createConversationCompactionPromptSessionEntry,
} from "./conversationCompactionPrompt.ts";
import {
  DEFAULT_RETAINED_RECENT_CONVERSATION_TURN_COUNT,
  selectConversationEntriesForCompaction,
} from "./selectConversationEntriesForCompaction.ts";
import { prepareConversationEntriesForCompactionRequest } from "./prepareConversationEntriesForCompactionRequest.ts";

export class ConversationSessionCompactor {
  readonly conversationTurnProvider: ConversationTurnProvider;
  readonly conversationHistory: InMemoryConversationHistory;
  readonly workspaceRootPath: string;
  readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  readonly promptCacheKey: string | undefined;
  readonly isConversationTurnRunning: () => boolean;
  readonly autoCompactionThresholdRatio: number | undefined;
  readonly autoCompactionReservedTokenCount: number | undefined;
  readonly retainedRecentConversationTurnCount: number;
  private isCompactingConversationSession = false;

  constructor(input: {
    conversationTurnProvider: ConversationTurnProvider;
    conversationHistory: InMemoryConversationHistory;
    workspaceRootPath: string;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
    promptCacheKey?: string | undefined;
    isConversationTurnRunning: () => boolean;
    autoCompactionThresholdRatio?: number | undefined;
    autoCompactionReservedTokenCount?: number | undefined;
    retainedRecentConversationTurnCount?: number | undefined;
  }) {
    this.conversationTurnProvider = input.conversationTurnProvider;
    this.conversationHistory = input.conversationHistory;
    this.workspaceRootPath = input.workspaceRootPath;
    this.diagnosticLogger = input.diagnosticLogger;
    this.promptCacheKey = input.promptCacheKey;
    this.isConversationTurnRunning = input.isConversationTurnRunning;
    this.autoCompactionThresholdRatio = input.autoCompactionThresholdRatio;
    this.autoCompactionReservedTokenCount = input.autoCompactionReservedTokenCount;
    this.retainedRecentConversationTurnCount = input.retainedRecentConversationTurnCount ??
      DEFAULT_RETAINED_RECENT_CONVERSATION_TURN_COUNT;
  }

  isCompactingCurrentConversationSession(): boolean {
    return this.isCompactingConversationSession;
  }

  async compactCurrentConversationSession(input: ConversationCompactionRequest): Promise<ConversationCompactionResult> {
    const conversationSessionEntriesBeforeCompaction = this.conversationHistory.listConversationSessionEntries();
    if (conversationSessionEntriesBeforeCompaction.length === 0) {
      throw new Error("Nothing to compact yet.");
    }

    if (this.isConversationTurnRunning()) {
      throw new Error("Cannot compact while a conversation turn is running.");
    }

    if (this.isCompactingConversationSession) {
      throw new Error("Conversation compaction is already running.");
    }

    const selectedConversationEntriesForCompaction = selectConversationEntriesForCompaction({
      conversationSessionEntries: conversationSessionEntriesBeforeCompaction,
      retainedRecentConversationTurnCount: this.retainedRecentConversationTurnCount,
    });
    const compactionRequestProjection = prepareConversationEntriesForCompactionRequest({
      conversationSessionEntries: selectedConversationEntriesForCompaction.compactionSourceConversationSessionEntries,
    });
    this.isCompactingConversationSession = true;
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_compaction.started", {
      selectedModelId: input.selectedModelId,
      selectedReasoningEffort: input.selectedReasoningEffort ?? null,
      conversationSessionEntryCount: conversationSessionEntriesBeforeCompaction.length,
      compactionSourceConversationSessionEntryCount:
        selectedConversationEntriesForCompaction.compactionSourceConversationSessionEntries.length,
      retainedRecentConversationSessionEntryCount:
        selectedConversationEntriesForCompaction.retainedRecentConversationSessionEntryCount,
      compactionRequestOriginalCharacterCount: compactionRequestProjection.originalCharacterCount,
      compactionRequestProjectedCharacterCount: compactionRequestProjection.projectedCharacterCount,
      strippedImageAttachmentCount: compactionRequestProjection.strippedImageAttachmentCount,
      truncatedToolResultCount: compactionRequestProjection.truncatedToolResultCount,
      removedProviderTurnReplayCount: compactionRequestProjection.removedProviderTurnReplayCount,
      modelContextItemCount: this.conversationHistory.listModelContextItems().length,
    });
    input.onCompactionSummaryTextUpdated?.("");

    try {
      const compactionPromptEntry = createConversationCompactionPromptSessionEntry();
      const providerConversationTurn = this.conversationTurnProvider.startConversationTurn({
        systemPromptText: buildConversationCompactionSystemPrompt({ workspaceRootPath: this.workspaceRootPath }),
        conversationSessionEntries: [
          ...compactionRequestProjection.conversationSessionEntries,
          compactionPromptEntry,
        ],
        selectedModelId: input.selectedModelId,
        ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
        ...(this.promptCacheKey ? { promptCacheKey: this.promptCacheKey } : {}),
        availableToolNames: [],
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
      const summaryText = await collectConversationCompactionSummaryText({
        providerConversationTurn,
        diagnosticLogger: this.diagnosticLogger,
        ...(input.onCompactionSummaryTextUpdated ? { onCompactionSummaryTextUpdated: input.onCompactionSummaryTextUpdated } : {}),
      });
      const compactionResult: ConversationCompactionResult = {
        summaryText,
        compactedEntryCount: selectedConversationEntriesForCompaction.compactionSourceConversationSessionEntries.length,
      };
      this.conversationHistory.appendConversationSessionEntry({
        entryKind: "conversation_compaction_summary",
        summaryText: compactionResult.summaryText,
        compactedEntryCount: compactionResult.compactedEntryCount,
        retainedRecentConversationSessionEntryCount:
          selectedConversationEntriesForCompaction.retainedRecentConversationSessionEntryCount,
        compactionSource: input.compactionSource ?? "manual",
      });
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_compaction.completed", {
        compactedEntryCount: compactionResult.compactedEntryCount,
        retainedRecentConversationSessionEntryCount:
          selectedConversationEntriesForCompaction.retainedRecentConversationSessionEntryCount,
        summaryTextLength: compactionResult.summaryText.length,
        conversationSessionEntryCount: this.conversationHistory.listConversationSessionEntries().length,
        modelContextItemCount: this.conversationHistory.listModelContextItems().length,
      });
      return compactionResult;
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      const sanitizedErrorText = redactSensitiveText(errorText);
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_compaction.failed", {
        errorTextLength: sanitizedErrorText.length,
        rawErrorTextLength: errorText.length,
      });
      throw error;
    } finally {
      this.isCompactingConversationSession = false;
    }
  }

  async autoCompactCurrentConversationSession(
    input: ConversationAutoCompactionRequest,
  ): Promise<ConversationAutoCompactionResult> {
    const autoCompactionDecision = decideConversationAutoCompaction({
      ...input,
      conversationSessionEntries: this.conversationHistory.listConversationSessionEntries(),
      ...(this.autoCompactionThresholdRatio !== undefined ? { thresholdRatio: this.autoCompactionThresholdRatio } : {}),
      ...(this.autoCompactionReservedTokenCount !== undefined ? { reservedTokenCount: this.autoCompactionReservedTokenCount } : {}),
    });
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_compaction.auto_decided", {
      shouldCompact: autoCompactionDecision.shouldCompact,
      reason: autoCompactionDecision.reason,
      selectedModelId: autoCompactionDecision.selectedModelId,
      contextTokensUsed: autoCompactionDecision.contextTokensUsed,
      contextWindowTokenCapacity: autoCompactionDecision.contextWindowTokenCapacity ?? null,
      contextUsageRatio: autoCompactionDecision.contextUsageRatio ?? null,
      contextCompactionTriggerTokenCount: autoCompactionDecision.contextCompactionTriggerTokenCount ?? null,
      reservedTokenCount: autoCompactionDecision.reservedTokenCount ?? null,
      thresholdRatio: autoCompactionDecision.thresholdRatio ?? null,
      triggerKind: autoCompactionDecision.triggerKind ?? null,
      sessionEntryCountAfterLatestCompactionSummary:
        autoCompactionDecision.sessionEntryCountAfterLatestCompactionSummary,
    });
    if (!autoCompactionDecision.shouldCompact) {
      return { didCompact: false, decision: autoCompactionDecision };
    }

    await this.compactCurrentConversationSession({
      selectedModelId: input.selectedModelId,
      compactionSource: "auto",
      ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
      ...(input.onCompactionSummaryTextUpdated
        ? { onCompactionSummaryTextUpdated: input.onCompactionSummaryTextUpdated }
        : {}),
    });
    const conversationSessionEntries = this.conversationHistory.listConversationSessionEntries();
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_compaction.auto_completed", {
      selectedModelId: input.selectedModelId,
      conversationSessionEntryCount: conversationSessionEntries.length,
      contextTokensUsed: autoCompactionDecision.contextTokensUsed,
      triggerKind: autoCompactionDecision.triggerKind ?? null,
    });

    return {
      didCompact: true,
      decision: autoCompactionDecision,
      conversationSessionEntries,
    };
  }
}
