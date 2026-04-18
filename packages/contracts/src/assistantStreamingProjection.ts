import { z } from "zod";
import { AssistantContentPartSchema } from "./assistantContentPart.ts";

export const StreamingMarkdownTextContentPartSchema = z
  .object({
    kind: z.literal("streaming_markdown_text"),
    text: z.string(),
  })
  .strict();

export const StreamingFencedCodeBlockContentPartSchema = z
  .object({
    kind: z.literal("streaming_fenced_code_block"),
    languageLabel: z.string().min(1).optional(),
    codeLines: z.array(z.string()),
  })
  .strict();

export const StreamingAssistantContentPartSchema = z.discriminatedUnion("kind", [
  StreamingMarkdownTextContentPartSchema,
  StreamingFencedCodeBlockContentPartSchema,
]);

export const AssistantStreamingProjectionSchema = z
  .object({
    fullResponseText: z.string(),
    completedContentParts: z.array(AssistantContentPartSchema),
    openContentPart: StreamingAssistantContentPartSchema.optional(),
  })
  .strict();

export type StreamingMarkdownTextContentPart = z.infer<typeof StreamingMarkdownTextContentPartSchema>;
export type StreamingFencedCodeBlockContentPart = z.infer<typeof StreamingFencedCodeBlockContentPartSchema>;
export type StreamingAssistantContentPart = z.infer<typeof StreamingAssistantContentPartSchema>;
export type AssistantStreamingProjection = z.infer<typeof AssistantStreamingProjectionSchema>;
