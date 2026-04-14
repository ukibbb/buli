// Assistant-turn streaming events. A single turn produces:
//   started → (reasoning summary stream)? → (text chunks)* → completed | failed
// Reasoning-summary events have their own lifecycle (started → chunks → completed)
// because the underlying Responses API emits summary text separately from the
// model's final answer. Keeping them as independent arms lets the UI render a
// collapsible thinking block without interleaving it into the response stream.
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

export const AssistantReasoningSummaryStartedEventSchema = z
  .object({
    type: z.literal("assistant_reasoning_summary_started"),
  })
  .strict();

export const AssistantReasoningSummaryTextChunkEventSchema = z
  .object({
    type: z.literal("assistant_reasoning_summary_text_chunk"),
    text: z.string(),
  })
  .strict();

// reasoningTokenCount is deliberately absent. The Responses API delivers
// per-reasoning token counts only with the final response.completed usage
// payload, so the chat-state reducer back-fills the chip when
// assistant_response_completed arrives with usage.reasoning.
export const AssistantReasoningSummaryCompletedEventSchema = z
  .object({
    type: z.literal("assistant_reasoning_summary_completed"),
    reasoningDurationMs: z.number().int().nonnegative(),
  })
  .strict();

export const AssistantResponseEventSchema = z.discriminatedUnion("type", [
  AssistantResponseStartedEventSchema,
  AssistantResponseTextChunkEventSchema,
  AssistantResponseCompletedEventSchema,
  AssistantResponseFailedEventSchema,
  AssistantReasoningSummaryStartedEventSchema,
  AssistantReasoningSummaryTextChunkEventSchema,
  AssistantReasoningSummaryCompletedEventSchema,
]);

export type AssistantResponseStartedEvent = z.infer<typeof AssistantResponseStartedEventSchema>;
export type AssistantResponseTextChunkEvent = z.infer<typeof AssistantResponseTextChunkEventSchema>;
export type AssistantResponseCompletedEvent = z.infer<typeof AssistantResponseCompletedEventSchema>;
export type AssistantResponseFailedEvent = z.infer<typeof AssistantResponseFailedEventSchema>;
export type AssistantReasoningSummaryStartedEvent = z.infer<typeof AssistantReasoningSummaryStartedEventSchema>;
export type AssistantReasoningSummaryTextChunkEvent = z.infer<typeof AssistantReasoningSummaryTextChunkEventSchema>;
export type AssistantReasoningSummaryCompletedEvent = z.infer<typeof AssistantReasoningSummaryCompletedEventSchema>;
export type AssistantResponseEvent = z.infer<typeof AssistantResponseEventSchema>;
