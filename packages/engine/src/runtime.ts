import { randomUUID } from "node:crypto";
import {
  DEFAULT_ASSISTANT_OPERATING_MODE,
  AssistantMessageFailedEventSchema,
  AssistantMessageInterruptedEventSchema,
  AssistantTurnStartedEventSchema,
  type AssistantOperatingMode,
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
  type ToolCallRequest,
} from "@buli/contracts";
import { InMemoryConversationHistory } from "./conversationHistory.ts";
import { buildBuliSystemPrompt } from "./systemPrompt.ts";
import type {
  ActiveConversationTurn,
  AssistantConversationRunner,
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

type PendingToolApprovalState = {
  approvalId: string;
  toolCallId: string;
  toolCallRequest: ToolCallRequest;
  resolveDecision: (decision: RuntimeToolApprovalDecision) => void;
};

const USER_INTERRUPTED_CONVERSATION_TURN_REASON = "Interrupted by user.";

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
  currentPendingConversationTurn: RuntimeConversationTurn | undefined;

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
  }

  startConversationTurn(input: ConversationTurnRequest): ActiveConversationTurn {
    const assistantOperatingMode = input.assistantOperatingMode ?? DEFAULT_ASSISTANT_OPERATING_MODE;
    if (this.currentPendingConversationTurn && !this.currentPendingConversationTurn.hasFinishedTurn()) {
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.rejected", {
        reason: "turn_already_running",
        selectedModelId: input.selectedModelId,
        userPromptLength: input.userPromptText.length,
      });
      throw new Error("A conversation turn is already running");
    }

    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.accepted", {
      selectedModelId: input.selectedModelId,
      selectedReasoningEffort: input.selectedReasoningEffort ?? null,
      userPromptLength: input.userPromptText.length,
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
      onConversationTurnFinished: () => {
        if (this.currentPendingConversationTurn === runtimeConversationTurn) {
          this.currentPendingConversationTurn = undefined;
        }
      },
    });

    this.currentPendingConversationTurn = runtimeConversationTurn;
    return runtimeConversationTurn;
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
  readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  readonly bashToolApprovalMode: BashToolApprovalMode;
  readonly promptCacheKey: string | undefined;
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
      conversationTurnSessionRecorder.appendAcceptedUserPromptSessionEntry(modelFacingPromptTextForAcceptedTurn);

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
        }),
        conversationSessionEntries: this.conversationHistory.listConversationSessionEntries(),
        modelContextItems: this.conversationHistory.listModelContextItems(),
        selectedModelId: this.conversationTurnInput.selectedModelId,
        ...(this.conversationTurnInput.selectedReasoningEffort
          ? { selectedReasoningEffort: this.conversationTurnInput.selectedReasoningEffort }
          : {}),
        ...(this.promptCacheKey ? { promptCacheKey: this.promptCacheKey } : {}),
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
            toolCallId: providerStreamEventTranslation.providerToolCallRequestedEvent.toolCallId,
            toolCallRequest: providerStreamEventTranslation.providerToolCallRequestedEvent.toolCallRequest,
            assistantOperatingMode: this.assistantOperatingMode,
            bashToolApprovalMode: this.bashToolApprovalMode,
            workspaceRootPath: this.workspaceRootPath,
            workspaceShellCommandExecutor: this.workspaceShellCommandExecutor,
            conversationHistory: this.conversationHistory,
            abortSignal: this.abortController.signal,
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
