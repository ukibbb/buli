import { z } from "zod";
import { TranscriptMessageSchema } from "./messages.ts";
import { TokenUsageSchema } from "./provider.ts";

export const AssistantStreamStartedEventSchema = z
  .object({
    type: z.literal("assistant_stream_started"),
    model: z.string().min(1),
  })
  .strict();

export const AssistantTextDeltaEventSchema = z
  .object({
    type: z.literal("assistant_text_delta"),
    text: z.string(),
  })
  .strict();

export const AssistantStreamFinishedEventSchema = z
  .object({
    type: z.literal("assistant_stream_finished"),
    message: TranscriptMessageSchema,
    usage: TokenUsageSchema,
  })
  .strict();

export const AssistantStreamFailedEventSchema = z
  .object({
    type: z.literal("assistant_stream_failed"),
    error: z.string().min(1),
  })
  .strict();

export const TurnEventSchema = z.discriminatedUnion("type", [
  AssistantStreamStartedEventSchema,
  AssistantTextDeltaEventSchema,
  AssistantStreamFinishedEventSchema,
  AssistantStreamFailedEventSchema,
]);

export type AssistantStreamStartedEvent = z.infer<typeof AssistantStreamStartedEventSchema>;
export type AssistantTextDeltaEvent = z.infer<typeof AssistantTextDeltaEventSchema>;
export type AssistantStreamFinishedEvent = z.infer<typeof AssistantStreamFinishedEventSchema>;
export type AssistantStreamFailedEvent = z.infer<typeof AssistantStreamFailedEventSchema>;
export type TurnEvent = z.infer<typeof TurnEventSchema>;
