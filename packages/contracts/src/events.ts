import { z } from "zod";
import { TranscriptMessageSchema } from "./messages.ts";
import { TokenUsageSchema } from "./provider.ts";

export const AssistantResponseStartedEventSchema = z
  .object({
    type: z.literal("assistant_response_started"),
    model: z.string().min(1),
  })
  .strict();

export const AssistantResponseTextChunkEventSchema = z
  .object({
    type: z.literal("assistant_response_text_chunk"),
    text: z.string(),
  })
  .strict();

export const AssistantResponseCompletedEventSchema = z
  .object({
    type: z.literal("assistant_response_completed"),
    message: TranscriptMessageSchema,
    usage: TokenUsageSchema,
  })
  .strict();

export const AssistantResponseFailedEventSchema = z
  .object({
    type: z.literal("assistant_response_failed"),
    error: z.string().min(1),
  })
  .strict();

export const AssistantResponseEventSchema = z.discriminatedUnion("type", [
  AssistantResponseStartedEventSchema,
  AssistantResponseTextChunkEventSchema,
  AssistantResponseCompletedEventSchema,
  AssistantResponseFailedEventSchema,
]);

export type AssistantResponseStartedEvent = z.infer<typeof AssistantResponseStartedEventSchema>;
export type AssistantResponseTextChunkEvent = z.infer<typeof AssistantResponseTextChunkEventSchema>;
export type AssistantResponseCompletedEvent = z.infer<typeof AssistantResponseCompletedEventSchema>;
export type AssistantResponseFailedEvent = z.infer<typeof AssistantResponseFailedEventSchema>;
export type AssistantResponseEvent = z.infer<typeof AssistantResponseEventSchema>;
