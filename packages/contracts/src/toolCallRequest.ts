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

export const ReadToolCallRequestSchema = z
  .object({
    toolName: z.literal("read"),
    readTargetPath: z.string().min(1),
    offsetLineNumber: z.number().int().positive().optional(),
    maximumLineCount: z.number().int().positive().optional(),
  })
  .strict();

export const GlobToolCallRequestSchema = z
  .object({
    toolName: z.literal("glob"),
    globPattern: z.string().min(1),
    searchDirectoryPath: z.string().min(1).optional(),
  })
  .strict();

export const GrepToolCallRequestSchema = z
  .object({
    toolName: z.literal("grep"),
    regexPattern: z.string().min(1),
    searchPath: z.string().min(1).optional(),
    includeGlobPattern: z.string().min(1).optional(),
  })
  .strict();

export const ToolCallRequestSchema = z.discriminatedUnion("toolName", [
  BashToolCallRequestSchema,
  ReadToolCallRequestSchema,
  GlobToolCallRequestSchema,
  GrepToolCallRequestSchema,
]);

export type BashToolCallRequest = z.infer<typeof BashToolCallRequestSchema>;
export type ReadToolCallRequest = z.infer<typeof ReadToolCallRequestSchema>;
export type GlobToolCallRequest = z.infer<typeof GlobToolCallRequestSchema>;
export type GrepToolCallRequest = z.infer<typeof GrepToolCallRequestSchema>;
export type ToolCallRequest = z.infer<typeof ToolCallRequestSchema>;
