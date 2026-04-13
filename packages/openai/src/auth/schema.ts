import { z } from "zod";

export const OpenAiAuthInfoSchema = z
  .object({
    provider: z.literal("openai"),
    method: z.literal("oauth"),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    expiresAt: z.number().int().nonnegative(),
    accountId: z.string().min(1).optional(),
  })
  .strict();

export const OpenAiAuthStoreSchema = z
  .object({
    openai: OpenAiAuthInfoSchema.optional(),
  })
  .strict();

export type OpenAiAuthInfo = z.infer<typeof OpenAiAuthInfoSchema>;
export type OpenAiAuthStoreData = z.infer<typeof OpenAiAuthStoreSchema>;
