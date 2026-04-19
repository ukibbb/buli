import { randomUUID } from "node:crypto";
import {
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
  type AssistantResponseEvent,
  type BashToolCallRequest,
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
import { classifyBashToolApprovalRequirement } from "./tools/bashToolApprovalPolicy.ts";
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
      conversationSessionEntries: this.conversationHistory.listConversationSessionEntries(),
      modelContextItems: this.conversationHistory.listModelContextItems(),
      selectedModelId: this.conversationTurnInput.selectedModelId,
      ...(this.conversationTurnInput.selectedReasoningEffort
        ? { selectedReasoningEffort: this.conversationTurnInput.selectedReasoningEffort }
        : {}),
    });

    const assistantResponseMessageId = randomUUID();
    const assistantTextPartId = randomUUID();
    let assistantTextMessagePartBuilderState = createInitialAssistantTextMessagePartBuilder(assistantTextPartId);
    let hasEmittedAssistantTextMessagePart = false;
    let currentReasoningPartId: string | undefined;
    let currentReasoningSummaryText = "";
    let currentReasoningStartedAtMs: number | undefined;

    try {
      yield AssistantTurnStartedEventSchema.parse({
        type: "assistant_turn_started",
        messageId: assistantResponseMessageId,
        startedAtMs: conversationTurnStartedAtMilliseconds,
      });

      for await (const providerStreamEvent of providerConversationTurn.streamProviderEvents()) {
        if (providerStreamEvent.type === "reasoning_summary_started") {
          currentReasoningPartId = randomUUID();
          currentReasoningSummaryText = "";
          currentReasoningStartedAtMs = Date.now();
          yield AssistantMessagePartAddedEventSchema.parse({
            type: "assistant_message_part_added",
            messageId: assistantResponseMessageId,
            part: AssistantReasoningConversationMessagePartSchema.parse({
              id: currentReasoningPartId,
              partKind: "assistant_reasoning",
              partStatus: "streaming",
              reasoningSummaryText: "",
              reasoningStartedAtMs: currentReasoningStartedAtMs,
            }),
          });
          continue;
        }

        if (providerStreamEvent.type === "reasoning_summary_text_chunk") {
          if (!currentReasoningPartId || currentReasoningStartedAtMs === undefined) {
            continue;
          }

          currentReasoningSummaryText += providerStreamEvent.text;
          yield AssistantMessagePartUpdatedEventSchema.parse({
            type: "assistant_message_part_updated",
            messageId: assistantResponseMessageId,
            part: AssistantReasoningConversationMessagePartSchema.parse({
              id: currentReasoningPartId,
              partKind: "assistant_reasoning",
              partStatus: "streaming",
              reasoningSummaryText: currentReasoningSummaryText,
              reasoningStartedAtMs: currentReasoningStartedAtMs,
            }),
          });
          continue;
        }

        if (providerStreamEvent.type === "reasoning_summary_completed") {
          if (!currentReasoningPartId || currentReasoningStartedAtMs === undefined) {
            continue;
          }

          yield AssistantMessagePartUpdatedEventSchema.parse({
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
          });
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
          yield (hasEmittedAssistantTextMessagePart
            ? AssistantMessagePartUpdatedEventSchema
            : AssistantMessagePartAddedEventSchema
          ).parse({
            type: hasEmittedAssistantTextMessagePart ? "assistant_message_part_updated" : "assistant_message_part_added",
            messageId: assistantResponseMessageId,
            part: assistantTextConversationMessagePart,
          });
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
          yield AssistantMessagePartAddedEventSchema.parse({
            type: "assistant_message_part_added",
            messageId: assistantResponseMessageId,
            part: AssistantRateLimitNoticeConversationMessagePartSchema.parse({
              id: randomUUID(),
              partKind: "assistant_rate_limit_notice",
              retryAfterSeconds: providerStreamEvent.retryAfterSeconds,
              limitExplanation: providerStreamEvent.limitExplanation,
              noticeStartedAtMs: Date.now(),
            }),
          });
          continue;
        }

        if (providerStreamEvent.type === "plan_proposed") {
          yield AssistantMessagePartAddedEventSchema.parse({
            type: "assistant_message_part_added",
            messageId: assistantResponseMessageId,
            part: AssistantPlanProposalConversationMessagePartSchema.parse({
              id: randomUUID(),
              partKind: "assistant_plan_proposal",
              planId: providerStreamEvent.planId,
              planTitle: providerStreamEvent.planTitle,
              planSteps: providerStreamEvent.planSteps,
            }),
          });
          continue;
        }

        if (providerStreamEvent.type === "incomplete") {
          yield AssistantMessagePartAddedEventSchema.parse({
            type: "assistant_message_part_added",
            messageId: assistantResponseMessageId,
            part: AssistantTurnSummaryConversationMessagePartSchema.parse({
              id: randomUUID(),
              partKind: "assistant_turn_summary",
              turnDurationMs: Date.now() - conversationTurnStartedAtMilliseconds,
              modelDisplayName: this.conversationTurnInput.selectedModelId,
            }),
          });
          yield AssistantMessageIncompleteEventSchema.parse({
            type: "assistant_message_incomplete",
            messageId: assistantResponseMessageId,
            incompleteReason: providerStreamEvent.incompleteReason,
            usage: providerStreamEvent.usage,
          });
          return;
        }

        yield AssistantMessagePartAddedEventSchema.parse({
          type: "assistant_message_part_added",
          messageId: assistantResponseMessageId,
          part: AssistantTurnSummaryConversationMessagePartSchema.parse({
            id: randomUUID(),
            partKind: "assistant_turn_summary",
            turnDurationMs: Date.now() - conversationTurnStartedAtMilliseconds,
            modelDisplayName: this.conversationTurnInput.selectedModelId,
          }),
        });
        if (hasEmittedAssistantTextMessagePart) {
          yield AssistantMessagePartUpdatedEventSchema.parse({
            type: "assistant_message_part_updated",
            messageId: assistantResponseMessageId,
            part: buildCompletedAssistantTextConversationMessagePart(assistantTextMessagePartBuilderState),
          });
        }
        const providerTurnReplay = providerConversationTurn.getProviderTurnReplay();
        this.conversationHistory.appendConversationSessionEntry({
          entryKind: "assistant_message",
          assistantMessageText: assistantTextMessagePartBuilderState.rawMarkdownText,
          ...(providerTurnReplay ? { providerTurnReplay } : {}),
        });
        yield AssistantMessageCompletedEventSchema.parse({
          type: "assistant_message_completed",
          messageId: assistantResponseMessageId,
          usage: providerStreamEvent.usage,
        });
        return;
      }

      yield AssistantMessageFailedEventSchema.parse({
        type: "assistant_message_failed",
        messageId: assistantResponseMessageId,
        errorText: "Provider stream ended before completion",
      });
    } catch (error) {
      yield AssistantMessageFailedEventSchema.parse({
        type: "assistant_message_failed",
        messageId: assistantResponseMessageId,
        errorText: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.hasFinishedConversationTurn = true;
      this.currentPendingToolApprovalState = undefined;
      this.onConversationTurnFinished();
    }
  }

  private async *handleRequestedToolCall(input: {
    assistantResponseMessageId: string;
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
    const bashToolApprovalDecision = classifyBashToolApprovalRequirement(bashToolCallRequest);
    const toolCallPartId = randomUUID();
    const toolCallStartedAtMs = Date.now();

    if (bashToolApprovalDecision.approvalPolicy === "requires_user_approval") {
      yield AssistantMessagePartAddedEventSchema.parse({
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
      });
      const { approvalId, approvalDecisionPromise } = this.createPendingToolApproval({
        toolCallId: input.toolCallId,
        toolCallRequest: bashToolCallRequest,
      });
      yield AssistantPendingToolApprovalRequestedEventSchema.parse({
        type: "assistant_pending_tool_approval_requested",
        approvalRequest: {
          approvalId,
          pendingToolCallId: input.toolCallId,
          pendingToolCallDetail: startedToolCallDetail,
          riskExplanation: bashToolApprovalDecision.riskExplanation,
        },
      });
      const approvalDecision = await approvalDecisionPromise;
      yield AssistantPendingToolApprovalClearedEventSchema.parse({
        type: "assistant_pending_tool_approval_cleared",
        approvalId,
      });

      if (approvalDecision === "denied") {
        const denialText = "The user denied this bash command, so it was not executed.";
        this.conversationHistory.appendConversationSessionEntry({
          entryKind: "denied_tool_result",
          toolCallId: input.toolCallId,
          toolCallDetail: startedToolCallDetail,
          toolResultText: denialText,
          denialExplanation: denialText,
        });
        yield AssistantMessagePartUpdatedEventSchema.parse({
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
        });
        await input.providerConversationTurn.submitToolResult({
          toolCallId: input.toolCallId,
          toolResultText: denialText,
        });
        return;
      }

      yield AssistantMessagePartUpdatedEventSchema.parse({
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
      });
    } else {
      yield AssistantMessagePartAddedEventSchema.parse({
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
      });
    }

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
      yield AssistantMessagePartUpdatedEventSchema.parse({
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
    yield AssistantMessagePartUpdatedEventSchema.parse({
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
