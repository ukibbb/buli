import { randomUUID } from "node:crypto";
import {
  AssistantStreamFinishedEventSchema,
  TranscriptMessageSchema,
  type AssistantStreamFinishedEvent,
  type TokenUsage,
  type TranscriptMessage,
} from "@buli/contracts";

export function createAssistantMessage(text: string, id: string = randomUUID()): TranscriptMessage {
  return TranscriptMessageSchema.parse({
    id,
    role: "assistant",
    text,
  });
}

export function finishAssistantTurn(input: {
  text: string;
  usage: TokenUsage;
  id?: string;
}): AssistantStreamFinishedEvent {
  return AssistantStreamFinishedEventSchema.parse({
    type: "assistant_stream_finished",
    message: createAssistantMessage(input.text, input.id),
    usage: input.usage,
  });
}
