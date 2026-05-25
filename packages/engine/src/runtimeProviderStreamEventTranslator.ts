import { randomUUID } from "node:crypto";
import {
  AssistantMessageCompletedEventSchema,
  AssistantMessageIncompleteEventSchema,
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantPlanProposalConversationMessagePartSchema,
  AssistantRateLimitNoticeConversationMessagePartSchema,
  AssistantReasoningConversationMessagePartSchema,
  AssistantTurnSummaryConversationMessagePartSchema,
  type AssistantOperatingMode,
  type AssistantTurnSummaryConversationMessagePart,
  type AssistantTextPartStatus,
  type AssistantSegmentConversationSessionEntry,
  type AssistantMessageConversationSessionEntry,
  type AssistantResponseEvent,
  type ProviderPlanProposedEvent,
  type ProviderRetryPendingReason,
  type ProviderStreamEvent,
  type ProviderToolCallRequestedEvent,
  type ProviderToolCallsRequestedEvent,
  type ProviderTurnReplay,
  type TokenUsage,
} from "@buli/contracts";
import {
  appendAssistantTextDeltaToAssistantTextMessagePartBuilder,
  buildAssistantTextConversationMessagePartWithStatus,
  buildStreamingAssistantTextConversationMessagePart,
  createInitialAssistantTextMessagePartBuilder,
  readAssistantTextMessagePartBuilderRawMarkdownText,
  type AssistantTextMessagePartBuilderState,
} from "./assistantTextMessagePartBuilder.ts";

export type RuntimeProviderStreamAssistantEventsTranslation = {
  translationKind: "assistant_response_events";
  assistantResponseEvents: readonly AssistantResponseEvent[];
  assistantSegmentSessionEntries?: readonly AssistantSegmentConversationSessionEntry[];
};

export type RuntimeProviderStreamToolCallRequestedTranslation = {
  translationKind: "tool_call_requested";
  providerToolCallRequestedEvent: ProviderToolCallRequestedEvent;
  assistantResponseEventsBeforeToolCall?: readonly AssistantResponseEvent[];
  assistantSegmentSessionEntriesBeforeToolCall?: readonly AssistantSegmentConversationSessionEntry[];
};

export type RuntimeProviderStreamToolCallsRequestedTranslation = {
  translationKind: "tool_calls_requested";
  providerToolCallsRequestedEvent: ProviderToolCallsRequestedEvent;
  assistantResponseEventsBeforeToolCall?: readonly AssistantResponseEvent[];
  assistantSegmentSessionEntriesBeforeToolCall?: readonly AssistantSegmentConversationSessionEntry[];
};

export type RuntimeProviderStreamTerminalAssistantResponseTranslation = {
  translationKind: "terminal_assistant_response";
  assistantResponseEventsBeforeTerminalSessionEntry: readonly AssistantResponseEvent[];
  assistantSegmentSessionEntriesBeforeTerminalSessionEntry?: readonly AssistantSegmentConversationSessionEntry[];
  terminalAssistantMessageSessionEntry: AssistantMessageConversationSessionEntry;
  terminalAssistantResponseEvent: AssistantResponseEvent;
};

export type RuntimeProviderStreamEventTranslation =
  | RuntimeProviderStreamAssistantEventsTranslation
  | RuntimeProviderStreamToolCallRequestedTranslation
  | RuntimeProviderStreamToolCallsRequestedTranslation
  | RuntimeProviderStreamTerminalAssistantResponseTranslation;

export type RuntimeAssistantTextSegmentFlush = {
  assistantResponseEvents: readonly AssistantResponseEvent[];
  assistantSegmentSessionEntries?: readonly AssistantSegmentConversationSessionEntry[];
};

type RuntimeProviderStreamEventTranslatorInput = {
  assistantResponseMessageId: string;
  assistantTextPartId: string;
  conversationTurnStartedAtMilliseconds: number;
  assistantOperatingMode: AssistantOperatingMode;
  selectedModelId: string;
  createConversationMessagePartId?: (() => string) | undefined;
  readCurrentTimeInMilliseconds?: (() => number) | undefined;
};

const streamedAssistantTextUpdateChunkThreshold = 12;
const streamedAssistantTextUpdateCharacterThreshold = 96;
const streamedReasoningSummaryUpdateChunkThreshold = 1;
const streamedReasoningSummaryUpdateCharacterThreshold = 96;

export class RuntimeProviderStreamEventTranslator {
  readonly assistantResponseMessageId: string;
  readonly conversationTurnStartedAtMilliseconds: number;
  readonly assistantOperatingMode: AssistantOperatingMode;
  readonly selectedModelId: string;
  readonly createConversationMessagePartId: () => string;
  readonly readCurrentTimeInMilliseconds: () => number;
  private nextAssistantTextPartId: string | undefined;
  private currentAssistantTextMessagePartBuilderState: AssistantTextMessagePartBuilderState | undefined;
  private hasEmittedCurrentAssistantTextMessagePart = false;
  private pendingCurrentAssistantTextPartUpdateChunkCount = 0;
  private pendingCurrentAssistantTextPartUpdateCharacterCount = 0;
  private completedAssistantText = "";
  private hasObservedToolCallBoundary = false;
  private hasObservedAssistantSegmentBoundary = false;
  private currentReasoningPartId: string | undefined;
  private currentReasoningSummaryText = "";
  private currentReasoningStartedAtMs: number | undefined;
  private pendingReasoningSummaryUpdateChunkCount = 0;
  private pendingReasoningSummaryUpdateCharacterCount = 0;

  constructor(input: RuntimeProviderStreamEventTranslatorInput) {
    this.assistantResponseMessageId = input.assistantResponseMessageId;
    this.conversationTurnStartedAtMilliseconds = input.conversationTurnStartedAtMilliseconds;
    this.assistantOperatingMode = input.assistantOperatingMode;
    this.selectedModelId = input.selectedModelId;
    this.createConversationMessagePartId = input.createConversationMessagePartId ?? randomUUID;
    this.readCurrentTimeInMilliseconds = input.readCurrentTimeInMilliseconds ?? Date.now;
    this.nextAssistantTextPartId = input.assistantTextPartId;
  }

  get assistantMessageText(): string {
    return this.completedAssistantText + (this.currentAssistantTextMessagePartBuilderState
      ? readAssistantTextMessagePartBuilderRawMarkdownText(this.currentAssistantTextMessagePartBuilderState)
      : "");
  }

  translateProviderStreamEvent(input: {
    providerStreamEvent: ProviderStreamEvent;
    providerTurnReplay?: ProviderTurnReplay | undefined;
  }): RuntimeProviderStreamEventTranslation {
    if (input.providerStreamEvent.type === "reasoning_summary_started") {
      return this.translateReasoningSummaryStartedProviderStreamEvent();
    }

    if (input.providerStreamEvent.type === "reasoning_summary_text_chunk") {
      return this.translateReasoningSummaryTextChunkProviderStreamEvent(input.providerStreamEvent.text);
    }

    if (input.providerStreamEvent.type === "reasoning_summary_completed") {
      return this.translateReasoningSummaryCompletedProviderStreamEvent(input.providerStreamEvent.reasoningDurationMs);
    }

    if (input.providerStreamEvent.type === "text_chunk") {
      return this.translateTextChunkProviderStreamEvent(input.providerStreamEvent.text);
    }

    if (input.providerStreamEvent.type === "tool_call_requested") {
      this.hasObservedToolCallBoundary = true;
      const assistantSegmentFlush = this.flushCurrentAssistantTextSegmentForBoundary({
        partStatus: "completed",
        shouldEmitPartUpdatedEvent: true,
        shouldRecordSessionEntry: true,
      });
      return {
        translationKind: "tool_call_requested",
        providerToolCallRequestedEvent: input.providerStreamEvent,
        ...(assistantSegmentFlush && assistantSegmentFlush.assistantResponseEvents.length > 0
          ? { assistantResponseEventsBeforeToolCall: assistantSegmentFlush.assistantResponseEvents }
          : {}),
        ...(assistantSegmentFlush?.assistantSegmentSessionEntries && assistantSegmentFlush.assistantSegmentSessionEntries.length > 0
          ? { assistantSegmentSessionEntriesBeforeToolCall: assistantSegmentFlush.assistantSegmentSessionEntries }
          : {}),
      };
    }

    if (input.providerStreamEvent.type === "tool_calls_requested") {
      this.hasObservedToolCallBoundary = true;
      const assistantSegmentFlush = this.flushCurrentAssistantTextSegmentForBoundary({
        partStatus: "completed",
        shouldEmitPartUpdatedEvent: true,
        shouldRecordSessionEntry: true,
      });
      return {
        translationKind: "tool_calls_requested",
        providerToolCallsRequestedEvent: input.providerStreamEvent,
        ...(assistantSegmentFlush && assistantSegmentFlush.assistantResponseEvents.length > 0
          ? { assistantResponseEventsBeforeToolCall: assistantSegmentFlush.assistantResponseEvents }
          : {}),
        ...(assistantSegmentFlush?.assistantSegmentSessionEntries && assistantSegmentFlush.assistantSegmentSessionEntries.length > 0
          ? { assistantSegmentSessionEntriesBeforeToolCall: assistantSegmentFlush.assistantSegmentSessionEntries }
          : {}),
      };
    }

    if (input.providerStreamEvent.type === "rate_limit_pending") {
      return this.translateRateLimitPendingProviderStreamEvent({
        retryAfterSeconds: input.providerStreamEvent.retryAfterSeconds,
        retryWaitStartedAtMs: input.providerStreamEvent.retryWaitStartedAtMs,
        retryReason: input.providerStreamEvent.retryReason,
        limitExplanation: input.providerStreamEvent.limitExplanation,
      });
    }

    if (input.providerStreamEvent.type === "plan_proposed") {
      return this.translatePlanProposedProviderStreamEvent({
        planId: input.providerStreamEvent.planId,
        planTitle: input.providerStreamEvent.planTitle,
        planSteps: input.providerStreamEvent.planSteps,
      });
    }

    if (input.providerStreamEvent.type === "incomplete") {
      return this.translateIncompleteProviderStreamEvent({
        incompleteReason: input.providerStreamEvent.incompleteReason,
        usage: input.providerStreamEvent.usage,
        contextWindowUsage: input.providerStreamEvent.contextWindowUsage,
        providerTurnReplay: input.providerTurnReplay,
      });
    }

    return this.translateCompletedProviderStreamEvent({
      usage: input.providerStreamEvent.usage,
      contextWindowUsage: input.providerStreamEvent.contextWindowUsage,
      providerTurnReplay: input.providerTurnReplay,
    });
  }

  private translateReasoningSummaryStartedProviderStreamEvent(): RuntimeProviderStreamAssistantEventsTranslation {
    this.currentReasoningPartId = this.createConversationMessagePartId();
    this.currentReasoningSummaryText = "";
    this.currentReasoningStartedAtMs = this.readCurrentTimeInMilliseconds();
    this.resetBufferedReasoningSummaryTextUpdate();

    return {
      translationKind: "assistant_response_events",
      assistantResponseEvents: [
        AssistantMessagePartAddedEventSchema.parse({
          type: "assistant_message_part_added",
          messageId: this.assistantResponseMessageId,
          part: AssistantReasoningConversationMessagePartSchema.parse({
            id: this.currentReasoningPartId,
            partKind: "assistant_reasoning",
            partStatus: "streaming",
            reasoningSummaryText: "",
            reasoningStartedAtMs: this.currentReasoningStartedAtMs,
          }),
        }),
      ],
    };
  }

  private translateReasoningSummaryTextChunkProviderStreamEvent(
    reasoningSummaryTextChunk: string,
  ): RuntimeProviderStreamAssistantEventsTranslation {
    if (!this.currentReasoningPartId || this.currentReasoningStartedAtMs === undefined) {
      return { translationKind: "assistant_response_events", assistantResponseEvents: [] };
    }

    const isFirstReasoningSummaryTextChunk = this.currentReasoningSummaryText.length === 0;
    this.currentReasoningSummaryText += reasoningSummaryTextChunk;
    this.pendingReasoningSummaryUpdateChunkCount += 1;
    this.pendingReasoningSummaryUpdateCharacterCount += reasoningSummaryTextChunk.length;
    if (!isFirstReasoningSummaryTextChunk && !this.shouldEmitBufferedReasoningSummaryTextUpdate()) {
      return { translationKind: "assistant_response_events", assistantResponseEvents: [] };
    }

    this.resetBufferedReasoningSummaryTextUpdate();
    return {
      translationKind: "assistant_response_events",
      assistantResponseEvents: [
        AssistantMessagePartUpdatedEventSchema.parse({
          type: "assistant_message_part_updated",
          messageId: this.assistantResponseMessageId,
          part: AssistantReasoningConversationMessagePartSchema.parse({
            id: this.currentReasoningPartId,
            partKind: "assistant_reasoning",
            partStatus: "streaming",
            reasoningSummaryText: this.currentReasoningSummaryText,
            reasoningStartedAtMs: this.currentReasoningStartedAtMs,
          }),
        }),
      ],
    };
  }

  private translateReasoningSummaryCompletedProviderStreamEvent(
    reasoningDurationMs: number,
  ): RuntimeProviderStreamAssistantEventsTranslation {
    if (!this.currentReasoningPartId || this.currentReasoningStartedAtMs === undefined) {
      return { translationKind: "assistant_response_events", assistantResponseEvents: [] };
    }

    const assistantResponseEvents = [
      AssistantMessagePartUpdatedEventSchema.parse({
        type: "assistant_message_part_updated",
        messageId: this.assistantResponseMessageId,
        part: AssistantReasoningConversationMessagePartSchema.parse({
          id: this.currentReasoningPartId,
          partKind: "assistant_reasoning",
          partStatus: "completed",
          reasoningSummaryText: this.currentReasoningSummaryText,
          reasoningStartedAtMs: this.currentReasoningStartedAtMs,
          reasoningDurationMs,
        }),
      }),
    ];

    this.clearCurrentReasoningSummaryState();
    return { translationKind: "assistant_response_events", assistantResponseEvents };
  }

  private clearCurrentReasoningSummaryState(): void {
    this.currentReasoningPartId = undefined;
    this.currentReasoningStartedAtMs = undefined;
    this.currentReasoningSummaryText = "";
    this.resetBufferedReasoningSummaryTextUpdate();
  }

  private resetBufferedReasoningSummaryTextUpdate(): void {
    this.pendingReasoningSummaryUpdateChunkCount = 0;
    this.pendingReasoningSummaryUpdateCharacterCount = 0;
  }

  private shouldEmitBufferedReasoningSummaryTextUpdate(): boolean {
    return this.pendingReasoningSummaryUpdateChunkCount >= streamedReasoningSummaryUpdateChunkThreshold ||
      this.pendingReasoningSummaryUpdateCharacterCount >= streamedReasoningSummaryUpdateCharacterThreshold;
  }

  private translateTextChunkProviderStreamEvent(assistantTextDelta: string): RuntimeProviderStreamAssistantEventsTranslation {
    return {
      translationKind: "assistant_response_events",
      assistantResponseEvents: this.appendPlainTextToCurrentAssistantTextPart(assistantTextDelta),
    };
  }

  private appendPlainTextToCurrentAssistantTextPart(assistantTextDelta: string): AssistantResponseEvent[] {
    if (assistantTextDelta.length === 0) {
      return [];
    }

    const currentAssistantTextMessagePartBuilderState = this.ensureCurrentAssistantTextMessagePartBuilder();
    this.currentAssistantTextMessagePartBuilderState = appendAssistantTextDeltaToAssistantTextMessagePartBuilder(
      currentAssistantTextMessagePartBuilderState,
      assistantTextDelta,
    );
    this.pendingCurrentAssistantTextPartUpdateChunkCount += 1;
    this.pendingCurrentAssistantTextPartUpdateCharacterCount += assistantTextDelta.length;

    const shouldEmitAssistantTextPartEvent = !this.hasEmittedCurrentAssistantTextMessagePart ||
      this.shouldEmitBufferedAssistantTextPartUpdate();
    if (!shouldEmitAssistantTextPartEvent) {
      return [];
    }

    const assistantTextConversationMessagePart = buildStreamingAssistantTextConversationMessagePart(
      this.currentAssistantTextMessagePartBuilderState,
    );
    const assistantResponseEvent = (this.hasEmittedCurrentAssistantTextMessagePart
      ? AssistantMessagePartUpdatedEventSchema
      : AssistantMessagePartAddedEventSchema).parse({
        type: this.hasEmittedCurrentAssistantTextMessagePart
          ? "assistant_message_part_updated"
          : "assistant_message_part_added",
        messageId: this.assistantResponseMessageId,
        part: assistantTextConversationMessagePart,
      });
    this.hasEmittedCurrentAssistantTextMessagePart = true;
    this.resetBufferedCurrentAssistantTextPartUpdate();

    return [assistantResponseEvent];
  }

  private shouldEmitBufferedAssistantTextPartUpdate(): boolean {
    return this.pendingCurrentAssistantTextPartUpdateChunkCount >= streamedAssistantTextUpdateChunkThreshold ||
      this.pendingCurrentAssistantTextPartUpdateCharacterCount >= streamedAssistantTextUpdateCharacterThreshold;
  }

  flushCurrentAssistantTextSegmentBeforeFailedTerminal(): RuntimeAssistantTextSegmentFlush | undefined {
    return this.flushCurrentAssistantTextSegmentForBoundary({
      partStatus: "failed",
      shouldEmitPartUpdatedEvent: true,
      shouldRecordSessionEntry: this.shouldRecordAssistantTextSegmentSessionEntries(),
    });
  }

  flushCurrentAssistantTextSegmentBeforeInterruptedTerminal(): RuntimeAssistantTextSegmentFlush | undefined {
    return this.flushCurrentAssistantTextSegmentForBoundary({
      partStatus: "interrupted",
      shouldEmitPartUpdatedEvent: true,
      shouldRecordSessionEntry: this.shouldRecordAssistantTextSegmentSessionEntries(),
    });
  }

  private flushCurrentAssistantTextSegmentForBoundary(input: {
    partStatus: AssistantTextPartStatus;
    shouldEmitPartUpdatedEvent: boolean;
    shouldRecordSessionEntry: boolean;
  }): RuntimeAssistantTextSegmentFlush | undefined {
    const assistantTextSegmentFlush = this.flushCurrentAssistantTextSegment(input);
    const assistantResponseEvents = assistantTextSegmentFlush?.assistantResponseEvents ?? [];
    const assistantSegmentSessionEntries = assistantTextSegmentFlush?.assistantSegmentSessionEntries ?? [];

    if (assistantResponseEvents.length === 0 && assistantSegmentSessionEntries.length === 0) {
      return undefined;
    }

    return {
      assistantResponseEvents,
      ...(assistantSegmentSessionEntries.length > 0 ? { assistantSegmentSessionEntries } : {}),
    };
  }

  private shouldRecordAssistantTextSegmentSessionEntries(): boolean {
    return this.hasObservedToolCallBoundary || this.hasObservedAssistantSegmentBoundary;
  }

  private ensureCurrentAssistantTextMessagePartBuilder(): AssistantTextMessagePartBuilderState {
    if (this.currentAssistantTextMessagePartBuilderState) {
      return this.currentAssistantTextMessagePartBuilderState;
    }

    const assistantTextPartId = this.nextAssistantTextPartId ?? this.createConversationMessagePartId();
    this.nextAssistantTextPartId = undefined;
    this.currentAssistantTextMessagePartBuilderState = createInitialAssistantTextMessagePartBuilder(assistantTextPartId);
    this.hasEmittedCurrentAssistantTextMessagePart = false;
    this.resetBufferedCurrentAssistantTextPartUpdate();
    return this.currentAssistantTextMessagePartBuilderState;
  }

  private clearCurrentAssistantTextPartBuilderState(): void {
    this.currentAssistantTextMessagePartBuilderState = undefined;
    this.hasEmittedCurrentAssistantTextMessagePart = false;
    this.resetBufferedCurrentAssistantTextPartUpdate();
  }

  private resetBufferedCurrentAssistantTextPartUpdate(): void {
    this.pendingCurrentAssistantTextPartUpdateChunkCount = 0;
    this.pendingCurrentAssistantTextPartUpdateCharacterCount = 0;
  }

  private flushCurrentAssistantTextSegment(input: {
    partStatus: AssistantTextPartStatus;
    shouldEmitPartUpdatedEvent: boolean;
    shouldRecordSessionEntry: boolean;
  }): RuntimeAssistantTextSegmentFlush | undefined {
    if (!this.currentAssistantTextMessagePartBuilderState || !this.hasEmittedCurrentAssistantTextMessagePart) {
      return undefined;
    }

    const assistantTextSegmentText = readAssistantTextMessagePartBuilderRawMarkdownText(
      this.currentAssistantTextMessagePartBuilderState,
    );
    if (assistantTextSegmentText.length === 0) {
      this.clearCurrentAssistantTextPartBuilderState();
      return undefined;
    }

    const assistantResponseEvents = input.shouldEmitPartUpdatedEvent
      ? [
          AssistantMessagePartUpdatedEventSchema.parse({
            type: "assistant_message_part_updated",
            messageId: this.assistantResponseMessageId,
            part: buildAssistantTextConversationMessagePartWithStatus(
              this.currentAssistantTextMessagePartBuilderState,
              input.partStatus,
            ),
          }),
        ]
      : [];
    const assistantTextSegmentSessionEntry = input.shouldRecordSessionEntry
      ? {
          entryKind: "assistant_text_segment",
          assistantTextSegmentText,
        } satisfies AssistantSegmentConversationSessionEntry
      : undefined;

    this.completedAssistantText += assistantTextSegmentText;
    this.clearCurrentAssistantTextPartBuilderState();

    return {
      assistantResponseEvents,
      ...(assistantTextSegmentSessionEntry ? { assistantSegmentSessionEntries: [assistantTextSegmentSessionEntry] } : {}),
    };
  }

  private translateRateLimitPendingProviderStreamEvent(input: {
    retryAfterSeconds: number;
    retryWaitStartedAtMs: number | undefined;
    retryReason: ProviderRetryPendingReason | undefined;
    limitExplanation: string;
  }): RuntimeProviderStreamAssistantEventsTranslation {
    return {
      translationKind: "assistant_response_events",
      assistantResponseEvents: [
        AssistantMessagePartAddedEventSchema.parse({
          type: "assistant_message_part_added",
          messageId: this.assistantResponseMessageId,
          part: AssistantRateLimitNoticeConversationMessagePartSchema.parse({
            id: this.createConversationMessagePartId(),
            partKind: "assistant_rate_limit_notice",
            retryAfterSeconds: input.retryAfterSeconds,
            ...(input.retryReason !== undefined ? { retryReason: input.retryReason } : {}),
            limitExplanation: input.limitExplanation,
            noticeStartedAtMs: input.retryWaitStartedAtMs ?? this.readCurrentTimeInMilliseconds(),
          }),
        }),
      ],
    };
  }

  private translatePlanProposedProviderStreamEvent(input: {
    planId: string;
    planTitle: string;
    planSteps: ProviderPlanProposedEvent["planSteps"];
  }): RuntimeProviderStreamAssistantEventsTranslation {
    return {
      translationKind: "assistant_response_events",
      assistantResponseEvents: [
        AssistantMessagePartAddedEventSchema.parse({
          type: "assistant_message_part_added",
          messageId: this.assistantResponseMessageId,
          part: AssistantPlanProposalConversationMessagePartSchema.parse({
            id: this.createConversationMessagePartId(),
            partKind: "assistant_plan_proposal",
            planId: input.planId,
            planTitle: input.planTitle,
            planSteps: input.planSteps,
          }),
        }),
      ],
    };
  }

  private translateIncompleteProviderStreamEvent(input: {
    incompleteReason: string;
    usage: TokenUsage;
    contextWindowUsage?: TokenUsage | undefined;
    providerTurnReplay?: ProviderTurnReplay | undefined;
  }): RuntimeProviderStreamTerminalAssistantResponseTranslation {
    const assistantSegmentFlush = this.flushCurrentAssistantTextSegmentForBoundary({
      partStatus: "incomplete",
      shouldEmitPartUpdatedEvent: true,
      shouldRecordSessionEntry: this.shouldRecordAssistantTextSegmentSessionEntries(),
    });
    const assistantTurnSummaryPart = this.createAssistantTurnSummaryPart({ usage: input.usage });
    const assistantResponseEventsBeforeTerminalSessionEntry: AssistantResponseEvent[] = [
      this.createAssistantTurnSummaryEvent(assistantTurnSummaryPart),
    ];
    if (assistantSegmentFlush) {
      assistantResponseEventsBeforeTerminalSessionEntry.push(...assistantSegmentFlush.assistantResponseEvents);
    }
    return {
      translationKind: "terminal_assistant_response",
      assistantResponseEventsBeforeTerminalSessionEntry,
      ...(assistantSegmentFlush?.assistantSegmentSessionEntries && assistantSegmentFlush.assistantSegmentSessionEntries.length > 0
        ? { assistantSegmentSessionEntriesBeforeTerminalSessionEntry: assistantSegmentFlush.assistantSegmentSessionEntries }
        : {}),
      terminalAssistantMessageSessionEntry: {
        entryKind: "assistant_message",
        assistantMessageStatus: "incomplete",
        assistantMessageText: this.assistantMessageText,
        selectedModelId: this.selectedModelId,
        assistantOperatingMode: this.assistantOperatingMode,
        turnDurationMs: assistantTurnSummaryPart.turnDurationMs,
        usage: input.usage,
        incompleteReason: input.incompleteReason,
        ...(input.providerTurnReplay ? { providerTurnReplay: input.providerTurnReplay } : {}),
      },
      terminalAssistantResponseEvent: AssistantMessageIncompleteEventSchema.parse({
        type: "assistant_message_incomplete",
        messageId: this.assistantResponseMessageId,
        incompleteReason: input.incompleteReason,
        usage: input.usage,
        ...(input.contextWindowUsage ? { contextWindowUsage: input.contextWindowUsage } : {}),
      }),
    };
  }

  private translateCompletedProviderStreamEvent(input: {
    usage: TokenUsage;
    contextWindowUsage?: TokenUsage | undefined;
    providerTurnReplay?: ProviderTurnReplay | undefined;
  }): RuntimeProviderStreamTerminalAssistantResponseTranslation {
    const assistantSegmentFlush = this.flushCurrentAssistantTextSegmentForBoundary({
      partStatus: "completed",
      shouldEmitPartUpdatedEvent: true,
      shouldRecordSessionEntry: this.shouldRecordAssistantTextSegmentSessionEntries(),
    });
    const assistantTurnSummaryPart = this.createAssistantTurnSummaryPart({ usage: input.usage });
    const assistantResponseEventsBeforeTerminalSessionEntry: AssistantResponseEvent[] = [
      this.createAssistantTurnSummaryEvent(assistantTurnSummaryPart),
    ];
    if (assistantSegmentFlush) {
      assistantResponseEventsBeforeTerminalSessionEntry.push(...assistantSegmentFlush.assistantResponseEvents);
    }

    return {
      translationKind: "terminal_assistant_response",
      assistantResponseEventsBeforeTerminalSessionEntry,
      ...(assistantSegmentFlush?.assistantSegmentSessionEntries && assistantSegmentFlush.assistantSegmentSessionEntries.length > 0
        ? { assistantSegmentSessionEntriesBeforeTerminalSessionEntry: assistantSegmentFlush.assistantSegmentSessionEntries }
        : {}),
      terminalAssistantMessageSessionEntry: {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: this.assistantMessageText,
        selectedModelId: this.selectedModelId,
        assistantOperatingMode: this.assistantOperatingMode,
        turnDurationMs: assistantTurnSummaryPart.turnDurationMs,
        usage: input.usage,
        ...(input.providerTurnReplay ? { providerTurnReplay: input.providerTurnReplay } : {}),
      },
      terminalAssistantResponseEvent: AssistantMessageCompletedEventSchema.parse({
        type: "assistant_message_completed",
        messageId: this.assistantResponseMessageId,
        usage: input.usage,
        ...(input.contextWindowUsage ? { contextWindowUsage: input.contextWindowUsage } : {}),
      }),
    };
  }

  private createAssistantTurnSummaryPart(input: { usage: TokenUsage }): AssistantTurnSummaryConversationMessagePart {
    return AssistantTurnSummaryConversationMessagePartSchema.parse({
      id: this.createConversationMessagePartId(),
      partKind: "assistant_turn_summary",
      turnDurationMs: this.readCurrentTimeInMilliseconds() - this.conversationTurnStartedAtMilliseconds,
      modelDisplayName: this.selectedModelId,
      assistantOperatingMode: this.assistantOperatingMode,
      usage: input.usage,
    });
  }

  private createAssistantTurnSummaryEvent(
    assistantTurnSummaryPart: AssistantTurnSummaryConversationMessagePart,
  ): AssistantResponseEvent {
    return AssistantMessagePartAddedEventSchema.parse({
      type: "assistant_message_part_added",
      messageId: this.assistantResponseMessageId,
      part: assistantTurnSummaryPart,
    });
  }
}
