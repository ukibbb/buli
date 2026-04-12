import { z } from "zod";

export const AuthInfoSchema = z
  .object({
    provider: z.literal("openai"),
    method: z.literal("oauth"),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    expiresAt: z.number().int().nonnegative(),
    accountId: z.string().min(1).optional(),
  })
  .strict();

export const AuthStoreSchema = z
  .object({
    openai: AuthInfoSchema.optional(),
  })
  .strict();

export type AuthInfo = z.infer<typeof AuthInfoSchema>;
export type AuthStore = z.infer<typeof AuthStoreSchema>;
