// Typed per-tool detail payloads carried by tool-call events. Each tool has
// its own arm so the terminal can render a dedicated card (file preview, grep
// hits, diff, shell transcript, todo list, sub-agent summary). A generic
// "tool args as JSON" shape would collapse these concepts and lose the
// rendering affordances the design depends on.
import { z } from "zod";

export const SyntaxHighlightSpanStyleSchema = z.enum([
  "keyword",
  "identifier",
  "string",
  "comment",
  "module",
  "type",
  "number",
  "symbol",
  "self",
  "decorator",
]);
export type SyntaxHighlightSpanStyle = z.infer<typeof SyntaxHighlightSpanStyleSchema>;

export const SyntaxHighlightSpanSchema = z
  .object({
    spanText: z.string(),
    spanStyle: SyntaxHighlightSpanStyleSchema,
  })
  .strict();
export type SyntaxHighlightSpan = z.infer<typeof SyntaxHighlightSpanSchema>;

export const ToolCallReadPreviewLineSchema = z
  .object({
    lineNumber: z.number().int().positive(),
    lineText: z.string(),
    syntaxHighlightSpans: z.array(SyntaxHighlightSpanSchema).optional(),
  })
  .strict();
export type ToolCallReadPreviewLine = z.infer<typeof ToolCallReadPreviewLineSchema>;

export const ToolCallReadDetailSchema = z
  .object({
    toolName: z.literal("read"),
    readFilePath: z.string().min(1),
    readLineCount: z.number().int().nonnegative().optional(),
    readByteCount: z.number().int().nonnegative().optional(),
    previewLines: z.array(ToolCallReadPreviewLineSchema).optional(),
  })
  .strict();
export type ToolCallReadDetail = z.infer<typeof ToolCallReadDetailSchema>;

export const ToolCallGrepMatchSchema = z
  .object({
    matchFilePath: z.string().min(1),
    matchLineNumber: z.number().int().positive(),
    matchSnippet: z.string(),
  })
  .strict();
export type ToolCallGrepMatch = z.infer<typeof ToolCallGrepMatchSchema>;

export const ToolCallGrepDetailSchema = z
  .object({
    toolName: z.literal("grep"),
    searchPattern: z.string(),
    matchedFileCount: z.number().int().nonnegative().optional(),
    totalMatchCount: z.number().int().nonnegative().optional(),
    matchHits: z.array(ToolCallGrepMatchSchema).optional(),
  })
  .strict();
export type ToolCallGrepDetail = z.infer<typeof ToolCallGrepDetailSchema>;

export const ToolCallEditDiffLineKindSchema = z.enum(["context", "addition", "removal"]);
export type ToolCallEditDiffLineKind = z.infer<typeof ToolCallEditDiffLineKindSchema>;

export const ToolCallEditDiffLineSchema = z
  .object({
    lineNumber: z.number().int().positive().optional(),
    lineKind: ToolCallEditDiffLineKindSchema,
    lineText: z.string(),
  })
  .strict();
export type ToolCallEditDiffLine = z.infer<typeof ToolCallEditDiffLineSchema>;

export const ToolCallEditDetailSchema = z
  .object({
    toolName: z.literal("edit"),
    editedFilePath: z.string().min(1),
    addedLineCount: z.number().int().nonnegative().optional(),
    removedLineCount: z.number().int().nonnegative().optional(),
    diffLines: z.array(ToolCallEditDiffLineSchema).optional(),
  })
  .strict();
export type ToolCallEditDetail = z.infer<typeof ToolCallEditDetailSchema>;

export const ToolCallBashOutputLineKindSchema = z.enum(["prompt", "stdout", "stderr"]);
export type ToolCallBashOutputLineKind = z.infer<typeof ToolCallBashOutputLineKindSchema>;

export const ToolCallBashOutputLineSchema = z
  .object({
    lineKind: ToolCallBashOutputLineKindSchema,
    lineText: z.string(),
  })
  .strict();
export type ToolCallBashOutputLine = z.infer<typeof ToolCallBashOutputLineSchema>;

export const ToolCallBashDetailSchema = z
  .object({
    toolName: z.literal("bash"),
    commandLine: z.string().min(1),
    exitCode: z.number().int().optional(),
    outputLines: z.array(ToolCallBashOutputLineSchema).optional(),
  })
  .strict();
export type ToolCallBashDetail = z.infer<typeof ToolCallBashDetailSchema>;

export const ToolCallTodoItemStatusSchema = z.enum(["pending", "in_progress", "completed"]);
export type ToolCallTodoItemStatus = z.infer<typeof ToolCallTodoItemStatusSchema>;

export const ToolCallTodoItemSchema = z
  .object({
    todoItemTitle: z.string().min(1),
    todoItemStatus: ToolCallTodoItemStatusSchema,
  })
  .strict();
export type ToolCallTodoItem = z.infer<typeof ToolCallTodoItemSchema>;

export const ToolCallTodoWriteDetailSchema = z
  .object({
    toolName: z.literal("todowrite"),
    todoItems: z.array(ToolCallTodoItemSchema),
  })
  .strict();
export type ToolCallTodoWriteDetail = z.infer<typeof ToolCallTodoWriteDetailSchema>;

export const ToolCallTaskDetailSchema = z
  .object({
    toolName: z.literal("task"),
    subagentDescription: z.string().min(1),
    subagentPrompt: z.string().optional(),
    subagentResultSummary: z.string().optional(),
  })
  .strict();
export type ToolCallTaskDetail = z.infer<typeof ToolCallTaskDetailSchema>;

export const ToolCallDetailSchema = z.discriminatedUnion("toolName", [
  ToolCallReadDetailSchema,
  ToolCallGrepDetailSchema,
  ToolCallEditDetailSchema,
  ToolCallBashDetailSchema,
  ToolCallTodoWriteDetailSchema,
  ToolCallTaskDetailSchema,
]);
export type ToolCallDetail = z.infer<typeof ToolCallDetailSchema>;
