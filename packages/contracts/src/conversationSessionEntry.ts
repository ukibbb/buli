import { z } from "zod";
import { ToolCallDetailSchema } from "./toolCallDetail.ts";
import { ToolCallRequestSchema } from "./toolCallRequest.ts";

export const UserPromptConversationSessionEntrySchema = z
  .object({
    entryKind: z.literal("user_prompt"),
    promptText: z.string().min(1),
    modelFacingPromptText: z.string().min(1),
  })
  .strict();

export const AssistantMessageConversationSessionEntrySchema = z
  .object({
    entryKind: z.literal("assistant_message"),
    assistantMessageText: z.string(),
  })
  .strict();

export const ToolCallConversationSessionEntrySchema = z
  .object({
    entryKind: z.literal("tool_call"),
    toolCallId: z.string().min(1),
    toolCallRequest: ToolCallRequestSchema,
  })
  .strict();

const ToolResultConversationSessionEntryBaseSchema = z
  .object({
    toolCallId: z.string().min(1),
    toolCallDetail: ToolCallDetailSchema,
    toolResultText: z.string(),
  })
  .strict();

export const CompletedToolResultConversationSessionEntrySchema = ToolResultConversationSessionEntryBaseSchema.extend({
  entryKind: z.literal("completed_tool_result"),
});

export const FailedToolResultConversationSessionEntrySchema = ToolResultConversationSessionEntryBaseSchema.extend({
  entryKind: z.literal("failed_tool_result"),
  failureExplanation: z.string().min(1),
});

export const DeniedToolResultConversationSessionEntrySchema = ToolResultConversationSessionEntryBaseSchema.extend({
  entryKind: z.literal("denied_tool_result"),
  denialExplanation: z.string().min(1),
});

export const ConversationSessionEntrySchema = z.discriminatedUnion("entryKind", [
  UserPromptConversationSessionEntrySchema,
  AssistantMessageConversationSessionEntrySchema,
  ToolCallConversationSessionEntrySchema,
  CompletedToolResultConversationSessionEntrySchema,
  FailedToolResultConversationSessionEntrySchema,
  DeniedToolResultConversationSessionEntrySchema,
]);

export type UserPromptConversationSessionEntry = z.infer<typeof UserPromptConversationSessionEntrySchema>;
export type AssistantMessageConversationSessionEntry = z.infer<typeof AssistantMessageConversationSessionEntrySchema>;
export type ToolCallConversationSessionEntry = z.infer<typeof ToolCallConversationSessionEntrySchema>;
export type CompletedToolResultConversationSessionEntry = z.infer<typeof CompletedToolResultConversationSessionEntrySchema>;
export type FailedToolResultConversationSessionEntry = z.infer<typeof FailedToolResultConversationSessionEntrySchema>;
export type DeniedToolResultConversationSessionEntry = z.infer<typeof DeniedToolResultConversationSessionEntrySchema>;
export type ConversationSessionEntry = z.infer<typeof ConversationSessionEntrySchema>;
