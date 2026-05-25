import { z } from "zod";

export const ConversationMessageRoleSchema = z.enum(["user", "assistant"]);
export const ConversationMessageStatusSchema = z.enum(["streaming", "completed", "incomplete", "failed", "interrupted"]);
export const ConversationMessageModelContextVisibilitySchema = z.enum([
  "visible_to_model",
  "compacted_out_of_model_context",
]);

export const ConversationMessageSchema = z
  .object({
    id: z.string().min(1),
    role: ConversationMessageRoleSchema,
    messageStatus: ConversationMessageStatusSchema,
    createdAtMs: z.number().int().nonnegative(),
    partIds: z.array(z.string().min(1)),
    modelContextVisibility: ConversationMessageModelContextVisibilitySchema.optional(),
  })
  .strict();

export type ConversationMessageRole = z.infer<typeof ConversationMessageRoleSchema>;
export type ConversationMessageStatus = z.infer<typeof ConversationMessageStatusSchema>;
export type ConversationMessageModelContextVisibility = z.infer<typeof ConversationMessageModelContextVisibilitySchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
