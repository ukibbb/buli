import { randomUUID } from "node:crypto";
import {
  AssistantResponseCompletedEventSchema,
  TranscriptMessageSchema,
  type AssistantResponseCompletedEvent,
  type TokenUsage,
  type TranscriptMessage,
} from "@buli/contracts";

export function createAssistantTranscriptMessage(assistantText: string, id: string = randomUUID()): TranscriptMessage {
  return TranscriptMessageSchema.parse({
    id,
    role: "assistant",
    text: assistantText,
  });
}

export function createCompletedAssistantResponseEvent(input: {
  assistantText: string;
  usage: TokenUsage;
  id?: string;
}): AssistantResponseCompletedEvent {
  return AssistantResponseCompletedEventSchema.parse({
    type: "assistant_response_completed",
    message: createAssistantTranscriptMessage(input.assistantText, input.id),
    usage: input.usage,
  });
}
