import {
  findLatestVisibleWorkflowHandoffCheckpoint,
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
  buildConversationCompactionWorkflowModeContext,
  buildConversationCompactionSystemPrompt,
  createConversationCompactionPromptSessionEntry,
} from "./conversationCompactionPrompt.ts";
import {
  selectConversationEntriesForCompaction,
} from "./selectConversationEntriesForCompaction.ts";
import { prepareConversationEntriesForCompactionRequest } from "./prepareConversationEntriesForCompactionRequest.ts";
import type {
  AssistantProviderModelPromptProfileResolver,
  AssistantProviderName,
} from "../assistantProviderModelPromptProfile.ts";

export class ConversationSessionCompactor {
  readonly conversationTurnProvider: ConversationTurnProvider;
  readonly assistantProviderName: AssistantProviderName;
  readonly assistantProviderModelPromptProfileResolver: AssistantProviderModelPromptProfileResolver;
  readonly conversationHistory: InMemoryConversationHistory;
  readonly workspaceRootPath: string;
  readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  readonly promptCacheKey: string | undefined;
  readonly isConversationTurnRunning: () => boolean;
  readonly autoCompactionThresholdRatio: number | undefined;
  readonly autoCompactionReservedTokenCount: number | undefined;
  private isCompactingConversationSession = false;

  constructor(input: {
    conversationTurnProvider: ConversationTurnProvider;
    assistantProviderName: AssistantProviderName;
    assistantProviderModelPromptProfileResolver: AssistantProviderModelPromptProfileResolver;
    conversationHistory: InMemoryConversationHistory;
    workspaceRootPath: string;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
    promptCacheKey?: string | undefined;
    isConversationTurnRunning: () => boolean;
    autoCompactionThresholdRatio?: number | undefined;
    autoCompactionReservedTokenCount?: number | undefined;
  }) {
    this.conversationTurnProvider = input.conversationTurnProvider;
    this.assistantProviderName = input.assistantProviderName;
    this.assistantProviderModelPromptProfileResolver = input.assistantProviderModelPromptProfileResolver;
    this.conversationHistory = input.conversationHistory;
    this.workspaceRootPath = input.workspaceRootPath;
    this.diagnosticLogger = input.diagnosticLogger;
    this.promptCacheKey = input.promptCacheKey;
    this.isConversationTurnRunning = input.isConversationTurnRunning;
    this.autoCompactionThresholdRatio = input.autoCompactionThresholdRatio;
    this.autoCompactionReservedTokenCount = input.autoCompactionReservedTokenCount;
  }

  isCompactingCurrentConversationSession(): boolean {
    return this.isCompactingConversationSession;
  }

  async compactCurrentConversationSession(input: ConversationCompactionRequest): Promise<ConversationCompactionResult> {
    return this.compactCurrentConversationSessionWithPolicy({
      ...input,
      shouldBlockDuringConversationTurn: true,
    });
  }

  async compactCurrentConversationSessionForContextOverflowRecovery(
    input: ConversationCompactionRequest,
  ): Promise<ConversationCompactionResult> {
    return this.compactCurrentConversationSessionWithPolicy({
      ...input,
      shouldBlockDuringConversationTurn: false,
    });
  }

  private async compactCurrentConversationSessionWithPolicy(
    input: ConversationCompactionRequest & { shouldBlockDuringConversationTurn: boolean },
  ): Promise<ConversationCompactionResult> {
    const conversationSessionEntriesBeforeCompaction = this.conversationHistory.listConversationSessionEntries();
    if (conversationSessionEntriesBeforeCompaction.length === 0) {
      throw new Error("Nothing to compact yet.");
    }

    if (input.shouldBlockDuringConversationTurn && this.isConversationTurnRunning()) {
      throw new Error("Cannot compact while a conversation turn is running.");
    }

    if (this.isCompactingConversationSession) {
      throw new Error("Conversation compaction is already running.");
    }

    const selectedConversationEntriesForCompaction = selectConversationEntriesForCompaction({
      conversationSessionEntries: conversationSessionEntriesBeforeCompaction,
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
    try {
      const workflowModeContext = buildConversationCompactionWorkflowModeContext({
        conversationSessionEntries: selectedConversationEntriesForCompaction.compactionSourceConversationSessionEntries,
      });
      const latestVisibleWorkflowHandoffCheckpoint = findLatestVisibleWorkflowHandoffCheckpoint(
        selectedConversationEntriesForCompaction.compactionSourceConversationSessionEntries,
      );
      const assistantProviderModelPromptProfile = this.assistantProviderModelPromptProfileResolver({
        providerName: this.assistantProviderName,
        selectedModelId: input.selectedModelId,
      });
      const compactionPromptEntry = createConversationCompactionPromptSessionEntry({
        workflowModeContext,
        assistantProviderModelPromptProfile,
      });
      const compactionSource = input.compactionSource ?? "manual";
      const providerConversationTurn = this.conversationTurnProvider.startConversationTurn({
        providerTurnKind: "conversation_compaction",
        compactionSource,
        systemPromptText: buildConversationCompactionSystemPrompt({
          workspaceRootPath: this.workspaceRootPath,
          assistantProviderModelPromptProfile,
        }),
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
        compactionSource,
        ...(workflowModeContext.latestCompletedAssistantOperatingMode !== undefined
          ? { latestCompletedAssistantOperatingMode: workflowModeContext.latestCompletedAssistantOperatingMode }
          : {}),
        ...latestVisibleWorkflowHandoffCheckpoint,
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
      ...(input.requestTriggerKind === "context_window_overflow" ? { retainedRecentConversationTurnCount: 0 } : {}),
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
