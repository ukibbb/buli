import {
  emitBuliDiagnosticLogEvent,
  type AssistantResponseEvent,
  type BuliDiagnosticLogFields,
  type BuliDiagnosticLogger,
  type UserPromptImageAttachment,
} from "@buli/contracts";
import type { ActiveConversationTurn, AssistantConversationRunner, ConversationTurnRequest } from "@buli/engine";
import { applyAssistantResponseEventsToChatSessionState, type ChatSessionState } from "@buli/chat-session-state";
import { startTransition, useEffect, useEffectEvent, type Dispatch, type SetStateAction } from "react";
import { summarizeAssistantResponseEventsForDiagnostics } from "../assistantResponseEventDiagnostics.ts";
import { relayAssistantResponseRunnerEvents } from "../relayAssistantResponseRunnerEvents.ts";
import type { FinishedChatScreenActiveTurn, StartedChatScreenActiveTurn } from "./useChatScreenActiveTurnInterrupt.ts";

type MutableValueRef<T> = { current: T };

export type UseChatScreenAssistantTurnActionsInput = {
  chatSessionState: ChatSessionState;
  assistantConversationRunner: AssistantConversationRunner;
  latestChatSessionStateRef: MutableValueRef<ChatSessionState>;
  isPromptSubmissionInFlightRef: MutableValueRef<boolean>;
  submittedToolApprovalDecisionApprovalIdRef: MutableValueRef<string | undefined>;
  setChatSessionState: Dispatch<SetStateAction<ChatSessionState>>;
  getActiveConversationTurn: () => ActiveConversationTurn | undefined;
  registerActiveConversationTurnStarted: (startedActiveConversationTurn: StartedChatScreenActiveTurn) => void;
  registerActiveConversationTurnFinished: (finishedActiveConversationTurn: FinishedChatScreenActiveTurn) => void;
  registerActiveConversationTurnSettlement: (activeConversationTurnSettlementPromise: Promise<void>) => void;
  autoCompactCurrentConversationSessionAfterAssistantTurn: () => Promise<void> | void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type SubmittedChatScreenPrompt = {
  submittedPromptText: string;
  submittedPromptImageAttachments: readonly UserPromptImageAttachment[];
};

export type PendingToolApprovalDecisionSubmission = {
  decision: "approved" | "denied";
  source: "button" | "keyboard";
};

export type UseChatScreenAssistantTurnActionsResult = {
  streamAssistantResponseForSubmittedPrompt: (submittedPrompt: SubmittedChatScreenPrompt) => Promise<void>;
  submitPendingToolApprovalDecision: (submission: PendingToolApprovalDecisionSubmission) => void;
};

function logChatScreenDiagnosticEvent(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  eventName: string,
  fields?: BuliDiagnosticLogFields,
): void {
  emitBuliDiagnosticLogEvent(diagnosticLogger, {
    subsystem: "tui",
    eventName,
    ...(fields ? { fields } : {}),
  });
}

export function useChatScreenAssistantTurnActions(
  input: UseChatScreenAssistantTurnActionsInput,
): UseChatScreenAssistantTurnActionsResult {
  useEffect(() => {
    const pendingApprovalId = input.chatSessionState.pendingToolApprovalRequest?.approvalId;
    if (!pendingApprovalId || input.submittedToolApprovalDecisionApprovalIdRef.current !== pendingApprovalId) {
      input.submittedToolApprovalDecisionApprovalIdRef.current = undefined;
    }
  }, [input.chatSessionState.pendingToolApprovalRequest?.approvalId]);

  const applyIncomingAssistantResponseEventsToChatScreen = useEffectEvent((assistantResponseEvents: readonly AssistantResponseEvent[]): void => {
    logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.assistant_event_batch_applied", {
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

  const streamAssistantResponseForSubmittedPrompt = useEffectEvent(async (submittedPrompt: SubmittedChatScreenPrompt): Promise<void> => {
    const conversationTurnRequest: ConversationTurnRequest = {
      userPromptText: submittedPrompt.submittedPromptText,
      ...(submittedPrompt.submittedPromptImageAttachments.length > 0
        ? { userPromptImageAttachments: submittedPrompt.submittedPromptImageAttachments }
        : {}),
      assistantOperatingMode: input.latestChatSessionStateRef.current.selectedAssistantOperatingMode,
      selectedModelId: input.latestChatSessionStateRef.current.selectedModelId,
      ...(input.latestChatSessionStateRef.current.selectedReasoningEffort
        ? { selectedReasoningEffort: input.latestChatSessionStateRef.current.selectedReasoningEffort }
        : {}),
    };

    logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.assistant_turn_request_created", {
      selectedModelId: conversationTurnRequest.selectedModelId,
      selectedReasoningEffort: conversationTurnRequest.selectedReasoningEffort ?? null,
      assistantOperatingMode: conversationTurnRequest.assistantOperatingMode ?? null,
      submittedPromptLength: submittedPrompt.submittedPromptText.length,
      submittedPromptImageAttachmentCount: submittedPrompt.submittedPromptImageAttachments.length,
    });

    try {
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
        onAssistantResponseEvents: applyIncomingAssistantResponseEventsToChatScreen,
        diagnosticLogger: input.diagnosticLogger,
      });
      input.registerActiveConversationTurnSettlement(assistantResponseRelayPromise);
      await assistantResponseRelayPromise;
      await input.autoCompactCurrentConversationSessionAfterAssistantTurn();
    } finally {
      input.isPromptSubmissionInFlightRef.current = false;
    }
  });

  const submitPendingToolApprovalDecision = useEffectEvent((submission: PendingToolApprovalDecisionSubmission): void => {
    const pendingToolApprovalRequest = input.latestChatSessionStateRef.current.pendingToolApprovalRequest;
    if (!pendingToolApprovalRequest) {
      logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.tool_approval_decision_ignored", {
        decision: submission.decision,
        source: submission.source,
        reason: "no_pending_approval",
      });
      return;
    }

    if (input.submittedToolApprovalDecisionApprovalIdRef.current === pendingToolApprovalRequest.approvalId) {
      logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.tool_approval_decision_ignored", {
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
      logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.tool_approval_decision_ignored", {
        approvalId: pendingToolApprovalRequest.approvalId,
        pendingToolCallId: pendingToolApprovalRequest.pendingToolCallId,
        decision: submission.decision,
        source: submission.source,
        reason: "no_active_turn",
      });
      return;
    }

    input.submittedToolApprovalDecisionApprovalIdRef.current = pendingToolApprovalRequest.approvalId;
    logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.tool_approval_decision_submitted", {
      approvalId: pendingToolApprovalRequest.approvalId,
      pendingToolCallId: pendingToolApprovalRequest.pendingToolCallId,
      decision: submission.decision,
      source: submission.source,
    });

    const resetApprovalDecisionGuardAfterFailure = (error: unknown): void => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.tool_approval_decision_failed", {
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
