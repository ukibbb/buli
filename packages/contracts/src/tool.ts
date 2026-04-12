import { z } from "zod";

export const ToolCallSchema = z
  .object({
    name: z.string().min(1),
  })
  .strict();

export const ToolResultSchema = z
  .object({
    name: z.string().min(1),
    ok: z.boolean(),
  })
  .strict();

export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
