export const DEFAULT_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT = 4;

export class RuntimeReadOnlyToolCallConcurrencyLimiter {
  private readonly maximumConcurrentReadOnlyToolCalls: number;
  private activeReadOnlyToolCallCount = 0;
  private readonly pendingReadOnlyToolCallSlotResolvers: Array<() => void> = [];

  constructor(input: { maximumConcurrentReadOnlyToolCalls?: number } = {}) {
    const maximumConcurrentReadOnlyToolCalls = input.maximumConcurrentReadOnlyToolCalls ?? DEFAULT_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT;
    if (!Number.isInteger(maximumConcurrentReadOnlyToolCalls) || maximumConcurrentReadOnlyToolCalls < 1) {
      throw new Error("Read-only tool-call concurrency limit must be a positive integer.");
    }

    this.maximumConcurrentReadOnlyToolCalls = maximumConcurrentReadOnlyToolCalls;
  }

  async run<ReadOnlyToolCallResult>(operation: () => Promise<ReadOnlyToolCallResult>): Promise<ReadOnlyToolCallResult> {
    await this.acquireReadOnlyToolCallSlot();
    try {
      return await operation();
    } finally {
      this.releaseReadOnlyToolCallSlot();
    }
  }

  private acquireReadOnlyToolCallSlot(): Promise<void> {
    if (this.activeReadOnlyToolCallCount < this.maximumConcurrentReadOnlyToolCalls) {
      this.activeReadOnlyToolCallCount += 1;
      return Promise.resolve();
    }

    return new Promise((resolveSlot) => {
      this.pendingReadOnlyToolCallSlotResolvers.push(() => {
        this.activeReadOnlyToolCallCount += 1;
        resolveSlot();
      });
    });
  }

  private releaseReadOnlyToolCallSlot(): void {
    this.activeReadOnlyToolCallCount -= 1;
    const resolveNextPendingReadOnlyToolCallSlot = this.pendingReadOnlyToolCallSlotResolvers.shift();
    resolveNextPendingReadOnlyToolCallSlot?.();
  }
}
