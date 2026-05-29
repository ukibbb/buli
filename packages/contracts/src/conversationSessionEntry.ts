import { z } from "zod";
import { TokenUsageSchema } from "./provider.ts";
import { ProviderTurnReplaySchema } from "./providerTurnReplay.ts";
import { ToolCallDetailSchema } from "./toolCallDetail.ts";
import { ToolCallRequestSchema } from "./toolCallRequest.ts";
import { UserPromptImageAttachmentSchema } from "./userPromptImageAttachment.ts";
import { AssistantOperatingModeSchema } from "./assistantOperatingMode.ts";
import { ContextWindowOverflowFailureKindSchema } from "./contextWindowOverflow.ts";
import { WorkflowHandoffSchema } from "./workflowHandoff.ts";
import { WorkspacePatchSchema } from "./workspacePatch.ts";

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
    promptSource: z.enum(["auto_compaction_continue", "auto_compaction_retry"]).optional(),
    assistantOperatingMode: AssistantOperatingModeSchema.optional(),
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
    selectedModelId: z.string().min(1).optional(),
    assistantOperatingMode: AssistantOperatingModeSchema.optional(),
    turnDurationMs: z.number().int().nonnegative().optional(),
    usage: TokenUsageSchema.optional(),
  })
  .strict();

export const CompletedAssistantMessageConversationSessionEntrySchema = AssistantMessageConversationSessionEntryBaseSchema.extend({
  assistantMessageStatus: z.literal("completed"),
  workflowHandoff: WorkflowHandoffSchema.optional(),
});

export const IncompleteAssistantMessageConversationSessionEntrySchema = AssistantMessageConversationSessionEntryBaseSchema.extend({
  assistantMessageStatus: z.literal("incomplete"),
  incompleteReason: z.string().min(1),
});

export const FailedAssistantMessageConversationSessionEntrySchema = AssistantMessageConversationSessionEntryBaseSchema.extend({
  assistantMessageStatus: z.literal("failed"),
  failureKind: ContextWindowOverflowFailureKindSchema.optional(),
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

export const AssistantTextSegmentConversationSessionEntrySchema = z
  .object({
    entryKind: z.literal("assistant_text_segment"),
    assistantTextSegmentText: z.string().min(1),
  })
  .strict();

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
    retainedRecentConversationSessionEntryCount: z.number().int().nonnegative().default(0),
    compactionSource: z.enum(["manual", "auto"]).optional(),
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

export const WorkspacePatchConversationSessionEntrySchema = z
  .object({
    entryKind: z.literal("workspace_patch"),
    workspacePatch: WorkspacePatchSchema,
  })
  .strict();

export const ConversationSessionEntrySchema = z.union([
  UserPromptConversationSessionEntrySchema,
  AssistantTextSegmentConversationSessionEntrySchema,
  AssistantMessageConversationSessionEntrySchema,
  ToolCallConversationSessionEntrySchema,
  ConversationCompactionSummaryConversationSessionEntrySchema,
  CompletedToolResultConversationSessionEntrySchema,
  FailedToolResultConversationSessionEntrySchema,
  DeniedToolResultConversationSessionEntrySchema,
  WorkspacePatchConversationSessionEntrySchema,
]);

export const ConversationSessionSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    conversationSessionEntries: z.array(ConversationSessionEntrySchema),
  })
  .strict();

export type UserPromptConversationSessionEntry = z.infer<typeof UserPromptConversationSessionEntrySchema>;
export type UserPromptSource = NonNullable<UserPromptConversationSessionEntry["promptSource"]>;
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
export type AssistantTextSegmentConversationSessionEntry = z.infer<typeof AssistantTextSegmentConversationSessionEntrySchema>;
export type AssistantSegmentConversationSessionEntry = AssistantTextSegmentConversationSessionEntry;
export type ToolCallConversationSessionEntry = z.infer<typeof ToolCallConversationSessionEntrySchema>;
export type ConversationCompactionSummaryConversationSessionEntry = z.infer<
  typeof ConversationCompactionSummaryConversationSessionEntrySchema
>;
export type CompletedToolResultConversationSessionEntry = z.infer<typeof CompletedToolResultConversationSessionEntrySchema>;
export type FailedToolResultConversationSessionEntry = z.infer<typeof FailedToolResultConversationSessionEntrySchema>;
export type DeniedToolResultConversationSessionEntry = z.infer<typeof DeniedToolResultConversationSessionEntrySchema>;
export type WorkspacePatchConversationSessionEntry = z.infer<typeof WorkspacePatchConversationSessionEntrySchema>;
export type ConversationSessionEntry = z.infer<typeof ConversationSessionEntrySchema>;
export type ConversationSessionSnapshot = z.infer<typeof ConversationSessionSnapshotSchema>;
