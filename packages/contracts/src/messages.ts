import { z } from "zod";

export const MessageRoleSchema = z.enum(["user", "assistant"]);

export const TranscriptMessageSchema = z
  .object({
    id: z.string().min(1),
    role: MessageRoleSchema,
    text: z.string(),
  })
  .strict();

export type MessageRole = z.infer<typeof MessageRoleSchema>;
export type TranscriptMessage = z.infer<typeof TranscriptMessageSchema>;
