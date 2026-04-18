import { z } from "zod";
import { AssistantContentPartSchema } from "./assistantContentPart.ts";

export const MessageRoleSchema = z.enum(["user", "assistant"]);

export const TranscriptMessageSchema = z
  .object({
    id: z.string().min(1),
    role: MessageRoleSchema,
    text: z.string(),
    assistantContentParts: z.array(AssistantContentPartSchema).optional(),
  })
  .strict();

export type MessageRole = z.infer<typeof MessageRoleSchema>;
export type TranscriptMessage = z.infer<typeof TranscriptMessageSchema>;
