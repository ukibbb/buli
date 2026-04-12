import { TokenUsageSchema, type TokenUsage } from "@buli/contracts";
import { z } from "zod";

export const OpenAiUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  input_tokens_details: z
    .object({
      cached_tokens: z.number().int().nonnegative().nullish(),
    })
    .nullish(),
  output_tokens: z.number().int().nonnegative(),
  output_tokens_details: z
    .object({
      reasoning_tokens: z.number().int().nonnegative().nullish(),
    })
    .nullish(),
  total_tokens: z.number().int().nonnegative().optional(),
});

export type OpenAiUsage = z.infer<typeof OpenAiUsageSchema>;

export function normalizeOpenAiUsage(input: OpenAiUsage): TokenUsage {
  const cacheRead = input.input_tokens_details?.cached_tokens ?? 0;
  const reasoning = input.output_tokens_details?.reasoning_tokens ?? 0;

  // We normalize usage once here so the rest of the app never needs to know
  // about OpenAI-specific field names or how cached/reasoning tokens are split.
  return TokenUsageSchema.parse({
    total: input.total_tokens ?? input.input_tokens + input.output_tokens,
    input: Math.max(0, input.input_tokens - cacheRead),
    output: Math.max(0, input.output_tokens - reasoning),
    reasoning,
    cache: {
      read: cacheRead,
      write: 0,
    },
  });
}
