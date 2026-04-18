import { z } from "zod";
import { PlanStepSchema } from "./planProposal.ts";
import { ToolCallRequestSchema } from "./toolCallRequest.ts";

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

export const ProviderIncompleteEventSchema = z
  .object({
    type: z.literal("incomplete"),
    incompleteReason: z.string().min(1),
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

// Provider-level tool-call events model only the model's intent. Local
// execution lifecycle belongs to the engine because approvals, subprocesses,
// and render details are all local concerns outside the provider boundary.
export const ProviderToolCallRequestedEventSchema = z
  .object({
    type: z.literal("tool_call_requested"),
    toolCallId: z.string().min(1),
    toolCallRequest: ToolCallRequestSchema,
  })
  .strict();

export const ProviderRateLimitPendingEventSchema = z
  .object({
    type: z.literal("rate_limit_pending"),
    retryAfterSeconds: z.number().int().nonnegative(),
    limitExplanation: z.string().min(1),
  })
  .strict();

export const ProviderPlanProposedEventSchema = z
  .object({
    type: z.literal("plan_proposed"),
    planId: z.string().min(1),
    planTitle: z.string().min(1),
    planSteps: z.array(PlanStepSchema).min(1),
  })
  .strict();

export const ProviderStreamEventSchema = z.discriminatedUnion("type", [
  ProviderTextChunkEventSchema,
  ProviderCompletedEventSchema,
  ProviderIncompleteEventSchema,
  ProviderReasoningSummaryStartedEventSchema,
  ProviderReasoningSummaryTextChunkEventSchema,
  ProviderReasoningSummaryCompletedEventSchema,
  ProviderToolCallRequestedEventSchema,
  ProviderRateLimitPendingEventSchema,
  ProviderPlanProposedEventSchema,
]);

export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;
export type AvailableAssistantModel = z.infer<typeof AvailableAssistantModelSchema>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type ProviderTextChunkEvent = z.infer<typeof ProviderTextChunkEventSchema>;
export type ProviderCompletedEvent = z.infer<typeof ProviderCompletedEventSchema>;
export type ProviderIncompleteEvent = z.infer<typeof ProviderIncompleteEventSchema>;
export type ProviderReasoningSummaryStartedEvent = z.infer<typeof ProviderReasoningSummaryStartedEventSchema>;
export type ProviderReasoningSummaryTextChunkEvent = z.infer<typeof ProviderReasoningSummaryTextChunkEventSchema>;
export type ProviderReasoningSummaryCompletedEvent = z.infer<typeof ProviderReasoningSummaryCompletedEventSchema>;
export type ProviderToolCallRequestedEvent = z.infer<typeof ProviderToolCallRequestedEventSchema>;
export type ProviderRateLimitPendingEvent = z.infer<typeof ProviderRateLimitPendingEventSchema>;
export type ProviderPlanProposedEvent = z.infer<typeof ProviderPlanProposedEventSchema>;
export type ProviderStreamEvent = z.infer<typeof ProviderStreamEventSchema>;
