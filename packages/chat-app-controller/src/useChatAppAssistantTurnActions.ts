import {
  type AssistantOperatingMode,
  type AssistantResponseEvent,
  type UserPromptSource,
  type UserPromptImageAttachment,
} from "@buli/contracts";
import type {
  ActiveConversationTurn,
  AssistantConversationRunner,
  ConversationAutoCompactionRequest,
  ConversationAutoCompactionResult,
  ConversationTurnRequest,
} from "@buli/engine";
import {
  appendSubmittedUserPromptToConversation,
  applyAssistantResponseEventsToChatSessionState,
  type ChatSessionState,
} from "@buli/chat-session-state";
import { startTransition, useEffect, useEffectEvent, type Dispatch, type SetStateAction } from "react";
import { relayAssistantResponseRunnerEvents } from "./relayAssistantResponseRunnerEvents.ts";

type MutableValueRef<T> = { current: T };

type AutoCompactionAfterAssistantTurnRequest = {
  requestTriggerKind?: ConversationAutoCompactionRequest["requestTriggerKind"] | undefined;
};

type TerminalAssistantResponseEvent = Extract<AssistantResponseEvent, {
  type: "assistant_message_completed" | "assistant_message_incomplete" | "assistant_message_failed" | "assistant_message_interrupted";
}>;

const AUTO_COMPACTION_CONTINUATION_PROMPT_TEXT =
  "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.";
const AUTO_COMPACTION_INCOMPLETE_CONTINUATION_PROMPT_TEXT =
  "Continue the previous response from where it stopped. Do not repeat completed content.";

export type UseChatAppAssistantTurnActionsInput = {
  chatSessionState: ChatSessionState;
  assistantConversationRunner: AssistantConversationRunner;
  latestChatSessionStateRef: MutableValueRef<ChatSessionState>;
  isPromptSubmissionInFlightRef: MutableValueRef<boolean>;
  isChatAppControllerMountedRef: MutableValueRef<boolean>;
  submittedToolApprovalDecisionApprovalIdRef: MutableValueRef<string | undefined>;
  setChatSessionState: Dispatch<SetStateAction<ChatSessionState>>;
  getActiveConversationTurn: () => ActiveConversationTurn | undefined;
  registerActiveConversationTurnStarted: (activeConversationTurn: ActiveConversationTurn) => void;
  registerActiveConversationTurnFinished: () => void;
  registerActiveConversationTurnSettlement: (activeConversationTurnSettlementPromise: Promise<unknown>) => void;
  dequeueQueuedSubmittedPrompt: () => QueuedChatAppPrompt | undefined;
  scrollConversationMessagesToBottom: () => void;
  autoCompactCurrentConversationSessionAfterAssistantTurn: (
    input?: AutoCompactionAfterAssistantTurnRequest,
  ) =>
    | Promise<ConversationAutoCompactionResult | undefined>
    | ConversationAutoCompactionResult
    | undefined;
};

export type SubmittedChatAppPrompt = {
  submittedPromptText: string;
  submittedPromptImageAttachments: readonly UserPromptImageAttachment[];
  submittedAssistantOperatingMode: AssistantOperatingMode;
  submittedPromptSource?: UserPromptSource | undefined;
};

export type QueuedChatAppPrompt = {
  submittedPromptText: string;
  submittedPromptImageAttachments: readonly UserPromptImageAttachment[];
  submittedAssistantOperatingMode: AssistantOperatingMode;
};

export type PendingToolApprovalDecisionSubmission = {
  decision: "approved" | "denied";
  source: "button" | "keyboard";
};

export type UseChatAppAssistantTurnActionsResult = {
  streamAssistantResponseForSubmittedPrompt: (submittedPrompt: SubmittedChatAppPrompt) => Promise<void>;
  submitPendingToolApprovalDecision: (submission: PendingToolApprovalDecisionSubmission) => void;
};

export function resolveAutoCompactionFollowUpPromptAfterAssistantTurn(input: {
  activeSubmittedPrompt: SubmittedChatAppPrompt;
  terminalAssistantResponseEvent: TerminalAssistantResponseEvent | undefined;
  autoCompactionResult: ConversationAutoCompactionResult | undefined;
}): SubmittedChatAppPrompt | undefined {
  if (!input.autoCompactionResult?.didCompact) {
    return undefined;
  }

  const didFailBecauseContextWindowOverflow =
    input.terminalAssistantResponseEvent?.type === "assistant_message_failed" &&
    input.terminalAssistantResponseEvent.failureKind === "context_window_overflow";
  if (
    didFailBecauseContextWindowOverflow &&
    input.activeSubmittedPrompt.submittedPromptSource !== "auto_compaction_retry"
  ) {
    return {
      submittedPromptText: input.activeSubmittedPrompt.submittedPromptText,
      submittedPromptImageAttachments: input.activeSubmittedPrompt.submittedPromptImageAttachments,
      submittedAssistantOperatingMode: input.activeSubmittedPrompt.submittedAssistantOperatingMode,
      submittedPromptSource: "auto_compaction_retry",
    };
  }

  const didStopBecauseMaxOutputTokens =
    input.terminalAssistantResponseEvent?.type === "assistant_message_incomplete" &&
    input.terminalAssistantResponseEvent.incompleteReason === "max_output_tokens";
  if (
    didStopBecauseMaxOutputTokens &&
    input.activeSubmittedPrompt.submittedPromptSource !== "auto_compaction_continue"
  ) {
    return {
      submittedPromptText: AUTO_COMPACTION_INCOMPLETE_CONTINUATION_PROMPT_TEXT,
      submittedPromptImageAttachments: [],
      submittedAssistantOperatingMode: input.activeSubmittedPrompt.submittedAssistantOperatingMode,
      submittedPromptSource: "auto_compaction_continue",
    };
  }

  if (
    input.activeSubmittedPrompt.submittedPromptSource !== "auto_compaction_continue" &&
    input.activeSubmittedPrompt.submittedPromptSource !== "auto_compaction_retry"
  ) {
    return {
      submittedPromptText: AUTO_COMPACTION_CONTINUATION_PROMPT_TEXT,
      submittedPromptImageAttachments: [],
      submittedAssistantOperatingMode: input.activeSubmittedPrompt.submittedAssistantOperatingMode,
      submittedPromptSource: "auto_compaction_continue",
    };
  }

  return undefined;
}

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
    return {
      submittedPromptText: queuedChatAppPrompt.submittedPromptText,
      submittedPromptImageAttachments: queuedChatAppPrompt.submittedPromptImageAttachments,
      submittedAssistantOperatingMode: queuedChatAppPrompt.submittedAssistantOperatingMode,
    };
  });

  const streamAssistantResponseForSubmittedPrompt = useEffectEvent(async (submittedPrompt: SubmittedChatAppPrompt): Promise<void> => {
    let nextSubmittedPrompt: SubmittedChatAppPrompt | undefined = submittedPrompt;
    try {
      while (nextSubmittedPrompt) {
        const activeSubmittedPrompt: SubmittedChatAppPrompt = nextSubmittedPrompt;
        nextSubmittedPrompt = undefined;
        const conversationTurnRequest: ConversationTurnRequest = {
          userPromptText: activeSubmittedPrompt.submittedPromptText,
          ...(activeSubmittedPrompt.submittedPromptImageAttachments.length > 0
            ? { userPromptImageAttachments: activeSubmittedPrompt.submittedPromptImageAttachments }
            : {}),
          assistantOperatingMode: activeSubmittedPrompt.submittedAssistantOperatingMode,
          selectedModelId: input.latestChatSessionStateRef.current.selectedModelId,
          ...(input.latestChatSessionStateRef.current.selectedReasoningEffort
            ? { selectedReasoningEffort: input.latestChatSessionStateRef.current.selectedReasoningEffort }
            : {}),
          ...(activeSubmittedPrompt.submittedPromptSource ? { promptSource: activeSubmittedPrompt.submittedPromptSource } : {}),
        };

        const assistantResponseRelayPromise = relayAssistantResponseRunnerEvents({
          assistantConversationRunner: input.assistantConversationRunner,
          conversationTurnRequest,
          onConversationTurnStarted: (activeConversationTurn) => {
            input.registerActiveConversationTurnStarted(activeConversationTurn);
          },
          onConversationTurnFinished: () => {
            input.registerActiveConversationTurnFinished();
          },
          onAssistantResponseEvents: applyIncomingAssistantResponseEventsToChatAppState,
        });
        input.registerActiveConversationTurnSettlement(assistantResponseRelayPromise);
        const assistantResponseRelayResult = await assistantResponseRelayPromise;

        if (!input.isChatAppControllerMountedRef.current) {
          return;
        }

        const didFailBecauseContextWindowOverflow =
          assistantResponseRelayResult.terminalAssistantResponseEvent?.type === "assistant_message_failed" &&
          assistantResponseRelayResult.terminalAssistantResponseEvent.failureKind === "context_window_overflow";
        const autoCompactionResult = await input.autoCompactCurrentConversationSessionAfterAssistantTurn(
          didFailBecauseContextWindowOverflow ? { requestTriggerKind: "context_window_overflow" } : undefined,
        );
        if (!input.isChatAppControllerMountedRef.current) {
          return;
        }

        const autoCompactionFollowUpPrompt = resolveAutoCompactionFollowUpPromptAfterAssistantTurn({
          activeSubmittedPrompt,
          terminalAssistantResponseEvent: assistantResponseRelayResult.terminalAssistantResponseEvent,
          autoCompactionResult,
        });
        if (autoCompactionFollowUpPrompt) {
          nextSubmittedPrompt = autoCompactionFollowUpPrompt;
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
      return;
    }

    if (input.submittedToolApprovalDecisionApprovalIdRef.current === pendingToolApprovalRequest.approvalId) {
      return;
    }

    const activeConversationTurn = input.getActiveConversationTurn();
    if (!activeConversationTurn) {
      return;
    }

    input.submittedToolApprovalDecisionApprovalIdRef.current = pendingToolApprovalRequest.approvalId;

    const resetApprovalDecisionGuardAfterFailure = (): void => {
      if (input.latestChatSessionStateRef.current.pendingToolApprovalRequest?.approvalId === pendingToolApprovalRequest.approvalId) {
        input.submittedToolApprovalDecisionApprovalIdRef.current = undefined;
      }
    };

    try {
      const approvalDecisionPromise = submission.decision === "approved"
        ? activeConversationTurn.approvePendingToolCall(pendingToolApprovalRequest.approvalId)
        : activeConversationTurn.denyPendingToolCall(pendingToolApprovalRequest.approvalId);
      void approvalDecisionPromise.catch(resetApprovalDecisionGuardAfterFailure);
    } catch {
      resetApprovalDecisionGuardAfterFailure();
    }
  });

  return {
    streamAssistantResponseForSubmittedPrompt,
    submitPendingToolApprovalDecision,
  };
}
