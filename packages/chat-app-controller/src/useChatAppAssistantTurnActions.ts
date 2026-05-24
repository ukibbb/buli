import {
  type AssistantResponseEvent,
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
import { relayAssistantResponseRunnerEvents } from "./relayAssistantResponseRunnerEvents.ts";

type MutableValueRef<T> = { current: T };

const AUTO_COMPACTION_CONTINUATION_PROMPT_TEXT =
  "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.";

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
  registerActiveConversationTurnSettlement: (activeConversationTurnSettlementPromise: Promise<void>) => void;
  dequeueQueuedSubmittedPrompt: () => QueuedChatAppPrompt | undefined;
  scrollConversationMessagesToBottom: () => void;
  autoCompactCurrentConversationSessionAfterAssistantTurn: () =>
    | Promise<ConversationAutoCompactionResult | undefined>
    | ConversationAutoCompactionResult
    | undefined;
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
        await assistantResponseRelayPromise;

        if (!input.isChatAppControllerMountedRef.current) {
          return;
        }

        const autoCompactionResult = await input.autoCompactCurrentConversationSessionAfterAssistantTurn();
        if (!input.isChatAppControllerMountedRef.current) {
          return;
        }
        if (autoCompactionResult?.didCompact && activeSubmittedPrompt.submittedPromptSource !== "auto_compaction_continue") {
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
