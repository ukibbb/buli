import { z } from "zod";
import { AssistantSubagentNameSchema } from "./assistantAgent.ts";

export const MAX_BASH_TOOL_TIMEOUT_MILLISECONDS = 300_000;
export const MAX_TOOL_CALL_PATH_LENGTH = 4_096;
export const MAX_BASH_TOOL_COMMAND_LENGTH = 20_000;
export const MAX_BASH_TOOL_DESCRIPTION_LENGTH = 2_000;
export const MAX_GLOB_TOOL_PATTERN_LENGTH = 4_096;
export const MAX_GREP_TOOL_PATTERN_LENGTH = 4_096;
export const MAX_EDIT_TOOL_SEARCH_TEXT_LENGTH = 1_000_000;
export const MAX_EDIT_TOOL_REPLACEMENT_TEXT_LENGTH = 1_000_000;
export const MAX_WRITE_TOOL_FILE_CONTENT_LENGTH = 1_000_000;
export const MAX_TASK_TOOL_DESCRIPTION_LENGTH = 2_000;
export const MAX_TASK_TOOL_PROMPT_LENGTH = 100_000;

const WorkspacePathSchema = z.string().min(1).max(MAX_TOOL_CALL_PATH_LENGTH);

export const BashToolCallRequestSchema = z
  .object({
    toolName: z.literal("bash"),
    shellCommand: z.string().min(1).max(MAX_BASH_TOOL_COMMAND_LENGTH),
    commandDescription: z.string().min(1).max(MAX_BASH_TOOL_DESCRIPTION_LENGTH),
    workingDirectoryPath: WorkspacePathSchema.optional(),
    timeoutMilliseconds: z.number().int().positive().max(MAX_BASH_TOOL_TIMEOUT_MILLISECONDS).optional(),
  })
  .strict();

export const ReadToolCallRequestSchema = z
  .object({
    toolName: z.literal("read"),
    readTargetPath: WorkspacePathSchema,
    offsetLineNumber: z.number().int().positive().optional(),
    maximumLineCount: z.number().int().positive().optional(),
  })
  .strict();

export const GlobToolCallRequestSchema = z
  .object({
    toolName: z.literal("glob"),
    globPattern: z.string().min(1).max(MAX_GLOB_TOOL_PATTERN_LENGTH),
    searchDirectoryPath: WorkspacePathSchema.optional(),
  })
  .strict();

export const GrepToolCallRequestSchema = z
  .object({
    toolName: z.literal("grep"),
    regexPattern: z.string().min(1).max(MAX_GREP_TOOL_PATTERN_LENGTH),
    searchPath: WorkspacePathSchema.optional(),
    includeGlobPattern: z.string().min(1).max(MAX_GLOB_TOOL_PATTERN_LENGTH).optional(),
  })
  .strict();

export const EditToolCallRequestSchema = z
  .object({
    toolName: z.literal("edit"),
    editTargetPath: WorkspacePathSchema,
    oldString: z.string().min(1).max(MAX_EDIT_TOOL_SEARCH_TEXT_LENGTH),
    newString: z.string().max(MAX_EDIT_TOOL_REPLACEMENT_TEXT_LENGTH),
  })
  .strict();

export const WriteToolCallRequestSchema = z
  .object({
    toolName: z.literal("write"),
    writeTargetPath: WorkspacePathSchema,
    fileContent: z.string().max(MAX_WRITE_TOOL_FILE_CONTENT_LENGTH),
  })
  .strict();

export const TaskToolCallRequestSchema = z
  .object({
    toolName: z.literal("task"),
    subagentName: AssistantSubagentNameSchema,
    subagentDescription: z.string().min(1).max(MAX_TASK_TOOL_DESCRIPTION_LENGTH),
    subagentPrompt: z.string().min(1).max(MAX_TASK_TOOL_PROMPT_LENGTH),
  })
  .strict();

export const ToolCallRequestSchema = z.discriminatedUnion("toolName", [
  BashToolCallRequestSchema,
  ReadToolCallRequestSchema,
  GlobToolCallRequestSchema,
  GrepToolCallRequestSchema,
  EditToolCallRequestSchema,
  WriteToolCallRequestSchema,
  TaskToolCallRequestSchema,
]);

export type BashToolCallRequest = z.infer<typeof BashToolCallRequestSchema>;
export type ReadToolCallRequest = z.infer<typeof ReadToolCallRequestSchema>;
export type GlobToolCallRequest = z.infer<typeof GlobToolCallRequestSchema>;
export type GrepToolCallRequest = z.infer<typeof GrepToolCallRequestSchema>;
export type EditToolCallRequest = z.infer<typeof EditToolCallRequestSchema>;
export type WriteToolCallRequest = z.infer<typeof WriteToolCallRequestSchema>;
export type TaskToolCallRequest = z.infer<typeof TaskToolCallRequestSchema>;
export type ToolCallRequest = z.infer<typeof ToolCallRequestSchema>;
