import { randomUUID } from "node:crypto";
import {
  DEFAULT_ASSISTANT_OPERATING_MODE,
  AssistantMessagePartAddedEventSchema,
  AssistantTurnStartedEventSchema,
  type AssistantOperatingMode,
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
  type ProviderAvailableToolName,
  type ProjectInstructionSnapshot,
  isContextWindowOverflowError,
  redactSensitiveText,
  type WorkflowHandoff,
} from "@buli/contracts";
import { ConversationSessionCompactor } from "./conversationCompaction/ConversationSessionCompactor.ts";
import {
  createDefaultWorkspaceCodebaseKnowledgeIndex,
  type WorkspaceCodebaseKnowledgeIndex,
} from "./codebaseKnowledge/treeSitterWorkspaceCodebaseKnowledgeIndex.ts";
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
import { RuntimeSubagentConversationConcurrencyLimiter } from "./runtimeSubagentConversationConcurrencyLimiter.ts";
import { startAcceptedRuntimeConversationTurn } from "./runtimeConversationTurnStart.ts";
import { streamAssistantResponseEventsFromProviderStream } from "./runtimeProviderStreamProcessor.ts";
import { summarizeConversationHistoryResourceUsageForDiagnostics } from "./runtimeConversationResourceDiagnostics.ts";
import { WorkspaceSkillCatalog } from "./skills/skillCatalog.ts";
import {
  DEFAULT_ASSISTANT_PROVIDER_NAME,
  resolveDefaultAssistantProviderModelPromptProfile,
  type AssistantProviderModelPromptProfile,
  type AssistantProviderModelPromptProfileResolver,
  type AssistantProviderName,
} from "./assistantProviderModelPromptProfile.ts";
import {
  finalizeFailedConversationTurn,
  finalizeInterruptedConversationTurn,
  finalizeProviderStreamEndedBeforeCompletion,
} from "./runtimeConversationTurnTerminalFinalizer.ts";
import type { WorkspaceSnapshotStore } from "./workspaceSnapshot/workspaceSnapshotStore.ts";

export class AssistantConversationRuntime implements AssistantConversationRunner {
  readonly conversationTurnProvider: ConversationTurnProvider;
  readonly assistantProviderName: AssistantProviderName;
  readonly assistantProviderModelPromptProfileResolver: AssistantProviderModelPromptProfileResolver;
  readonly workspaceRootPath: string;
  readonly promptContextBrowseRootPath: string;
  readonly promptContextStartingDirectoryPath: string;
  readonly workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
  readonly workspaceSnapshotStore: WorkspaceSnapshotStore | undefined;
  readonly workspaceCodebaseKnowledgeIndex: WorkspaceCodebaseKnowledgeIndex;
  readonly conversationHistory: InMemoryConversationHistory;
  readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  readonly bashToolApprovalMode: BashToolApprovalMode;
  readonly promptCacheKey: string | undefined;
  readonly availableToolNames: readonly ProviderAvailableToolName[] | undefined;
  readonly canSpawnSubagent: boolean;
  readonly maximumConcurrentReadOnlyToolCalls: number | undefined;
  readonly maximumConcurrentSubagentConversations: number | undefined;
  readonly taskSubagentSoftElapsedTimeCheckpointMilliseconds: number | undefined;
  readonly projectInstructionTracker: ProjectInstructionTracker;
  readonly skillCatalog: WorkspaceSkillCatalog;
  readonly conversationSessionCompactor: ConversationSessionCompactor;
  currentPendingConversationTurn: RuntimeConversationTurn | undefined;
  #hasStartedWorkspaceCodebaseKnowledgeIndexing = false;

  constructor(input: {
    conversationTurnProvider: ConversationTurnProvider;
    assistantProviderName?: AssistantProviderName | undefined;
    assistantProviderModelPromptProfileResolver?: AssistantProviderModelPromptProfileResolver | undefined;
    workspaceRootPath: string;
    promptContextBrowseRootPath: string;
    promptContextStartingDirectoryPath?: string;
    workspaceShellCommandExecutor?: WorkspaceShellCommandExecutor;
    workspaceSnapshotStore?: WorkspaceSnapshotStore | undefined;
    workspaceCodebaseKnowledgeIndex?: WorkspaceCodebaseKnowledgeIndex | undefined;
    conversationHistory?: InMemoryConversationHistory;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
    bashToolApprovalMode?: BashToolApprovalMode;
    promptCacheKey?: string | undefined;
    availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
    canSpawnSubagent?: boolean;
    maximumConcurrentReadOnlyToolCalls?: number | undefined;
    maximumConcurrentSubagentConversations?: number | undefined;
    taskSubagentSoftElapsedTimeCheckpointMilliseconds?: number | undefined;
    projectInstructionTracker?: ProjectInstructionTracker;
    skillCatalog?: WorkspaceSkillCatalog;
    skillHomeDirectoryPath?: string | undefined;
    autoCompactionThresholdRatio?: number | undefined;
    autoCompactionReservedTokenCount?: number | undefined;
  }) {
    this.conversationTurnProvider = input.conversationTurnProvider;
    this.assistantProviderName = input.assistantProviderName ?? DEFAULT_ASSISTANT_PROVIDER_NAME;
    this.assistantProviderModelPromptProfileResolver = input.assistantProviderModelPromptProfileResolver ??
      resolveDefaultAssistantProviderModelPromptProfile;
    this.workspaceRootPath = input.workspaceRootPath;
    this.promptContextBrowseRootPath = input.promptContextBrowseRootPath;
    this.promptContextStartingDirectoryPath = input.promptContextStartingDirectoryPath ?? input.promptContextBrowseRootPath;
    this.workspaceShellCommandExecutor =
      input.workspaceShellCommandExecutor ?? new WorkspaceShellCommandExecutor({ workspaceRootPath: input.workspaceRootPath });
    this.workspaceSnapshotStore = input.workspaceSnapshotStore;
    this.workspaceCodebaseKnowledgeIndex = input.workspaceCodebaseKnowledgeIndex ?? createDefaultWorkspaceCodebaseKnowledgeIndex({
      workspaceRootPath: input.workspaceRootPath,
      ...(input.diagnosticLogger ? { diagnosticLogger: input.diagnosticLogger } : {}),
    });
    this.conversationHistory = input.conversationHistory ?? new InMemoryConversationHistory();
    this.diagnosticLogger = input.diagnosticLogger;
    this.bashToolApprovalMode = input.bashToolApprovalMode ?? DEFAULT_BASH_TOOL_APPROVAL_MODE;
    this.promptCacheKey = input.promptCacheKey;
    this.availableToolNames = input.availableToolNames;
    this.canSpawnSubagent = input.canSpawnSubagent ?? true;
    this.maximumConcurrentReadOnlyToolCalls = input.maximumConcurrentReadOnlyToolCalls;
    this.maximumConcurrentSubagentConversations = input.maximumConcurrentSubagentConversations;
    this.taskSubagentSoftElapsedTimeCheckpointMilliseconds = validateTaskSubagentSoftElapsedTimeCheckpointMilliseconds(
      input.taskSubagentSoftElapsedTimeCheckpointMilliseconds,
    );
    this.projectInstructionTracker = input.projectInstructionTracker ?? new ProjectInstructionTracker({
      workspaceRootPath: input.workspaceRootPath,
    });
    this.skillCatalog = input.skillCatalog ?? new WorkspaceSkillCatalog({
      workspaceRootPath: input.workspaceRootPath,
      ...(input.skillHomeDirectoryPath !== undefined ? { homeDirectoryPath: input.skillHomeDirectoryPath } : {}),
    });
    this.conversationSessionCompactor = new ConversationSessionCompactor({
      conversationTurnProvider: this.conversationTurnProvider,
      assistantProviderName: this.assistantProviderName,
      assistantProviderModelPromptProfileResolver: this.assistantProviderModelPromptProfileResolver,
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
    });
  }

  startWorkspaceCodebaseKnowledgeIndexing(): void {
    if (this.#hasStartedWorkspaceCodebaseKnowledgeIndexing) {
      return;
    }
    this.#hasStartedWorkspaceCodebaseKnowledgeIndexing = true;
    const indexingStartedAtMs = Date.now();
    logEngineDiagnosticEvent(this.diagnosticLogger, "codebase_knowledge.indexing_started", {
      workspaceRootPath: this.workspaceRootPath,
    });

    void this.workspaceCodebaseKnowledgeIndex.ensureWorkspaceIndexed().then(() => {
      logEngineDiagnosticEvent(this.diagnosticLogger, "codebase_knowledge.indexing_completed", {
        workspaceRootPath: this.workspaceRootPath,
        durationMs: Date.now() - indexingStartedAtMs,
      });
    }).catch((error: unknown) => {
      this.#hasStartedWorkspaceCodebaseKnowledgeIndexing = false;
      logEngineDiagnosticEvent(this.diagnosticLogger, "codebase_knowledge.indexing_failed", {
        workspaceRootPath: this.workspaceRootPath,
        durationMs: Date.now() - indexingStartedAtMs,
        failureExplanation: error instanceof Error ? error.message : String(error),
      });
    });
  }

  startConversationTurn(input: ConversationTurnRequest): ActiveConversationTurn {
    const assistantOperatingMode = input.assistantOperatingMode ?? DEFAULT_ASSISTANT_OPERATING_MODE;
    const conversationTurnInput: ConversationTurnRequest = {
      ...input,
      conversationTurnId: input.conversationTurnId ?? randomUUID(),
    };
    if (this.conversationSessionCompactor.isCompactingCurrentConversationSession()) {
      throw new Error("Cannot start a conversation turn while compaction is running.");
    }

    if (this.currentPendingConversationTurn && !this.currentPendingConversationTurn.hasFinishedTurn()) {
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.rejected", {
        reason: "turn_already_running",
        conversationTurnId: conversationTurnInput.conversationTurnId ?? null,
        selectedModelId: conversationTurnInput.selectedModelId,
        userPromptLength: conversationTurnInput.userPromptText.length,
        userPromptImageAttachmentCount: conversationTurnInput.userPromptImageAttachments?.length ?? 0,
      });
      throw new Error("A conversation turn is already running");
    }

    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.accepted", {
      conversationTurnId: conversationTurnInput.conversationTurnId ?? null,
      selectedModelId: conversationTurnInput.selectedModelId,
      selectedReasoningEffort: conversationTurnInput.selectedReasoningEffort ?? null,
      userPromptLength: conversationTurnInput.userPromptText.length,
      userPromptImageAttachmentCount: conversationTurnInput.userPromptImageAttachments?.length ?? 0,
      conversationSessionEntryCount: this.conversationHistory.listConversationSessionEntries().length,
      modelContextItemCount: this.conversationHistory.listModelContextItems().length,
      bashToolApprovalMode: this.bashToolApprovalMode,
      assistantOperatingMode,
    });

    const runtimeConversationTurn = new RuntimeConversationTurn({
      conversationTurnInput,
      assistantOperatingMode,
      conversationTurnProvider: this.conversationTurnProvider,
      assistantProviderName: this.assistantProviderName,
      assistantProviderModelPromptProfileResolver: this.assistantProviderModelPromptProfileResolver,
      conversationSessionCompactor: this.conversationSessionCompactor,
      conversationHistory: this.conversationHistory,
      workspaceRootPath: this.workspaceRootPath,
      promptContextBrowseRootPath: this.promptContextBrowseRootPath,
      promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
      workspaceShellCommandExecutor: this.workspaceShellCommandExecutor,
      workspaceSnapshotStore: this.workspaceSnapshotStore,
      workspaceCodebaseKnowledgeIndex: this.workspaceCodebaseKnowledgeIndex,
      diagnosticLogger: this.diagnosticLogger,
      bashToolApprovalMode: this.bashToolApprovalMode,
      promptCacheKey: this.promptCacheKey,
      availableToolNames: this.availableToolNames,
      canSpawnSubagent: this.canSpawnSubagent,
      ...(this.maximumConcurrentReadOnlyToolCalls !== undefined
        ? { maximumConcurrentReadOnlyToolCalls: this.maximumConcurrentReadOnlyToolCalls }
        : {}),
      ...(this.maximumConcurrentSubagentConversations !== undefined
        ? { maximumConcurrentSubagentConversations: this.maximumConcurrentSubagentConversations }
        : {}),
      ...(this.taskSubagentSoftElapsedTimeCheckpointMilliseconds !== undefined
        ? { taskSubagentSoftElapsedTimeCheckpointMilliseconds: this.taskSubagentSoftElapsedTimeCheckpointMilliseconds }
        : {}),
      projectInstructionTracker: this.projectInstructionTracker,
      skillCatalog: this.skillCatalog,
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

  async listAvailableSkills() {
    return this.skillCatalog.listAvailableSkills();
  }
}

class RuntimeConversationTurn implements ActiveConversationTurn {
  readonly conversationTurnId: string;
  readonly conversationTurnInput: ConversationTurnRequest;
  readonly assistantOperatingMode: AssistantOperatingMode;
  readonly conversationTurnProvider: ConversationTurnProvider;
  readonly assistantProviderName: AssistantProviderName;
  readonly assistantProviderModelPromptProfile: AssistantProviderModelPromptProfile;
  readonly conversationSessionCompactor: ConversationSessionCompactor;
  readonly conversationHistory: InMemoryConversationHistory;
  readonly workspaceRootPath: string;
  readonly promptContextBrowseRootPath: string;
  readonly promptContextStartingDirectoryPath: string;
  readonly workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
  readonly workspaceSnapshotStore: WorkspaceSnapshotStore | undefined;
  readonly workspaceCodebaseKnowledgeIndex: WorkspaceCodebaseKnowledgeIndex;
  readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  readonly bashToolApprovalMode: BashToolApprovalMode;
  readonly promptCacheKey: string | undefined;
  readonly availableToolNames: readonly ProviderAvailableToolName[] | undefined;
  readonly canSpawnSubagent: boolean;
  readonly maximumConcurrentReadOnlyToolCalls: number | undefined;
  readonly maximumConcurrentSubagentConversations: number | undefined;
  readonly taskSubagentSoftElapsedTimeCheckpointMilliseconds: number | undefined;
  readonly projectInstructionTracker: ProjectInstructionTracker;
  readonly skillCatalog: WorkspaceSkillCatalog;
  readonly onConversationTurnFinished: () => void;
  readonly pendingToolApprovalController: RuntimePendingToolApprovalController;
  readonly conversationTurnLifecycle: RuntimeConversationTurnLifecycle;
  readonly readOnlyToolCallConcurrencyLimiter: RuntimeReadOnlyToolCallConcurrencyLimiter;
  readonly subagentConversationConcurrencyLimiter: RuntimeSubagentConversationConcurrencyLimiter;
  private recordedWorkflowHandoff: WorkflowHandoff | undefined;

  constructor(input: {
    conversationTurnInput: ConversationTurnRequest;
    assistantOperatingMode: AssistantOperatingMode;
    conversationTurnProvider: ConversationTurnProvider;
    assistantProviderName: AssistantProviderName;
    assistantProviderModelPromptProfileResolver: AssistantProviderModelPromptProfileResolver;
    conversationSessionCompactor: ConversationSessionCompactor;
    conversationHistory: InMemoryConversationHistory;
    workspaceRootPath: string;
    promptContextBrowseRootPath: string;
    promptContextStartingDirectoryPath: string;
    workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
    workspaceSnapshotStore?: WorkspaceSnapshotStore | undefined;
    workspaceCodebaseKnowledgeIndex: WorkspaceCodebaseKnowledgeIndex;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
    bashToolApprovalMode: BashToolApprovalMode;
    promptCacheKey?: string | undefined;
    availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
    canSpawnSubagent: boolean;
    maximumConcurrentReadOnlyToolCalls?: number | undefined;
    maximumConcurrentSubagentConversations?: number | undefined;
    taskSubagentSoftElapsedTimeCheckpointMilliseconds?: number | undefined;
    projectInstructionTracker: ProjectInstructionTracker;
    skillCatalog: WorkspaceSkillCatalog;
    onConversationTurnFinished: () => void;
  }) {
    this.conversationTurnInput = input.conversationTurnInput;
    this.conversationTurnId = input.conversationTurnInput.conversationTurnId ?? randomUUID();
    this.assistantOperatingMode = input.assistantOperatingMode;
    this.conversationTurnProvider = input.conversationTurnProvider;
    this.assistantProviderName = input.assistantProviderName;
    this.assistantProviderModelPromptProfile = input.assistantProviderModelPromptProfileResolver({
      providerName: input.assistantProviderName,
      selectedModelId: input.conversationTurnInput.selectedModelId,
    });
    this.conversationSessionCompactor = input.conversationSessionCompactor;
    this.conversationHistory = input.conversationHistory;
    this.workspaceRootPath = input.workspaceRootPath;
    this.promptContextBrowseRootPath = input.promptContextBrowseRootPath;
    this.promptContextStartingDirectoryPath = input.promptContextStartingDirectoryPath;
    this.workspaceShellCommandExecutor = input.workspaceShellCommandExecutor;
    this.workspaceSnapshotStore = input.workspaceSnapshotStore;
    this.workspaceCodebaseKnowledgeIndex = input.workspaceCodebaseKnowledgeIndex;
    this.diagnosticLogger = input.diagnosticLogger;
    this.bashToolApprovalMode = input.bashToolApprovalMode;
    this.promptCacheKey = input.promptCacheKey;
    this.availableToolNames = input.availableToolNames;
    this.canSpawnSubagent = input.canSpawnSubagent;
    this.maximumConcurrentReadOnlyToolCalls = input.maximumConcurrentReadOnlyToolCalls;
    this.maximumConcurrentSubagentConversations = input.maximumConcurrentSubagentConversations;
    this.taskSubagentSoftElapsedTimeCheckpointMilliseconds = input.taskSubagentSoftElapsedTimeCheckpointMilliseconds;
    this.projectInstructionTracker = input.projectInstructionTracker;
    this.skillCatalog = input.skillCatalog;
    this.onConversationTurnFinished = input.onConversationTurnFinished;
    this.pendingToolApprovalController = new RuntimePendingToolApprovalController({
      diagnosticLogger: this.diagnosticLogger,
    });
    this.readOnlyToolCallConcurrencyLimiter = new RuntimeReadOnlyToolCallConcurrencyLimiter({
      diagnosticLogger: this.diagnosticLogger,
      ...(this.maximumConcurrentReadOnlyToolCalls !== undefined
        ? { maximumConcurrentReadOnlyToolCalls: this.maximumConcurrentReadOnlyToolCalls }
        : {}),
    });
    this.subagentConversationConcurrencyLimiter = new RuntimeSubagentConversationConcurrencyLimiter({
      diagnosticLogger: this.diagnosticLogger,
      ...(this.maximumConcurrentSubagentConversations !== undefined
        ? { maximumConcurrentSubagentConversations: this.maximumConcurrentSubagentConversations }
        : {}),
    });
    this.conversationTurnLifecycle = new RuntimeConversationTurnLifecycle({
      conversationTurnId: this.conversationTurnId,
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
    const assistantBuliStickyNotesPartId = randomUUID();
    const createConversationTurnSessionRecorder = (): RuntimeConversationTurnSessionRecorder =>
      new RuntimeConversationTurnSessionRecorder({
        conversationTurnId: this.conversationTurnId,
        conversationHistory: this.conversationHistory,
        userPromptText: this.conversationTurnInput.userPromptText,
        assistantOperatingMode: this.assistantOperatingMode,
        ...(this.conversationTurnInput.promptSource ? { promptSource: this.conversationTurnInput.promptSource } : {}),
        ...(this.conversationTurnInput.userPromptImageAttachments
          ? { userPromptImageAttachments: this.conversationTurnInput.userPromptImageAttachments }
          : {}),
        diagnosticLogger: this.diagnosticLogger,
      });
    const createProviderStreamEventTranslator = (): RuntimeProviderStreamEventTranslator =>
      new RuntimeProviderStreamEventTranslator({
        assistantResponseMessageId,
        assistantTextPartId,
        conversationTurnStartedAtMilliseconds,
        assistantOperatingMode: this.assistantOperatingMode,
        selectedModelId: this.conversationTurnInput.selectedModelId,
      });
    let conversationTurnSessionRecorder = createConversationTurnSessionRecorder();
    let providerStreamEventTranslator = createProviderStreamEventTranslator();
    let modelFacingPromptTextForAcceptedTurn: string | undefined;
    let projectInstructionSnapshotsForAcceptedTurn: readonly ProjectInstructionSnapshot[] = [];
    let assistantResponseEventCount = 0;
    let conversationTurnOutcomeKind = "unknown";
    const logAssistantResponseEventEmitted = (assistantResponseEvent: AssistantResponseEvent): AssistantResponseEvent => {
      assistantResponseEventCount += 1;
      logEngineDiagnosticEvent(this.diagnosticLogger, "assistant_response_event.emitted", {
        conversationTurnId: this.conversationTurnId,
        eventType: assistantResponseEvent.type,
        ...summarizeAssistantResponseEventForDiagnostics(assistantResponseEvent),
      });
      return assistantResponseEvent;
    };

    try {
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.stream_started", {
        conversationTurnId: this.conversationTurnId,
        selectedModelId: this.conversationTurnInput.selectedModelId,
        selectedReasoningEffort: this.conversationTurnInput.selectedReasoningEffort ?? null,
        userPromptLength: this.conversationTurnInput.userPromptText.length,
        userPromptImageAttachmentCount: this.conversationTurnInput.userPromptImageAttachments?.length ?? 0,
        assistantOperatingMode: this.assistantOperatingMode,
      });
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.context_snapshot", {
        conversationTurnId: this.conversationTurnId,
        snapshotPhase: "before_user_prompt",
        ...summarizeConversationHistoryResourceUsageForDiagnostics({
          conversationSessionEntries: this.conversationHistory.listConversationSessionEntries(),
          modelContextItems: this.conversationHistory.listModelContextItems(),
        }),
      });
      yield logAssistantResponseEventEmitted(AssistantTurnStartedEventSchema.parse({
        type: "assistant_turn_started",
        messageId: assistantResponseMessageId,
        startedAtMs: conversationTurnStartedAtMilliseconds,
      }));

      let hasRetriedAfterContextWindowOverflow = false;
      while (true) {
        const conversationSessionEntriesBeforeAttempt = this.conversationHistory.listConversationSessionEntries();
        const assistantResponseEventCountBeforeAttempt = assistantResponseEventCount;
        try {
          const startedRuntimeConversationTurn = await startAcceptedRuntimeConversationTurn({
            conversationTurnInput: this.conversationTurnInput,
            assistantOperatingMode: this.assistantOperatingMode,
            conversationTurnProvider: this.conversationTurnProvider,
            assistantProviderModelPromptProfile: this.assistantProviderModelPromptProfile,
            conversationHistory: this.conversationHistory,
            workspaceRootPath: this.workspaceRootPath,
            promptContextBrowseRootPath: this.promptContextBrowseRootPath,
            promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
            projectInstructionTracker: this.projectInstructionTracker,
            skillCatalog: this.skillCatalog,
            ...(this.promptCacheKey ? { promptCacheKey: this.promptCacheKey } : {}),
            ...(this.availableToolNames ? { availableToolNames: this.availableToolNames } : {}),
            abortSignal: this.conversationTurnLifecycle.abortSignal,
            conversationTurnSessionRecorder,
            throwIfConversationTurnInterrupted: () => this.throwIfConversationTurnInterrupted(),
            diagnosticLogger: this.diagnosticLogger,
          });
          modelFacingPromptTextForAcceptedTurn = startedRuntimeConversationTurn.modelFacingPromptTextForAcceptedTurn;
          projectInstructionSnapshotsForAcceptedTurn = startedRuntimeConversationTurn.projectInstructionSnapshotsForAcceptedTurn;
          const buliStickyNotesContextTextForAcceptedTurn =
            startedRuntimeConversationTurn.buliStickyNotesContextTextForAcceptedTurn;
          const conversationTurnSessionRecorderForAcceptedAttempt = conversationTurnSessionRecorder;
          const createBuliStickyNotesAssistantResponseEventsBeforeFirstProviderEvent = buliStickyNotesContextTextForAcceptedTurn
            ? () => {
                conversationTurnSessionRecorderForAcceptedAttempt.appendBuliStickyNotesSessionEntry(
                  buliStickyNotesContextTextForAcceptedTurn,
                );
                return [
                  AssistantMessagePartAddedEventSchema.parse({
                    type: "assistant_message_part_added",
                    messageId: assistantResponseMessageId,
                    part: {
                      id: assistantBuliStickyNotesPartId,
                      partKind: "assistant_buli_sticky_notes",
                      buliStickyNotesContextText: buliStickyNotesContextTextForAcceptedTurn,
                    },
                  }),
                ];
              }
            : undefined;

          const providerStreamProcessingOutcome = yield* streamAssistantResponseEventsFromProviderStream({
            conversationTurnId: this.conversationTurnId,
            providerConversationTurn: startedRuntimeConversationTurn.providerConversationTurn,
            providerStreamEventTranslator,
            conversationTurnSessionRecorder,
            createRequestedToolCallsExecutionContext: () => this.createRequestedToolCallsExecutionContext({
              assistantResponseMessageId,
              providerConversationTurn: startedRuntimeConversationTurn.providerConversationTurn,
            }),
            readRecordedWorkflowHandoff: () => this.recordedWorkflowHandoff,
            ...(createBuliStickyNotesAssistantResponseEventsBeforeFirstProviderEvent !== undefined
              ? {
                  createAssistantResponseEventsBeforeFirstProviderEvent:
                    createBuliStickyNotesAssistantResponseEventsBeforeFirstProviderEvent,
                }
              : {}),
            throwIfConversationTurnInterrupted: () => this.throwIfConversationTurnInterrupted(),
            logAssistantResponseEventEmitted,
            diagnosticLogger: this.diagnosticLogger,
          });
          if (providerStreamProcessingOutcome.outcomeKind === "terminal_assistant_response") {
            conversationTurnOutcomeKind = "terminal_assistant_response";
            return;
          }

          conversationTurnOutcomeKind = "provider_stream_ended_before_completion";
          for (const assistantResponseEvent of finalizeProviderStreamEndedBeforeCompletion({
            assistantResponseMessageId,
            conversationTurnSessionRecorder,
            providerStreamEventTranslator,
          })) {
            yield logAssistantResponseEventEmitted(assistantResponseEvent);
          }
          return;
        } catch (error) {
          const canRecoverContextWindowOverflow = isContextWindowOverflowError(error) &&
            !hasRetriedAfterContextWindowOverflow &&
            conversationSessionEntriesBeforeAttempt.length > 0 &&
            providerStreamEventTranslator.assistantMessageText.length === 0 &&
            assistantResponseEventCount === assistantResponseEventCountBeforeAttempt &&
            !conversationTurnSessionRecorder.hasAppendedTerminalAssistantMessageSessionEntry();
          if (!canRecoverContextWindowOverflow) {
            throw error;
          }

          hasRetriedAfterContextWindowOverflow = true;
          conversationTurnOutcomeKind = "context_window_overflow_recovering";
          this.conversationHistory.replaceConversationSessionEntries(conversationSessionEntriesBeforeAttempt);
          conversationTurnSessionRecorder = createConversationTurnSessionRecorder();
          providerStreamEventTranslator = createProviderStreamEventTranslator();
          logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.context_window_overflow_recovery_started", {
            conversationTurnId: this.conversationTurnId,
            selectedModelId: this.conversationTurnInput.selectedModelId,
            conversationSessionEntryCount: conversationSessionEntriesBeforeAttempt.length,
          });
          await this.conversationSessionCompactor.compactCurrentConversationSessionForContextOverflowRecovery({
            selectedModelId: this.conversationTurnInput.selectedModelId,
            compactionSource: "auto",
            ...(this.conversationTurnInput.selectedReasoningEffort
              ? { selectedReasoningEffort: this.conversationTurnInput.selectedReasoningEffort }
              : {}),
            abortSignal: this.conversationTurnLifecycle.abortSignal,
          });
          logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.context_window_overflow_recovery_completed", {
            conversationTurnId: this.conversationTurnId,
            selectedModelId: this.conversationTurnInput.selectedModelId,
            conversationSessionEntryCount: this.conversationHistory.countConversationSessionEntries(),
          });
        }
      }
    } catch (error) {
      if (this.conversationTurnLifecycle.hasInterruptedTurn() || this.conversationTurnLifecycle.abortSignal.aborted) {
        conversationTurnOutcomeKind = "interrupted";
        logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.interrupted", {
          conversationTurnId: this.conversationTurnId,
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
      const failureKind = isContextWindowOverflowError(error) ? "context_window_overflow" : undefined;
      conversationTurnOutcomeKind = failureKind ?? "failed";
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.failed", {
        conversationTurnId: this.conversationTurnId,
        failureExplanationLength: failureExplanation.length,
        rawErrorTextLength: rawErrorText.length,
        failureKind: failureKind ?? null,
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
        ...(failureKind ? { failureKind } : {}),
      })) {
        yield logAssistantResponseEventEmitted(assistantResponseEvent);
      }
    } finally {
      this.pendingToolApprovalController.clearPendingToolApproval();
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.summary", {
        conversationTurnId: this.conversationTurnId,
        selectedModelId: this.conversationTurnInput.selectedModelId,
        selectedReasoningEffort: this.conversationTurnInput.selectedReasoningEffort ?? null,
        assistantOperatingMode: this.assistantOperatingMode,
        outcomeKind: conversationTurnOutcomeKind,
        assistantResponseEventCount,
        turnDurationMs: Date.now() - conversationTurnStartedAtMilliseconds,
        ...summarizeConversationHistoryResourceUsageForDiagnostics({
          conversationSessionEntries: this.conversationHistory.listConversationSessionEntries(),
          modelContextItems: this.conversationHistory.listModelContextItems(),
        }),
      });
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
      conversationTurnId: this.conversationTurnId,
      conversationTurnProvider: this.conversationTurnProvider,
      selectedModelId: this.conversationTurnInput.selectedModelId,
      ...(this.conversationTurnInput.selectedReasoningEffort
        ? { selectedReasoningEffort: this.conversationTurnInput.selectedReasoningEffort }
        : {}),
      assistantProviderModelPromptProfile: this.assistantProviderModelPromptProfile,
      assistantOperatingMode: this.assistantOperatingMode,
      ...(this.availableToolNames ? { availableToolNames: this.availableToolNames } : {}),
      bashToolApprovalMode: this.bashToolApprovalMode,
      workspaceRootPath: this.workspaceRootPath,
      workspaceSnapshotStore: this.workspaceSnapshotStore,
      workspaceCodebaseKnowledgeIndex: this.workspaceCodebaseKnowledgeIndex,
      projectInstructionTracker: this.projectInstructionTracker,
      skillCatalog: this.skillCatalog,
      promptContextBrowseRootPath: this.promptContextBrowseRootPath,
      promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
      workspaceShellCommandExecutor: this.workspaceShellCommandExecutor,
      conversationHistory: this.conversationHistory,
      abortSignal: this.conversationTurnLifecycle.abortSignal,
      readOnlyToolCallConcurrencyLimiter: this.readOnlyToolCallConcurrencyLimiter,
      subagentConversationConcurrencyLimiter: this.subagentConversationConcurrencyLimiter,
      ...(this.taskSubagentSoftElapsedTimeCheckpointMilliseconds !== undefined
        ? { taskSubagentSoftElapsedTimeCheckpointMilliseconds: this.taskSubagentSoftElapsedTimeCheckpointMilliseconds }
        : {}),
      canSpawnSubagent: this.canSpawnSubagent,
      recordWorkflowHandoff: (workflowHandoff) => {
        this.recordedWorkflowHandoff = workflowHandoff;
      },
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

function validateTaskSubagentSoftElapsedTimeCheckpointMilliseconds(
  taskSubagentSoftElapsedTimeCheckpointMilliseconds: number | undefined,
): number | undefined {
  if (taskSubagentSoftElapsedTimeCheckpointMilliseconds === undefined) {
    return undefined;
  }

  if (
    !Number.isInteger(taskSubagentSoftElapsedTimeCheckpointMilliseconds) ||
    taskSubagentSoftElapsedTimeCheckpointMilliseconds < 1
  ) {
    throw new Error("Task subagent soft elapsed-time checkpoint must be a positive integer number of milliseconds.");
  }

  return taskSubagentSoftElapsedTimeCheckpointMilliseconds;
}
