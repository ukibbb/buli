import {
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
  type UserPromptSource,
  type UserPromptImageAttachment,
} from "@buli/contracts";
import type {
  ActiveConversationTurn,
  AssistantConversationRunner,
  ConversationAutoCompactionResult,
  ConversationTurnRequest,
} from "@buli/engine";
import {
  appendSubmittedUserPromptToConversation,
  applyAssistantResponseEventsToChatSessionState,
  type ChatSessionState,
} from "@buli/chat-session-state";
import { startTransition, useEffect, useEffectEvent, type Dispatch, type SetStateAction } from "react";
import { summarizeAssistantResponseEventsForDiagnostics } from "./assistantResponseEventDiagnostics.ts";
import { logChatAppControllerDiagnosticEvent } from "./diagnostics.ts";
import { relayAssistantResponseRunnerEvents } from "./relayAssistantResponseRunnerEvents.ts";
import type { FinishedChatAppActiveTurn, StartedChatAppActiveTurn } from "./useChatAppActiveTurnInterrupt.ts";

type MutableValueRef<T> = { current: T };

const AUTO_COMPACTION_CONTINUATION_PROMPT_TEXT =
  "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.";

export type UseChatAppAssistantTurnActionsInput = {
  chatSessionState: ChatSessionState;
  assistantConversationRunner: AssistantConversationRunner;
  latestChatSessionStateRef: MutableValueRef<ChatSessionState>;
  isPromptSubmissionInFlightRef: MutableValueRef<boolean>;
  submittedToolApprovalDecisionApprovalIdRef: MutableValueRef<string | undefined>;
  setChatSessionState: Dispatch<SetStateAction<ChatSessionState>>;
  getActiveConversationTurn: () => ActiveConversationTurn | undefined;
  registerActiveConversationTurnStarted: (startedActiveConversationTurn: StartedChatAppActiveTurn) => void;
  registerActiveConversationTurnFinished: (finishedActiveConversationTurn: FinishedChatAppActiveTurn) => void;
  registerActiveConversationTurnSettlement: (activeConversationTurnSettlementPromise: Promise<void>) => void;
  dequeueQueuedSubmittedPrompt: () => QueuedChatAppPrompt | undefined;
  scrollConversationMessagesToBottom: () => void;
  autoCompactCurrentConversationSessionAfterAssistantTurn: () =>
    | Promise<ConversationAutoCompactionResult | undefined>
    | ConversationAutoCompactionResult
    | undefined;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type SubmittedChatAppPrompt = {
  submittedPromptText: string;
  submittedPromptImageAttachments: readonly UserPromptImageAttachment[];
  submittedPromptSource?: UserPromptSource | undefined;
};

export type QueuedChatAppPrompt = {
  submittedPromptText: string;
  submittedPromptImageAttachments: readonly UserPromptImageAttachment[];
};

export type PendingToolApprovalDecisionSubmission = {
  decision: "approved" | "denied";
  source: "button" | "keyboard";
};

export type UseChatAppAssistantTurnActionsResult = {
  streamAssistantResponseForSubmittedPrompt: (submittedPrompt: SubmittedChatAppPrompt) => Promise<void>;
  submitPendingToolApprovalDecision: (submission: PendingToolApprovalDecisionSubmission) => void;
};

export function useChatAppAssistantTurnActions(
  input: UseChatAppAssistantTurnActionsInput,
): UseChatAppAssistantTurnActionsResult {
  useEffect(() => {
    const pendingApprovalId = input.chatSessionState.pendingToolApprovalRequest?.approvalId;
    if (!pendingApprovalId || input.submittedToolApprovalDecisionApprovalIdRef.current !== pendingApprovalId) {
      input.submittedToolApprovalDecisionApprovalIdRef.current = undefined;
    }
  }, [input.chatSessionState.pendingToolApprovalRequest?.approvalId]);

  const applyIncomingAssistantResponseEventsToChatAppState = useEffectEvent((assistantResponseEvents: readonly AssistantResponseEvent[]): void => {
    logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.assistant_event_batch_applied", {
      ...summarizeAssistantResponseEventsForDiagnostics(assistantResponseEvents),
      previousConversationTurnStatus: input.latestChatSessionStateRef.current.conversationTurnStatus,
    });
    const nextChatSessionState = applyAssistantResponseEventsToChatSessionState(
      input.latestChatSessionStateRef.current,
      assistantResponseEvents,
    );
    input.latestChatSessionStateRef.current = nextChatSessionState;
    startTransition(() => {
      input.setChatSessionState(nextChatSessionState);
    });
  });

  const appendQueuedSubmittedPromptToConversation = useEffectEvent((queuedChatAppPrompt: QueuedChatAppPrompt): SubmittedChatAppPrompt => {
    const nextChatSessionState = appendSubmittedUserPromptToConversation({
      chatSessionState: input.latestChatSessionStateRef.current,
      submittedPromptText: queuedChatAppPrompt.submittedPromptText,
      submittedPromptImageAttachments: queuedChatAppPrompt.submittedPromptImageAttachments,
    });
    input.latestChatSessionStateRef.current = nextChatSessionState;
    input.setChatSessionState(nextChatSessionState);
    input.scrollConversationMessagesToBottom();
    logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.queued_prompt_started", {
      submittedPromptLength: queuedChatAppPrompt.submittedPromptText.length,
      submittedPromptImageAttachmentCount: queuedChatAppPrompt.submittedPromptImageAttachments.length,
      selectedModelId: nextChatSessionState.selectedModelId,
      selectedReasoningEffort: nextChatSessionState.selectedReasoningEffort ?? null,
    });
    return {
      submittedPromptText: queuedChatAppPrompt.submittedPromptText,
      submittedPromptImageAttachments: queuedChatAppPrompt.submittedPromptImageAttachments,
    };
  });

  const streamAssistantResponseForSubmittedPrompt = useEffectEvent(async (submittedPrompt: SubmittedChatAppPrompt): Promise<void> => {
    let nextSubmittedPrompt: SubmittedChatAppPrompt | undefined = submittedPrompt;
    try {
      while (nextSubmittedPrompt) {
        const activeSubmittedPrompt = nextSubmittedPrompt;
        nextSubmittedPrompt = undefined;
        const conversationTurnRequest: ConversationTurnRequest = {
          userPromptText: activeSubmittedPrompt.submittedPromptText,
          ...(activeSubmittedPrompt.submittedPromptImageAttachments.length > 0
            ? { userPromptImageAttachments: activeSubmittedPrompt.submittedPromptImageAttachments }
            : {}),
          assistantOperatingMode: input.latestChatSessionStateRef.current.selectedAssistantOperatingMode,
          selectedModelId: input.latestChatSessionStateRef.current.selectedModelId,
          ...(input.latestChatSessionStateRef.current.selectedReasoningEffort
            ? { selectedReasoningEffort: input.latestChatSessionStateRef.current.selectedReasoningEffort }
            : {}),
          ...(activeSubmittedPrompt.submittedPromptSource ? { promptSource: activeSubmittedPrompt.submittedPromptSource } : {}),
        };

        logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.assistant_turn_request_created", {
          selectedModelId: conversationTurnRequest.selectedModelId,
          selectedReasoningEffort: conversationTurnRequest.selectedReasoningEffort ?? null,
          assistantOperatingMode: conversationTurnRequest.assistantOperatingMode ?? null,
          promptSource: conversationTurnRequest.promptSource ?? null,
          submittedPromptLength: activeSubmittedPrompt.submittedPromptText.length,
          submittedPromptImageAttachmentCount: activeSubmittedPrompt.submittedPromptImageAttachments.length,
        });

        const assistantResponseRelayPromise = relayAssistantResponseRunnerEvents({
          assistantConversationRunner: input.assistantConversationRunner,
          conversationTurnRequest,
          onConversationTurnStarted: (activeConversationTurn) => {
            input.registerActiveConversationTurnStarted({
              activeConversationTurn,
              selectedModelId: conversationTurnRequest.selectedModelId,
            });
          },
          onConversationTurnFinished: () => {
            input.registerActiveConversationTurnFinished({
              selectedModelId: conversationTurnRequest.selectedModelId,
            });
          },
          onAssistantResponseEvents: applyIncomingAssistantResponseEventsToChatAppState,
          diagnosticLogger: input.diagnosticLogger,
        });
        input.registerActiveConversationTurnSettlement(assistantResponseRelayPromise);
        await assistantResponseRelayPromise;

        const autoCompactionResult = await input.autoCompactCurrentConversationSessionAfterAssistantTurn();
        if (autoCompactionResult?.didCompact && activeSubmittedPrompt.submittedPromptSource !== "auto_compaction_continue") {
          logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.auto_compaction_continue_prompt_queued", {
            selectedModelId: conversationTurnRequest.selectedModelId,
            conversationSessionEntryCount: autoCompactionResult.conversationSessionEntries.length,
          });
          nextSubmittedPrompt = {
            submittedPromptText: AUTO_COMPACTION_CONTINUATION_PROMPT_TEXT,
            submittedPromptImageAttachments: [],
            submittedPromptSource: "auto_compaction_continue",
          };
          continue;
        }

        const queuedChatAppPrompt = input.dequeueQueuedSubmittedPrompt();
        if (queuedChatAppPrompt) {
          nextSubmittedPrompt = appendQueuedSubmittedPromptToConversation(queuedChatAppPrompt);
        }
      }
    } finally {
      input.isPromptSubmissionInFlightRef.current = false;
    }
  });

  const submitPendingToolApprovalDecision = useEffectEvent((submission: PendingToolApprovalDecisionSubmission): void => {
    const pendingToolApprovalRequest = input.latestChatSessionStateRef.current.pendingToolApprovalRequest;
    if (!pendingToolApprovalRequest) {
      logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.tool_approval_decision_ignored", {
        decision: submission.decision,
        source: submission.source,
        reason: "no_pending_approval",
      });
      return;
    }

    if (input.submittedToolApprovalDecisionApprovalIdRef.current === pendingToolApprovalRequest.approvalId) {
      logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.tool_approval_decision_ignored", {
        approvalId: pendingToolApprovalRequest.approvalId,
        pendingToolCallId: pendingToolApprovalRequest.pendingToolCallId,
        decision: submission.decision,
        source: submission.source,
        reason: "decision_already_submitted",
      });
      return;
    }

    const activeConversationTurn = input.getActiveConversationTurn();
    if (!activeConversationTurn) {
      logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.tool_approval_decision_ignored", {
        approvalId: pendingToolApprovalRequest.approvalId,
        pendingToolCallId: pendingToolApprovalRequest.pendingToolCallId,
        decision: submission.decision,
        source: submission.source,
        reason: "no_active_turn",
      });
      return;
    }

    input.submittedToolApprovalDecisionApprovalIdRef.current = pendingToolApprovalRequest.approvalId;
    logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.tool_approval_decision_submitted", {
      approvalId: pendingToolApprovalRequest.approvalId,
      pendingToolCallId: pendingToolApprovalRequest.pendingToolCallId,
      decision: submission.decision,
      source: submission.source,
    });

    const resetApprovalDecisionGuardAfterFailure = (error: unknown): void => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.tool_approval_decision_failed", {
        approvalId: pendingToolApprovalRequest.approvalId,
        pendingToolCallId: pendingToolApprovalRequest.pendingToolCallId,
        decision: submission.decision,
        source: submission.source,
        errorMessage,
      });
      if (input.latestChatSessionStateRef.current.pendingToolApprovalRequest?.approvalId === pendingToolApprovalRequest.approvalId) {
        input.submittedToolApprovalDecisionApprovalIdRef.current = undefined;
      }
    };

    try {
      const approvalDecisionPromise = submission.decision === "approved"
        ? activeConversationTurn.approvePendingToolCall(pendingToolApprovalRequest.approvalId)
        : activeConversationTurn.denyPendingToolCall(pendingToolApprovalRequest.approvalId);
      void approvalDecisionPromise.catch(resetApprovalDecisionGuardAfterFailure);
    } catch (error) {
      resetApprovalDecisionGuardAfterFailure(error);
    }
  });

  return {
    streamAssistantResponseForSubmittedPrompt,
    submitPendingToolApprovalDecision,
  };
}
