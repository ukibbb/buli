import { z } from "zod";
import { AssistantOperatingModeSchema } from "./assistantOperatingMode.ts";
import { ToolCallRequestSchema } from "./toolCallRequest.ts";
import { UserPromptImageAttachmentSchema } from "./userPromptImageAttachment.ts";

export const UserMessageModelContextItemSchema = z
  .object({
    itemKind: z.literal("user_message"),
    messageText: z.string(),
    assistantOperatingMode: AssistantOperatingModeSchema.optional(),
    imageAttachments: z.array(UserPromptImageAttachmentSchema).optional(),
  })
  .strict();

export const AssistantMessageModelContextItemSchema = z
  .object({
    itemKind: z.literal("assistant_message"),
    messageText: z.string(),
    assistantOperatingMode: AssistantOperatingModeSchema.optional(),
  })
  .strict();

export const ToolCallModelContextItemSchema = z
  .object({
    itemKind: z.literal("tool_call"),
    toolCallId: z.string().min(1),
    toolCallRequest: ToolCallRequestSchema,
  })
  .strict();

export const ToolResultModelContextItemSchema = z
  .object({
    itemKind: z.literal("tool_result"),
    toolCallId: z.string().min(1),
    toolResultText: z.string(),
  })
  .strict();

export const CompactionSummaryModelContextItemSchema = z
  .object({
    itemKind: z.literal("compaction_summary"),
    summaryText: z.string().min(1),
    latestCompletedAssistantOperatingMode: AssistantOperatingModeSchema.optional(),
  })
  .strict();

export const ModelContextItemSchema = z.discriminatedUnion("itemKind", [
  UserMessageModelContextItemSchema,
  AssistantMessageModelContextItemSchema,
  ToolCallModelContextItemSchema,
  ToolResultModelContextItemSchema,
  CompactionSummaryModelContextItemSchema,
]);

export type UserMessageModelContextItem = z.infer<typeof UserMessageModelContextItemSchema>;
export type AssistantMessageModelContextItem = z.infer<typeof AssistantMessageModelContextItemSchema>;
export type ToolCallModelContextItem = z.infer<typeof ToolCallModelContextItemSchema>;
export type ToolResultModelContextItem = z.infer<typeof ToolResultModelContextItemSchema>;
export type CompactionSummaryModelContextItem = z.infer<typeof CompactionSummaryModelContextItemSchema>;
export type ModelContextItem = z.infer<typeof ModelContextItemSchema>;
