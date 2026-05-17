import { randomUUID } from "node:crypto";
import {
  DEFAULT_ASSISTANT_OPERATING_MODE,
  AssistantTurnStartedEventSchema,
  type AssistantOperatingMode,
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
  type ConversationSessionEntry,
  type ProviderAvailableToolName,
  type ProviderStreamEvent,
  type ProjectInstructionSnapshot,
  redactSensitiveText,
} from "@buli/contracts";
import { InMemoryConversationHistory } from "./conversationHistory.ts";
import type {
  ActiveConversationTurn,
  AssistantConversationRunner,
  ConversationCompactionRequest,
  ConversationCompactionResult,
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
  summarizeProviderStreamEventForDiagnostics,
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
import { startAcceptedRuntimeConversationTurn } from "./runtimeConversationTurnStart.ts";
import { streamAssistantResponseEventsFromProviderStream } from "./runtimeProviderStreamProcessor.ts";
import {
  finalizeFailedConversationTurn,
  finalizeInterruptedConversationTurn,
  finalizeProviderStreamEndedBeforeCompletion,
} from "./runtimeConversationTurnTerminalFinalizer.ts";

const CONVERSATION_COMPACTION_PROMPT_TEXT = [
  "Create a compact continuation summary for the next assistant turn.",
  "Preserve only information needed to continue the current session correctly.",
  "Include the user's goal, constraints and preferences, completed work, in-progress work, blockers, key decisions, next steps, and critical technical context.",
  "Preserve exact file paths, commands, errors, identifiers, and user-approved decisions when they matter.",
  "Do not answer the user, do not ask questions, and do not introduce new plans beyond summarizing the current continuation state.",
  "Return Markdown only.",
].join("\n");

export class AssistantConversationRuntime implements AssistantConversationRunner {
  readonly conversationTurnProvider: ConversationTurnProvider;
  readonly workspaceRootPath: string;
  readonly promptContextBrowseRootPath: string;
  readonly promptContextStartingDirectoryPath: string;
  readonly workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
  readonly conversationHistory: InMemoryConversationHistory;
  readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  readonly bashToolApprovalMode: BashToolApprovalMode;
  readonly promptCacheKey: string | undefined;
  readonly availableToolNames: readonly ProviderAvailableToolName[] | undefined;
  readonly canSpawnExplorer: boolean;
  readonly projectInstructionTracker: ProjectInstructionTracker;
  currentPendingConversationTurn: RuntimeConversationTurn | undefined;
  isCompactingConversationSession = false;

  constructor(input: {
    conversationTurnProvider: ConversationTurnProvider;
    workspaceRootPath: string;
    promptContextBrowseRootPath: string;
    promptContextStartingDirectoryPath?: string;
    workspaceShellCommandExecutor?: WorkspaceShellCommandExecutor;
    conversationHistory?: InMemoryConversationHistory;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
    bashToolApprovalMode?: BashToolApprovalMode;
    promptCacheKey?: string | undefined;
    availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
    canSpawnExplorer?: boolean;
    projectInstructionTracker?: ProjectInstructionTracker;
  }) {
    this.conversationTurnProvider = input.conversationTurnProvider;
    this.workspaceRootPath = input.workspaceRootPath;
    this.promptContextBrowseRootPath = input.promptContextBrowseRootPath;
    this.promptContextStartingDirectoryPath = input.promptContextStartingDirectoryPath ?? input.promptContextBrowseRootPath;
    this.workspaceShellCommandExecutor =
      input.workspaceShellCommandExecutor ?? new WorkspaceShellCommandExecutor({ workspaceRootPath: input.workspaceRootPath });
    this.conversationHistory = input.conversationHistory ?? new InMemoryConversationHistory();
    this.diagnosticLogger = input.diagnosticLogger;
    this.bashToolApprovalMode = input.bashToolApprovalMode ?? DEFAULT_BASH_TOOL_APPROVAL_MODE;
    this.promptCacheKey = input.promptCacheKey;
    this.availableToolNames = input.availableToolNames;
    this.canSpawnExplorer = input.canSpawnExplorer ?? true;
    this.projectInstructionTracker = input.projectInstructionTracker ?? new ProjectInstructionTracker({
      workspaceRootPath: input.workspaceRootPath,
    });
  }

  startConversationTurn(input: ConversationTurnRequest): ActiveConversationTurn {
    const assistantOperatingMode = input.assistantOperatingMode ?? DEFAULT_ASSISTANT_OPERATING_MODE;
    if (this.isCompactingConversationSession) {
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
      diagnosticLogger: this.diagnosticLogger,
      bashToolApprovalMode: this.bashToolApprovalMode,
      promptCacheKey: this.promptCacheKey,
      availableToolNames: this.availableToolNames,
      canSpawnExplorer: this.canSpawnExplorer,
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

  async compactConversationSession(input: ConversationCompactionRequest): Promise<ConversationCompactionResult> {
    const conversationSessionEntriesBeforeCompaction = this.conversationHistory.listConversationSessionEntries();
    if (conversationSessionEntriesBeforeCompaction.length === 0) {
      throw new Error("Nothing to compact yet.");
    }

    if (this.currentPendingConversationTurn && !this.currentPendingConversationTurn.hasFinishedTurn()) {
      throw new Error("Cannot compact while a conversation turn is running.");
    }

    if (this.isCompactingConversationSession) {
      throw new Error("Conversation compaction is already running.");
    }

    this.isCompactingConversationSession = true;
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_compaction.started", {
      selectedModelId: input.selectedModelId,
      selectedReasoningEffort: input.selectedReasoningEffort ?? null,
      conversationSessionEntryCount: conversationSessionEntriesBeforeCompaction.length,
      modelContextItemCount: this.conversationHistory.listModelContextItems().length,
    });

    try {
      const compactionPromptEntry = createConversationCompactionPromptSessionEntry();
      const providerConversationTurn = this.conversationTurnProvider.startConversationTurn({
        systemPromptText: buildConversationCompactionSystemPrompt({ workspaceRootPath: this.workspaceRootPath }),
        conversationSessionEntries: [...conversationSessionEntriesBeforeCompaction, compactionPromptEntry],
        selectedModelId: input.selectedModelId,
        ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
        ...(this.promptCacheKey ? { promptCacheKey: this.promptCacheKey } : {}),
        availableToolNames: [],
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
      const summaryText = await collectConversationCompactionSummaryText({
        providerConversationTurn,
        diagnosticLogger: this.diagnosticLogger,
      });
      const compactionResult: ConversationCompactionResult = {
        summaryText,
        compactedEntryCount: conversationSessionEntriesBeforeCompaction.length,
      };
      this.conversationHistory.appendConversationSessionEntry({
        entryKind: "conversation_compaction_summary",
        summaryText: compactionResult.summaryText,
        compactedEntryCount: compactionResult.compactedEntryCount,
      });
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_compaction.completed", {
        compactedEntryCount: compactionResult.compactedEntryCount,
        summaryTextLength: compactionResult.summaryText.length,
        conversationSessionEntryCount: this.conversationHistory.listConversationSessionEntries().length,
        modelContextItemCount: this.conversationHistory.listModelContextItems().length,
      });
      return compactionResult;
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      const sanitizedErrorText = sanitizeRuntimeFailureExplanation(errorText);
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_compaction.failed", {
        errorTextLength: sanitizedErrorText.length,
        rawErrorTextLength: errorText.length,
      });
      throw error;
    } finally {
      this.isCompactingConversationSession = false;
    }
  }
}

function buildConversationCompactionSystemPrompt(input: { workspaceRootPath: string }): string {
  return [
    "You are buli's conversation compaction worker.",
    `Current workspace root: ${input.workspaceRootPath}`,
    "Summarize the prior conversation for continuation by the same assistant.",
    "Use only the provided conversation context. Do not call tools.",
  ].join("\n");
}

function createConversationCompactionPromptSessionEntry(): ConversationSessionEntry {
  return {
    entryKind: "user_prompt",
    promptText: CONVERSATION_COMPACTION_PROMPT_TEXT,
    modelFacingPromptText: CONVERSATION_COMPACTION_PROMPT_TEXT,
  };
}

async function collectConversationCompactionSummaryText(input: {
  providerConversationTurn: ProviderConversationTurn;
  diagnosticLogger: BuliDiagnosticLogger | undefined;
}): Promise<string> {
  let summaryText = "";

  for await (const providerStreamEvent of input.providerConversationTurn.streamProviderEvents()) {
    logEngineDiagnosticEvent(input.diagnosticLogger, "conversation_compaction.provider_event_received", {
      eventType: providerStreamEvent.type,
      ...summarizeProviderStreamEventForDiagnostics(providerStreamEvent),
    });

    if (providerStreamEvent.type === "text_chunk") {
      summaryText += providerStreamEvent.text;
      continue;
    }

    if (providerStreamEvent.type === "completed") {
      const trimmedSummaryText = summaryText.trim();
      if (trimmedSummaryText.length === 0) {
        throw new Error("Conversation compaction produced an empty summary.");
      }

      return trimmedSummaryText;
    }

    throwIfProviderEventCannotAppearDuringCompaction(providerStreamEvent);
  }

  throw new Error("Conversation compaction provider stream ended before completion.");
}

function throwIfProviderEventCannotAppearDuringCompaction(providerStreamEvent: ProviderStreamEvent): void {
  if (
    providerStreamEvent.type === "reasoning_summary_started" ||
    providerStreamEvent.type === "reasoning_summary_text_chunk" ||
    providerStreamEvent.type === "reasoning_summary_completed" ||
    providerStreamEvent.type === "rate_limit_pending"
  ) {
    return;
  }

  if (providerStreamEvent.type === "incomplete") {
    throw new Error(`Conversation compaction ended incomplete: ${providerStreamEvent.incompleteReason}`);
  }

  if (providerStreamEvent.type === "tool_call_requested") {
    throw new Error(`Conversation compaction unexpectedly requested tool ${providerStreamEvent.toolCallRequest.toolName}.`);
  }

  if (providerStreamEvent.type === "tool_calls_requested") {
    throw new Error(`Conversation compaction unexpectedly requested ${providerStreamEvent.requestedToolCalls.length} tools.`);
  }

  throw new Error("Conversation compaction unexpectedly produced a plan proposal.");
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
  readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  readonly bashToolApprovalMode: BashToolApprovalMode;
  readonly promptCacheKey: string | undefined;
  readonly availableToolNames: readonly ProviderAvailableToolName[] | undefined;
  readonly canSpawnExplorer: boolean;
  readonly projectInstructionTracker: ProjectInstructionTracker;
  readonly onConversationTurnFinished: () => void;
  readonly pendingToolApprovalController: RuntimePendingToolApprovalController;
  readonly conversationTurnLifecycle: RuntimeConversationTurnLifecycle;

  constructor(input: {
    conversationTurnInput: ConversationTurnRequest;
    assistantOperatingMode: AssistantOperatingMode;
    conversationTurnProvider: ConversationTurnProvider;
    conversationHistory: InMemoryConversationHistory;
    workspaceRootPath: string;
    promptContextBrowseRootPath: string;
    promptContextStartingDirectoryPath: string;
    workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
    bashToolApprovalMode: BashToolApprovalMode;
    promptCacheKey?: string | undefined;
    availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
    canSpawnExplorer: boolean;
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
    this.diagnosticLogger = input.diagnosticLogger;
    this.bashToolApprovalMode = input.bashToolApprovalMode;
    this.promptCacheKey = input.promptCacheKey;
    this.availableToolNames = input.availableToolNames;
    this.canSpawnExplorer = input.canSpawnExplorer;
    this.projectInstructionTracker = input.projectInstructionTracker;
    this.onConversationTurnFinished = input.onConversationTurnFinished;
    this.pendingToolApprovalController = new RuntimePendingToolApprovalController({
      diagnosticLogger: this.diagnosticLogger,
    });
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
      projectInstructionTracker: this.projectInstructionTracker,
      promptContextBrowseRootPath: this.promptContextBrowseRootPath,
      promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
      workspaceShellCommandExecutor: this.workspaceShellCommandExecutor,
      conversationHistory: this.conversationHistory,
      abortSignal: this.conversationTurnLifecycle.abortSignal,
      canSpawnExplorer: this.canSpawnExplorer,
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
