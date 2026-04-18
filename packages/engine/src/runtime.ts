import { randomUUID } from "node:crypto";
import {
  AssistantPlanProposedEventSchema,
  AssistantRateLimitPendingEventSchema,
  AssistantReasoningSummaryCompletedEventSchema,
  AssistantReasoningSummaryStartedEventSchema,
  AssistantReasoningSummaryTextChunkEventSchema,
  AssistantResponseFailedEventSchema,
  AssistantResponseIncompleteEventSchema,
  AssistantResponseStreamProjectionUpdatedEventSchema,
  AssistantResponseStartedEventSchema,
  AssistantToolApprovalRequestedEventSchema,
  AssistantToolCallCompletedEventSchema,
  AssistantToolCallDeniedEventSchema,
  AssistantToolCallFailedEventSchema,
  AssistantToolCallStartedEventSchema,
  AssistantTurnCompletedEventSchema,
  type AssistantResponseEvent,
  type BashToolCallRequest,
  type ToolCallRequest,
} from "@buli/contracts";
import {
  appendAssistantTextDeltaToStreamingProjectorState,
  createInitialAssistantStreamingProjectorState,
  finalizeAssistantStreamingProjectorState,
} from "./assistantStreamingProjection.ts";
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
import { createCompletedAssistantResponseEvent } from "./turn.ts";
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
  currentPendingConversationTurn: RuntimeConversationTurn | undefined;

  constructor(input: {
    conversationTurnProvider: ConversationTurnProvider;
    workspaceRootPath: string;
    promptContextBrowseRootPath: string;
    promptContextStartingDirectoryPath?: string;
    workspaceShellCommandExecutor?: WorkspaceShellCommandExecutor;
    conversationHistory?: InMemoryConversationHistory;
  }) {
    this.conversationTurnProvider = input.conversationTurnProvider;
    this.workspaceRootPath = input.workspaceRootPath;
    this.promptContextBrowseRootPath = input.promptContextBrowseRootPath;
    this.promptContextStartingDirectoryPath = input.promptContextStartingDirectoryPath ?? input.promptContextBrowseRootPath;
    this.workspaceShellCommandExecutor =
      input.workspaceShellCommandExecutor ?? new WorkspaceShellCommandExecutor({ workspaceRootPath: input.workspaceRootPath });
    this.conversationHistory = input.conversationHistory ?? new InMemoryConversationHistory();
  }

  startConversationTurn(input: ConversationTurnRequest): ActiveConversationTurn {
    if (this.currentPendingConversationTurn && !this.currentPendingConversationTurn.hasFinishedTurn()) {
      throw new Error("A conversation turn is already running");
    }

    const runtimeConversationTurn = new RuntimeConversationTurn({
      conversationTurnInput: input,
      conversationTurnProvider: this.conversationTurnProvider,
      conversationHistory: this.conversationHistory,
      workspaceRootPath: this.workspaceRootPath,
      promptContextBrowseRootPath: this.promptContextBrowseRootPath,
      promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
      workspaceShellCommandExecutor: this.workspaceShellCommandExecutor,
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
  readonly conversationTurnProvider: ConversationTurnProvider;
  readonly conversationHistory: InMemoryConversationHistory;
  readonly workspaceRootPath: string;
  readonly promptContextBrowseRootPath: string;
  readonly promptContextStartingDirectoryPath: string;
  readonly workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
  readonly onConversationTurnFinished: () => void;
  currentPendingToolApprovalState: PendingToolApprovalState | undefined;
  hasStartedStreamingAssistantResponseEvents = false;
  hasFinishedConversationTurn = false;

  constructor(input: {
    conversationTurnInput: ConversationTurnRequest;
    conversationTurnProvider: ConversationTurnProvider;
    conversationHistory: InMemoryConversationHistory;
    workspaceRootPath: string;
    promptContextBrowseRootPath: string;
    promptContextStartingDirectoryPath: string;
    workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
    onConversationTurnFinished: () => void;
  }) {
    this.conversationTurnInput = input.conversationTurnInput;
    this.conversationTurnProvider = input.conversationTurnProvider;
    this.conversationHistory = input.conversationHistory;
    this.workspaceRootPath = input.workspaceRootPath;
    this.promptContextBrowseRootPath = input.promptContextBrowseRootPath;
    this.promptContextStartingDirectoryPath = input.promptContextStartingDirectoryPath;
    this.workspaceShellCommandExecutor = input.workspaceShellCommandExecutor;
    this.onConversationTurnFinished = input.onConversationTurnFinished;
  }

  hasFinishedTurn(): boolean {
    return this.hasFinishedConversationTurn;
  }

  async approvePendingToolCall(approvalId: string): Promise<void> {
    if (!this.currentPendingToolApprovalState || this.currentPendingToolApprovalState.approvalId !== approvalId) {
      throw new Error(`No pending tool approval matches approvalId=${approvalId}`);
    }

    this.currentPendingToolApprovalState.resolveDecision("approved");
    this.currentPendingToolApprovalState = undefined;
  }

  async denyPendingToolCall(approvalId: string): Promise<void> {
    if (!this.currentPendingToolApprovalState || this.currentPendingToolApprovalState.approvalId !== approvalId) {
      throw new Error(`No pending tool approval matches approvalId=${approvalId}`);
    }

    this.currentPendingToolApprovalState.resolveDecision("denied");
    this.currentPendingToolApprovalState = undefined;
  }

  async *streamAssistantResponseEvents(): AsyncGenerator<AssistantResponseEvent> {
    if (this.hasStartedStreamingAssistantResponseEvents) {
      throw new Error("Conversation turn events can only be streamed once");
    }
    this.hasStartedStreamingAssistantResponseEvents = true;

    const conversationTurnStartedAtMilliseconds = Date.now();
    const modelFacingPromptText = await buildModelFacingPromptTextFromPromptContextReferences({
      promptText: this.conversationTurnInput.userPromptText,
      promptContextBrowseRootPath: this.promptContextBrowseRootPath,
      promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
    });
    this.conversationHistory.appendConversationSessionEntry({
      entryKind: "user_prompt",
      promptText: this.conversationTurnInput.userPromptText,
      modelFacingPromptText,
    });

    const providerConversationTurn = this.conversationTurnProvider.startConversationTurn({
      systemPromptText: buildBuliSystemPrompt({ workspaceRootPath: this.workspaceRootPath }),
      modelContextItems: this.conversationHistory.buildModelContextItems(),
      selectedModelId: this.conversationTurnInput.selectedModelId,
      ...(this.conversationTurnInput.selectedReasoningEffort
        ? { selectedReasoningEffort: this.conversationTurnInput.selectedReasoningEffort }
        : {}),
    });

    const assistantResponseMessageId = randomUUID();
    let assistantStreamingProjectorState = createInitialAssistantStreamingProjectorState();

    try {
      yield AssistantResponseStartedEventSchema.parse({
        type: "assistant_response_started",
        model: this.conversationTurnInput.selectedModelId,
        messageId: assistantResponseMessageId,
      });

      for await (const providerStreamEvent of providerConversationTurn.streamProviderEvents()) {
        if (providerStreamEvent.type === "reasoning_summary_started") {
          yield AssistantReasoningSummaryStartedEventSchema.parse({ type: "assistant_reasoning_summary_started" });
          continue;
        }

        if (providerStreamEvent.type === "reasoning_summary_text_chunk") {
          yield AssistantReasoningSummaryTextChunkEventSchema.parse({
            type: "assistant_reasoning_summary_text_chunk",
            text: providerStreamEvent.text,
          });
          continue;
        }

        if (providerStreamEvent.type === "reasoning_summary_completed") {
          yield AssistantReasoningSummaryCompletedEventSchema.parse({
            type: "assistant_reasoning_summary_completed",
            reasoningDurationMs: providerStreamEvent.reasoningDurationMs,
          });
          continue;
        }

        if (providerStreamEvent.type === "text_chunk") {
          assistantStreamingProjectorState = appendAssistantTextDeltaToStreamingProjectorState(
            assistantStreamingProjectorState,
            providerStreamEvent.text,
          );
          yield AssistantResponseStreamProjectionUpdatedEventSchema.parse({
            type: "assistant_response_stream_projection_updated",
            messageId: assistantResponseMessageId,
            textDelta: providerStreamEvent.text,
            projection: assistantStreamingProjectorState.projection,
          });
          continue;
        }

        if (providerStreamEvent.type === "tool_call_requested") {
          yield* this.handleRequestedToolCall({
            providerConversationTurn,
            toolCallId: providerStreamEvent.toolCallId,
            toolCallRequest: providerStreamEvent.toolCallRequest,
          });
          continue;
        }

        if (providerStreamEvent.type === "rate_limit_pending") {
          yield AssistantRateLimitPendingEventSchema.parse({
            type: "assistant_rate_limit_pending",
            retryAfterSeconds: providerStreamEvent.retryAfterSeconds,
            limitExplanation: providerStreamEvent.limitExplanation,
          });
          continue;
        }

        if (providerStreamEvent.type === "plan_proposed") {
          yield AssistantPlanProposedEventSchema.parse({
            type: "assistant_plan_proposed",
            planId: providerStreamEvent.planId,
            planTitle: providerStreamEvent.planTitle,
            planSteps: providerStreamEvent.planSteps,
          });
          continue;
        }

        if (providerStreamEvent.type === "incomplete") {
          yield AssistantTurnCompletedEventSchema.parse({
            type: "assistant_turn_completed",
            turnDurationMs: Date.now() - conversationTurnStartedAtMilliseconds,
            modelDisplayName: this.conversationTurnInput.selectedModelId,
          });
          yield AssistantResponseIncompleteEventSchema.parse({
            type: "assistant_response_incomplete",
            incompleteReason: providerStreamEvent.incompleteReason,
            usage: providerStreamEvent.usage,
          });
          return;
        }

        yield AssistantTurnCompletedEventSchema.parse({
          type: "assistant_turn_completed",
          turnDurationMs: Date.now() - conversationTurnStartedAtMilliseconds,
          modelDisplayName: this.conversationTurnInput.selectedModelId,
        });
        const finalAssistantStreamingProjection = finalizeAssistantStreamingProjectorState(assistantStreamingProjectorState);
        const completedAssistantResponseEvent = createCompletedAssistantResponseEvent({
          assistantText: finalAssistantStreamingProjection.fullResponseText,
          assistantContentParts: finalAssistantStreamingProjection.completedContentParts,
          usage: providerStreamEvent.usage,
          id: assistantResponseMessageId,
        });
        this.conversationHistory.appendConversationSessionEntry({
          entryKind: "assistant_message",
          assistantMessageText: completedAssistantResponseEvent.message.text,
        });
        yield completedAssistantResponseEvent;
        return;
      }

      yield AssistantResponseFailedEventSchema.parse({
        type: "assistant_response_failed",
        error: "Provider stream ended before completion",
      });
    } catch (error) {
      yield AssistantResponseFailedEventSchema.parse({
        type: "assistant_response_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.hasFinishedConversationTurn = true;
      this.currentPendingToolApprovalState = undefined;
      this.onConversationTurnFinished();
    }
  }

  private async *handleRequestedToolCall(input: {
    providerConversationTurn: ProviderConversationTurn;
    toolCallId: string;
    toolCallRequest: ToolCallRequest;
  }): AsyncGenerator<AssistantResponseEvent> {
    this.conversationHistory.appendConversationSessionEntry({
      entryKind: "tool_call",
      toolCallId: input.toolCallId,
      toolCallRequest: input.toolCallRequest,
    });

    if (input.toolCallRequest.toolName !== "bash") {
      throw new Error(`Unsupported tool requested: ${input.toolCallRequest.toolName}`);
    }

    const bashToolCallRequest: BashToolCallRequest = input.toolCallRequest;
    const startedToolCallDetail = createStartedBashToolCallDetail(bashToolCallRequest);
    const { approvalId, approvalDecisionPromise } = this.createPendingToolApproval({
      toolCallId: input.toolCallId,
      toolCallRequest: bashToolCallRequest,
    });
    yield AssistantToolApprovalRequestedEventSchema.parse({
      type: "assistant_tool_approval_requested",
      approvalId,
      pendingToolCallId: input.toolCallId,
      pendingToolCallDetail: startedToolCallDetail,
      riskExplanation: "This bash command will run inside the current workspace.",
    });
    const approvalDecision = await approvalDecisionPromise;

    if (approvalDecision === "denied") {
      const denialText = "The user denied this bash command, so it was not executed.";
      this.conversationHistory.appendConversationSessionEntry({
        entryKind: "denied_tool_result",
        toolCallId: input.toolCallId,
        toolCallDetail: startedToolCallDetail,
        toolResultText: denialText,
        denialExplanation: denialText,
      });
      yield AssistantToolCallDeniedEventSchema.parse({
        type: "assistant_tool_call_denied",
        toolCallId: input.toolCallId,
        toolCallDetail: startedToolCallDetail,
        denialText,
      });
      await input.providerConversationTurn.submitToolResult({
        toolCallId: input.toolCallId,
        toolResultText: denialText,
      });
      return;
    }

    yield AssistantToolCallStartedEventSchema.parse({
      type: "assistant_tool_call_started",
      toolCallId: input.toolCallId,
      toolCallDetail: startedToolCallDetail,
    });

    const bashToolCallOutcome = await runApprovedBashToolCall({
      bashToolCallRequest,
      workspaceRootPath: this.workspaceRootPath,
      workspaceShellCommandExecutor: this.workspaceShellCommandExecutor,
    });

    if (bashToolCallOutcome.outcomeKind === "completed") {
      this.conversationHistory.appendConversationSessionEntry({
        entryKind: "completed_tool_result",
        toolCallId: input.toolCallId,
        toolCallDetail: bashToolCallOutcome.toolCallDetail,
        toolResultText: bashToolCallOutcome.toolResultText,
      });
      yield AssistantToolCallCompletedEventSchema.parse({
        type: "assistant_tool_call_completed",
        toolCallId: input.toolCallId,
        toolCallDetail: bashToolCallOutcome.toolCallDetail,
        durationMs: bashToolCallOutcome.durationMilliseconds,
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
    yield AssistantToolCallFailedEventSchema.parse({
      type: "assistant_tool_call_failed",
      toolCallId: input.toolCallId,
      toolCallDetail: bashToolCallOutcome.toolCallDetail,
      errorText: bashToolCallOutcome.failureExplanation,
      durationMs: bashToolCallOutcome.durationMilliseconds,
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
