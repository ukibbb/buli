// Assistant-turn streaming events. A single turn produces:
//   started → (reasoning summary stream)? → (text chunks | tool calls)* → turn_completed? → completed | incomplete | failed
// Reasoning-summary events have their own lifecycle (started → chunks → completed)
// because the underlying Responses API emits summary text separately from the
// model's final answer. Keeping them as independent arms lets the UI render a
// collapsible thinking block without interleaving it into the response stream.
//
// Tool-call events carry a typed detail payload (see toolCallDetail.ts) per
// supported tool so each card renders with domain affordances (diff, shell,
// todo list, …) instead of collapsing to an opaque "tool args" blob.
//
// The additional behavior events (turn completion summary, rate-limit notice,
// tool-approval request, plan proposal) exist as peers of the text/reasoning
// streams because the UI needs to pin each as its own transcript entry and
// back-pressure the streaming message accordingly.
import { z } from "zod";
import { TranscriptMessageSchema } from "./messages.ts";
import { PlanStepSchema } from "./planProposal.ts";
import { TokenUsageSchema } from "./provider.ts";
import { ToolCallDetailSchema } from "./toolCallDetail.ts";

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

export const AssistantResponseIncompleteEventSchema = z
  .object({
    type: z.literal("assistant_response_incomplete"),
    incompleteReason: z.string().min(1),
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

// Fires when a tool invocation begins. The detail carries whatever the model
// supplied up front (file path, command line, search pattern) so the card can
// render with a concrete header before results arrive.
export const AssistantToolCallStartedEventSchema = z
  .object({
    type: z.literal("assistant_tool_call_started"),
    toolCallId: z.string().min(1),
    toolCallDetail: ToolCallDetailSchema,
  })
  .strict();

// Fires when a tool finishes successfully. The detail now carries full
// results (diff lines, grep hits, shell output). durationMs lets the card
// render timing in its status slot.
export const AssistantToolCallCompletedEventSchema = z
  .object({
    type: z.literal("assistant_tool_call_completed"),
    toolCallId: z.string().min(1),
    toolCallDetail: ToolCallDetailSchema,
    durationMs: z.number().int().nonnegative(),
  })
  .strict();

// Fires when the tool invocation fails. Detail preserves whatever state we
// knew when the failure happened so the card can still show the attempted
// command or path alongside the error message.
export const AssistantToolCallFailedEventSchema = z
  .object({
    type: z.literal("assistant_tool_call_failed"),
    toolCallId: z.string().min(1),
    toolCallDetail: ToolCallDetailSchema,
    errorText: z.string().min(1),
    durationMs: z.number().int().nonnegative(),
  })
  .strict();

// Emitted when the UI should pin turn metadata (model · duration) for the
// current turn. Token usage arrives later on assistant_response_completed or
// assistant_response_incomplete so this event stays truthful instead of
// fabricating accounting data.
export const AssistantTurnCompletedEventSchema = z
  .object({
    type: z.literal("assistant_turn_completed"),
    turnDurationMs: z.number().int().nonnegative(),
    modelDisplayName: z.string().min(1),
  })
  .strict();

// Signals that the provider is rate-limited and backing off. Carries enough
// information to render a countdown and an explanation without guessing.
export const AssistantRateLimitPendingEventSchema = z
  .object({
    type: z.literal("assistant_rate_limit_pending"),
    retryAfterSeconds: z.number().int().nonnegative(),
    limitExplanation: z.string().min(1),
  })
  .strict();

// A pending tool invocation that requires explicit user approval before the
// engine runs it. The UI renders the attempted operation in detail so the
// user can judge risk before approving or denying.
export const AssistantToolApprovalRequestedEventSchema = z
  .object({
    type: z.literal("assistant_tool_approval_requested"),
    approvalId: z.string().min(1),
    pendingToolCallId: z.string().min(1),
    pendingToolCallDetail: ToolCallDetailSchema,
    riskExplanation: z.string().min(1),
  })
  .strict();

// A proposed execution plan. The assistant emits this when operating in a
// "plan-first" mode so the user can review and approve the step list before
// work begins.
export const AssistantPlanProposedEventSchema = z
  .object({
    type: z.literal("assistant_plan_proposed"),
    planId: z.string().min(1),
    planTitle: z.string().min(1),
    planSteps: z.array(PlanStepSchema).min(1),
  })
  .strict();

export const AssistantResponseEventSchema = z.discriminatedUnion("type", [
  AssistantResponseStartedEventSchema,
  AssistantResponseTextChunkEventSchema,
  AssistantResponseCompletedEventSchema,
  AssistantResponseIncompleteEventSchema,
  AssistantResponseFailedEventSchema,
  AssistantReasoningSummaryStartedEventSchema,
  AssistantReasoningSummaryTextChunkEventSchema,
  AssistantReasoningSummaryCompletedEventSchema,
  AssistantToolCallStartedEventSchema,
  AssistantToolCallCompletedEventSchema,
  AssistantToolCallFailedEventSchema,
  AssistantTurnCompletedEventSchema,
  AssistantRateLimitPendingEventSchema,
  AssistantToolApprovalRequestedEventSchema,
  AssistantPlanProposedEventSchema,
]);

export type AssistantResponseStartedEvent = z.infer<typeof AssistantResponseStartedEventSchema>;
export type AssistantResponseTextChunkEvent = z.infer<typeof AssistantResponseTextChunkEventSchema>;
export type AssistantResponseCompletedEvent = z.infer<typeof AssistantResponseCompletedEventSchema>;
export type AssistantResponseIncompleteEvent = z.infer<typeof AssistantResponseIncompleteEventSchema>;
export type AssistantResponseFailedEvent = z.infer<typeof AssistantResponseFailedEventSchema>;
export type AssistantReasoningSummaryStartedEvent = z.infer<typeof AssistantReasoningSummaryStartedEventSchema>;
export type AssistantReasoningSummaryTextChunkEvent = z.infer<typeof AssistantReasoningSummaryTextChunkEventSchema>;
export type AssistantReasoningSummaryCompletedEvent = z.infer<typeof AssistantReasoningSummaryCompletedEventSchema>;
export type AssistantToolCallStartedEvent = z.infer<typeof AssistantToolCallStartedEventSchema>;
export type AssistantToolCallCompletedEvent = z.infer<typeof AssistantToolCallCompletedEventSchema>;
export type AssistantToolCallFailedEvent = z.infer<typeof AssistantToolCallFailedEventSchema>;
export type AssistantTurnCompletedEvent = z.infer<typeof AssistantTurnCompletedEventSchema>;
export type AssistantRateLimitPendingEvent = z.infer<typeof AssistantRateLimitPendingEventSchema>;
export type AssistantToolApprovalRequestedEvent = z.infer<typeof AssistantToolApprovalRequestedEventSchema>;
export type AssistantPlanProposedEvent = z.infer<typeof AssistantPlanProposedEventSchema>;
export type AssistantResponseEvent = z.infer<typeof AssistantResponseEventSchema>;
