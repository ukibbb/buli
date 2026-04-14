import { z } from "zod";

export const ReasoningEffortSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]);

export const AvailableAssistantModelSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    defaultReasoningEffort: ReasoningEffortSchema.optional(),
    supportedReasoningEfforts: z.array(ReasoningEffortSchema),
  })
  .strict();

export const TokenUsageSchema = z
  .object({
    total: z.number().int().nonnegative().optional(),
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
    reasoning: z.number().int().nonnegative(),
    cache: z
      .object({
        read: z.number().int().nonnegative(),
        write: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const ProviderTextChunkEventSchema = z
  .object({
    type: z.literal("text_chunk"),
    text: z.string(),
  })
  .strict();

export const ProviderCompletedEventSchema = z
  .object({
    type: z.literal("completed"),
    usage: TokenUsageSchema,
  })
  .strict();

// Provider-level reasoning summary events. Mirror the assistant-level
// reasoning arms but live here so the provider boundary can emit them without
// knowing about assistant-turn semantics. Duration is measured provider-side
// because the provider is closest to the SSE clock.
export const ProviderReasoningSummaryStartedEventSchema = z
  .object({ type: z.literal("reasoning_summary_started") })
  .strict();

export const ProviderReasoningSummaryTextChunkEventSchema = z
  .object({
    type: z.literal("reasoning_summary_text_chunk"),
    text: z.string(),
  })
  .strict();

export const ProviderReasoningSummaryCompletedEventSchema = z
  .object({
    type: z.literal("reasoning_summary_completed"),
    reasoningDurationMs: z.number().int().nonnegative(),
  })
  .strict();

export const ProviderStreamEventSchema = z.discriminatedUnion("type", [
  ProviderTextChunkEventSchema,
  ProviderCompletedEventSchema,
  ProviderReasoningSummaryStartedEventSchema,
  ProviderReasoningSummaryTextChunkEventSchema,
  ProviderReasoningSummaryCompletedEventSchema,
]);

export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;
export type AvailableAssistantModel = z.infer<typeof AvailableAssistantModelSchema>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type ProviderTextChunkEvent = z.infer<typeof ProviderTextChunkEventSchema>;
export type ProviderCompletedEvent = z.infer<typeof ProviderCompletedEventSchema>;
export type ProviderReasoningSummaryStartedEvent = z.infer<typeof ProviderReasoningSummaryStartedEventSchema>;
export type ProviderReasoningSummaryTextChunkEvent = z.infer<typeof ProviderReasoningSummaryTextChunkEventSchema>;
export type ProviderReasoningSummaryCompletedEvent = z.infer<typeof ProviderReasoningSummaryCompletedEventSchema>;
export type ProviderStreamEvent = z.infer<typeof ProviderStreamEventSchema>;
