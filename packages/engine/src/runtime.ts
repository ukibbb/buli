import { randomUUID } from "node:crypto";
import {
  DEFAULT_ASSISTANT_OPERATING_MODE,
  AssistantTurnStartedEventSchema,
  type AssistantOperatingMode,
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
  type ProviderAvailableToolName,
  type ProjectInstructionSnapshot,
  redactSensitiveText,
} from "@buli/contracts";
import { ConversationSessionCompactor } from "./conversationCompaction/ConversationSessionCompactor.ts";
import type {
  ConversationAutoCompactionRequest,
  ConversationAutoCompactionResult,
} from "./conversationCompaction/conversationAutoCompactionPolicy.ts";
import { InMemoryConversationHistory } from "./conversationHistory.ts";
import type {
  ActiveConversationTurn,
  AssistantConversationRunner,
  ConversationCompactionRequest,
  ConversationCompactionResult,
  ConversationTurnRuntimeStatus,
  ConversationTurnProvider,
  ConversationTurnRequest,
  ProviderConversationTurn,
} from "./provider.ts";
import {
  DEFAULT_BASH_TOOL_APPROVAL_MODE,
  type BashToolApprovalMode,
} from "./tools/bashToolApprovalPolicy.ts";
import { WorkspaceShellCommandExecutor } from "./tools/workspaceShellCommandExecutor.ts";
import {
  logEngineDiagnosticEvent,
  summarizeAssistantResponseEventForDiagnostics,
} from "./runtimeDiagnostics.ts";
import {
  type RuntimePendingToolApproval,
  type RuntimePendingToolApprovalInput,
  type RuntimeToolCallExecutionContext,
} from "./runtimeToolCallExecution.ts";
import { RuntimePendingToolApprovalController } from "./runtimePendingToolApprovalController.ts";
import {
  RuntimeConversationTurnLifecycle,
} from "./runtimeConversationTurnLifecycle.ts";
import { RuntimeConversationTurnSessionRecorder } from "./runtimeConversationTurnSessionRecorder.ts";
import { RuntimeProviderStreamEventTranslator } from "./runtimeProviderStreamEventTranslator.ts";
import { ProjectInstructionTracker } from "./projectInstructions.ts";
import { RuntimeReadOnlyToolCallConcurrencyLimiter } from "./runtimeReadOnlyToolCallConcurrencyLimiter.ts";
import { startAcceptedRuntimeConversationTurn } from "./runtimeConversationTurnStart.ts";
import { streamAssistantResponseEventsFromProviderStream } from "./runtimeProviderStreamProcessor.ts";
import {
  finalizeFailedConversationTurn,
  finalizeInterruptedConversationTurn,
  finalizeProviderStreamEndedBeforeCompletion,
} from "./runtimeConversationTurnTerminalFinalizer.ts";
import type { WorkspaceSnapshotStore } from "./workspaceSnapshot/workspaceSnapshotStore.ts";

export class AssistantConversationRuntime implements AssistantConversationRunner {
  readonly conversationTurnProvider: ConversationTurnProvider;
  readonly workspaceRootPath: string;
  readonly promptContextBrowseRootPath: string;
  readonly promptContextStartingDirectoryPath: string;
  readonly workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
  readonly workspaceSnapshotStore: WorkspaceSnapshotStore | undefined;
  readonly conversationHistory: InMemoryConversationHistory;
  readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  readonly bashToolApprovalMode: BashToolApprovalMode;
  readonly promptCacheKey: string | undefined;
  readonly availableToolNames: readonly ProviderAvailableToolName[] | undefined;
  readonly canSpawnSubagent: boolean;
  readonly projectInstructionTracker: ProjectInstructionTracker;
  readonly conversationSessionCompactor: ConversationSessionCompactor;
  currentPendingConversationTurn: RuntimeConversationTurn | undefined;

  constructor(input: {
    conversationTurnProvider: ConversationTurnProvider;
    workspaceRootPath: string;
    promptContextBrowseRootPath: string;
    promptContextStartingDirectoryPath?: string;
    workspaceShellCommandExecutor?: WorkspaceShellCommandExecutor;
    workspaceSnapshotStore?: WorkspaceSnapshotStore | undefined;
    conversationHistory?: InMemoryConversationHistory;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
    bashToolApprovalMode?: BashToolApprovalMode;
    promptCacheKey?: string | undefined;
    availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
    canSpawnSubagent?: boolean;
    projectInstructionTracker?: ProjectInstructionTracker;
    autoCompactionThresholdRatio?: number | undefined;
    autoCompactionReservedTokenCount?: number | undefined;
    retainedRecentConversationTurnCount?: number | undefined;
  }) {
    this.conversationTurnProvider = input.conversationTurnProvider;
    this.workspaceRootPath = input.workspaceRootPath;
    this.promptContextBrowseRootPath = input.promptContextBrowseRootPath;
    this.promptContextStartingDirectoryPath = input.promptContextStartingDirectoryPath ?? input.promptContextBrowseRootPath;
    this.workspaceShellCommandExecutor =
      input.workspaceShellCommandExecutor ?? new WorkspaceShellCommandExecutor({ workspaceRootPath: input.workspaceRootPath });
    this.workspaceSnapshotStore = input.workspaceSnapshotStore;
    this.conversationHistory = input.conversationHistory ?? new InMemoryConversationHistory();
    this.diagnosticLogger = input.diagnosticLogger;
    this.bashToolApprovalMode = input.bashToolApprovalMode ?? DEFAULT_BASH_TOOL_APPROVAL_MODE;
    this.promptCacheKey = input.promptCacheKey;
    this.availableToolNames = input.availableToolNames;
    this.canSpawnSubagent = input.canSpawnSubagent ?? true;
    this.projectInstructionTracker = input.projectInstructionTracker ?? new ProjectInstructionTracker({
      workspaceRootPath: input.workspaceRootPath,
    });
    this.conversationSessionCompactor = new ConversationSessionCompactor({
      conversationTurnProvider: this.conversationTurnProvider,
      conversationHistory: this.conversationHistory,
      workspaceRootPath: this.workspaceRootPath,
      ...(this.diagnosticLogger ? { diagnosticLogger: this.diagnosticLogger } : {}),
      ...(this.promptCacheKey ? { promptCacheKey: this.promptCacheKey } : {}),
      isConversationTurnRunning: () => Boolean(this.currentPendingConversationTurn && !this.currentPendingConversationTurn.hasFinishedTurn()),
      ...(input.autoCompactionThresholdRatio !== undefined
        ? { autoCompactionThresholdRatio: input.autoCompactionThresholdRatio }
        : {}),
      ...(input.autoCompactionReservedTokenCount !== undefined
        ? { autoCompactionReservedTokenCount: input.autoCompactionReservedTokenCount }
        : {}),
      ...(input.retainedRecentConversationTurnCount !== undefined
        ? { retainedRecentConversationTurnCount: input.retainedRecentConversationTurnCount }
        : {}),
    });
  }

  startConversationTurn(input: ConversationTurnRequest): ActiveConversationTurn {
    const assistantOperatingMode = input.assistantOperatingMode ?? DEFAULT_ASSISTANT_OPERATING_MODE;
    if (this.conversationSessionCompactor.isCompactingCurrentConversationSession()) {
      throw new Error("Cannot start a conversation turn while compaction is running.");
    }

    if (this.currentPendingConversationTurn && !this.currentPendingConversationTurn.hasFinishedTurn()) {
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.rejected", {
        reason: "turn_already_running",
        selectedModelId: input.selectedModelId,
        userPromptLength: input.userPromptText.length,
        userPromptImageAttachmentCount: input.userPromptImageAttachments?.length ?? 0,
      });
      throw new Error("A conversation turn is already running");
    }

    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.accepted", {
      selectedModelId: input.selectedModelId,
      selectedReasoningEffort: input.selectedReasoningEffort ?? null,
      userPromptLength: input.userPromptText.length,
      userPromptImageAttachmentCount: input.userPromptImageAttachments?.length ?? 0,
      conversationSessionEntryCount: this.conversationHistory.listConversationSessionEntries().length,
      modelContextItemCount: this.conversationHistory.listModelContextItems().length,
      bashToolApprovalMode: this.bashToolApprovalMode,
      assistantOperatingMode,
    });

    const runtimeConversationTurn = new RuntimeConversationTurn({
      conversationTurnInput: input,
      assistantOperatingMode,
      conversationTurnProvider: this.conversationTurnProvider,
      conversationHistory: this.conversationHistory,
      workspaceRootPath: this.workspaceRootPath,
      promptContextBrowseRootPath: this.promptContextBrowseRootPath,
      promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
      workspaceShellCommandExecutor: this.workspaceShellCommandExecutor,
      workspaceSnapshotStore: this.workspaceSnapshotStore,
      diagnosticLogger: this.diagnosticLogger,
      bashToolApprovalMode: this.bashToolApprovalMode,
      promptCacheKey: this.promptCacheKey,
      availableToolNames: this.availableToolNames,
      canSpawnSubagent: this.canSpawnSubagent,
      projectInstructionTracker: this.projectInstructionTracker,
      onConversationTurnFinished: () => {
        if (this.currentPendingConversationTurn === runtimeConversationTurn) {
          this.currentPendingConversationTurn = undefined;
        }
      },
    });

    this.currentPendingConversationTurn = runtimeConversationTurn;
    return runtimeConversationTurn;
  }

  readConversationTurnRuntimeStatus(): ConversationTurnRuntimeStatus {
    if (this.conversationSessionCompactor.isCompactingCurrentConversationSession()) {
      return { statusKind: "conversation_session_compaction_running" };
    }

    if (this.currentPendingConversationTurn && !this.currentPendingConversationTurn.hasFinishedTurn()) {
      return {
        statusKind: "conversation_turn_running",
        selectedModelId: this.currentPendingConversationTurn.conversationTurnInput.selectedModelId,
      };
    }

    return { statusKind: "idle" };
  }

  async compactConversationSession(input: ConversationCompactionRequest): Promise<ConversationCompactionResult> {
    return this.conversationSessionCompactor.compactCurrentConversationSession(input);
  }

  async autoCompactConversationSession(input: ConversationAutoCompactionRequest): Promise<ConversationAutoCompactionResult> {
    return this.conversationSessionCompactor.autoCompactCurrentConversationSession(input);
  }
}

class RuntimeConversationTurn implements ActiveConversationTurn {
  readonly conversationTurnInput: ConversationTurnRequest;
  readonly assistantOperatingMode: AssistantOperatingMode;
  readonly conversationTurnProvider: ConversationTurnProvider;
  readonly conversationHistory: InMemoryConversationHistory;
  readonly workspaceRootPath: string;
  readonly promptContextBrowseRootPath: string;
  readonly promptContextStartingDirectoryPath: string;
  readonly workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
  readonly workspaceSnapshotStore: WorkspaceSnapshotStore | undefined;
  readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  readonly bashToolApprovalMode: BashToolApprovalMode;
  readonly promptCacheKey: string | undefined;
  readonly availableToolNames: readonly ProviderAvailableToolName[] | undefined;
  readonly canSpawnSubagent: boolean;
  readonly projectInstructionTracker: ProjectInstructionTracker;
  readonly onConversationTurnFinished: () => void;
  readonly pendingToolApprovalController: RuntimePendingToolApprovalController;
  readonly conversationTurnLifecycle: RuntimeConversationTurnLifecycle;
  readonly readOnlyToolCallConcurrencyLimiter: RuntimeReadOnlyToolCallConcurrencyLimiter;

  constructor(input: {
    conversationTurnInput: ConversationTurnRequest;
    assistantOperatingMode: AssistantOperatingMode;
    conversationTurnProvider: ConversationTurnProvider;
    conversationHistory: InMemoryConversationHistory;
    workspaceRootPath: string;
    promptContextBrowseRootPath: string;
    promptContextStartingDirectoryPath: string;
    workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
    workspaceSnapshotStore?: WorkspaceSnapshotStore | undefined;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
    bashToolApprovalMode: BashToolApprovalMode;
    promptCacheKey?: string | undefined;
    availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
    canSpawnSubagent: boolean;
    projectInstructionTracker: ProjectInstructionTracker;
    onConversationTurnFinished: () => void;
  }) {
    this.conversationTurnInput = input.conversationTurnInput;
    this.assistantOperatingMode = input.assistantOperatingMode;
    this.conversationTurnProvider = input.conversationTurnProvider;
    this.conversationHistory = input.conversationHistory;
    this.workspaceRootPath = input.workspaceRootPath;
    this.promptContextBrowseRootPath = input.promptContextBrowseRootPath;
    this.promptContextStartingDirectoryPath = input.promptContextStartingDirectoryPath;
    this.workspaceShellCommandExecutor = input.workspaceShellCommandExecutor;
    this.workspaceSnapshotStore = input.workspaceSnapshotStore;
    this.diagnosticLogger = input.diagnosticLogger;
    this.bashToolApprovalMode = input.bashToolApprovalMode;
    this.promptCacheKey = input.promptCacheKey;
    this.availableToolNames = input.availableToolNames;
    this.canSpawnSubagent = input.canSpawnSubagent;
    this.projectInstructionTracker = input.projectInstructionTracker;
    this.onConversationTurnFinished = input.onConversationTurnFinished;
    this.pendingToolApprovalController = new RuntimePendingToolApprovalController({
      diagnosticLogger: this.diagnosticLogger,
    });
    this.readOnlyToolCallConcurrencyLimiter = new RuntimeReadOnlyToolCallConcurrencyLimiter();
    this.conversationTurnLifecycle = new RuntimeConversationTurnLifecycle({
      selectedModelId: this.conversationTurnInput.selectedModelId,
      diagnosticLogger: this.diagnosticLogger,
      onConversationTurnFinished: this.onConversationTurnFinished,
      hasPendingToolApproval: () => this.pendingToolApprovalController.hasPendingToolApproval(),
      resolvePendingToolApprovalAsInterrupted: () => {
        this.pendingToolApprovalController.resolveCurrentPendingToolApprovalAsInterrupted();
      },
    });
  }

  hasFinishedTurn(): boolean {
    return this.conversationTurnLifecycle.hasFinishedTurn();
  }

  async approvePendingToolCall(approvalId: string): Promise<void> {
    await this.pendingToolApprovalController.approvePendingToolCall(approvalId);
  }

  async denyPendingToolCall(approvalId: string): Promise<void> {
    await this.pendingToolApprovalController.denyPendingToolCall(approvalId);
  }

  interrupt(): void {
    this.conversationTurnLifecycle.interrupt();
  }

  async *streamAssistantResponseEvents(): AsyncGenerator<AssistantResponseEvent> {
    this.conversationTurnLifecycle.markAssistantResponseEventStreamStarted();

    const conversationTurnStartedAtMilliseconds = Date.now();
    const assistantResponseMessageId = randomUUID();
    const assistantTextPartId = randomUUID();
    const conversationTurnSessionRecorder = new RuntimeConversationTurnSessionRecorder({
      conversationHistory: this.conversationHistory,
      userPromptText: this.conversationTurnInput.userPromptText,
      assistantOperatingMode: this.assistantOperatingMode,
      ...(this.conversationTurnInput.promptSource ? { promptSource: this.conversationTurnInput.promptSource } : {}),
      ...(this.conversationTurnInput.userPromptImageAttachments
        ? { userPromptImageAttachments: this.conversationTurnInput.userPromptImageAttachments }
        : {}),
      diagnosticLogger: this.diagnosticLogger,
    });
    const providerStreamEventTranslator = new RuntimeProviderStreamEventTranslator({
      assistantResponseMessageId,
      assistantTextPartId,
      conversationTurnStartedAtMilliseconds,
      selectedModelId: this.conversationTurnInput.selectedModelId,
    });
    let modelFacingPromptTextForAcceptedTurn: string | undefined;
    let projectInstructionSnapshotsForAcceptedTurn: readonly ProjectInstructionSnapshot[] = [];
    const logAssistantResponseEventEmitted = (assistantResponseEvent: AssistantResponseEvent): AssistantResponseEvent => {
      logEngineDiagnosticEvent(this.diagnosticLogger, "assistant_response_event.emitted", {
        eventType: assistantResponseEvent.type,
        ...summarizeAssistantResponseEventForDiagnostics(assistantResponseEvent),
      });
      return assistantResponseEvent;
    };

    try {
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.stream_started", {
        selectedModelId: this.conversationTurnInput.selectedModelId,
        selectedReasoningEffort: this.conversationTurnInput.selectedReasoningEffort ?? null,
        userPromptLength: this.conversationTurnInput.userPromptText.length,
        userPromptImageAttachmentCount: this.conversationTurnInput.userPromptImageAttachments?.length ?? 0,
        assistantOperatingMode: this.assistantOperatingMode,
      });
      yield logAssistantResponseEventEmitted(AssistantTurnStartedEventSchema.parse({
        type: "assistant_turn_started",
        messageId: assistantResponseMessageId,
        startedAtMs: conversationTurnStartedAtMilliseconds,
      }));

      const startedRuntimeConversationTurn = await startAcceptedRuntimeConversationTurn({
        conversationTurnInput: this.conversationTurnInput,
        assistantOperatingMode: this.assistantOperatingMode,
        conversationTurnProvider: this.conversationTurnProvider,
        conversationHistory: this.conversationHistory,
        workspaceRootPath: this.workspaceRootPath,
        promptContextBrowseRootPath: this.promptContextBrowseRootPath,
        promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
        projectInstructionTracker: this.projectInstructionTracker,
        ...(this.promptCacheKey ? { promptCacheKey: this.promptCacheKey } : {}),
        ...(this.availableToolNames ? { availableToolNames: this.availableToolNames } : {}),
        abortSignal: this.conversationTurnLifecycle.abortSignal,
        conversationTurnSessionRecorder,
        throwIfConversationTurnInterrupted: () => this.throwIfConversationTurnInterrupted(),
        diagnosticLogger: this.diagnosticLogger,
      });
      modelFacingPromptTextForAcceptedTurn = startedRuntimeConversationTurn.modelFacingPromptTextForAcceptedTurn;
      projectInstructionSnapshotsForAcceptedTurn = startedRuntimeConversationTurn.projectInstructionSnapshotsForAcceptedTurn;

      const providerStreamProcessingOutcome = yield* streamAssistantResponseEventsFromProviderStream({
        providerConversationTurn: startedRuntimeConversationTurn.providerConversationTurn,
        providerStreamEventTranslator,
        conversationTurnSessionRecorder,
        createRequestedToolCallsExecutionContext: () => this.createRequestedToolCallsExecutionContext({
          assistantResponseMessageId,
          providerConversationTurn: startedRuntimeConversationTurn.providerConversationTurn,
        }),
        throwIfConversationTurnInterrupted: () => this.throwIfConversationTurnInterrupted(),
        logAssistantResponseEventEmitted,
        diagnosticLogger: this.diagnosticLogger,
      });
      if (providerStreamProcessingOutcome.outcomeKind === "terminal_assistant_response") {
        return;
      }

      for (const assistantResponseEvent of finalizeProviderStreamEndedBeforeCompletion({
        assistantResponseMessageId,
        conversationTurnSessionRecorder,
        providerStreamEventTranslator,
      })) {
        yield logAssistantResponseEventEmitted(assistantResponseEvent);
      }
    } catch (error) {
      if (this.conversationTurnLifecycle.hasInterruptedTurn() || this.conversationTurnLifecycle.abortSignal.aborted) {
        logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.interrupted", {
          selectedModelId: this.conversationTurnInput.selectedModelId,
          assistantMessageTextLength: providerStreamEventTranslator.assistantMessageText.length,
        });
        for (const assistantResponseEvent of finalizeInterruptedConversationTurn({
          assistantResponseMessageId,
          conversationTurnSessionRecorder,
          providerStreamEventTranslator,
          acceptedPromptFallback: {
            userPromptText: this.conversationTurnInput.userPromptText,
            modelFacingPromptTextForAcceptedTurn,
            projectInstructionSnapshotsForAcceptedTurn,
          },
        })) {
          yield logAssistantResponseEventEmitted(assistantResponseEvent);
        }
        return;
      }

      const rawErrorText = error instanceof Error ? error.message : String(error);
      const failureExplanation = sanitizeRuntimeFailureExplanation(
        rawErrorText.length > 0 ? rawErrorText : "Unknown conversation turn failure",
      );
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.failed", {
        failureExplanationLength: failureExplanation.length,
        rawErrorTextLength: rawErrorText.length,
      });
      for (const assistantResponseEvent of finalizeFailedConversationTurn({
        assistantResponseMessageId,
        conversationTurnSessionRecorder,
        providerStreamEventTranslator,
        acceptedPromptFallback: {
          userPromptText: this.conversationTurnInput.userPromptText,
          modelFacingPromptTextForAcceptedTurn,
          projectInstructionSnapshotsForAcceptedTurn,
        },
        failureExplanation,
      })) {
        yield logAssistantResponseEventEmitted(assistantResponseEvent);
      }
    } finally {
      this.pendingToolApprovalController.clearPendingToolApproval();
      this.conversationTurnLifecycle.finish({ conversationTurnStartedAtMilliseconds });
    }
  }

  private createPendingToolApproval(input: RuntimePendingToolApprovalInput): RuntimePendingToolApproval {
    return this.pendingToolApprovalController.createPendingToolApproval(input);
  }

  private createRequestedToolCallsExecutionContext(input: {
    assistantResponseMessageId: string;
    providerConversationTurn: ProviderConversationTurn;
  }): RuntimeToolCallExecutionContext {
    return {
      assistantResponseMessageId: input.assistantResponseMessageId,
      providerConversationTurn: input.providerConversationTurn,
      conversationTurnProvider: this.conversationTurnProvider,
      selectedModelId: this.conversationTurnInput.selectedModelId,
      ...(this.conversationTurnInput.selectedReasoningEffort
        ? { selectedReasoningEffort: this.conversationTurnInput.selectedReasoningEffort }
        : {}),
      assistantOperatingMode: this.assistantOperatingMode,
      bashToolApprovalMode: this.bashToolApprovalMode,
      workspaceRootPath: this.workspaceRootPath,
      workspaceSnapshotStore: this.workspaceSnapshotStore,
      projectInstructionTracker: this.projectInstructionTracker,
      promptContextBrowseRootPath: this.promptContextBrowseRootPath,
      promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
      workspaceShellCommandExecutor: this.workspaceShellCommandExecutor,
      conversationHistory: this.conversationHistory,
      abortSignal: this.conversationTurnLifecycle.abortSignal,
      readOnlyToolCallConcurrencyLimiter: this.readOnlyToolCallConcurrencyLimiter,
      canSpawnSubagent: this.canSpawnSubagent,
      createPendingToolApproval: (pendingToolApprovalInput) => this.createPendingToolApproval(pendingToolApprovalInput),
      throwIfConversationTurnInterrupted: () => {
        this.throwIfConversationTurnInterrupted();
      },
      diagnosticLogger: this.diagnosticLogger,
    };
  }

  private throwIfConversationTurnInterrupted(): void {
    this.conversationTurnLifecycle.throwIfInterrupted();
  }
}

function sanitizeRuntimeFailureExplanation(failureExplanation: string): string {
  return redactSensitiveText(failureExplanation);
}
