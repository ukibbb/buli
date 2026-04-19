// Assistant-turn streaming events now describe one assistant message evolving
// over time. The engine creates the message once, then adds or updates message
// parts for text, reasoning, tool calls, approvals, and terminal metadata.
// Renderers consume this event stream into normalized message/part state rather
// than rebuilding transcript-entry-shaped UI objects.
import { z } from "zod";
import { ConversationMessagePartSchema } from "./conversationMessagePart.ts";
import { PendingToolApprovalRequestSchema } from "./pendingToolApprovalRequest.ts";
import { TokenUsageSchema } from "./provider.ts";

export const AssistantTurnStartedEventSchema = z
  .object({
    type: z.literal("assistant_turn_started"),
    messageId: z.string().min(1),
    startedAtMs: z.number().int().nonnegative(),
  })
  .strict();

export const AssistantMessagePartAddedEventSchema = z
  .object({
    type: z.literal("assistant_message_part_added"),
    messageId: z.string().min(1),
    part: ConversationMessagePartSchema,
  })
  .strict();

export const AssistantMessagePartUpdatedEventSchema = z
  .object({
    type: z.literal("assistant_message_part_updated"),
    messageId: z.string().min(1),
    part: ConversationMessagePartSchema,
  })
  .strict();

export const AssistantPendingToolApprovalRequestedEventSchema = z
  .object({
    type: z.literal("assistant_pending_tool_approval_requested"),
    approvalRequest: PendingToolApprovalRequestSchema,
  })
  .strict();

export const AssistantPendingToolApprovalClearedEventSchema = z
  .object({
    type: z.literal("assistant_pending_tool_approval_cleared"),
    approvalId: z.string().min(1),
  })
  .strict();

export const AssistantMessageCompletedEventSchema = z
  .object({
    type: z.literal("assistant_message_completed"),
    messageId: z.string().min(1),
    usage: TokenUsageSchema,
  })
  .strict();

export const AssistantMessageIncompleteEventSchema = z
  .object({
    type: z.literal("assistant_message_incomplete"),
    messageId: z.string().min(1),
    incompleteReason: z.string().min(1),
    usage: TokenUsageSchema,
  })
  .strict();

export const AssistantMessageFailedEventSchema = z
  .object({
    type: z.literal("assistant_message_failed"),
    messageId: z.string().min(1),
    errorText: z.string().min(1),
  })
  .strict();

export const AssistantResponseEventSchema = z.discriminatedUnion("type", [
  AssistantTurnStartedEventSchema,
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantPendingToolApprovalRequestedEventSchema,
  AssistantPendingToolApprovalClearedEventSchema,
  AssistantMessageCompletedEventSchema,
  AssistantMessageIncompleteEventSchema,
  AssistantMessageFailedEventSchema,
]);

export type AssistantTurnStartedEvent = z.infer<typeof AssistantTurnStartedEventSchema>;
export type AssistantMessagePartAddedEvent = z.infer<typeof AssistantMessagePartAddedEventSchema>;
export type AssistantMessagePartUpdatedEvent = z.infer<typeof AssistantMessagePartUpdatedEventSchema>;
export type AssistantPendingToolApprovalRequestedEvent = z.infer<typeof AssistantPendingToolApprovalRequestedEventSchema>;
export type AssistantPendingToolApprovalClearedEvent = z.infer<typeof AssistantPendingToolApprovalClearedEventSchema>;
export type AssistantMessageCompletedEvent = z.infer<typeof AssistantMessageCompletedEventSchema>;
export type AssistantMessageIncompleteEvent = z.infer<typeof AssistantMessageIncompleteEventSchema>;
export type AssistantMessageFailedEvent = z.infer<typeof AssistantMessageFailedEventSchema>;
export type AssistantResponseEvent = z.infer<typeof AssistantResponseEventSchema>;
