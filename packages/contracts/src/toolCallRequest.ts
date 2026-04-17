import { z } from "zod";

export const BashToolCallRequestSchema = z
  .object({
    toolName: z.literal("bash"),
    shellCommand: z.string().min(1),
    commandDescription: z.string().min(1),
    workingDirectoryPath: z.string().min(1).optional(),
    timeoutMilliseconds: z.number().int().positive().optional(),
  })
  .strict();

export const ToolCallRequestSchema = z.discriminatedUnion("toolName", [BashToolCallRequestSchema]);

export type BashToolCallRequest = z.infer<typeof BashToolCallRequestSchema>;
export type ToolCallRequest = z.infer<typeof ToolCallRequestSchema>;
