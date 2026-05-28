import { availableParallelism } from "node:os";
import type { BuliDiagnosticLogFields, BuliDiagnosticLogger } from "@buli/contracts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";

export const MINIMUM_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT = 16;
export const MAXIMUM_DEFAULT_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT = 32;
export const DEFAULT_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT = Math.max(
  MINIMUM_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT,
  Math.min(MAXIMUM_DEFAULT_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT, availableParallelism() * 4),
);

export type RuntimeReadOnlyToolCallConcurrencyCategory = "read" | "search" | "knowledge";

type PendingReadOnlyToolCallSlotRequest = {
  readonly category: RuntimeReadOnlyToolCallConcurrencyCategory;
  readonly diagnosticFields: BuliDiagnosticLogFields | undefined;
  readonly waitStartedAtMs: number;
  readonly resolveSlot: () => void;
};

type ReadOnlyToolCallConcurrencyLimitByCategory = Readonly<Record<RuntimeReadOnlyToolCallConcurrencyCategory, number>>;
type ActiveReadOnlyToolCallCountByCategory = Record<RuntimeReadOnlyToolCallConcurrencyCategory, number>;

export class RuntimeReadOnlyToolCallConcurrencyLimiter {
  private readonly maximumConcurrentReadOnlyToolCalls: number;
  private readonly maximumConcurrentReadOnlyToolCallsByCategory: ReadOnlyToolCallConcurrencyLimitByCategory;
  private readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  private activeReadOnlyToolCallCount = 0;
  private readonly activeReadOnlyToolCallCountByCategory: ActiveReadOnlyToolCallCountByCategory = {
    read: 0,
    search: 0,
    knowledge: 0,
  };
  private readonly pendingReadOnlyToolCallSlotRequests: PendingReadOnlyToolCallSlotRequest[] = [];

  constructor(input: {
    maximumConcurrentReadOnlyToolCalls?: number;
    maximumConcurrentReadToolCalls?: number;
    maximumConcurrentSearchToolCalls?: number;
    maximumConcurrentKnowledgeToolCalls?: number;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
  } = {}) {
    const maximumConcurrentReadOnlyToolCalls = input.maximumConcurrentReadOnlyToolCalls ?? DEFAULT_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT;
    validateReadOnlyToolCallConcurrencyLimit(maximumConcurrentReadOnlyToolCalls, "Read-only tool-call concurrency limit");

    const maximumConcurrentReadOnlyToolCallsByCategory: ReadOnlyToolCallConcurrencyLimitByCategory = {
      read: input.maximumConcurrentReadToolCalls ?? maximumConcurrentReadOnlyToolCalls,
      search: input.maximumConcurrentSearchToolCalls ?? createDefaultMaximumConcurrentSearchToolCalls(maximumConcurrentReadOnlyToolCalls),
      knowledge: input.maximumConcurrentKnowledgeToolCalls ?? createDefaultMaximumConcurrentKnowledgeToolCalls(maximumConcurrentReadOnlyToolCalls),
    };
    validateReadOnlyToolCallConcurrencyLimit(
      maximumConcurrentReadOnlyToolCallsByCategory.read,
      "Read tool-call concurrency limit",
    );
    validateReadOnlyToolCallConcurrencyLimit(
      maximumConcurrentReadOnlyToolCallsByCategory.search,
      "Search tool-call concurrency limit",
    );
    validateReadOnlyToolCallConcurrencyLimit(
      maximumConcurrentReadOnlyToolCallsByCategory.knowledge,
      "Knowledge tool-call concurrency limit",
    );

    this.maximumConcurrentReadOnlyToolCalls = maximumConcurrentReadOnlyToolCalls;
    this.maximumConcurrentReadOnlyToolCallsByCategory = maximumConcurrentReadOnlyToolCallsByCategory;
    this.diagnosticLogger = input.diagnosticLogger;
  }

  async run<ReadOnlyToolCallResult>(
    operation: () => Promise<ReadOnlyToolCallResult>,
    diagnosticFields?: BuliDiagnosticLogFields,
    concurrencyCategory?: RuntimeReadOnlyToolCallConcurrencyCategory,
  ): Promise<ReadOnlyToolCallResult> {
    const resolvedConcurrencyCategory = concurrencyCategory ?? inferReadOnlyToolCallConcurrencyCategory(diagnosticFields);
    await this.acquireReadOnlyToolCallSlot(resolvedConcurrencyCategory, diagnosticFields);
    try {
      return await operation();
    } finally {
      this.releaseReadOnlyToolCallSlot(resolvedConcurrencyCategory, diagnosticFields);
    }
  }

  private acquireReadOnlyToolCallSlot(
    category: RuntimeReadOnlyToolCallConcurrencyCategory,
    diagnosticFields: BuliDiagnosticLogFields | undefined,
  ): Promise<void> {
    if (this.canAcquireReadOnlyToolCallSlot(category)) {
      this.acquireAvailableReadOnlyToolCallSlot(category, diagnosticFields, 0);
      return Promise.resolve();
    }

    return new Promise<void>((resolveSlot) => {
      this.pendingReadOnlyToolCallSlotRequests.push({
        category,
        diagnosticFields,
        waitStartedAtMs: Date.now(),
        resolveSlot,
      });
      this.logReadOnlyToolCallLimiterEvent("read_only_tool_call_limiter.slot_wait_started", category, diagnosticFields);
    });
  }

  private releaseReadOnlyToolCallSlot(
    category: RuntimeReadOnlyToolCallConcurrencyCategory,
    diagnosticFields: BuliDiagnosticLogFields | undefined,
  ): void {
    this.activeReadOnlyToolCallCount -= 1;
    this.activeReadOnlyToolCallCountByCategory[category] -= 1;
    this.logReadOnlyToolCallLimiterEvent("read_only_tool_call_limiter.slot_released", category, diagnosticFields);
    this.acquireRunnablePendingReadOnlyToolCallSlots();
  }

  private acquireRunnablePendingReadOnlyToolCallSlots(): void {
    while (this.activeReadOnlyToolCallCount < this.maximumConcurrentReadOnlyToolCalls) {
      const runnableRequestIndex = this.pendingReadOnlyToolCallSlotRequests.findIndex((pendingRequest) =>
        this.canAcquireReadOnlyToolCallSlot(pendingRequest.category)
      );
      if (runnableRequestIndex === -1) {
        return;
      }

      const [pendingRequest] = this.pendingReadOnlyToolCallSlotRequests.splice(runnableRequestIndex, 1);
      if (!pendingRequest) {
        return;
      }

      this.acquireAvailableReadOnlyToolCallSlot(
        pendingRequest.category,
        pendingRequest.diagnosticFields,
        Date.now() - pendingRequest.waitStartedAtMs,
      );
      pendingRequest.resolveSlot();
    }
  }

  private canAcquireReadOnlyToolCallSlot(category: RuntimeReadOnlyToolCallConcurrencyCategory): boolean {
    return this.activeReadOnlyToolCallCount < this.maximumConcurrentReadOnlyToolCalls &&
      this.activeReadOnlyToolCallCountByCategory[category] < this.maximumConcurrentReadOnlyToolCallsByCategory[category];
  }

  private acquireAvailableReadOnlyToolCallSlot(
    category: RuntimeReadOnlyToolCallConcurrencyCategory,
    diagnosticFields: BuliDiagnosticLogFields | undefined,
    waitDurationMs: number,
  ): void {
    this.activeReadOnlyToolCallCount += 1;
    this.activeReadOnlyToolCallCountByCategory[category] += 1;
    this.logReadOnlyToolCallLimiterEvent("read_only_tool_call_limiter.slot_acquired", category, {
      ...diagnosticFields,
      waitDurationMs,
    });
  }

  private logReadOnlyToolCallLimiterEvent(
    eventName: string,
    category: RuntimeReadOnlyToolCallConcurrencyCategory,
    diagnosticFields: BuliDiagnosticLogFields | undefined,
  ): void {
    logEngineDiagnosticEvent(this.diagnosticLogger, eventName, {
      ...diagnosticFields,
      readOnlyToolCallConcurrencyCategory: category,
      activeReadOnlyToolCallCount: this.activeReadOnlyToolCallCount,
      pendingReadOnlyToolCallCount: this.pendingReadOnlyToolCallSlotRequests.length,
      maximumConcurrentReadOnlyToolCalls: this.maximumConcurrentReadOnlyToolCalls,
      activeReadToolCallCount: this.activeReadOnlyToolCallCountByCategory.read,
      pendingReadToolCallCount: this.countPendingReadOnlyToolCallSlotsByCategory("read"),
      maximumConcurrentReadToolCalls: this.maximumConcurrentReadOnlyToolCallsByCategory.read,
      activeSearchToolCallCount: this.activeReadOnlyToolCallCountByCategory.search,
      pendingSearchToolCallCount: this.countPendingReadOnlyToolCallSlotsByCategory("search"),
      maximumConcurrentSearchToolCalls: this.maximumConcurrentReadOnlyToolCallsByCategory.search,
      activeKnowledgeToolCallCount: this.activeReadOnlyToolCallCountByCategory.knowledge,
      pendingKnowledgeToolCallCount: this.countPendingReadOnlyToolCallSlotsByCategory("knowledge"),
      maximumConcurrentKnowledgeToolCalls: this.maximumConcurrentReadOnlyToolCallsByCategory.knowledge,
    });
  }

  private countPendingReadOnlyToolCallSlotsByCategory(category: RuntimeReadOnlyToolCallConcurrencyCategory): number {
    return this.pendingReadOnlyToolCallSlotRequests.filter((pendingRequest) => pendingRequest.category === category).length;
  }
}

function validateReadOnlyToolCallConcurrencyLimit(limit: number, description: string): void {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`${description} must be a positive integer.`);
  }
}

function createDefaultMaximumConcurrentSearchToolCalls(maximumConcurrentReadOnlyToolCalls: number): number {
  return Math.min(maximumConcurrentReadOnlyToolCalls, Math.max(2, Math.floor(maximumConcurrentReadOnlyToolCalls / 4)));
}

function createDefaultMaximumConcurrentKnowledgeToolCalls(maximumConcurrentReadOnlyToolCalls: number): number {
  return Math.min(maximumConcurrentReadOnlyToolCalls, Math.max(2, Math.floor(maximumConcurrentReadOnlyToolCalls / 2)));
}

function inferReadOnlyToolCallConcurrencyCategory(
  diagnosticFields: BuliDiagnosticLogFields | undefined,
): RuntimeReadOnlyToolCallConcurrencyCategory {
  const toolName = diagnosticFields?.["toolName"];
  if (toolName === "locate_codebase_symbols") {
    return "knowledge";
  }

  if (toolName === "glob" || toolName === "grep") {
    return "search";
  }

  return "read";
}
