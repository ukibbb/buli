import { z } from "zod";

export const OpenAiReasoningSummaryReplayPartSchema = z
  .object({
    type: z.literal("summary_text"),
    text: z.string(),
  })
  .strict();

export const OpenAiReasoningReplayItemSchema = z
  .object({
    type: z.literal("reasoning"),
    id: z.string().min(1),
    encrypted_content: z.string().min(1).nullable().optional(),
    summary: z.array(OpenAiReasoningSummaryReplayPartSchema),
  })
  .strict();

export const OpenAiFunctionCallReplayItemSchema = z
  .object({
    type: z.literal("function_call"),
    id: z.string().min(1),
    call_id: z.string().min(1),
    name: z.string().min(1),
    arguments: z.string(),
  })
  .strict();

export const OpenAiFunctionCallOutputReplayItemSchema = z
  .object({
    type: z.literal("function_call_output"),
    call_id: z.string().min(1),
    output: z.string(),
  })
  .strict();

export const OpenAiProviderTurnReplayInputItemSchema = z.discriminatedUnion("type", [
  OpenAiReasoningReplayItemSchema,
  OpenAiFunctionCallReplayItemSchema,
  OpenAiFunctionCallOutputReplayItemSchema,
]);

export const OpenAiProviderTurnReplaySchema = z
  .object({
    provider: z.literal("openai"),
    inputItems: z.array(OpenAiProviderTurnReplayInputItemSchema),
  })
  .strict();

export const ProviderTurnReplaySchema = z.discriminatedUnion("provider", [OpenAiProviderTurnReplaySchema]);

export type OpenAiReasoningSummaryReplayPart = z.infer<typeof OpenAiReasoningSummaryReplayPartSchema>;
export type OpenAiReasoningReplayItem = z.infer<typeof OpenAiReasoningReplayItemSchema>;
export type OpenAiFunctionCallReplayItem = z.infer<typeof OpenAiFunctionCallReplayItemSchema>;
export type OpenAiFunctionCallOutputReplayItem = z.infer<typeof OpenAiFunctionCallOutputReplayItemSchema>;
export type OpenAiProviderTurnReplayInputItem = z.infer<typeof OpenAiProviderTurnReplayInputItemSchema>;
export type OpenAiProviderTurnReplay = z.infer<typeof OpenAiProviderTurnReplaySchema>;
export type ProviderTurnReplay = z.infer<typeof ProviderTurnReplaySchema>;
