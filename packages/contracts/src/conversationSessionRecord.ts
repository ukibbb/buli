import { z } from "zod";
import { ConversationSessionEntrySchema } from "./conversationSessionEntry.ts";
import { ReasoningEffortSchema } from "./provider.ts";

export const ConversationSessionModelSelectionSchema = z
  .object({
    selectedModelId: z.string().min(1),
    selectedModelDefaultReasoningEffort: ReasoningEffortSchema.optional(),
    selectedReasoningEffort: ReasoningEffortSchema.optional(),
  })
  .strict();

export const ConversationSessionHeaderRecordSchema = z
  .object({
    recordKind: z.literal("conversation_session"),
    schemaVersion: z.literal(1),
    sessionId: z.string().min(1),
    workspaceRootPath: z.string().min(1),
    createdAtMs: z.number().int().nonnegative(),
    parentSessionId: z.string().min(1).optional(),
  })
  .strict();

export const ConversationSessionEntryRecordSchema = z
  .object({
    recordKind: z.literal("conversation_entry"),
    sessionEntryId: z.string().min(1),
    parentSessionEntryId: z.string().min(1).nullable(),
    recordedAtMs: z.number().int().nonnegative(),
    conversationSessionEntry: ConversationSessionEntrySchema,
  })
  .strict();

export const ConversationSessionSettingsRecordSchema = z
  .object({
    recordKind: z.literal("conversation_session_settings"),
    recordedAtMs: z.number().int().nonnegative(),
    modelSelection: ConversationSessionModelSelectionSchema,
  })
  .strict();

export const ConversationSessionJsonLineRecordSchema = z.discriminatedUnion("recordKind", [
  ConversationSessionHeaderRecordSchema,
  ConversationSessionSettingsRecordSchema,
  ConversationSessionEntryRecordSchema,
]);

export const ConversationSessionSummarySchema = z
  .object({
    sessionId: z.string().min(1),
    title: z.string().min(1),
    createdAtMs: z.number().int().nonnegative(),
    updatedAtMs: z.number().int().nonnegative(),
    conversationSessionEntryCount: z.number().int().nonnegative(),
  })
  .strict();

export type ConversationSessionHeaderRecord = z.infer<typeof ConversationSessionHeaderRecordSchema>;
export type ConversationSessionModelSelection = z.infer<typeof ConversationSessionModelSelectionSchema>;
export type ConversationSessionSettingsRecord = z.infer<typeof ConversationSessionSettingsRecordSchema>;
export type ConversationSessionEntryRecord = z.infer<typeof ConversationSessionEntryRecordSchema>;
export type ConversationSessionJsonLineRecord = z.infer<typeof ConversationSessionJsonLineRecordSchema>;
export type ConversationSessionSummary = z.infer<typeof ConversationSessionSummarySchema>;
