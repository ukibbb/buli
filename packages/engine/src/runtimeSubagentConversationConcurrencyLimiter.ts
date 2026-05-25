import type { BuliDiagnosticLogFields, BuliDiagnosticLogger } from "@buli/contracts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";

export const DEFAULT_SUBAGENT_CONVERSATION_CONCURRENCY_LIMIT = 8;

export class RuntimeSubagentConversationConcurrencyLimiter {
  private readonly maximumConcurrentSubagentConversations: number;
  private readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  private activeSubagentConversationCount = 0;
  private readonly pendingSubagentConversationSlotResolvers: Array<() => void> = [];

  constructor(input: {
    maximumConcurrentSubagentConversations?: number;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
  } = {}) {
    const maximumConcurrentSubagentConversations = input.maximumConcurrentSubagentConversations ??
      DEFAULT_SUBAGENT_CONVERSATION_CONCURRENCY_LIMIT;
    if (!Number.isInteger(maximumConcurrentSubagentConversations) || maximumConcurrentSubagentConversations < 1) {
      throw new Error("Subagent conversation concurrency limit must be a positive integer.");
    }

    this.maximumConcurrentSubagentConversations = maximumConcurrentSubagentConversations;
    this.diagnosticLogger = input.diagnosticLogger;
  }

  async *stream<SubagentConversationEvent>(
    streamSubagentConversationEvents: () => AsyncGenerator<SubagentConversationEvent>,
    diagnosticFields?: BuliDiagnosticLogFields,
  ): AsyncGenerator<SubagentConversationEvent> {
    await this.acquireSubagentConversationSlot(diagnosticFields);
    try {
      yield* streamSubagentConversationEvents();
    } finally {
      this.releaseSubagentConversationSlot(diagnosticFields);
    }
  }

  private acquireSubagentConversationSlot(diagnosticFields: BuliDiagnosticLogFields | undefined): Promise<void> {
    if (this.activeSubagentConversationCount < this.maximumConcurrentSubagentConversations) {
      this.activeSubagentConversationCount += 1;
      this.logSubagentConversationLimiterEvent("subagent_conversation_limiter.slot_acquired", {
        ...diagnosticFields,
        waitDurationMs: 0,
      });
      return Promise.resolve();
    }

    const waitStartedAtMs = Date.now();
    return new Promise((resolveSlot) => {
      this.pendingSubagentConversationSlotResolvers.push(() => {
        this.activeSubagentConversationCount += 1;
        this.logSubagentConversationLimiterEvent("subagent_conversation_limiter.slot_acquired", {
          ...diagnosticFields,
          waitDurationMs: Date.now() - waitStartedAtMs,
        });
        resolveSlot();
      });
      this.logSubagentConversationLimiterEvent("subagent_conversation_limiter.slot_wait_started", diagnosticFields);
    });
  }

  private releaseSubagentConversationSlot(diagnosticFields: BuliDiagnosticLogFields | undefined): void {
    this.activeSubagentConversationCount -= 1;
    this.logSubagentConversationLimiterEvent("subagent_conversation_limiter.slot_released", diagnosticFields);
    const resolveNextPendingSubagentConversationSlot = this.pendingSubagentConversationSlotResolvers.shift();
    resolveNextPendingSubagentConversationSlot?.();
  }

  private logSubagentConversationLimiterEvent(
    eventName: string,
    diagnosticFields: BuliDiagnosticLogFields | undefined,
  ): void {
    logEngineDiagnosticEvent(this.diagnosticLogger, eventName, {
      ...diagnosticFields,
      activeSubagentConversationCount: this.activeSubagentConversationCount,
      pendingSubagentConversationCount: this.pendingSubagentConversationSlotResolvers.length,
      maximumConcurrentSubagentConversations: this.maximumConcurrentSubagentConversations,
    });
  }
}
