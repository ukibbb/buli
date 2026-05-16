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
  type AssistantTextPartStatus,
  type AssistantMessageConversationSessionEntry,
  type AssistantResponseEvent,
  type AssistantTextSegmentConversationSessionEntry,
  type ProviderPlanProposedEvent,
  type ProviderStreamEvent,
  type ProviderToolCallRequestedEvent,
  type ProviderTurnReplay,
  type TokenUsage,
} from "@buli/contracts";
import {
  appendAssistantTextDeltaToAssistantTextMessagePartBuilder,
  buildAssistantTextConversationMessagePartWithStatus,
  buildStreamingAssistantTextConversationMessagePart,
  createInitialAssistantTextMessagePartBuilder,
  type AssistantTextMessagePartBuilderState,
} from "./assistantTextMessagePartBuilder.ts";

export type RuntimeProviderStreamAssistantEventsTranslation = {
  translationKind: "assistant_response_events";
  assistantResponseEvents: readonly AssistantResponseEvent[];
};

export type RuntimeProviderStreamToolCallRequestedTranslation = {
  translationKind: "tool_call_requested";
  providerToolCallRequestedEvent: ProviderToolCallRequestedEvent;
  assistantResponseEventsBeforeToolCall?: readonly AssistantResponseEvent[];
  assistantTextSegmentSessionEntryBeforeToolCall?: AssistantTextSegmentConversationSessionEntry;
};

export type RuntimeProviderStreamTerminalAssistantResponseTranslation = {
  translationKind: "terminal_assistant_response";
  assistantResponseEventsBeforeTerminalSessionEntry: readonly AssistantResponseEvent[];
  assistantTextSegmentSessionEntryBeforeTerminalSessionEntry?: AssistantTextSegmentConversationSessionEntry;
  terminalAssistantMessageSessionEntry: AssistantMessageConversationSessionEntry;
  terminalAssistantResponseEvent: AssistantResponseEvent;
};

export type RuntimeProviderStreamEventTranslation =
  | RuntimeProviderStreamAssistantEventsTranslation
  | RuntimeProviderStreamToolCallRequestedTranslation
  | RuntimeProviderStreamTerminalAssistantResponseTranslation;

export type RuntimeAssistantTextSegmentFlush = {
  assistantResponseEvents: readonly AssistantResponseEvent[];
  assistantTextSegmentSessionEntry?: AssistantTextSegmentConversationSessionEntry;
};

type RuntimeProviderStreamEventTranslatorInput = {
  assistantResponseMessageId: string;
  assistantTextPartId: string;
  conversationTurnStartedAtMilliseconds: number;
  selectedModelId: string;
  createConversationMessagePartId?: (() => string) | undefined;
  readCurrentTimeInMilliseconds?: (() => number) | undefined;
};

export class RuntimeProviderStreamEventTranslator {
  readonly assistantResponseMessageId: string;
  readonly conversationTurnStartedAtMilliseconds: number;
  readonly selectedModelId: string;
  readonly createConversationMessagePartId: () => string;
  readonly readCurrentTimeInMilliseconds: () => number;
  private nextAssistantTextPartId: string | undefined;
  private currentAssistantTextMessagePartBuilderState: AssistantTextMessagePartBuilderState | undefined;
  private hasEmittedCurrentAssistantTextMessagePart = false;
  private completedAssistantTextSegmentTexts: string[] = [];
  private hasObservedToolCallBoundary = false;
  private currentReasoningPartId: string | undefined;
  private currentReasoningSummaryText = "";
  private currentReasoningStartedAtMs: number | undefined;

  constructor(input: RuntimeProviderStreamEventTranslatorInput) {
    this.assistantResponseMessageId = input.assistantResponseMessageId;
    this.conversationTurnStartedAtMilliseconds = input.conversationTurnStartedAtMilliseconds;
    this.selectedModelId = input.selectedModelId;
    this.createConversationMessagePartId = input.createConversationMessagePartId ?? randomUUID;
    this.readCurrentTimeInMilliseconds = input.readCurrentTimeInMilliseconds ?? Date.now;
    this.nextAssistantTextPartId = input.assistantTextPartId;
  }

  get assistantMessageText(): string {
    return [
      ...this.completedAssistantTextSegmentTexts,
      ...(this.currentAssistantTextMessagePartBuilderState
        ? [this.currentAssistantTextMessagePartBuilderState.rawMarkdownText]
        : []),
    ].join("");
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
      const assistantTextSegmentFlush = this.flushCurrentAssistantTextSegment({
        partStatus: "completed",
        shouldEmitPartUpdatedEvent: true,
        shouldRecordSessionEntry: true,
      });
      return {
        translationKind: "tool_call_requested",
        providerToolCallRequestedEvent: input.providerStreamEvent,
        ...(assistantTextSegmentFlush && assistantTextSegmentFlush.assistantResponseEvents.length > 0
          ? { assistantResponseEventsBeforeToolCall: assistantTextSegmentFlush.assistantResponseEvents }
          : {}),
        ...(assistantTextSegmentFlush?.assistantTextSegmentSessionEntry
          ? { assistantTextSegmentSessionEntryBeforeToolCall: assistantTextSegmentFlush.assistantTextSegmentSessionEntry }
          : {}),
      };
    }

    if (input.providerStreamEvent.type === "rate_limit_pending") {
      return this.translateRateLimitPendingProviderStreamEvent({
        retryAfterSeconds: input.providerStreamEvent.retryAfterSeconds,
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
        providerTurnReplay: input.providerTurnReplay,
      });
    }

    return this.translateCompletedProviderStreamEvent({
      usage: input.providerStreamEvent.usage,
      providerTurnReplay: input.providerTurnReplay,
    });
  }

  private translateReasoningSummaryStartedProviderStreamEvent(): RuntimeProviderStreamAssistantEventsTranslation {
    this.currentReasoningPartId = this.createConversationMessagePartId();
    this.currentReasoningSummaryText = "";
    this.currentReasoningStartedAtMs = this.readCurrentTimeInMilliseconds();

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

    this.currentReasoningSummaryText += reasoningSummaryTextChunk;
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

    this.currentReasoningPartId = undefined;
    this.currentReasoningStartedAtMs = undefined;
    return { translationKind: "assistant_response_events", assistantResponseEvents };
  }

  private translateTextChunkProviderStreamEvent(assistantTextDelta: string): RuntimeProviderStreamAssistantEventsTranslation {
    const currentAssistantTextMessagePartBuilderState = this.ensureCurrentAssistantTextMessagePartBuilder();
    this.currentAssistantTextMessagePartBuilderState = appendAssistantTextDeltaToAssistantTextMessagePartBuilder(
      currentAssistantTextMessagePartBuilderState,
      assistantTextDelta,
    );

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

    return {
      translationKind: "assistant_response_events",
      assistantResponseEvents: [assistantResponseEvent],
    };
  }

  flushCurrentAssistantTextSegmentBeforeFailedTerminal(): RuntimeAssistantTextSegmentFlush | undefined {
    return this.flushCurrentAssistantTextSegment({
      partStatus: "failed",
      shouldEmitPartUpdatedEvent: false,
      shouldRecordSessionEntry: this.hasObservedToolCallBoundary,
    });
  }

  flushCurrentAssistantTextSegmentBeforeInterruptedTerminal(): RuntimeAssistantTextSegmentFlush | undefined {
    return this.flushCurrentAssistantTextSegment({
      partStatus: "interrupted",
      shouldEmitPartUpdatedEvent: false,
      shouldRecordSessionEntry: this.hasObservedToolCallBoundary,
    });
  }

  private ensureCurrentAssistantTextMessagePartBuilder(): AssistantTextMessagePartBuilderState {
    if (this.currentAssistantTextMessagePartBuilderState) {
      return this.currentAssistantTextMessagePartBuilderState;
    }

    const assistantTextPartId = this.nextAssistantTextPartId ?? this.createConversationMessagePartId();
    this.nextAssistantTextPartId = undefined;
    this.currentAssistantTextMessagePartBuilderState = createInitialAssistantTextMessagePartBuilder(assistantTextPartId);
    this.hasEmittedCurrentAssistantTextMessagePart = false;
    return this.currentAssistantTextMessagePartBuilderState;
  }

  private flushCurrentAssistantTextSegment(input: {
    partStatus: AssistantTextPartStatus;
    shouldEmitPartUpdatedEvent: boolean;
    shouldRecordSessionEntry: boolean;
  }): RuntimeAssistantTextSegmentFlush | undefined {
    if (!this.currentAssistantTextMessagePartBuilderState || !this.hasEmittedCurrentAssistantTextMessagePart) {
      return undefined;
    }

    const assistantTextSegmentText = this.currentAssistantTextMessagePartBuilderState.rawMarkdownText;
    if (assistantTextSegmentText.length === 0) {
      this.currentAssistantTextMessagePartBuilderState = undefined;
      this.hasEmittedCurrentAssistantTextMessagePart = false;
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
        } satisfies AssistantTextSegmentConversationSessionEntry
      : undefined;

    this.completedAssistantTextSegmentTexts.push(assistantTextSegmentText);
    this.currentAssistantTextMessagePartBuilderState = undefined;
    this.hasEmittedCurrentAssistantTextMessagePart = false;

    return {
      assistantResponseEvents,
      ...(assistantTextSegmentSessionEntry ? { assistantTextSegmentSessionEntry } : {}),
    };
  }

  private translateRateLimitPendingProviderStreamEvent(input: {
    retryAfterSeconds: number;
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
            limitExplanation: input.limitExplanation,
            noticeStartedAtMs: this.readCurrentTimeInMilliseconds(),
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
    providerTurnReplay?: ProviderTurnReplay | undefined;
  }): RuntimeProviderStreamTerminalAssistantResponseTranslation {
    const assistantTextSegmentFlush = this.flushCurrentAssistantTextSegment({
      partStatus: "incomplete",
      shouldEmitPartUpdatedEvent: false,
      shouldRecordSessionEntry: this.hasObservedToolCallBoundary,
    });
    return {
      translationKind: "terminal_assistant_response",
      assistantResponseEventsBeforeTerminalSessionEntry: [this.createAssistantTurnSummaryEvent()],
      ...(assistantTextSegmentFlush?.assistantTextSegmentSessionEntry
        ? { assistantTextSegmentSessionEntryBeforeTerminalSessionEntry: assistantTextSegmentFlush.assistantTextSegmentSessionEntry }
        : {}),
      terminalAssistantMessageSessionEntry: {
        entryKind: "assistant_message",
        assistantMessageStatus: "incomplete",
        assistantMessageText: this.assistantMessageText,
        incompleteReason: input.incompleteReason,
        ...(input.providerTurnReplay ? { providerTurnReplay: input.providerTurnReplay } : {}),
      },
      terminalAssistantResponseEvent: AssistantMessageIncompleteEventSchema.parse({
        type: "assistant_message_incomplete",
        messageId: this.assistantResponseMessageId,
        incompleteReason: input.incompleteReason,
        usage: input.usage,
      }),
    };
  }

  private translateCompletedProviderStreamEvent(input: {
    usage: TokenUsage;
    providerTurnReplay?: ProviderTurnReplay | undefined;
  }): RuntimeProviderStreamTerminalAssistantResponseTranslation {
    const assistantTextSegmentFlush = this.flushCurrentAssistantTextSegment({
      partStatus: "completed",
      shouldEmitPartUpdatedEvent: true,
      shouldRecordSessionEntry: this.hasObservedToolCallBoundary,
    });
    const assistantResponseEventsBeforeTerminalSessionEntry: AssistantResponseEvent[] = [this.createAssistantTurnSummaryEvent()];
    if (assistantTextSegmentFlush) {
      assistantResponseEventsBeforeTerminalSessionEntry.push(...assistantTextSegmentFlush.assistantResponseEvents);
    }

    return {
      translationKind: "terminal_assistant_response",
      assistantResponseEventsBeforeTerminalSessionEntry,
      ...(assistantTextSegmentFlush?.assistantTextSegmentSessionEntry
        ? { assistantTextSegmentSessionEntryBeforeTerminalSessionEntry: assistantTextSegmentFlush.assistantTextSegmentSessionEntry }
        : {}),
      terminalAssistantMessageSessionEntry: {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: this.assistantMessageText,
        ...(input.providerTurnReplay ? { providerTurnReplay: input.providerTurnReplay } : {}),
      },
      terminalAssistantResponseEvent: AssistantMessageCompletedEventSchema.parse({
        type: "assistant_message_completed",
        messageId: this.assistantResponseMessageId,
        usage: input.usage,
      }),
    };
  }

  private createAssistantTurnSummaryEvent(): AssistantResponseEvent {
    return AssistantMessagePartAddedEventSchema.parse({
      type: "assistant_message_part_added",
      messageId: this.assistantResponseMessageId,
      part: AssistantTurnSummaryConversationMessagePartSchema.parse({
        id: this.createConversationMessagePartId(),
        partKind: "assistant_turn_summary",
        turnDurationMs: this.readCurrentTimeInMilliseconds() - this.conversationTurnStartedAtMilliseconds,
        modelDisplayName: this.selectedModelId,
      }),
    });
  }
}
