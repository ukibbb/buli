import { z } from "zod";
import { ConversationSessionEntrySchema } from "./conversationSessionEntry.ts";

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

export const ConversationSessionJsonLineRecordSchema = z.discriminatedUnion("recordKind", [
  ConversationSessionHeaderRecordSchema,
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
export type ConversationSessionEntryRecord = z.infer<typeof ConversationSessionEntryRecordSchema>;
export type ConversationSessionJsonLineRecord = z.infer<typeof ConversationSessionJsonLineRecordSchema>;
export type ConversationSessionSummary = z.infer<typeof ConversationSessionSummarySchema>;
