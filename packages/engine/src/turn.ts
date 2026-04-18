import { randomUUID } from "node:crypto";
import {
  AssistantResponseCompletedEventSchema,
  TranscriptMessageSchema,
  type AssistantContentPart,
  type AssistantResponseCompletedEvent,
  type TokenUsage,
  type TranscriptMessage,
} from "@buli/contracts";

export function createAssistantTranscriptMessage(input: {
  assistantText: string;
  assistantContentParts: readonly AssistantContentPart[];
  messageId?: string;
}): TranscriptMessage {
  return TranscriptMessageSchema.parse({
    id: input.messageId ?? randomUUID(),
    role: "assistant",
    text: input.assistantText,
    assistantContentParts: input.assistantContentParts,
  });
}

export function createCompletedAssistantResponseEvent(input: {
  assistantText: string;
  assistantContentParts: readonly AssistantContentPart[];
  usage: TokenUsage;
  id?: string;
}): AssistantResponseCompletedEvent {
  const message = createAssistantTranscriptMessage({
    assistantText: input.assistantText,
    assistantContentParts: input.assistantContentParts,
    ...(input.id ? { messageId: input.id } : {}),
  });
  return AssistantResponseCompletedEventSchema.parse({
    type: "assistant_response_completed",
    message,
    usage: input.usage,
  });
}
