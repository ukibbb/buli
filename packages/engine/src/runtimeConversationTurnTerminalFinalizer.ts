import {
  AssistantMessageFailedEventSchema,
  AssistantMessageInterruptedEventSchema,
  type AssistantMessageFailureKind,
  type AssistantResponseEvent,
  type ProjectInstructionSnapshot,
} from "@buli/contracts";
import { RuntimeConversationTurnSessionRecorder } from "./runtimeConversationTurnSessionRecorder.ts";
import { RuntimeProviderStreamEventTranslator } from "./runtimeProviderStreamEventTranslator.ts";
import { USER_INTERRUPTED_CONVERSATION_TURN_REASON } from "./runtimeConversationTurnLifecycle.ts";

export type RuntimeConversationTurnTerminalFinalizerInput = {
  assistantResponseMessageId: string;
  conversationTurnSessionRecorder: RuntimeConversationTurnSessionRecorder;
  providerStreamEventTranslator: RuntimeProviderStreamEventTranslator;
};

export type RuntimeConversationTurnAcceptedPromptFallback = {
  userPromptText: string;
  modelFacingPromptTextForAcceptedTurn: string | undefined;
  projectInstructionSnapshotsForAcceptedTurn: readonly ProjectInstructionSnapshot[];
};

export function finalizeProviderStreamEndedBeforeCompletion(
  input: RuntimeConversationTurnTerminalFinalizerInput,
): AssistantResponseEvent[] {
  const failureExplanation = "Provider stream ended before completion";
  if (
    input.conversationTurnSessionRecorder.hasAppendedAcceptedUserPromptSessionEntry() &&
    !input.conversationTurnSessionRecorder.hasAppendedTerminalAssistantMessageSessionEntry()
  ) {
    const assistantResponseEventsBeforeTerminal = flushAssistantTextSegmentBeforeTerminal({
      conversationTurnSessionRecorder: input.conversationTurnSessionRecorder,
      assistantTextSegmentFlush: input.providerStreamEventTranslator.flushCurrentAssistantTextSegmentBeforeFailedTerminal(),
    });
    input.conversationTurnSessionRecorder.appendTerminalAssistantMessageSessionEntry({
      entryKind: "assistant_message",
      assistantMessageStatus: "failed",
      assistantMessageText: input.providerStreamEventTranslator.assistantMessageText,
      failureExplanation,
    });
    return [
      ...assistantResponseEventsBeforeTerminal,
      AssistantMessageFailedEventSchema.parse({
        type: "assistant_message_failed",
        messageId: input.assistantResponseMessageId,
        errorText: failureExplanation,
      }),
    ];
  }

  return [
    AssistantMessageFailedEventSchema.parse({
      type: "assistant_message_failed",
      messageId: input.assistantResponseMessageId,
      errorText: failureExplanation,
    }),
  ];
}

export function finalizeInterruptedConversationTurn(input: RuntimeConversationTurnTerminalFinalizerInput & {
  acceptedPromptFallback: RuntimeConversationTurnAcceptedPromptFallback;
}): AssistantResponseEvent[] {
  appendAcceptedUserPromptIfMissing({
    conversationTurnSessionRecorder: input.conversationTurnSessionRecorder,
    acceptedPromptFallback: input.acceptedPromptFallback,
  });
  if (!input.conversationTurnSessionRecorder.hasAppendedTerminalAssistantMessageSessionEntry()) {
    const assistantResponseEventsBeforeTerminal = flushAssistantTextSegmentBeforeTerminal({
      conversationTurnSessionRecorder: input.conversationTurnSessionRecorder,
      assistantTextSegmentFlush: input.providerStreamEventTranslator.flushCurrentAssistantTextSegmentBeforeInterruptedTerminal(),
    });
    input.conversationTurnSessionRecorder.appendTerminalAssistantMessageSessionEntry({
      entryKind: "assistant_message",
      assistantMessageStatus: "interrupted",
      assistantMessageText: input.providerStreamEventTranslator.assistantMessageText,
      interruptionReason: USER_INTERRUPTED_CONVERSATION_TURN_REASON,
    });
    return [
      ...assistantResponseEventsBeforeTerminal,
      AssistantMessageInterruptedEventSchema.parse({
        type: "assistant_message_interrupted",
        messageId: input.assistantResponseMessageId,
        interruptionReason: USER_INTERRUPTED_CONVERSATION_TURN_REASON,
      }),
    ];
  }

  return [
    AssistantMessageInterruptedEventSchema.parse({
      type: "assistant_message_interrupted",
      messageId: input.assistantResponseMessageId,
      interruptionReason: USER_INTERRUPTED_CONVERSATION_TURN_REASON,
    }),
  ];
}

export function finalizeFailedConversationTurn(input: RuntimeConversationTurnTerminalFinalizerInput & {
  acceptedPromptFallback: RuntimeConversationTurnAcceptedPromptFallback;
  failureExplanation: string;
  failureKind?: AssistantMessageFailureKind | undefined;
}): AssistantResponseEvent[] {
  appendAcceptedUserPromptIfMissing({
    conversationTurnSessionRecorder: input.conversationTurnSessionRecorder,
    acceptedPromptFallback: input.acceptedPromptFallback,
  });
  if (!input.conversationTurnSessionRecorder.hasAppendedTerminalAssistantMessageSessionEntry()) {
    const assistantResponseEventsBeforeTerminal = flushAssistantTextSegmentBeforeTerminal({
      conversationTurnSessionRecorder: input.conversationTurnSessionRecorder,
      assistantTextSegmentFlush: input.providerStreamEventTranslator.flushCurrentAssistantTextSegmentBeforeFailedTerminal(),
    });
    input.conversationTurnSessionRecorder.appendTerminalAssistantMessageSessionEntry({
      entryKind: "assistant_message",
      assistantMessageStatus: "failed",
      assistantMessageText: input.providerStreamEventTranslator.assistantMessageText,
      ...(input.failureKind ? { failureKind: input.failureKind } : {}),
      failureExplanation: input.failureExplanation,
    });
    return [
      ...assistantResponseEventsBeforeTerminal,
      AssistantMessageFailedEventSchema.parse({
        type: "assistant_message_failed",
        messageId: input.assistantResponseMessageId,
        errorText: input.failureExplanation,
        ...(input.failureKind ? { failureKind: input.failureKind } : {}),
      }),
    ];
  }

  return [
    AssistantMessageFailedEventSchema.parse({
      type: "assistant_message_failed",
      messageId: input.assistantResponseMessageId,
      errorText: input.failureExplanation,
      ...(input.failureKind ? { failureKind: input.failureKind } : {}),
    }),
  ];
}

function appendAcceptedUserPromptIfMissing(input: {
  conversationTurnSessionRecorder: RuntimeConversationTurnSessionRecorder;
  acceptedPromptFallback: RuntimeConversationTurnAcceptedPromptFallback;
}): void {
  if (input.conversationTurnSessionRecorder.hasAppendedAcceptedUserPromptSessionEntry()) {
    return;
  }

  input.conversationTurnSessionRecorder.appendAcceptedUserPromptSessionEntry(
    input.acceptedPromptFallback.modelFacingPromptTextForAcceptedTurn ?? input.acceptedPromptFallback.userPromptText,
    input.acceptedPromptFallback.projectInstructionSnapshotsForAcceptedTurn,
  );
}

function flushAssistantTextSegmentBeforeTerminal(input: {
  conversationTurnSessionRecorder: RuntimeConversationTurnSessionRecorder;
  assistantTextSegmentFlush: ReturnType<RuntimeProviderStreamEventTranslator["flushCurrentAssistantTextSegmentBeforeFailedTerminal"]>;
}): readonly AssistantResponseEvent[] {
  for (const assistantSegmentSessionEntry of input.assistantTextSegmentFlush?.assistantSegmentSessionEntries ?? []) {
    input.conversationTurnSessionRecorder.appendAssistantSegmentSessionEntry(assistantSegmentSessionEntry);
  }

  return input.assistantTextSegmentFlush?.assistantResponseEvents ?? [];
}
