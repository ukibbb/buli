import { availableParallelism } from "node:os";
import type { BuliDiagnosticLogFields, BuliDiagnosticLogger } from "@buli/contracts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";

export const MINIMUM_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT = 16;
export const MAXIMUM_DEFAULT_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT = 32;
export const DEFAULT_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT = Math.max(
  MINIMUM_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT,
  Math.min(MAXIMUM_DEFAULT_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT, availableParallelism() * 4),
);

export class RuntimeReadOnlyToolCallConcurrencyLimiter {
  private readonly maximumConcurrentReadOnlyToolCalls: number;
  private readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  private activeReadOnlyToolCallCount = 0;
  private readonly pendingReadOnlyToolCallSlotResolvers: Array<() => void> = [];

  constructor(input: {
    maximumConcurrentReadOnlyToolCalls?: number;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
  } = {}) {
    const maximumConcurrentReadOnlyToolCalls = input.maximumConcurrentReadOnlyToolCalls ?? DEFAULT_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT;
    if (!Number.isInteger(maximumConcurrentReadOnlyToolCalls) || maximumConcurrentReadOnlyToolCalls < 1) {
      throw new Error("Read-only tool-call concurrency limit must be a positive integer.");
    }

    this.maximumConcurrentReadOnlyToolCalls = maximumConcurrentReadOnlyToolCalls;
    this.diagnosticLogger = input.diagnosticLogger;
  }

  async run<ReadOnlyToolCallResult>(
    operation: () => Promise<ReadOnlyToolCallResult>,
    diagnosticFields?: BuliDiagnosticLogFields,
  ): Promise<ReadOnlyToolCallResult> {
    await this.acquireReadOnlyToolCallSlot(diagnosticFields);
    try {
      return await operation();
    } finally {
      this.releaseReadOnlyToolCallSlot(diagnosticFields);
    }
  }

  private acquireReadOnlyToolCallSlot(diagnosticFields: BuliDiagnosticLogFields | undefined): Promise<void> {
    if (this.activeReadOnlyToolCallCount < this.maximumConcurrentReadOnlyToolCalls) {
      this.activeReadOnlyToolCallCount += 1;
      this.logReadOnlyToolCallLimiterEvent("read_only_tool_call_limiter.slot_acquired", {
        ...diagnosticFields,
        waitDurationMs: 0,
      });
      return Promise.resolve();
    }

    const waitStartedAtMs = Date.now();
    return new Promise((resolveSlot) => {
      this.pendingReadOnlyToolCallSlotResolvers.push(() => {
        this.activeReadOnlyToolCallCount += 1;
        this.logReadOnlyToolCallLimiterEvent("read_only_tool_call_limiter.slot_acquired", {
          ...diagnosticFields,
          waitDurationMs: Date.now() - waitStartedAtMs,
        });
        resolveSlot();
      });
      this.logReadOnlyToolCallLimiterEvent("read_only_tool_call_limiter.slot_wait_started", diagnosticFields);
    });
  }

  private releaseReadOnlyToolCallSlot(diagnosticFields: BuliDiagnosticLogFields | undefined): void {
    this.activeReadOnlyToolCallCount -= 1;
    this.logReadOnlyToolCallLimiterEvent("read_only_tool_call_limiter.slot_released", diagnosticFields);
    const resolveNextPendingReadOnlyToolCallSlot = this.pendingReadOnlyToolCallSlotResolvers.shift();
    resolveNextPendingReadOnlyToolCallSlot?.();
  }

  private logReadOnlyToolCallLimiterEvent(
    eventName: string,
    diagnosticFields: BuliDiagnosticLogFields | undefined,
  ): void {
    logEngineDiagnosticEvent(this.diagnosticLogger, eventName, {
      ...diagnosticFields,
      activeReadOnlyToolCallCount: this.activeReadOnlyToolCallCount,
      pendingReadOnlyToolCallCount: this.pendingReadOnlyToolCallSlotResolvers.length,
      maximumConcurrentReadOnlyToolCalls: this.maximumConcurrentReadOnlyToolCalls,
    });
  }
}
