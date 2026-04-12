import { z } from "zod";

export const TokenUsageSchema = z
  .object({
    total: z.number().int().nonnegative().optional(),
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
    reasoning: z.number().int().nonnegative(),
    cache: z
      .object({
        read: z.number().int().nonnegative(),
        write: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const ProviderTextDeltaEventSchema = z
  .object({
    type: z.literal("text-delta"),
    text: z.string(),
  })
  .strict();

export const ProviderFinishEventSchema = z
  .object({
    type: z.literal("finish"),
    usage: TokenUsageSchema,
  })
  .strict();

export const ProviderStreamEventSchema = z.discriminatedUnion("type", [
  ProviderTextDeltaEventSchema,
  ProviderFinishEventSchema,
]);

export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type ProviderTextDeltaEvent = z.infer<typeof ProviderTextDeltaEventSchema>;
export type ProviderFinishEvent = z.infer<typeof ProviderFinishEventSchema>;
export type ProviderStreamEvent = z.infer<typeof ProviderStreamEventSchema>;
