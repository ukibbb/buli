import { z } from "zod";
import { AssistantContentPartSchema } from "./assistantContentPart.ts";
import { PlanStepSchema } from "./planProposal.ts";
import { TokenUsageSchema } from "./provider.ts";
import { ToolCallDetailSchema } from "./toolCallDetail.ts";

export const ConversationOpenMarkdownTextPartSchema = z
  .object({
    kind: z.literal("streaming_markdown_text"),
    text: z.string(),
  })
  .strict();

export const ConversationOpenFencedCodeBlockPartSchema = z
  .object({
    kind: z.literal("streaming_fenced_code_block"),
    languageLabel: z.string().min(1).optional(),
    codeLines: z.array(z.string()),
  })
  .strict();

export const ConversationOpenAssistantTextPartSchema = z.discriminatedUnion("kind", [
  ConversationOpenMarkdownTextPartSchema,
  ConversationOpenFencedCodeBlockPartSchema,
]);

export const AssistantTextPartStatusSchema = z.enum(["streaming", "completed", "incomplete", "failed"]);
export const AssistantReasoningPartStatusSchema = z.enum(["streaming", "completed"]);
export const AssistantToolCallPartStatusSchema = z.enum([
  "pending_approval",
  "running",
  "completed",
  "failed",
  "denied",
]);

export const UserTextConversationMessagePartSchema = z
  .object({
    id: z.string().min(1),
    partKind: z.literal("user_text"),
    text: z.string(),
  })
  .strict();

export const AssistantTextConversationMessagePartSchema = z
  .object({
    id: z.string().min(1),
    partKind: z.literal("assistant_text"),
    partStatus: AssistantTextPartStatusSchema,
    rawMarkdownText: z.string(),
    completedContentParts: z.array(AssistantContentPartSchema),
    openContentPart: ConversationOpenAssistantTextPartSchema.optional(),
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

export const AssistantToolCallConversationMessagePartSchema = z
  .object({
    id: z.string().min(1),
    partKind: z.literal("assistant_tool_call"),
    toolCallId: z.string().min(1),
    toolCallStatus: AssistantToolCallPartStatusSchema,
    toolCallStartedAtMs: z.number().int().nonnegative(),
    toolCallDetail: ToolCallDetailSchema,
    durationMs: z.number().int().nonnegative().optional(),
    errorText: z.string().min(1).optional(),
    denialText: z.string().min(1).optional(),
  })
  .strict();

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

export const AssistantTurnSummaryConversationMessagePartSchema = z
  .object({
    id: z.string().min(1),
    partKind: z.literal("assistant_turn_summary"),
    turnDurationMs: z.number().int().nonnegative(),
    modelDisplayName: z.string().min(1),
    usage: TokenUsageSchema.optional(),
  })
  .strict();

export const ConversationMessagePartSchema = z.discriminatedUnion("partKind", [
  UserTextConversationMessagePartSchema,
  AssistantTextConversationMessagePartSchema,
  AssistantReasoningConversationMessagePartSchema,
  AssistantToolCallConversationMessagePartSchema,
  AssistantPlanProposalConversationMessagePartSchema,
  AssistantRateLimitNoticeConversationMessagePartSchema,
  AssistantIncompleteNoticeConversationMessagePartSchema,
  AssistantErrorNoticeConversationMessagePartSchema,
  AssistantTurnSummaryConversationMessagePartSchema,
]);

export type ConversationOpenMarkdownTextPart = z.infer<typeof ConversationOpenMarkdownTextPartSchema>;
export type ConversationOpenFencedCodeBlockPart = z.infer<typeof ConversationOpenFencedCodeBlockPartSchema>;
export type ConversationOpenAssistantTextPart = z.infer<typeof ConversationOpenAssistantTextPartSchema>;
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
export type AssistantTurnSummaryConversationMessagePart = z.infer<typeof AssistantTurnSummaryConversationMessagePartSchema>;
export type ConversationMessagePart = z.infer<typeof ConversationMessagePartSchema>;
