import { z } from "zod";
import { PlanStepSchema } from "./planProposal.ts";
import { ToolCallDetailSchema } from "./toolCallDetail.ts";

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

// Provider-level tool-call events mirror the assistant-level arms 1:1. Keeping
// them as a separate namespace means a provider can emit tool events without
// importing engine-layer types, and the runtime stays a thin translation layer.
export const ProviderToolCallStartedEventSchema = z
  .object({
    type: z.literal("tool_call_started"),
    toolCallId: z.string().min(1),
    toolCallDetail: ToolCallDetailSchema,
  })
  .strict();

export const ProviderToolCallCompletedEventSchema = z
  .object({
    type: z.literal("tool_call_completed"),
    toolCallId: z.string().min(1),
    toolCallDetail: ToolCallDetailSchema,
    durationMs: z.number().int().nonnegative(),
  })
  .strict();

export const ProviderToolCallFailedEventSchema = z
  .object({
    type: z.literal("tool_call_failed"),
    toolCallId: z.string().min(1),
    toolCallDetail: ToolCallDetailSchema,
    errorText: z.string().min(1),
    durationMs: z.number().int().nonnegative(),
  })
  .strict();

export const ProviderTurnCompletedEventSchema = z
  .object({
    type: z.literal("turn_completed"),
    turnDurationMs: z.number().int().nonnegative(),
    modelDisplayName: z.string().min(1),
  })
  .strict();

export const ProviderRateLimitPendingEventSchema = z
  .object({
    type: z.literal("rate_limit_pending"),
    retryAfterSeconds: z.number().int().nonnegative(),
    limitExplanation: z.string().min(1),
  })
  .strict();

export const ProviderToolApprovalRequestedEventSchema = z
  .object({
    type: z.literal("tool_approval_requested"),
    approvalId: z.string().min(1),
    pendingToolCallId: z.string().min(1),
    pendingToolCallDetail: ToolCallDetailSchema,
    riskExplanation: z.string().min(1),
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
  ProviderReasoningSummaryStartedEventSchema,
  ProviderReasoningSummaryTextChunkEventSchema,
  ProviderReasoningSummaryCompletedEventSchema,
  ProviderToolCallStartedEventSchema,
  ProviderToolCallCompletedEventSchema,
  ProviderToolCallFailedEventSchema,
  ProviderTurnCompletedEventSchema,
  ProviderRateLimitPendingEventSchema,
  ProviderToolApprovalRequestedEventSchema,
  ProviderPlanProposedEventSchema,
]);

export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;
export type AvailableAssistantModel = z.infer<typeof AvailableAssistantModelSchema>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type ProviderTextChunkEvent = z.infer<typeof ProviderTextChunkEventSchema>;
export type ProviderCompletedEvent = z.infer<typeof ProviderCompletedEventSchema>;
export type ProviderReasoningSummaryStartedEvent = z.infer<typeof ProviderReasoningSummaryStartedEventSchema>;
export type ProviderReasoningSummaryTextChunkEvent = z.infer<typeof ProviderReasoningSummaryTextChunkEventSchema>;
export type ProviderReasoningSummaryCompletedEvent = z.infer<typeof ProviderReasoningSummaryCompletedEventSchema>;
export type ProviderToolCallStartedEvent = z.infer<typeof ProviderToolCallStartedEventSchema>;
export type ProviderToolCallCompletedEvent = z.infer<typeof ProviderToolCallCompletedEventSchema>;
export type ProviderToolCallFailedEvent = z.infer<typeof ProviderToolCallFailedEventSchema>;
export type ProviderTurnCompletedEvent = z.infer<typeof ProviderTurnCompletedEventSchema>;
export type ProviderRateLimitPendingEvent = z.infer<typeof ProviderRateLimitPendingEventSchema>;
export type ProviderToolApprovalRequestedEvent = z.infer<typeof ProviderToolApprovalRequestedEventSchema>;
export type ProviderPlanProposedEvent = z.infer<typeof ProviderPlanProposedEventSchema>;
export type ProviderStreamEvent = z.infer<typeof ProviderStreamEventSchema>;
