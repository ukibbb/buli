import { randomUUID } from "node:crypto";
import {
  DEFAULT_ASSISTANT_OPERATING_MODE,
  AssistantMessageCompletedEventSchema,
  AssistantMessageFailedEventSchema,
  AssistantMessageIncompleteEventSchema,
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantPendingToolApprovalClearedEventSchema,
  AssistantPendingToolApprovalRequestedEventSchema,
  AssistantPlanProposalConversationMessagePartSchema,
  AssistantRateLimitNoticeConversationMessagePartSchema,
  AssistantReasoningConversationMessagePartSchema,
  AssistantToolCallConversationMessagePartSchema,
  AssistantTurnStartedEventSchema,
  AssistantTurnSummaryConversationMessagePartSchema,
  type AssistantMessageConversationSessionEntry,
  type AssistantOperatingMode,
  type AssistantResponseEvent,
  type BashToolCallRequest,
  type BuliDiagnosticLogFields,
  type BuliDiagnosticLogger,
  type ProviderStreamEvent,
  type TokenUsage,
  type ToolCallRequest,
} from "@buli/contracts";
import {
  appendAssistantTextDeltaToAssistantTextMessagePartBuilder,
  buildCompletedAssistantTextConversationMessagePart,
  buildStreamingAssistantTextConversationMessagePart,
  createInitialAssistantTextMessagePartBuilder,
} from "./assistantTextMessagePartBuilder.ts";
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
  classifyBashToolApprovalRequirement,
  DEFAULT_BASH_TOOL_APPROVAL_MODE,
  type BashToolApprovalMode,
} from "./tools/bashToolApprovalPolicy.ts";
import { runApprovedBashToolCall, createStartedBashToolCallDetail } from "./tools/bashTool.ts";
import { WorkspaceShellCommandExecutor } from "./tools/workspaceShellCommandExecutor.ts";

type PendingToolApprovalState = {
  approvalId: string;
  toolCallId: string;
  toolCallRequest: ToolCallRequest;
  resolveDecision: (decision: "approved" | "denied") => void;
};

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
  currentPendingToolApprovalState: PendingToolApprovalState | undefined;
  hasStartedStreamingAssistantResponseEvents = false;
  hasFinishedConversationTurn = false;

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

  async *streamAssistantResponseEvents(): AsyncGenerator<AssistantResponseEvent> {
    if (this.hasStartedStreamingAssistantResponseEvents) {
      throw new Error("Conversation turn events can only be streamed once");
    }
    this.hasStartedStreamingAssistantResponseEvents = true;

    const conversationTurnStartedAtMilliseconds = Date.now();
    const assistantResponseMessageId = randomUUID();
    const assistantTextPartId = randomUUID();
    let assistantTextMessagePartBuilderState = createInitialAssistantTextMessagePartBuilder(assistantTextPartId);
    let hasEmittedAssistantTextMessagePart = false;
    let currentReasoningPartId: string | undefined;
    let currentReasoningSummaryText = "";
    let currentReasoningStartedAtMs: number | undefined;
    let providerConversationTurn: ProviderConversationTurn | undefined;
    let hasAppendedUserPromptSessionEntry = false;
    let hasAppendedTerminalAssistantSessionEntry = false;
    const logAssistantResponseEventEmitted = (assistantResponseEvent: AssistantResponseEvent): AssistantResponseEvent => {
      logEngineDiagnosticEvent(this.diagnosticLogger, "assistant_response_event.emitted", {
        eventType: assistantResponseEvent.type,
        ...summarizeAssistantResponseEventForDiagnostics(assistantResponseEvent),
      });
      return assistantResponseEvent;
    };
    const appendTerminalAssistantMessageSessionEntry = (
      assistantMessageConversationSessionEntry: AssistantMessageConversationSessionEntry,
    ): void => {
      if (hasAppendedTerminalAssistantSessionEntry) {
        return;
      }

      this.conversationHistory.appendConversationSessionEntry(assistantMessageConversationSessionEntry);
      hasAppendedTerminalAssistantSessionEntry = true;
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
        entryKind: "assistant_message",
        assistantMessageStatus: assistantMessageConversationSessionEntry.assistantMessageStatus,
        assistantMessageTextLength: assistantMessageConversationSessionEntry.assistantMessageText.length,
        providerTurnReplayInputItemCount:
          assistantMessageConversationSessionEntry.providerTurnReplay?.provider === "openai"
            ? assistantMessageConversationSessionEntry.providerTurnReplay.inputItems.length
            : 0,
        conversationSessionEntryCount: this.conversationHistory.listConversationSessionEntries().length,
        modelContextItemCount: this.conversationHistory.listModelContextItems().length,
      });
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

      const modelFacingPromptText = await buildModelFacingPromptTextFromPromptContextReferences({
        promptText: this.conversationTurnInput.userPromptText,
        promptContextBrowseRootPath: this.promptContextBrowseRootPath,
        promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
      });
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.prompt_context_expanded", {
        userPromptLength: this.conversationTurnInput.userPromptText.length,
        modelFacingPromptLength: modelFacingPromptText.length,
        promptContextBrowseRootPath: this.promptContextBrowseRootPath,
        promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
      });
      this.conversationHistory.appendConversationSessionEntry({
        entryKind: "user_prompt",
        promptText: this.conversationTurnInput.userPromptText,
        modelFacingPromptText,
      });
      hasAppendedUserPromptSessionEntry = true;
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
        entryKind: "user_prompt",
        conversationSessionEntryCount: this.conversationHistory.listConversationSessionEntries().length,
        modelContextItemCount: this.conversationHistory.listModelContextItems().length,
      });

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
      });
      logEngineDiagnosticEvent(this.diagnosticLogger, "provider_turn.started", {
        selectedModelId: this.conversationTurnInput.selectedModelId,
      });

      for await (const providerStreamEvent of providerConversationTurn.streamProviderEvents()) {
        logEngineDiagnosticEvent(this.diagnosticLogger, "provider_stream.event_received", {
          eventType: providerStreamEvent.type,
          ...summarizeProviderStreamEventForDiagnostics(providerStreamEvent),
        });

        if (providerStreamEvent.type === "reasoning_summary_started") {
          currentReasoningPartId = randomUUID();
          currentReasoningSummaryText = "";
          currentReasoningStartedAtMs = Date.now();
          yield logAssistantResponseEventEmitted(AssistantMessagePartAddedEventSchema.parse({
            type: "assistant_message_part_added",
            messageId: assistantResponseMessageId,
            part: AssistantReasoningConversationMessagePartSchema.parse({
              id: currentReasoningPartId,
              partKind: "assistant_reasoning",
              partStatus: "streaming",
              reasoningSummaryText: "",
              reasoningStartedAtMs: currentReasoningStartedAtMs,
            }),
          }));
          continue;
        }

        if (providerStreamEvent.type === "reasoning_summary_text_chunk") {
          if (!currentReasoningPartId || currentReasoningStartedAtMs === undefined) {
            continue;
          }

          currentReasoningSummaryText += providerStreamEvent.text;
          yield logAssistantResponseEventEmitted(AssistantMessagePartUpdatedEventSchema.parse({
            type: "assistant_message_part_updated",
            messageId: assistantResponseMessageId,
            part: AssistantReasoningConversationMessagePartSchema.parse({
              id: currentReasoningPartId,
              partKind: "assistant_reasoning",
              partStatus: "streaming",
              reasoningSummaryText: currentReasoningSummaryText,
              reasoningStartedAtMs: currentReasoningStartedAtMs,
            }),
          }));
          continue;
        }

        if (providerStreamEvent.type === "reasoning_summary_completed") {
          if (!currentReasoningPartId || currentReasoningStartedAtMs === undefined) {
            continue;
          }

          yield logAssistantResponseEventEmitted(AssistantMessagePartUpdatedEventSchema.parse({
            type: "assistant_message_part_updated",
            messageId: assistantResponseMessageId,
            part: AssistantReasoningConversationMessagePartSchema.parse({
              id: currentReasoningPartId,
              partKind: "assistant_reasoning",
              partStatus: "completed",
              reasoningSummaryText: currentReasoningSummaryText,
              reasoningStartedAtMs: currentReasoningStartedAtMs,
              reasoningDurationMs: providerStreamEvent.reasoningDurationMs,
            }),
          }));
          currentReasoningPartId = undefined;
          currentReasoningStartedAtMs = undefined;
          continue;
        }

        if (providerStreamEvent.type === "text_chunk") {
          assistantTextMessagePartBuilderState = appendAssistantTextDeltaToAssistantTextMessagePartBuilder(
            assistantTextMessagePartBuilderState,
            providerStreamEvent.text,
          );

          const assistantTextConversationMessagePart = buildStreamingAssistantTextConversationMessagePart(
            assistantTextMessagePartBuilderState,
          );
          yield logAssistantResponseEventEmitted((hasEmittedAssistantTextMessagePart
            ? AssistantMessagePartUpdatedEventSchema
            : AssistantMessagePartAddedEventSchema
          ).parse({
            type: hasEmittedAssistantTextMessagePart ? "assistant_message_part_updated" : "assistant_message_part_added",
            messageId: assistantResponseMessageId,
            part: assistantTextConversationMessagePart,
          }));
          hasEmittedAssistantTextMessagePart = true;
          continue;
        }

        if (providerStreamEvent.type === "tool_call_requested") {
          yield* this.handleRequestedToolCall({
            assistantResponseMessageId,
            providerConversationTurn,
            toolCallId: providerStreamEvent.toolCallId,
            toolCallRequest: providerStreamEvent.toolCallRequest,
          });
          continue;
        }

        if (providerStreamEvent.type === "rate_limit_pending") {
          yield logAssistantResponseEventEmitted(AssistantMessagePartAddedEventSchema.parse({
            type: "assistant_message_part_added",
            messageId: assistantResponseMessageId,
            part: AssistantRateLimitNoticeConversationMessagePartSchema.parse({
              id: randomUUID(),
              partKind: "assistant_rate_limit_notice",
              retryAfterSeconds: providerStreamEvent.retryAfterSeconds,
              limitExplanation: providerStreamEvent.limitExplanation,
              noticeStartedAtMs: Date.now(),
            }),
          }));
          continue;
        }

        if (providerStreamEvent.type === "plan_proposed") {
          yield logAssistantResponseEventEmitted(AssistantMessagePartAddedEventSchema.parse({
            type: "assistant_message_part_added",
            messageId: assistantResponseMessageId,
            part: AssistantPlanProposalConversationMessagePartSchema.parse({
              id: randomUUID(),
              partKind: "assistant_plan_proposal",
              planId: providerStreamEvent.planId,
              planTitle: providerStreamEvent.planTitle,
              planSteps: providerStreamEvent.planSteps,
            }),
          }));
          continue;
        }

        if (providerStreamEvent.type === "incomplete") {
          yield logAssistantResponseEventEmitted(AssistantMessagePartAddedEventSchema.parse({
            type: "assistant_message_part_added",
            messageId: assistantResponseMessageId,
            part: AssistantTurnSummaryConversationMessagePartSchema.parse({
              id: randomUUID(),
              partKind: "assistant_turn_summary",
              turnDurationMs: Date.now() - conversationTurnStartedAtMilliseconds,
              modelDisplayName: this.conversationTurnInput.selectedModelId,
            }),
          }));
          const providerTurnReplay = providerConversationTurn.getProviderTurnReplay();
          appendTerminalAssistantMessageSessionEntry({
            entryKind: "assistant_message",
            assistantMessageStatus: "incomplete",
            assistantMessageText: assistantTextMessagePartBuilderState.rawMarkdownText,
            incompleteReason: providerStreamEvent.incompleteReason,
            ...(providerTurnReplay ? { providerTurnReplay } : {}),
          });
          yield logAssistantResponseEventEmitted(AssistantMessageIncompleteEventSchema.parse({
            type: "assistant_message_incomplete",
            messageId: assistantResponseMessageId,
            incompleteReason: providerStreamEvent.incompleteReason,
            usage: providerStreamEvent.usage,
          }));
          return;
        }

        yield logAssistantResponseEventEmitted(AssistantMessagePartAddedEventSchema.parse({
          type: "assistant_message_part_added",
          messageId: assistantResponseMessageId,
          part: AssistantTurnSummaryConversationMessagePartSchema.parse({
            id: randomUUID(),
            partKind: "assistant_turn_summary",
            turnDurationMs: Date.now() - conversationTurnStartedAtMilliseconds,
            modelDisplayName: this.conversationTurnInput.selectedModelId,
          }),
        }));
        if (hasEmittedAssistantTextMessagePart) {
          yield logAssistantResponseEventEmitted(AssistantMessagePartUpdatedEventSchema.parse({
            type: "assistant_message_part_updated",
            messageId: assistantResponseMessageId,
            part: buildCompletedAssistantTextConversationMessagePart(assistantTextMessagePartBuilderState),
          }));
        }
        const providerTurnReplay = providerConversationTurn.getProviderTurnReplay();
        appendTerminalAssistantMessageSessionEntry({
          entryKind: "assistant_message",
          assistantMessageStatus: "completed",
          assistantMessageText: assistantTextMessagePartBuilderState.rawMarkdownText,
          ...(providerTurnReplay ? { providerTurnReplay } : {}),
        });
        yield logAssistantResponseEventEmitted(AssistantMessageCompletedEventSchema.parse({
          type: "assistant_message_completed",
          messageId: assistantResponseMessageId,
          usage: providerStreamEvent.usage,
        }));
        return;
      }

      const failureExplanation = "Provider stream ended before completion";
      if (hasAppendedUserPromptSessionEntry && !hasAppendedTerminalAssistantSessionEntry) {
        appendTerminalAssistantMessageSessionEntry({
          entryKind: "assistant_message",
          assistantMessageStatus: "failed",
          assistantMessageText: assistantTextMessagePartBuilderState.rawMarkdownText,
          failureExplanation,
        });
      }
      yield logAssistantResponseEventEmitted(AssistantMessageFailedEventSchema.parse({
        type: "assistant_message_failed",
        messageId: assistantResponseMessageId,
        errorText: failureExplanation,
      }));
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      const failureExplanation = errorText.length > 0 ? errorText : "Unknown conversation turn failure";
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.failed", {
        errorText: failureExplanation,
      });
      if (hasAppendedUserPromptSessionEntry && !hasAppendedTerminalAssistantSessionEntry) {
        appendTerminalAssistantMessageSessionEntry({
          entryKind: "assistant_message",
          assistantMessageStatus: "failed",
          assistantMessageText: assistantTextMessagePartBuilderState.rawMarkdownText,
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

  private async *handleRequestedToolCall(input: {
    assistantResponseMessageId: string;
    providerConversationTurn: ProviderConversationTurn;
    toolCallId: string;
    toolCallRequest: ToolCallRequest;
  }): AsyncGenerator<AssistantResponseEvent> {
    const logAssistantResponseEventEmitted = (assistantResponseEvent: AssistantResponseEvent): AssistantResponseEvent => {
      logEngineDiagnosticEvent(this.diagnosticLogger, "assistant_response_event.emitted", {
        eventType: assistantResponseEvent.type,
        ...summarizeAssistantResponseEventForDiagnostics(assistantResponseEvent),
      });
      return assistantResponseEvent;
    };

    logEngineDiagnosticEvent(this.diagnosticLogger, "tool_call.requested", {
      toolCallId: input.toolCallId,
      toolName: input.toolCallRequest.toolName,
      ...(input.toolCallRequest.toolName === "bash"
        ? {
            shellCommandLength: input.toolCallRequest.shellCommand.length,
            commandDescriptionLength: input.toolCallRequest.commandDescription.length,
            hasRequestedWorkingDirectoryPath: input.toolCallRequest.workingDirectoryPath !== undefined,
            hasRequestedTimeoutMilliseconds: input.toolCallRequest.timeoutMilliseconds !== undefined,
          }
        : {}),
    });
    this.conversationHistory.appendConversationSessionEntry({
      entryKind: "tool_call",
      toolCallId: input.toolCallId,
      toolCallRequest: input.toolCallRequest,
    });
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
      entryKind: "tool_call",
      toolCallId: input.toolCallId,
      toolName: input.toolCallRequest.toolName,
      conversationSessionEntryCount: this.conversationHistory.listConversationSessionEntries().length,
      modelContextItemCount: this.conversationHistory.listModelContextItems().length,
    });

    if (input.toolCallRequest.toolName !== "bash") {
      throw new Error(`Unsupported tool requested: ${input.toolCallRequest.toolName}`);
    }

    const bashToolCallRequest: BashToolCallRequest = input.toolCallRequest;
    const startedToolCallDetail = createStartedBashToolCallDetail(bashToolCallRequest);
    const toolCallPartId = randomUUID();
    const toolCallStartedAtMs = Date.now();
    const planModeBashToolDecision = this.assistantOperatingMode === "plan"
      ? classifyBashToolApprovalRequirement(bashToolCallRequest, "risk_based")
      : undefined;

    if (planModeBashToolDecision?.approvalPolicy === "requires_user_approval") {
      const denialText = [
        "Plan mode is read-only, so this bash command was not executed.",
        planModeBashToolDecision.riskExplanation,
      ].join(" ");
      this.conversationHistory.appendConversationSessionEntry({
        entryKind: "denied_tool_result",
        toolCallId: input.toolCallId,
        toolCallDetail: startedToolCallDetail,
        toolResultText: denialText,
        denialExplanation: denialText,
      });
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
        entryKind: "denied_tool_result",
        toolCallId: input.toolCallId,
        toolResultTextLength: denialText.length,
        conversationSessionEntryCount: this.conversationHistory.listConversationSessionEntries().length,
        modelContextItemCount: this.conversationHistory.listModelContextItems().length,
      });
      logEngineDiagnosticEvent(this.diagnosticLogger, "tool_call.plan_mode_blocked", {
        toolCallId: input.toolCallId,
        matchedRiskKind: planModeBashToolDecision.matchedRiskKind,
        riskExplanationLength: planModeBashToolDecision.riskExplanation.length,
      });
      yield logAssistantResponseEventEmitted(AssistantMessagePartAddedEventSchema.parse({
        type: "assistant_message_part_added",
        messageId: input.assistantResponseMessageId,
        part: AssistantToolCallConversationMessagePartSchema.parse({
          id: toolCallPartId,
          partKind: "assistant_tool_call",
          toolCallId: input.toolCallId,
          toolCallStatus: "denied",
          toolCallStartedAtMs,
          toolCallDetail: startedToolCallDetail,
          denialText,
        }),
      }));
      logEngineDiagnosticEvent(this.diagnosticLogger, "provider_turn.tool_result_submitted", {
        toolCallId: input.toolCallId,
        toolResultKind: "denied",
        toolResultTextLength: denialText.length,
      });
      await input.providerConversationTurn.submitToolResult({
        toolCallId: input.toolCallId,
        toolResultText: denialText,
      });
      return;
    }

    const bashToolApprovalDecision = classifyBashToolApprovalRequirement(bashToolCallRequest, this.bashToolApprovalMode);
    logEngineDiagnosticEvent(this.diagnosticLogger, "tool_call.approval_policy_classified", {
      toolCallId: input.toolCallId,
      bashToolApprovalMode: this.bashToolApprovalMode,
      approvalPolicy: bashToolApprovalDecision.approvalPolicy,
      ...(bashToolApprovalDecision.approvalPolicy === "requires_user_approval"
        ? {
            matchedRiskKind: bashToolApprovalDecision.matchedRiskKind,
            riskExplanationLength: bashToolApprovalDecision.riskExplanation.length,
          }
        : {}),
    });

    if (bashToolApprovalDecision.approvalPolicy === "requires_user_approval") {
      yield logAssistantResponseEventEmitted(AssistantMessagePartAddedEventSchema.parse({
        type: "assistant_message_part_added",
        messageId: input.assistantResponseMessageId,
        part: AssistantToolCallConversationMessagePartSchema.parse({
          id: toolCallPartId,
          partKind: "assistant_tool_call",
          toolCallId: input.toolCallId,
          toolCallStatus: "pending_approval",
          toolCallStartedAtMs,
          toolCallDetail: startedToolCallDetail,
        }),
      }));
      const { approvalId, approvalDecisionPromise } = this.createPendingToolApproval({
        toolCallId: input.toolCallId,
        toolCallRequest: bashToolCallRequest,
      });
      yield logAssistantResponseEventEmitted(AssistantPendingToolApprovalRequestedEventSchema.parse({
        type: "assistant_pending_tool_approval_requested",
        approvalRequest: {
          approvalId,
          pendingToolCallId: input.toolCallId,
          pendingToolCallDetail: startedToolCallDetail,
          riskExplanation: bashToolApprovalDecision.riskExplanation,
        },
      }));
      const approvalDecision = await approvalDecisionPromise;
      yield logAssistantResponseEventEmitted(AssistantPendingToolApprovalClearedEventSchema.parse({
        type: "assistant_pending_tool_approval_cleared",
        approvalId,
      }));

      if (approvalDecision === "denied") {
        const denialText = "The user denied this bash command, so it was not executed.";
        this.conversationHistory.appendConversationSessionEntry({
          entryKind: "denied_tool_result",
          toolCallId: input.toolCallId,
          toolCallDetail: startedToolCallDetail,
          toolResultText: denialText,
          denialExplanation: denialText,
        });
        logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
          entryKind: "denied_tool_result",
          toolCallId: input.toolCallId,
          toolResultTextLength: denialText.length,
          conversationSessionEntryCount: this.conversationHistory.listConversationSessionEntries().length,
          modelContextItemCount: this.conversationHistory.listModelContextItems().length,
        });
        yield logAssistantResponseEventEmitted(AssistantMessagePartUpdatedEventSchema.parse({
          type: "assistant_message_part_updated",
          messageId: input.assistantResponseMessageId,
          part: AssistantToolCallConversationMessagePartSchema.parse({
            id: toolCallPartId,
            partKind: "assistant_tool_call",
            toolCallId: input.toolCallId,
            toolCallStatus: "denied",
            toolCallStartedAtMs,
            toolCallDetail: startedToolCallDetail,
            denialText,
          }),
        }));
        logEngineDiagnosticEvent(this.diagnosticLogger, "provider_turn.tool_result_submitted", {
          toolCallId: input.toolCallId,
          toolResultKind: "denied",
          toolResultTextLength: denialText.length,
        });
        await input.providerConversationTurn.submitToolResult({
          toolCallId: input.toolCallId,
          toolResultText: denialText,
        });
        return;
      }

      yield logAssistantResponseEventEmitted(AssistantMessagePartUpdatedEventSchema.parse({
        type: "assistant_message_part_updated",
        messageId: input.assistantResponseMessageId,
        part: AssistantToolCallConversationMessagePartSchema.parse({
          id: toolCallPartId,
          partKind: "assistant_tool_call",
          toolCallId: input.toolCallId,
          toolCallStatus: "running",
          toolCallStartedAtMs,
          toolCallDetail: startedToolCallDetail,
        }),
      }));
    } else {
      yield logAssistantResponseEventEmitted(AssistantMessagePartAddedEventSchema.parse({
        type: "assistant_message_part_added",
        messageId: input.assistantResponseMessageId,
        part: AssistantToolCallConversationMessagePartSchema.parse({
          id: toolCallPartId,
          partKind: "assistant_tool_call",
          toolCallId: input.toolCallId,
          toolCallStatus: "running",
          toolCallStartedAtMs,
          toolCallDetail: startedToolCallDetail,
        }),
      }));
    }

    const bashToolCallOutcome = await runApprovedBashToolCall({
      bashToolCallRequest,
      workspaceRootPath: this.workspaceRootPath,
      workspaceShellCommandExecutor: this.workspaceShellCommandExecutor,
      diagnosticLogger: this.diagnosticLogger,
    });

    if (bashToolCallOutcome.outcomeKind === "completed") {
      this.conversationHistory.appendConversationSessionEntry({
        entryKind: "completed_tool_result",
        toolCallId: input.toolCallId,
        toolCallDetail: bashToolCallOutcome.toolCallDetail,
        toolResultText: bashToolCallOutcome.toolResultText,
      });
      logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
        entryKind: "completed_tool_result",
        toolCallId: input.toolCallId,
        toolResultTextLength: bashToolCallOutcome.toolResultText.length,
        conversationSessionEntryCount: this.conversationHistory.listConversationSessionEntries().length,
        modelContextItemCount: this.conversationHistory.listModelContextItems().length,
      });
      yield logAssistantResponseEventEmitted(AssistantMessagePartUpdatedEventSchema.parse({
        type: "assistant_message_part_updated",
        messageId: input.assistantResponseMessageId,
        part: AssistantToolCallConversationMessagePartSchema.parse({
          id: toolCallPartId,
          partKind: "assistant_tool_call",
          toolCallId: input.toolCallId,
          toolCallStatus: "completed",
          toolCallStartedAtMs,
          toolCallDetail: bashToolCallOutcome.toolCallDetail,
          durationMs: bashToolCallOutcome.durationMilliseconds,
        }),
      }));
      logEngineDiagnosticEvent(this.diagnosticLogger, "provider_turn.tool_result_submitted", {
        toolCallId: input.toolCallId,
        toolResultKind: "completed",
        toolResultTextLength: bashToolCallOutcome.toolResultText.length,
      });
      await input.providerConversationTurn.submitToolResult({
        toolCallId: input.toolCallId,
        toolResultText: bashToolCallOutcome.toolResultText,
      });
      return;
    }

    this.conversationHistory.appendConversationSessionEntry({
      entryKind: "failed_tool_result",
      toolCallId: input.toolCallId,
      toolCallDetail: bashToolCallOutcome.toolCallDetail,
      toolResultText: bashToolCallOutcome.toolResultText,
      failureExplanation: bashToolCallOutcome.failureExplanation,
    });
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
      entryKind: "failed_tool_result",
      toolCallId: input.toolCallId,
      toolResultTextLength: bashToolCallOutcome.toolResultText.length,
      failureExplanation: bashToolCallOutcome.failureExplanation,
      conversationSessionEntryCount: this.conversationHistory.listConversationSessionEntries().length,
      modelContextItemCount: this.conversationHistory.listModelContextItems().length,
    });
    yield logAssistantResponseEventEmitted(AssistantMessagePartUpdatedEventSchema.parse({
      type: "assistant_message_part_updated",
      messageId: input.assistantResponseMessageId,
      part: AssistantToolCallConversationMessagePartSchema.parse({
        id: toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: input.toolCallId,
        toolCallStatus: "failed",
        toolCallStartedAtMs,
        toolCallDetail: bashToolCallOutcome.toolCallDetail,
        errorText: bashToolCallOutcome.failureExplanation,
        durationMs: bashToolCallOutcome.durationMilliseconds,
      }),
    }));
    logEngineDiagnosticEvent(this.diagnosticLogger, "provider_turn.tool_result_submitted", {
      toolCallId: input.toolCallId,
      toolResultKind: "failed",
      toolResultTextLength: bashToolCallOutcome.toolResultText.length,
    });
    await input.providerConversationTurn.submitToolResult({
      toolCallId: input.toolCallId,
      toolResultText: bashToolCallOutcome.toolResultText,
    });
  }

  private createPendingToolApproval(input: {
    toolCallId: string;
    toolCallRequest: ToolCallRequest;
  }): { approvalId: string; approvalDecisionPromise: Promise<"approved" | "denied"> } {
    const approvalId = randomUUID();
    logEngineDiagnosticEvent(this.diagnosticLogger, "tool_approval.request_created", {
      approvalId,
      toolCallId: input.toolCallId,
      toolName: input.toolCallRequest.toolName,
    });
    const approvalDecisionPromise = new Promise<"approved" | "denied">((resolveDecision) => {
      this.currentPendingToolApprovalState = {
        approvalId,
        toolCallId: input.toolCallId,
        toolCallRequest: input.toolCallRequest,
        resolveDecision,
      };
    });
    return { approvalId, approvalDecisionPromise };
  }
}

function logEngineDiagnosticEvent(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  eventName: string,
  fields?: BuliDiagnosticLogFields,
): void {
  diagnosticLogger?.({
    subsystem: "engine",
    eventName,
    ...(fields ? { fields } : {}),
  });
}

function summarizeProviderStreamEventForDiagnostics(providerStreamEvent: ProviderStreamEvent): BuliDiagnosticLogFields {
  if (providerStreamEvent.type === "text_chunk") {
    return {
      textLength: providerStreamEvent.text.length,
    };
  }

  if (providerStreamEvent.type === "completed") {
    return summarizeTokenUsageForDiagnostics(providerStreamEvent.usage);
  }

  if (providerStreamEvent.type === "incomplete") {
    return {
      incompleteReason: providerStreamEvent.incompleteReason,
      ...summarizeTokenUsageForDiagnostics(providerStreamEvent.usage),
    };
  }

  if (providerStreamEvent.type === "reasoning_summary_text_chunk") {
    return {
      textLength: providerStreamEvent.text.length,
    };
  }

  if (providerStreamEvent.type === "reasoning_summary_completed") {
    return {
      reasoningDurationMs: providerStreamEvent.reasoningDurationMs,
    };
  }

  if (providerStreamEvent.type === "tool_call_requested") {
    return {
      toolCallId: providerStreamEvent.toolCallId,
      toolName: providerStreamEvent.toolCallRequest.toolName,
      ...(providerStreamEvent.toolCallRequest.toolName === "bash"
        ? {
            shellCommandLength: providerStreamEvent.toolCallRequest.shellCommand.length,
            commandDescriptionLength: providerStreamEvent.toolCallRequest.commandDescription.length,
          }
        : {}),
    };
  }

  if (providerStreamEvent.type === "rate_limit_pending") {
    return {
      retryAfterSeconds: providerStreamEvent.retryAfterSeconds,
      limitExplanationLength: providerStreamEvent.limitExplanation.length,
    };
  }

  if (providerStreamEvent.type === "plan_proposed") {
    return {
      planId: providerStreamEvent.planId,
      planTitleLength: providerStreamEvent.planTitle.length,
      planStepCount: providerStreamEvent.planSteps.length,
    };
  }

  return {};
}

function summarizeAssistantResponseEventForDiagnostics(
  assistantResponseEvent: AssistantResponseEvent,
): BuliDiagnosticLogFields {
  if (assistantResponseEvent.type === "assistant_turn_started") {
    return {
      messageId: assistantResponseEvent.messageId,
      startedAtMs: assistantResponseEvent.startedAtMs,
    };
  }

  if (
    assistantResponseEvent.type === "assistant_message_part_added" ||
    assistantResponseEvent.type === "assistant_message_part_updated"
  ) {
    return {
      messageId: assistantResponseEvent.messageId,
      partId: assistantResponseEvent.part.id,
      partKind: assistantResponseEvent.part.partKind,
      ...(assistantResponseEvent.part.partKind === "assistant_text"
        ? {
            partStatus: assistantResponseEvent.part.partStatus,
            rawMarkdownTextLength: assistantResponseEvent.part.rawMarkdownText.length,
          }
        : {}),
      ...(assistantResponseEvent.part.partKind === "assistant_reasoning"
        ? {
            partStatus: assistantResponseEvent.part.partStatus,
            reasoningSummaryTextLength: assistantResponseEvent.part.reasoningSummaryText.length,
          }
        : {}),
      ...(assistantResponseEvent.part.partKind === "assistant_tool_call"
        ? {
            toolCallId: assistantResponseEvent.part.toolCallId,
            toolCallStatus: assistantResponseEvent.part.toolCallStatus,
            toolName: assistantResponseEvent.part.toolCallDetail.toolName,
          }
        : {}),
    };
  }

  if (assistantResponseEvent.type === "assistant_pending_tool_approval_requested") {
    return {
      approvalId: assistantResponseEvent.approvalRequest.approvalId,
      pendingToolCallId: assistantResponseEvent.approvalRequest.pendingToolCallId,
      riskExplanationLength: assistantResponseEvent.approvalRequest.riskExplanation.length,
    };
  }

  if (assistantResponseEvent.type === "assistant_pending_tool_approval_cleared") {
    return {
      approvalId: assistantResponseEvent.approvalId,
    };
  }

  if (assistantResponseEvent.type === "assistant_message_completed") {
    return {
      messageId: assistantResponseEvent.messageId,
      ...summarizeTokenUsageForDiagnostics(assistantResponseEvent.usage),
    };
  }

  if (assistantResponseEvent.type === "assistant_message_incomplete") {
    return {
      messageId: assistantResponseEvent.messageId,
      incompleteReason: assistantResponseEvent.incompleteReason,
      ...summarizeTokenUsageForDiagnostics(assistantResponseEvent.usage),
    };
  }

  return {
    messageId: assistantResponseEvent.messageId,
    errorTextLength: assistantResponseEvent.errorText.length,
  };
}

function summarizeTokenUsageForDiagnostics(tokenUsage: TokenUsage): BuliDiagnosticLogFields {
  return {
    totalTokens: tokenUsage.total ?? tokenUsage.input + tokenUsage.output + tokenUsage.reasoning,
    inputTokens: tokenUsage.input,
    outputTokens: tokenUsage.output,
    reasoningTokens: tokenUsage.reasoning,
    cacheReadTokens: tokenUsage.cache.read,
    cacheWriteTokens: tokenUsage.cache.write,
  };
}
