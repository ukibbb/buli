import type { ProviderStreamEvent } from "@buli/contracts";

export type OpenAiReasoningSummaryTextDelta = {
  itemId: string;
  summaryIndex: number;
  deltaText: string;
};

export class OpenAiReasoningSummaryStreamProjector {
  private readonly readCurrentTimeInMilliseconds: () => number;
  private reasoningStartedAtMs: number | undefined;
  private isReasoningSummaryInProgress = false;
  private reasoningPartSeparatorPending = false;
  private lastReasoningSummaryPartKey: string | undefined;

  constructor(input: { readCurrentTimeInMilliseconds?: (() => number) | undefined } = {}) {
    this.readCurrentTimeInMilliseconds = input.readCurrentTimeInMilliseconds ?? (() => performance.now());
  }

  appendReasoningSummaryTextDelta(input: OpenAiReasoningSummaryTextDelta): ProviderStreamEvent[] {
    const providerEvents: ProviderStreamEvent[] = [];
    if (!this.isReasoningSummaryInProgress) {
      this.reasoningStartedAtMs = this.readCurrentTimeInMilliseconds();
      this.isReasoningSummaryInProgress = true;
      providerEvents.push({ type: "reasoning_summary_started" });
    }

    const reasoningSummaryPartKey = `${input.itemId}:${input.summaryIndex}`;
    if (this.reasoningPartSeparatorPending || (this.lastReasoningSummaryPartKey && this.lastReasoningSummaryPartKey !== reasoningSummaryPartKey)) {
      providerEvents.push({ type: "reasoning_summary_text_chunk", text: "\n\n" });
      this.reasoningPartSeparatorPending = false;
    }
    this.lastReasoningSummaryPartKey = reasoningSummaryPartKey;
    providerEvents.push({ type: "reasoning_summary_text_chunk", text: input.deltaText });
    return providerEvents;
  }

  markReasoningSummaryPartDone(): void {
    this.reasoningPartSeparatorPending = true;
  }

  completeReasoningSummaryBeforeNonReasoningEvent(): ProviderStreamEvent[] {
    if (!this.isReasoningSummaryInProgress || this.reasoningStartedAtMs === undefined) {
      return [];
    }

    const reasoningDurationMs = Math.max(0, Math.round(this.readCurrentTimeInMilliseconds() - this.reasoningStartedAtMs));
    this.reasoningStartedAtMs = undefined;
    this.isReasoningSummaryInProgress = false;
    this.reasoningPartSeparatorPending = false;
    this.lastReasoningSummaryPartKey = undefined;
    return [{ type: "reasoning_summary_completed", reasoningDurationMs }];
  }
}
