import type { BuliDiagnosticLogger } from "@buli/contracts";
import { logOpenAiDiagnosticEvent } from "./diagnostics.ts";
import {
  readOpenAiRateLimitHeaders,
  type OpenAiHttpResponseHeaders,
  type OpenAiRateLimitHeaderSnapshot,
} from "./httpResponseDiagnostics.ts";

export const DEFAULT_OPENAI_MAX_CONCURRENT_RESPONSE_STEP_STREAMS = 8;

export type OpenAiResponseStepStreamSlot = Readonly<{
  release: () => void;
}>;

export class OpenAiRateLimitCoordinator {
  readonly maximumConcurrentResponseStepStreams: number;
  private readonly nowMs: () => number;
  private readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  private currentConcurrentResponseStepStreamLimit: number;
  private activeResponseStepStreamCount = 0;
  private requestCooldownUntilMs = 0;
  private readonly pendingCoordinatorStateChangeResolvers: Array<() => void> = [];

  constructor(input: {
    maximumConcurrentResponseStepStreams?: number | undefined;
    nowMs?: (() => number) | undefined;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
  } = {}) {
    const maximumConcurrentResponseStepStreams = input.maximumConcurrentResponseStepStreams ??
      DEFAULT_OPENAI_MAX_CONCURRENT_RESPONSE_STEP_STREAMS;
    if (!Number.isInteger(maximumConcurrentResponseStepStreams) || maximumConcurrentResponseStepStreams < 1) {
      throw new Error("OpenAI response-step stream concurrency limit must be a positive integer.");
    }

    this.maximumConcurrentResponseStepStreams = maximumConcurrentResponseStepStreams;
    this.currentConcurrentResponseStepStreamLimit = maximumConcurrentResponseStepStreams;
    this.nowMs = input.nowMs ?? Date.now;
    this.diagnosticLogger = input.diagnosticLogger;
  }

  async acquireResponseStepStreamSlot(input: {
    abortSignal?: AbortSignal | undefined;
  } = {}): Promise<OpenAiResponseStepStreamSlot> {
    let didLogWaitStarted = false;
    while (true) {
      throwIfOpenAiRateLimitCoordinatorWaitAborted(input.abortSignal);
      const waitMilliseconds = this.readResponseStepStreamSlotWaitMilliseconds();
      if (waitMilliseconds === 0) {
        this.activeResponseStepStreamCount += 1;
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "rate_limit_coordinator.stream_slot_acquired", {
          activeResponseStepStreamCount: this.activeResponseStepStreamCount,
          currentConcurrentResponseStepStreamLimit: this.currentConcurrentResponseStepStreamLimit,
          maxConcurrentResponseStepStreams: this.maximumConcurrentResponseStepStreams,
        });
        let didReleaseSlot = false;
        return {
          release: () => {
            if (didReleaseSlot) {
              return;
            }

            didReleaseSlot = true;
            this.releaseResponseStepStreamSlot();
          },
        };
      }

      if (!didLogWaitStarted) {
        didLogWaitStarted = true;
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "rate_limit_coordinator.stream_slot_wait_started", {
          activeResponseStepStreamCount: this.activeResponseStepStreamCount,
          currentConcurrentResponseStepStreamLimit: this.currentConcurrentResponseStepStreamLimit,
          maxConcurrentResponseStepStreams: this.maximumConcurrentResponseStepStreams,
          waitMilliseconds: waitMilliseconds ?? null,
        });
      }

      await this.waitForCoordinatorStateChange({ waitMilliseconds, abortSignal: input.abortSignal });
    }
  }

  observeResponseHeaders(
    headers: OpenAiHttpResponseHeaders,
    input: {
      status?: number | undefined;
      wasSuccessfulHttpResponse?: boolean | undefined;
      retryAfterMilliseconds?: number | undefined;
    } = {},
  ): void {
    const rateLimitHeaderSnapshot = readOpenAiRateLimitHeaders(headers);
    let didObserveThrottlingPressure = false;

    if (rateLimitHeaderSnapshot?.requestsRemaining === 0) {
      this.reduceConcurrentResponseStepStreamLimit({ rateLimitHeaderSnapshot });
      this.observeRequestCooldownForExhaustedRequestLimit(rateLimitHeaderSnapshot);
      didObserveThrottlingPressure = true;
    }

    if (rateLimitHeaderSnapshot?.tokensRemaining === 0) {
      if (!didObserveThrottlingPressure) {
        this.reduceConcurrentResponseStepStreamLimit({ rateLimitHeaderSnapshot });
      }
      this.observeRequestCooldownForExhaustedTokenLimit(rateLimitHeaderSnapshot);
      didObserveThrottlingPressure = true;
    }

    if (!didObserveThrottlingPressure && input.status === 429) {
      this.reduceConcurrentResponseStepStreamLimit({ rateLimitHeaderSnapshot });
      didObserveThrottlingPressure = true;
    }

    if (input.retryAfterMilliseconds !== undefined) {
      this.observeRequestCooldownForRetryAfter(input.retryAfterMilliseconds, rateLimitHeaderSnapshot);
      didObserveThrottlingPressure = true;
    }

    if (!rateLimitHeaderSnapshot || didObserveThrottlingPressure) {
      return;
    }

    if (
      input.wasSuccessfulHttpResponse &&
      rateLimitHeaderSnapshot.requestsRemaining !== undefined &&
      rateLimitHeaderSnapshot.requestsRemaining > 0 &&
      rateLimitHeaderSnapshot.tokensRemaining !== 0
    ) {
      this.increaseConcurrentResponseStepStreamLimitAfterSuccessfulResponse(rateLimitHeaderSnapshot);
    }
  }

  private observeRequestCooldownForExhaustedRequestLimit(rateLimitHeaderSnapshot: OpenAiRateLimitHeaderSnapshot): void {
    if (rateLimitHeaderSnapshot.requestsResetAfterMilliseconds === undefined) {
      return;
    }

    const nextRequestCooldownUntilMs = this.nowMs() + rateLimitHeaderSnapshot.requestsResetAfterMilliseconds;
    if (nextRequestCooldownUntilMs <= this.requestCooldownUntilMs) {
      return;
    }

    this.requestCooldownUntilMs = nextRequestCooldownUntilMs;
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "rate_limit_coordinator.request_cooldown_observed", {
      rateLimitRequestsRemaining: rateLimitHeaderSnapshot.requestsRemaining ?? null,
      rateLimitRequestsResetAfterMilliseconds: rateLimitHeaderSnapshot.requestsResetAfterMilliseconds,
      requestCooldownUntilMs: this.requestCooldownUntilMs,
      currentConcurrentResponseStepStreamLimit: this.currentConcurrentResponseStepStreamLimit,
      maxConcurrentResponseStepStreams: this.maximumConcurrentResponseStepStreams,
    });
  }

  private observeRequestCooldownForExhaustedTokenLimit(rateLimitHeaderSnapshot: OpenAiRateLimitHeaderSnapshot): void {
    if (rateLimitHeaderSnapshot.tokensResetAfterMilliseconds === undefined) {
      return;
    }

    const nextRequestCooldownUntilMs = this.nowMs() + rateLimitHeaderSnapshot.tokensResetAfterMilliseconds;
    if (nextRequestCooldownUntilMs <= this.requestCooldownUntilMs) {
      return;
    }

    this.requestCooldownUntilMs = nextRequestCooldownUntilMs;
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "rate_limit_coordinator.token_cooldown_observed", {
      rateLimitTokensRemaining: rateLimitHeaderSnapshot.tokensRemaining ?? null,
      rateLimitTokensResetAfterMilliseconds: rateLimitHeaderSnapshot.tokensResetAfterMilliseconds,
      requestCooldownUntilMs: this.requestCooldownUntilMs,
      currentConcurrentResponseStepStreamLimit: this.currentConcurrentResponseStepStreamLimit,
      maxConcurrentResponseStepStreams: this.maximumConcurrentResponseStepStreams,
    });
  }

  private observeRequestCooldownForRetryAfter(
    retryAfterMilliseconds: number,
    rateLimitHeaderSnapshot: OpenAiRateLimitHeaderSnapshot | undefined,
  ): void {
    const normalizedRetryAfterMilliseconds = Math.max(0, Math.ceil(retryAfterMilliseconds));
    const nextRequestCooldownUntilMs = this.nowMs() + normalizedRetryAfterMilliseconds;
    if (nextRequestCooldownUntilMs <= this.requestCooldownUntilMs) {
      return;
    }

    this.requestCooldownUntilMs = nextRequestCooldownUntilMs;
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "rate_limit_coordinator.retry_after_cooldown_observed", {
      retryAfterMilliseconds: normalizedRetryAfterMilliseconds,
      requestCooldownUntilMs: this.requestCooldownUntilMs,
      currentConcurrentResponseStepStreamLimit: this.currentConcurrentResponseStepStreamLimit,
      maxConcurrentResponseStepStreams: this.maximumConcurrentResponseStepStreams,
      ...(rateLimitHeaderSnapshot?.requestsRemaining !== undefined
        ? { rateLimitRequestsRemaining: rateLimitHeaderSnapshot.requestsRemaining }
        : {}),
      ...(rateLimitHeaderSnapshot?.tokensRemaining !== undefined
        ? { rateLimitTokensRemaining: rateLimitHeaderSnapshot.tokensRemaining }
        : {}),
    });
  }

  private reduceConcurrentResponseStepStreamLimit(input: {
    rateLimitHeaderSnapshot?: OpenAiRateLimitHeaderSnapshot | undefined;
  }): void {
    const previousConcurrentResponseStepStreamLimit = this.currentConcurrentResponseStepStreamLimit;
    const nextConcurrentResponseStepStreamLimit = Math.max(1, Math.floor(previousConcurrentResponseStepStreamLimit / 2));
    if (nextConcurrentResponseStepStreamLimit === previousConcurrentResponseStepStreamLimit) {
      return;
    }

    this.currentConcurrentResponseStepStreamLimit = nextConcurrentResponseStepStreamLimit;
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "rate_limit_coordinator.adaptive_stream_limit_reduced", {
      previousConcurrentResponseStepStreamLimit,
      currentConcurrentResponseStepStreamLimit: this.currentConcurrentResponseStepStreamLimit,
      maxConcurrentResponseStepStreams: this.maximumConcurrentResponseStepStreams,
      ...(input.rateLimitHeaderSnapshot?.requestsRemaining !== undefined
        ? { rateLimitRequestsRemaining: input.rateLimitHeaderSnapshot.requestsRemaining }
        : {}),
      ...(input.rateLimitHeaderSnapshot?.requestsResetAfterMilliseconds !== undefined
        ? { rateLimitRequestsResetAfterMilliseconds: input.rateLimitHeaderSnapshot.requestsResetAfterMilliseconds }
        : {}),
      ...(input.rateLimitHeaderSnapshot?.tokensRemaining !== undefined
        ? { rateLimitTokensRemaining: input.rateLimitHeaderSnapshot.tokensRemaining }
        : {}),
      ...(input.rateLimitHeaderSnapshot?.tokensResetAfterMilliseconds !== undefined
        ? { rateLimitTokensResetAfterMilliseconds: input.rateLimitHeaderSnapshot.tokensResetAfterMilliseconds }
        : {}),
    });
  }

  private increaseConcurrentResponseStepStreamLimitAfterSuccessfulResponse(
    rateLimitHeaderSnapshot: OpenAiRateLimitHeaderSnapshot,
  ): void {
    const previousConcurrentResponseStepStreamLimit = this.currentConcurrentResponseStepStreamLimit;
    const nextConcurrentResponseStepStreamLimit = Math.min(
      this.maximumConcurrentResponseStepStreams,
      previousConcurrentResponseStepStreamLimit + 1,
    );
    if (nextConcurrentResponseStepStreamLimit === previousConcurrentResponseStepStreamLimit) {
      return;
    }

    this.currentConcurrentResponseStepStreamLimit = nextConcurrentResponseStepStreamLimit;
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "rate_limit_coordinator.adaptive_stream_limit_increased", {
      previousConcurrentResponseStepStreamLimit,
      currentConcurrentResponseStepStreamLimit: this.currentConcurrentResponseStepStreamLimit,
      maxConcurrentResponseStepStreams: this.maximumConcurrentResponseStepStreams,
      rateLimitRequestsRemaining: rateLimitHeaderSnapshot.requestsRemaining ?? null,
    });
    this.notifyCoordinatorStateChanged();
  }

  private readResponseStepStreamSlotWaitMilliseconds(): number | undefined {
    const cooldownWaitMilliseconds = Math.max(0, this.requestCooldownUntilMs - this.nowMs());
    if (this.activeResponseStepStreamCount >= this.currentConcurrentResponseStepStreamLimit) {
      return cooldownWaitMilliseconds > 0 ? cooldownWaitMilliseconds : undefined;
    }

    if (cooldownWaitMilliseconds > 0) {
      return cooldownWaitMilliseconds;
    }

    return 0;
  }

  private releaseResponseStepStreamSlot(): void {
    this.activeResponseStepStreamCount = Math.max(0, this.activeResponseStepStreamCount - 1);
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "rate_limit_coordinator.stream_slot_released", {
      activeResponseStepStreamCount: this.activeResponseStepStreamCount,
      currentConcurrentResponseStepStreamLimit: this.currentConcurrentResponseStepStreamLimit,
      maxConcurrentResponseStepStreams: this.maximumConcurrentResponseStepStreams,
    });
    this.notifyCoordinatorStateChanged();
  }

  private waitForCoordinatorStateChange(input: {
    waitMilliseconds?: number | undefined;
    abortSignal?: AbortSignal | undefined;
  }): Promise<void> {
    if (input.waitMilliseconds !== undefined && input.waitMilliseconds <= 0) {
      return Promise.resolve();
    }

    return new Promise<void>((resolveWait, rejectWait) => {
      let didSettle = false;
      let waitTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
      let abortListener: (() => void) | undefined;
      const stateChangeResolver = (): void => settleWait(resolveWait);
      const settleWait = (settle: (value?: void | PromiseLike<void>) => void, value?: Error): void => {
        if (didSettle) {
          return;
        }

        didSettle = true;
        if (waitTimeoutHandle !== undefined) {
          clearTimeout(waitTimeoutHandle);
        }
        if (abortListener) {
          input.abortSignal?.removeEventListener("abort", abortListener);
        }
        const resolverIndex = this.pendingCoordinatorStateChangeResolvers.indexOf(stateChangeResolver);
        if (resolverIndex >= 0) {
          this.pendingCoordinatorStateChangeResolvers.splice(resolverIndex, 1);
        }
        if (value) {
          rejectWait(value);
          return;
        }

        settle();
      };

      abortListener = (): void => {
        settleWait(resolveWait, new Error("OpenAI provider turn interrupted while waiting for an OpenAI response stream slot"));
      };
      this.pendingCoordinatorStateChangeResolvers.push(stateChangeResolver);
      if (input.waitMilliseconds !== undefined) {
        waitTimeoutHandle = setTimeout(stateChangeResolver, input.waitMilliseconds);
      }
      input.abortSignal?.addEventListener("abort", abortListener, { once: true });
      if (input.abortSignal?.aborted) {
        abortListener();
      }
    });
  }

  private notifyCoordinatorStateChanged(): void {
    const stateChangeResolvers = this.pendingCoordinatorStateChangeResolvers.splice(0);
    for (const stateChangeResolver of stateChangeResolvers) {
      stateChangeResolver();
    }
  }
}

function throwIfOpenAiRateLimitCoordinatorWaitAborted(abortSignal: AbortSignal | undefined): void {
  if (!abortSignal?.aborted) {
    return;
  }

  throw new Error("OpenAI provider turn interrupted while waiting for an OpenAI response stream slot");
}
