import { z } from "zod";
import { ProviderTurnReplaySchema } from "./providerTurnReplay.ts";
import { ToolCallDetailSchema } from "./toolCallDetail.ts";
import { ToolCallRequestSchema } from "./toolCallRequest.ts";
import { UserPromptImageAttachmentSchema } from "./userPromptImageAttachment.ts";

export const ProjectInstructionFileNameSchema = z.enum(["AGENTS.md", "CLAUDE.md"]);

export const ProjectInstructionSnapshotSchema = z
  .object({
    fileName: ProjectInstructionFileNameSchema,
    displayPath: z.string().min(1),
    instructionText: z.string(),
    contentHash: z.string().min(1),
  })
  .strict();

export const UserPromptConversationSessionEntrySchema = z
  .object({
    entryKind: z.literal("user_prompt"),
    promptText: z.string(),
    modelFacingPromptText: z.string(),
    imageAttachments: z.array(UserPromptImageAttachmentSchema).optional(),
    projectInstructionSnapshots: z.array(ProjectInstructionSnapshotSchema).optional(),
  })
  .strict();

export const AssistantMessageConversationSessionEntryStatusSchema = z.enum([
  "completed",
  "incomplete",
  "failed",
  "interrupted",
]);

const AssistantMessageConversationSessionEntryBaseSchema = z
  .object({
    entryKind: z.literal("assistant_message"),
    providerTurnReplay: ProviderTurnReplaySchema.optional(),
    assistantMessageText: z.string(),
  })
  .strict();

export const CompletedAssistantMessageConversationSessionEntrySchema = AssistantMessageConversationSessionEntryBaseSchema.extend({
  assistantMessageStatus: z.literal("completed"),
});

export const IncompleteAssistantMessageConversationSessionEntrySchema = AssistantMessageConversationSessionEntryBaseSchema.extend({
  assistantMessageStatus: z.literal("incomplete"),
  incompleteReason: z.string().min(1),
});

export const FailedAssistantMessageConversationSessionEntrySchema = AssistantMessageConversationSessionEntryBaseSchema.extend({
  assistantMessageStatus: z.literal("failed"),
  failureExplanation: z.string().min(1),
});

export const InterruptedAssistantMessageConversationSessionEntrySchema = AssistantMessageConversationSessionEntryBaseSchema.extend({
  assistantMessageStatus: z.literal("interrupted"),
  interruptionReason: z.string().min(1),
});

export const AssistantMessageConversationSessionEntrySchema = z.discriminatedUnion("assistantMessageStatus", [
  CompletedAssistantMessageConversationSessionEntrySchema,
  IncompleteAssistantMessageConversationSessionEntrySchema,
  FailedAssistantMessageConversationSessionEntrySchema,
  InterruptedAssistantMessageConversationSessionEntrySchema,
]);

export const ToolCallConversationSessionEntrySchema = z
  .object({
    entryKind: z.literal("tool_call"),
    toolCallId: z.string().min(1),
    toolCallRequest: ToolCallRequestSchema,
  })
  .strict();

export const ConversationCompactionSummaryConversationSessionEntrySchema = z
  .object({
    entryKind: z.literal("conversation_compaction_summary"),
    summaryText: z.string().min(1),
    compactedEntryCount: z.number().int().nonnegative(),
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

export const ConversationSessionEntrySchema = z.union([
  UserPromptConversationSessionEntrySchema,
  AssistantMessageConversationSessionEntrySchema,
  ToolCallConversationSessionEntrySchema,
  ConversationCompactionSummaryConversationSessionEntrySchema,
  CompletedToolResultConversationSessionEntrySchema,
  FailedToolResultConversationSessionEntrySchema,
  DeniedToolResultConversationSessionEntrySchema,
]);

export const ConversationSessionSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    conversationSessionEntries: z.array(ConversationSessionEntrySchema),
  })
  .strict();

export type UserPromptConversationSessionEntry = z.infer<typeof UserPromptConversationSessionEntrySchema>;
export type ProjectInstructionFileName = z.infer<typeof ProjectInstructionFileNameSchema>;
export type ProjectInstructionSnapshot = z.infer<typeof ProjectInstructionSnapshotSchema>;
export type AssistantMessageConversationSessionEntryStatus = z.infer<typeof AssistantMessageConversationSessionEntryStatusSchema>;
export type CompletedAssistantMessageConversationSessionEntry = z.infer<
  typeof CompletedAssistantMessageConversationSessionEntrySchema
>;
export type IncompleteAssistantMessageConversationSessionEntry = z.infer<
  typeof IncompleteAssistantMessageConversationSessionEntrySchema
>;
export type FailedAssistantMessageConversationSessionEntry = z.infer<typeof FailedAssistantMessageConversationSessionEntrySchema>;
export type InterruptedAssistantMessageConversationSessionEntry = z.infer<
  typeof InterruptedAssistantMessageConversationSessionEntrySchema
>;
export type AssistantMessageConversationSessionEntry = z.infer<typeof AssistantMessageConversationSessionEntrySchema>;
export type ToolCallConversationSessionEntry = z.infer<typeof ToolCallConversationSessionEntrySchema>;
export type ConversationCompactionSummaryConversationSessionEntry = z.infer<
  typeof ConversationCompactionSummaryConversationSessionEntrySchema
>;
export type CompletedToolResultConversationSessionEntry = z.infer<typeof CompletedToolResultConversationSessionEntrySchema>;
export type FailedToolResultConversationSessionEntry = z.infer<typeof FailedToolResultConversationSessionEntrySchema>;
export type DeniedToolResultConversationSessionEntry = z.infer<typeof DeniedToolResultConversationSessionEntrySchema>;
export type ConversationSessionEntry = z.infer<typeof ConversationSessionEntrySchema>;
export type ConversationSessionSnapshot = z.infer<typeof ConversationSessionSnapshotSchema>;
