import { z } from "zod";

export const AssistantMessageUrlCitationSchema = z
  .object({
    citedUrl: z.string().min(1),
    citedTitle: z.string().min(1).optional(),
    startIndex: z.number().int().nonnegative().optional(),
    endIndex: z.number().int().nonnegative().optional(),
  })
  .strict();
export type AssistantMessageUrlCitation = z.infer<typeof AssistantMessageUrlCitationSchema>;
