import { z } from "zod";

export const ConversationMessageRoleSchema = z.enum(["user", "assistant"]);
export const ConversationMessageStatusSchema = z.enum(["streaming", "completed", "incomplete", "failed"]);

export const ConversationMessageSchema = z
  .object({
    id: z.string().min(1),
    role: ConversationMessageRoleSchema,
    messageStatus: ConversationMessageStatusSchema,
    createdAtMs: z.number().int().nonnegative(),
    partIds: z.array(z.string().min(1)),
  })
  .strict();

export type ConversationMessageRole = z.infer<typeof ConversationMessageRoleSchema>;
export type ConversationMessageStatus = z.infer<typeof ConversationMessageStatusSchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
