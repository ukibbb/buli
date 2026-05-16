import { z } from "zod";
import { PlanStepSchema } from "./planProposal.ts";
import { TokenUsageSchema } from "./provider.ts";
import { ToolCallDetailSchema } from "./toolCallDetail.ts";
import { UserPromptImageAttachmentSchema } from "./userPromptImageAttachment.ts";

export const AssistantTextPartStatusSchema = z.enum(["streaming", "completed", "incomplete", "failed", "interrupted"]);
export const AssistantReasoningPartStatusSchema = z.enum(["streaming", "completed", "interrupted"]);
export const AssistantToolCallPartStatusSchema = z.enum([
  "pending_approval",
  "running",
  "completed",
  "failed",
  "denied",
  "interrupted",
]);

export const UserTextConversationMessagePartSchema = z
  .object({
    id: z.string().min(1),
    partKind: z.literal("user_text"),
    text: z.string(),
  })
  .strict();

export const UserImageAttachmentConversationMessagePartSchema = z
  .object({
    id: z.string().min(1),
    partKind: z.literal("user_image_attachment"),
    attachment: UserPromptImageAttachmentSchema,
  })
  .strict();

export const AssistantTextConversationMessagePartSchema = z
  .object({
    id: z.string().min(1),
    partKind: z.literal("assistant_text"),
    partStatus: AssistantTextPartStatusSchema,
    rawMarkdownText: z.string(),
  })
  .strict();

export const AssistantReasoningConversationMessagePartSchema = z
  .object({
    id: z.string().min(1),
    partKind: z.literal("assistant_reasoning"),
    partStatus: AssistantReasoningPartStatusSchema,
    reasoningSummaryText: z.string(),
    reasoningStartedAtMs: z.number().int().nonnegative(),
    reasoningDurationMs: z.number().int().nonnegative().optional(),
    reasoningTokenCount: z.number().int().nonnegative().optional(),
  })
  .strict();

const AssistantToolCallConversationMessagePartBaseSchema = z.object({
  id: z.string().min(1),
  partKind: z.literal("assistant_tool_call"),
  toolCallId: z.string().min(1),
  toolCallStartedAtMs: z.number().int().nonnegative(),
  toolCallDetail: ToolCallDetailSchema,
});

const AssistantPendingApprovalToolCallConversationMessagePartSchema = AssistantToolCallConversationMessagePartBaseSchema.extend({
  toolCallStatus: z.literal("pending_approval"),
  durationMs: z.never().optional(),
  errorText: z.never().optional(),
  denialText: z.never().optional(),
}).strict();

const AssistantRunningToolCallConversationMessagePartSchema = AssistantToolCallConversationMessagePartBaseSchema.extend({
  toolCallStatus: z.literal("running"),
  durationMs: z.never().optional(),
  errorText: z.never().optional(),
  denialText: z.never().optional(),
}).strict();

const AssistantCompletedToolCallConversationMessagePartSchema = AssistantToolCallConversationMessagePartBaseSchema.extend({
  toolCallStatus: z.literal("completed"),
  durationMs: z.number().int().nonnegative(),
  errorText: z.never().optional(),
  denialText: z.never().optional(),
}).strict();

const AssistantFailedToolCallConversationMessagePartSchema = AssistantToolCallConversationMessagePartBaseSchema.extend({
  toolCallStatus: z.literal("failed"),
  durationMs: z.number().int().nonnegative().optional(),
  errorText: z.string().min(1),
  denialText: z.never().optional(),
}).strict();

const AssistantDeniedToolCallConversationMessagePartSchema = AssistantToolCallConversationMessagePartBaseSchema.extend({
  toolCallStatus: z.literal("denied"),
  durationMs: z.number().int().nonnegative().optional(),
  errorText: z.never().optional(),
  denialText: z.string().min(1),
}).strict();

const AssistantInterruptedToolCallConversationMessagePartSchema = AssistantToolCallConversationMessagePartBaseSchema.extend({
  toolCallStatus: z.literal("interrupted"),
  durationMs: z.number().int().nonnegative().optional(),
  errorText: z.string().min(1),
  denialText: z.never().optional(),
}).strict();

export const AssistantToolCallConversationMessagePartSchema = z.discriminatedUnion("toolCallStatus", [
  AssistantPendingApprovalToolCallConversationMessagePartSchema,
  AssistantRunningToolCallConversationMessagePartSchema,
  AssistantCompletedToolCallConversationMessagePartSchema,
  AssistantFailedToolCallConversationMessagePartSchema,
  AssistantDeniedToolCallConversationMessagePartSchema,
  AssistantInterruptedToolCallConversationMessagePartSchema,
]);

export const AssistantPlanProposalConversationMessagePartSchema = z
  .object({
    id: z.string().min(1),
    partKind: z.literal("assistant_plan_proposal"),
    planId: z.string().min(1),
    planTitle: z.string().min(1),
    planSteps: z.array(PlanStepSchema).min(1),
  })
  .strict();

export const AssistantRateLimitNoticeConversationMessagePartSchema = z
  .object({
    id: z.string().min(1),
    partKind: z.literal("assistant_rate_limit_notice"),
    retryAfterSeconds: z.number().int().nonnegative(),
    limitExplanation: z.string().min(1),
    noticeStartedAtMs: z.number().int().nonnegative(),
  })
  .strict();

export const AssistantIncompleteNoticeConversationMessagePartSchema = z
  .object({
    id: z.string().min(1),
    partKind: z.literal("assistant_incomplete_notice"),
    incompleteReason: z.string().min(1),
  })
  .strict();

export const AssistantErrorNoticeConversationMessagePartSchema = z
  .object({
    id: z.string().min(1),
    partKind: z.literal("assistant_error_notice"),
    errorText: z.string().min(1),
  })
  .strict();

export const AssistantInterruptedNoticeConversationMessagePartSchema = z
  .object({
    id: z.string().min(1),
    partKind: z.literal("assistant_interrupted_notice"),
    interruptionReason: z.string().min(1),
  })
  .strict();

export const AssistantTurnSummaryConversationMessagePartSchema = z
  .object({
    id: z.string().min(1),
    partKind: z.literal("assistant_turn_summary"),
    turnDurationMs: z.number().int().nonnegative(),
    modelDisplayName: z.string().min(1),
    usage: TokenUsageSchema.optional(),
  })
  .strict();

export const ConversationMessagePartSchema = z.union([
  UserTextConversationMessagePartSchema,
  UserImageAttachmentConversationMessagePartSchema,
  AssistantTextConversationMessagePartSchema,
  AssistantReasoningConversationMessagePartSchema,
  AssistantToolCallConversationMessagePartSchema,
  AssistantPlanProposalConversationMessagePartSchema,
  AssistantRateLimitNoticeConversationMessagePartSchema,
  AssistantIncompleteNoticeConversationMessagePartSchema,
  AssistantErrorNoticeConversationMessagePartSchema,
  AssistantInterruptedNoticeConversationMessagePartSchema,
  AssistantTurnSummaryConversationMessagePartSchema,
]);

export type AssistantTextPartStatus = z.infer<typeof AssistantTextPartStatusSchema>;
export type AssistantReasoningPartStatus = z.infer<typeof AssistantReasoningPartStatusSchema>;
export type AssistantToolCallPartStatus = z.infer<typeof AssistantToolCallPartStatusSchema>;
export type UserTextConversationMessagePart = z.infer<typeof UserTextConversationMessagePartSchema>;
export type AssistantTextConversationMessagePart = z.infer<typeof AssistantTextConversationMessagePartSchema>;
export type AssistantReasoningConversationMessagePart = z.infer<typeof AssistantReasoningConversationMessagePartSchema>;
export type AssistantToolCallConversationMessagePart = z.infer<typeof AssistantToolCallConversationMessagePartSchema>;
export type AssistantPlanProposalConversationMessagePart = z.infer<typeof AssistantPlanProposalConversationMessagePartSchema>;
export type AssistantRateLimitNoticeConversationMessagePart = z.infer<typeof AssistantRateLimitNoticeConversationMessagePartSchema>;
export type AssistantIncompleteNoticeConversationMessagePart = z.infer<typeof AssistantIncompleteNoticeConversationMessagePartSchema>;
export type AssistantErrorNoticeConversationMessagePart = z.infer<typeof AssistantErrorNoticeConversationMessagePartSchema>;
export type AssistantInterruptedNoticeConversationMessagePart = z.infer<typeof AssistantInterruptedNoticeConversationMessagePartSchema>;
export type AssistantTurnSummaryConversationMessagePart = z.infer<typeof AssistantTurnSummaryConversationMessagePartSchema>;
export type ConversationMessagePart = z.infer<typeof ConversationMessagePartSchema>;
export type UserImageAttachmentConversationMessagePart = z.infer<typeof UserImageAttachmentConversationMessagePartSchema>;
