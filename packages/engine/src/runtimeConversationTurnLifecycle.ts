import type { BuliDiagnosticLogger } from "@buli/contracts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";

export const USER_INTERRUPTED_CONVERSATION_TURN_REASON = "Interrupted by user.";

export class RuntimeConversationTurnLifecycle {
  private readonly conversationTurnId: string;
  private readonly selectedModelId: string;
  private readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  private readonly onConversationTurnFinished: () => void;
  private readonly hasPendingToolApproval: () => boolean;
  private readonly resolvePendingToolApprovalAsInterrupted: () => void;
  private readonly abortController = new AbortController();
  private hasStartedStreamingAssistantResponseEvents = false;
  private hasFinishedConversationTurn = false;
  private hasInterruptedConversationTurn = false;

  constructor(input: {
    conversationTurnId: string;
    selectedModelId: string;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
    onConversationTurnFinished: () => void;
    hasPendingToolApproval: () => boolean;
    resolvePendingToolApprovalAsInterrupted: () => void;
  }) {
    this.conversationTurnId = input.conversationTurnId;
    this.selectedModelId = input.selectedModelId;
    this.diagnosticLogger = input.diagnosticLogger;
    this.onConversationTurnFinished = input.onConversationTurnFinished;
    this.hasPendingToolApproval = input.hasPendingToolApproval;
    this.resolvePendingToolApprovalAsInterrupted = input.resolvePendingToolApprovalAsInterrupted;
  }

  get abortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  hasFinishedTurn(): boolean {
    return this.hasFinishedConversationTurn;
  }

  hasInterruptedTurn(): boolean {
    return this.hasInterruptedConversationTurn;
  }

  markAssistantResponseEventStreamStarted(): void {
    if (this.hasStartedStreamingAssistantResponseEvents) {
      throw new Error("Conversation turn events can only be streamed once");
    }

    this.hasStartedStreamingAssistantResponseEvents = true;
  }

  interrupt(): void {
    if (this.hasFinishedConversationTurn || this.hasInterruptedConversationTurn) {
      return;
    }

    this.hasInterruptedConversationTurn = true;
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.interrupt_requested", {
      conversationTurnId: this.conversationTurnId,
      selectedModelId: this.selectedModelId,
      hasPendingToolApproval: this.hasPendingToolApproval(),
    });
    this.resolvePendingToolApprovalAsInterrupted();
    this.abortController.abort();
  }

  finish(input: { conversationTurnStartedAtMilliseconds: number }): void {
    if (this.hasFinishedConversationTurn) {
      return;
    }

    this.hasFinishedConversationTurn = true;
    this.onConversationTurnFinished();
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_turn.finished", {
      conversationTurnId: this.conversationTurnId,
      selectedModelId: this.selectedModelId,
      turnDurationMs: Date.now() - input.conversationTurnStartedAtMilliseconds,
    });
  }

  throwIfInterrupted(): void {
    if (this.hasInterruptedConversationTurn || this.abortController.signal.aborted) {
      throw new Error(USER_INTERRUPTED_CONVERSATION_TURN_REASON);
    }
  }
}
