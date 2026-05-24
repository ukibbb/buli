export const DEFAULT_SUBAGENT_CONVERSATION_CONCURRENCY_LIMIT = 2;

export class RuntimeSubagentConversationConcurrencyLimiter {
  private readonly maximumConcurrentSubagentConversations: number;
  private activeSubagentConversationCount = 0;
  private readonly pendingSubagentConversationSlotResolvers: Array<() => void> = [];

  constructor(input: { maximumConcurrentSubagentConversations?: number } = {}) {
    const maximumConcurrentSubagentConversations = input.maximumConcurrentSubagentConversations ??
      DEFAULT_SUBAGENT_CONVERSATION_CONCURRENCY_LIMIT;
    if (!Number.isInteger(maximumConcurrentSubagentConversations) || maximumConcurrentSubagentConversations < 1) {
      throw new Error("Subagent conversation concurrency limit must be a positive integer.");
    }

    this.maximumConcurrentSubagentConversations = maximumConcurrentSubagentConversations;
  }

  async *stream<SubagentConversationEvent>(
    streamSubagentConversationEvents: () => AsyncGenerator<SubagentConversationEvent>,
  ): AsyncGenerator<SubagentConversationEvent> {
    await this.acquireSubagentConversationSlot();
    try {
      yield* streamSubagentConversationEvents();
    } finally {
      this.releaseSubagentConversationSlot();
    }
  }

  private acquireSubagentConversationSlot(): Promise<void> {
    if (this.activeSubagentConversationCount < this.maximumConcurrentSubagentConversations) {
      this.activeSubagentConversationCount += 1;
      return Promise.resolve();
    }

    return new Promise((resolveSlot) => {
      this.pendingSubagentConversationSlotResolvers.push(() => {
        this.activeSubagentConversationCount += 1;
        resolveSlot();
      });
    });
  }

  private releaseSubagentConversationSlot(): void {
    this.activeSubagentConversationCount -= 1;
    const resolveNextPendingSubagentConversationSlot = this.pendingSubagentConversationSlotResolvers.shift();
    resolveNextPendingSubagentConversationSlot?.();
  }
}
