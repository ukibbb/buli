import {
  type AssistantOperatingMode,
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
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
  applyAssistantResponseEventsToChatSessionStateWithChangeSet,
  type AssistantResponseEventsChatSessionStateApplication,
  type ChatSessionState,
} from "@buli/chat-session-state";
import { startTransition, useEffect, useEffectEvent, type Dispatch, type SetStateAction } from "react";
import type { ChatAppRenderStore } from "./chatAppRenderStore.ts";
import { relayAssistantResponseRunnerEvents } from "./relayAssistantResponseRunnerEvents.ts";
import { logChatAppControllerDiagnosticEvent } from "./logChatAppControllerDiagnosticEvent.ts";

type MutableValueRef<T> = { current: T };

type AutoCompactionAfterAssistantTurnRequest = {
  requestTriggerKind?: ConversationAutoCompactionRequest["requestTriggerKind"] | undefined;
};

type TerminalAssistantResponseEvent = Extract<AssistantResponseEvent, {
  type: "assistant_message_completed" | "assistant_message_incomplete" | "assistant_message_failed" | "assistant_message_interrupted";
}>;

export const AUTO_COMPACTION_CONTINUATION_PROMPT_TEXT = [
  "Continue the active task from the compacted conversation summary now visible in context.",
  "",
  "Use the summary as the source of truth for the original user goal, constraints and preferences, verified progress, current in-progress step, blockers, key decisions, relevant files, next steps, and stop condition.",
  "",
  "If the original goal is not fulfilled and the next step is safe in the current workflow mode, continue without asking the user to continue.",
  "",
  "Stop only when the goal is fulfilled, you are blocked, you need user approval, or the summary is insufficient to continue safely.",
  "",
  "Do not repeat completed work. Do not mention compaction. Start at the next unfinished step.",
].join("\n");

export function buildAutoCompactionContinuationPromptText(input: { originalUserPromptText: string }): string {
  return [
    "Original user prompt before automatic compaction:",
    "",
    input.originalUserPromptText,
    "",
    AUTO_COMPACTION_CONTINUATION_PROMPT_TEXT,
  ].join("\n");
}

const AUTO_COMPACTION_INCOMPLETE_CONTINUATION_PROMPT_TEXT =
  "Continue the previous response from where it stopped. Do not repeat completed content.";
export const MAX_AUTO_COMPACTION_CONTINUATION_DEPTH = 8;

export type UseChatAppAssistantTurnActionsInput = {
  chatSessionState: ChatSessionState;
  assistantConversationRunner: AssistantConversationRunner;
  latestChatSessionStateRef: MutableValueRef<ChatSessionState>;
  isPromptSubmissionInFlightRef: MutableValueRef<boolean>;
  isChatAppControllerMountedRef: MutableValueRef<boolean>;
  submittedToolApprovalDecisionApprovalIdRef: MutableValueRef<string | undefined>;
  setChatSessionState: Dispatch<SetStateAction<ChatSessionState>>;
  chatAppRenderStore: ChatAppRenderStore;
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
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type SubmittedChatAppPrompt = {
  submittedPromptText: string;
  submittedPromptImageAttachments: readonly UserPromptImageAttachment[];
  submittedAssistantOperatingMode: AssistantOperatingMode;
  submittedUserSelectedSkillName?: string | undefined;
  submittedPromptSource?: UserPromptSource | undefined;
  autoCompactionContinuationDepth?: number | undefined;
  autoCompactionOriginalUserPromptText?: string | undefined;
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
  if (didFailBecauseContextWindowOverflow) {
    return undefined;
  }

  const didStopBecauseMaxOutputTokens =
    input.terminalAssistantResponseEvent?.type === "assistant_message_incomplete" &&
    input.terminalAssistantResponseEvent.incompleteReason === "max_output_tokens";
  if (
    didStopBecauseMaxOutputTokens &&
    input.activeSubmittedPrompt.submittedPromptSource !== "auto_compaction_continue"
  ) {
    const originalUserPromptText = resolveAutoCompactionOriginalUserPromptText(input.activeSubmittedPrompt);
    return {
      submittedPromptText: AUTO_COMPACTION_INCOMPLETE_CONTINUATION_PROMPT_TEXT,
      submittedPromptImageAttachments: [],
      submittedAssistantOperatingMode: input.activeSubmittedPrompt.submittedAssistantOperatingMode,
      submittedPromptSource: "auto_compaction_continue",
      autoCompactionContinuationDepth: resolveNextAutoCompactionContinuationDepth(input.activeSubmittedPrompt),
      autoCompactionOriginalUserPromptText: originalUserPromptText,
    };
  }
  if (didStopBecauseMaxOutputTokens) {
    return undefined;
  }

  if (input.activeSubmittedPrompt.submittedPromptSource === "auto_compaction_retry") {
    return undefined;
  }

  const nextAutoCompactionContinuationDepth = resolveNextAutoCompactionContinuationDepth(input.activeSubmittedPrompt);
  if (nextAutoCompactionContinuationDepth > MAX_AUTO_COMPACTION_CONTINUATION_DEPTH) {
    return undefined;
  }

  if (
    input.activeSubmittedPrompt.submittedPromptSource === undefined ||
    input.activeSubmittedPrompt.submittedPromptSource === "auto_compaction_continue"
  ) {
    const originalUserPromptText = resolveAutoCompactionOriginalUserPromptText(input.activeSubmittedPrompt);
    return {
      submittedPromptText: buildAutoCompactionContinuationPromptText({ originalUserPromptText }),
      submittedPromptImageAttachments: [],
      submittedAssistantOperatingMode: input.activeSubmittedPrompt.submittedAssistantOperatingMode,
      submittedPromptSource: "auto_compaction_continue",
      autoCompactionContinuationDepth: nextAutoCompactionContinuationDepth,
      autoCompactionOriginalUserPromptText: originalUserPromptText,
    };
  }

  return undefined;
}

function resolveNextAutoCompactionContinuationDepth(activeSubmittedPrompt: SubmittedChatAppPrompt): number {
  const currentContinuationDepth = activeSubmittedPrompt.autoCompactionContinuationDepth ??
    (activeSubmittedPrompt.submittedPromptSource === "auto_compaction_continue" ? 1 : 0);
  return currentContinuationDepth + 1;
}

function resolveAutoCompactionOriginalUserPromptText(activeSubmittedPrompt: SubmittedChatAppPrompt): string {
  return activeSubmittedPrompt.autoCompactionOriginalUserPromptText ?? activeSubmittedPrompt.submittedPromptText;
}

export function resolveAutoCompactionRequestAfterAssistantTurn(input: {
  terminalAssistantResponseEvent: TerminalAssistantResponseEvent | undefined;
}): AutoCompactionAfterAssistantTurnRequest {
  const didFailBecauseContextWindowOverflow =
    input.terminalAssistantResponseEvent?.type === "assistant_message_failed" &&
    input.terminalAssistantResponseEvent.failureKind === "context_window_overflow";
  return didFailBecauseContextWindowOverflow ? { requestTriggerKind: "context_window_overflow" } : {};
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
    const reducerStartedAtMs = Date.now();
    const previousChatSessionState = input.latestChatSessionStateRef.current;
    const assistantResponseEventsApplication = applyAssistantResponseEventsToChatSessionStateWithChangeSet(
      previousChatSessionState,
      assistantResponseEvents,
    );
    const nextChatSessionState = assistantResponseEventsApplication.nextChatSessionState;
    logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "assistant_response_events.reduced", {
      assistantResponseEventCount: assistantResponseEvents.length,
      durationMs: Date.now() - reducerStartedAtMs,
      conversationMessageCount: nextChatSessionState.orderedConversationMessageIds.length,
      conversationMessagePartCount: nextChatSessionState.conversationMessagePartCount,
    });
    input.latestChatSessionStateRef.current = nextChatSessionState;
    input.chatAppRenderStore.replaceChatSessionState(assistantResponseEventsApplication);
    if (
      !shouldUpdateControllerStateForAssistantResponseEvents({
        previousChatSessionState,
        assistantResponseEventsApplication,
      })
    ) {
      return;
    }

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
          ...(activeSubmittedPrompt.submittedUserSelectedSkillName !== undefined
            ? { userSelectedSkillName: activeSubmittedPrompt.submittedUserSelectedSkillName }
            : {}),
          assistantOperatingMode: activeSubmittedPrompt.submittedAssistantOperatingMode,
          selectedModelId: input.latestChatSessionStateRef.current.selectedModelId,
          ...(input.latestChatSessionStateRef.current.selectedReasoningEffort
            ? { selectedReasoningEffort: input.latestChatSessionStateRef.current.selectedReasoningEffort }
            : {}),
          ...(activeSubmittedPrompt.submittedPromptSource ? { promptSource: activeSubmittedPrompt.submittedPromptSource } : {}),
          ...(activeSubmittedPrompt.submittedPromptSource === "auto_compaction_continue"
            ? { modelFacingUserPromptText: activeSubmittedPrompt.submittedPromptText }
            : {}),
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
          diagnosticLogger: input.diagnosticLogger,
        });
        input.registerActiveConversationTurnSettlement(assistantResponseRelayPromise);
        const assistantResponseRelayResult = await assistantResponseRelayPromise;

        if (!input.isChatAppControllerMountedRef.current) {
          return;
        }

        const autoCompactionResult = await input.autoCompactCurrentConversationSessionAfterAssistantTurn(
          resolveAutoCompactionRequestAfterAssistantTurn({
            terminalAssistantResponseEvent: assistantResponseRelayResult.terminalAssistantResponseEvent,
          }),
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

function shouldUpdateControllerStateForAssistantResponseEvents(input: {
  previousChatSessionState: ChatSessionState;
  assistantResponseEventsApplication: AssistantResponseEventsChatSessionStateApplication;
}): boolean {
  const changeSet = input.assistantResponseEventsApplication.changeSet;
  return changeSet.didConversationMessageOrderChange ||
    changeSet.didPromptComposerStateChange ||
    changeSet.didInteractionStatusStateChange ||
    input.previousChatSessionState.conversationMessagePartCount !==
      input.assistantResponseEventsApplication.nextChatSessionState.conversationMessagePartCount;
}
