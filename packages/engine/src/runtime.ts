import { randomUUID } from "node:crypto";
import {
  DEFAULT_ASSISTANT_OPERATING_MODE,
  AssistantMessageFailedEventSchema,
  AssistantMessageInterruptedEventSchema,
  AssistantTurnStartedEventSchema,
  type AssistantOperatingMode,
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
  type ConversationSessionEntry,
  type ProviderAvailableToolName,
  type ProviderStreamEvent,
  type ToolCallRequest,
} from "@buli/contracts";
import { InMemoryConversationHistory } from "./conversationHistory.ts";
import { buildBuliSystemPrompt } from "./systemPrompt.ts";
import type {
  ActiveConversationTurn,
  AssistantConversationRunner,
  ConversationCompactionRequest,
  ConversationCompactionResult,
  ConversationTurnProvider,
  ConversationTurnRequest,
  ProviderConversationTurn,
} from "./provider.ts";
import { buildModelFacingPromptTextFromPromptContextReferences } from "./prompt-context/buildModelFacingPromptTextFromPromptContextReferences.ts";
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
  streamAssistantResponseEventsForRequestedToolCall,
  type RuntimePendingToolApproval,
  type RuntimePendingToolApprovalInput,
  type RuntimeToolApprovalDecision,
} from "./runtimeToolCallExecution.ts";
import { RuntimeConversationTurnSessionRecorder } from "./runtimeConversationTurnSessionRecorder.ts";
import { RuntimeProviderStreamEventTranslator } from "./runtimeProviderStreamEventTranslator.ts";
import { ProjectInstructionTracker, toProjectInstructionSnapshots } from "./projectInstructions.ts";
import { resolveAvailableToolNamesForAssistantOperatingMode } from "./assistantOperatingModePolicy.ts";

type PendingToolApprovalState = {
  approvalId: string;
  toolCallId: string;
  toolCallRequest: ToolCallRequest;
  resolveDecision: (decision: RuntimeToolApprovalDecision) => void;
};

const USER_INTERRUPTED_CONVERSATION_TURN_REASON = "Interrupted by user.";
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
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_compaction.failed", {
        errorText,
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
  readonly abortController: AbortController;
  currentPendingToolApprovalState: PendingToolApprovalState | undefined;
  hasStartedStreamingAssistantResponseEvents = false;
  hasFinishedConversationTurn = false;
  hasInterruptedConversationTurn = false;

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
    this.abortController = new AbortController();
  }

  hasFinishedTurn(): boolean {
    return this.hasFinishedConversationTurn;
  }

  async approvePendingToolCall(approvalId: string): Promise<void> {
    if (!this.currentPendingToolApprovalState || this.currentPendingToolApprovalState.approvalId !== approvalId) {
      throw new Error(`No pending tool approval matches approvalId=${approvalId}`);
    }

    logEngineDiagnosticEvent(this.diagnosticLogger, "tool_approval.decision_received", {
      approvalId,
      toolCallId: this.currentPendingToolApprovalState.toolCallId,
      decision: "approved",
    });
    this.currentPendingToolApprovalState.resolveDecision("approved");
    this.currentPendingToolApprovalState = undefined;
  }

  async denyPendingToolCall(approvalId: string): Promise<void> {
    if (!this.currentPendingToolApprovalState || this.currentPendingToolApprovalState.approvalId !== approvalId) {
      throw new Error(`No pending tool approval matches approvalId=${approvalId}`);
    }

    logEngineDiagnosticEvent(this.diagnosticLogger, "tool_approval.decision_received", {
      approvalId,
      toolCallId: this.currentPendingToolApprovalState.toolCallId,
      decision: "denied",
    });
    this.currentPendingToolApprovalState.resolveDecision("denied");
    this.currentPendingToolApprovalState = undefined;
  }

  interrupt(): void {
    if (this.hasFinishedConversationTurn || this.hasInterruptedConversationTurn) {
      return;
    }

    this.hasInterruptedConversationTurn = true;
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.interrupt_requested", {
      selectedModelId: this.conversationTurnInput.selectedModelId,
      hasPendingToolApproval: this.currentPendingToolApprovalState !== undefined,
    });
    this.currentPendingToolApprovalState?.resolveDecision("interrupted");
    this.currentPendingToolApprovalState = undefined;
    this.abortController.abort();
  }

  async *streamAssistantResponseEvents(): AsyncGenerator<AssistantResponseEvent> {
    if (this.hasStartedStreamingAssistantResponseEvents) {
      throw new Error("Conversation turn events can only be streamed once");
    }
    this.hasStartedStreamingAssistantResponseEvents = true;

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
    let providerConversationTurn: ProviderConversationTurn | undefined;
    let modelFacingPromptTextForAcceptedTurn: string | undefined;
    let projectInstructionSnapshotsForAcceptedTurn = [] as ReturnType<typeof toProjectInstructionSnapshots>;
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

      this.throwIfConversationTurnInterrupted();
      modelFacingPromptTextForAcceptedTurn = await buildModelFacingPromptTextFromPromptContextReferences({
        promptText: this.conversationTurnInput.userPromptText,
        promptContextBrowseRootPath: this.promptContextBrowseRootPath,
        promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
        abortSignal: this.abortController.signal,
      });
      this.throwIfConversationTurnInterrupted();
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.prompt_context_expanded", {
        userPromptLength: this.conversationTurnInput.userPromptText.length,
        modelFacingPromptLength: modelFacingPromptTextForAcceptedTurn.length,
        promptContextBrowseRootPath: this.promptContextBrowseRootPath,
        promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
      });
      projectInstructionSnapshotsForAcceptedTurn = toProjectInstructionSnapshots(
        await this.projectInstructionTracker.loadProjectInstructionsForDirectory({
          targetDirectoryPath: this.workspaceRootPath,
          abortSignal: this.abortController.signal,
        }),
      );
      this.throwIfConversationTurnInterrupted();
      conversationTurnSessionRecorder.appendAcceptedUserPromptSessionEntry(
        modelFacingPromptTextForAcceptedTurn,
        projectInstructionSnapshotsForAcceptedTurn,
      );

      logEngineDiagnosticEvent(this.diagnosticLogger, "provider_turn.start_requested", {
        selectedModelId: this.conversationTurnInput.selectedModelId,
        selectedReasoningEffort: this.conversationTurnInput.selectedReasoningEffort ?? null,
        conversationSessionEntryCount: this.conversationHistory.listConversationSessionEntries().length,
        modelContextItemCount: this.conversationHistory.listModelContextItems().length,
        assistantOperatingMode: this.assistantOperatingMode,
      });
      providerConversationTurn = this.conversationTurnProvider.startConversationTurn({
        systemPromptText: buildBuliSystemPrompt({
          workspaceRootPath: this.workspaceRootPath,
          assistantOperatingMode: this.assistantOperatingMode,
          projectInstructionSnapshots: projectInstructionSnapshotsForAcceptedTurn,
        }),
        conversationSessionEntries: this.conversationHistory.listConversationSessionEntries(),
        selectedModelId: this.conversationTurnInput.selectedModelId,
        ...(this.conversationTurnInput.selectedReasoningEffort
          ? { selectedReasoningEffort: this.conversationTurnInput.selectedReasoningEffort }
          : {}),
        ...(this.promptCacheKey ? { promptCacheKey: this.promptCacheKey } : {}),
        ...resolveAvailableToolNamesForAssistantOperatingMode({
          assistantOperatingMode: this.assistantOperatingMode,
          requestedAvailableToolNames: this.availableToolNames,
        }),
        abortSignal: this.abortController.signal,
      });
      logEngineDiagnosticEvent(this.diagnosticLogger, "provider_turn.started", {
        selectedModelId: this.conversationTurnInput.selectedModelId,
      });

      for await (const providerStreamEvent of providerConversationTurn.streamProviderEvents()) {
        this.throwIfConversationTurnInterrupted();
        logEngineDiagnosticEvent(this.diagnosticLogger, "provider_stream.event_received", {
          eventType: providerStreamEvent.type,
          ...summarizeProviderStreamEventForDiagnostics(providerStreamEvent),
        });

        const providerStreamEventTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
          providerStreamEvent,
          providerTurnReplay: providerStreamEvent.type === "completed" || providerStreamEvent.type === "incomplete"
            ? providerConversationTurn.getProviderTurnReplay()
            : undefined,
        });

        if (providerStreamEventTranslation.translationKind === "assistant_response_events") {
          for (const assistantResponseEvent of providerStreamEventTranslation.assistantResponseEvents) {
            yield logAssistantResponseEventEmitted(assistantResponseEvent);
          }
          continue;
        }

        if (providerStreamEventTranslation.translationKind === "tool_call_requested") {
          yield* streamAssistantResponseEventsForRequestedToolCall({
            assistantResponseMessageId,
            providerConversationTurn,
            conversationTurnProvider: this.conversationTurnProvider,
            toolCallId: providerStreamEventTranslation.providerToolCallRequestedEvent.toolCallId,
            toolCallRequest: providerStreamEventTranslation.providerToolCallRequestedEvent.toolCallRequest,
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
            abortSignal: this.abortController.signal,
            canSpawnExplorer: this.canSpawnExplorer,
            createPendingToolApproval: (pendingToolApprovalInput) =>
              this.createPendingToolApproval(pendingToolApprovalInput),
            throwIfConversationTurnInterrupted: () => {
              this.throwIfConversationTurnInterrupted();
            },
            diagnosticLogger: this.diagnosticLogger,
          });
          continue;
        }

        for (const assistantResponseEvent of providerStreamEventTranslation.assistantResponseEventsBeforeTerminalSessionEntry) {
          yield logAssistantResponseEventEmitted(assistantResponseEvent);
        }
        conversationTurnSessionRecorder.appendTerminalAssistantMessageSessionEntry(
          providerStreamEventTranslation.terminalAssistantMessageSessionEntry,
        );
        yield logAssistantResponseEventEmitted(providerStreamEventTranslation.terminalAssistantResponseEvent);
        return;
      }

      const failureExplanation = "Provider stream ended before completion";
      if (
        conversationTurnSessionRecorder.hasAppendedAcceptedUserPromptSessionEntry() &&
        !conversationTurnSessionRecorder.hasAppendedTerminalAssistantMessageSessionEntry()
      ) {
        conversationTurnSessionRecorder.appendTerminalAssistantMessageSessionEntry({
          entryKind: "assistant_message",
          assistantMessageStatus: "failed",
          assistantMessageText: providerStreamEventTranslator.assistantMessageText,
          failureExplanation,
        });
      }
      yield logAssistantResponseEventEmitted(AssistantMessageFailedEventSchema.parse({
        type: "assistant_message_failed",
        messageId: assistantResponseMessageId,
        errorText: failureExplanation,
      }));
    } catch (error) {
      if (this.hasInterruptedConversationTurn || this.abortController.signal.aborted) {
        logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.interrupted", {
          selectedModelId: this.conversationTurnInput.selectedModelId,
          assistantMessageTextLength: providerStreamEventTranslator.assistantMessageText.length,
        });
        if (!conversationTurnSessionRecorder.hasAppendedAcceptedUserPromptSessionEntry()) {
          conversationTurnSessionRecorder.appendAcceptedUserPromptSessionEntry(
            modelFacingPromptTextForAcceptedTurn ?? this.conversationTurnInput.userPromptText,
            projectInstructionSnapshotsForAcceptedTurn,
          );
        }
        if (!conversationTurnSessionRecorder.hasAppendedTerminalAssistantMessageSessionEntry()) {
          conversationTurnSessionRecorder.appendTerminalAssistantMessageSessionEntry({
            entryKind: "assistant_message",
            assistantMessageStatus: "interrupted",
            assistantMessageText: providerStreamEventTranslator.assistantMessageText,
            interruptionReason: USER_INTERRUPTED_CONVERSATION_TURN_REASON,
          });
        }
        yield logAssistantResponseEventEmitted(AssistantMessageInterruptedEventSchema.parse({
          type: "assistant_message_interrupted",
          messageId: assistantResponseMessageId,
          interruptionReason: USER_INTERRUPTED_CONVERSATION_TURN_REASON,
        }));
        return;
      }

      const errorText = error instanceof Error ? error.message : String(error);
      const failureExplanation = errorText.length > 0 ? errorText : "Unknown conversation turn failure";
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.failed", {
        errorText: failureExplanation,
      });
      if (
        conversationTurnSessionRecorder.hasAppendedAcceptedUserPromptSessionEntry() &&
        !conversationTurnSessionRecorder.hasAppendedTerminalAssistantMessageSessionEntry()
      ) {
        conversationTurnSessionRecorder.appendTerminalAssistantMessageSessionEntry({
          entryKind: "assistant_message",
          assistantMessageStatus: "failed",
          assistantMessageText: providerStreamEventTranslator.assistantMessageText,
          failureExplanation,
        });
      }
      yield logAssistantResponseEventEmitted(AssistantMessageFailedEventSchema.parse({
        type: "assistant_message_failed",
        messageId: assistantResponseMessageId,
        errorText: failureExplanation,
      }));
    } finally {
      this.hasFinishedConversationTurn = true;
      this.currentPendingToolApprovalState = undefined;
      this.onConversationTurnFinished();
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.finished", {
        selectedModelId: this.conversationTurnInput.selectedModelId,
        turnDurationMs: Date.now() - conversationTurnStartedAtMilliseconds,
      });
    }
  }

  private createPendingToolApproval(input: RuntimePendingToolApprovalInput): RuntimePendingToolApproval {
    const approvalId = randomUUID();
    logEngineDiagnosticEvent(this.diagnosticLogger, "tool_approval.request_created", {
      approvalId,
      toolCallId: input.toolCallId,
      toolName: input.toolCallRequest.toolName,
    });
    const approvalDecisionPromise = new Promise<RuntimeToolApprovalDecision>((resolveDecision) => {
      this.currentPendingToolApprovalState = {
        approvalId,
        toolCallId: input.toolCallId,
        toolCallRequest: input.toolCallRequest,
        resolveDecision,
      };
    });
    return { approvalId, approvalDecisionPromise };
  }

  private throwIfConversationTurnInterrupted(): void {
    if (this.hasInterruptedConversationTurn || this.abortController.signal.aborted) {
      throw new Error(USER_INTERRUPTED_CONVERSATION_TURN_REASON);
    }
  }
}
