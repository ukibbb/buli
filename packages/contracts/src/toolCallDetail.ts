// Typed per-tool detail payloads carried by tool-call events. Each tool has
// its own arm so the terminal can render a dedicated card (file preview, grep
// hits, diff, shell transcript, todo list, sub-agent summary). A generic
// "tool args as JSON" shape would collapse these concepts and lose the
// rendering affordances the design depends on.
import { z } from "zod";
import { AssistantSubagentNameSchema } from "./assistantAgent.ts";
import { WorkspacePatchFileDiffSchema } from "./workspacePatch.ts";

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

export const ToolCallGrepContextLineSchema = z
  .object({
    lineNumber: z.number().int().positive(),
    lineText: z.string(),
  })
  .strict();
export type ToolCallGrepContextLine = z.infer<typeof ToolCallGrepContextLineSchema>;

export const ToolCallReadDetailSchema = z
  .object({
    toolName: z.literal("read"),
    readFilePath: z.string().min(1),
    readLineCount: z.number().int().nonnegative().optional(),
    returnedLineCount: z.number().int().nonnegative().optional(),
    readByteCount: z.number().int().nonnegative().optional(),
    previewLines: z.array(ToolCallReadPreviewLineSchema).optional(),
    wasLineCountTruncated: z.boolean().optional(),
  })
  .strict();
export type ToolCallReadDetail = z.infer<typeof ToolCallReadDetailSchema>;

export const ToolCallGrepMatchSchema = z
  .object({
    matchFilePath: z.string().min(1),
    matchLineNumber: z.number().int().positive(),
    matchSnippet: z.string(),
    contextBeforeLines: z.array(ToolCallGrepContextLineSchema).optional(),
    contextAfterLines: z.array(ToolCallGrepContextLineSchema).optional(),
  })
  .strict();
export type ToolCallGrepMatch = z.infer<typeof ToolCallGrepMatchSchema>;

export const ToolCallGrepDetailSchema = z
  .object({
    toolName: z.literal("grep"),
    searchPattern: z.string(),
    matchedFileCount: z.number().int().nonnegative().optional(),
    totalMatchCount: z.number().int().nonnegative().optional(),
    returnedMatchHitCount: z.number().int().nonnegative().optional(),
    contextLineCount: z.number().int().nonnegative().optional(),
    matchHits: z.array(ToolCallGrepMatchSchema).optional(),
  })
  .strict();
export type ToolCallGrepDetail = z.infer<typeof ToolCallGrepDetailSchema>;

export const ToolCallGlobDetailSchema = z
  .object({
    toolName: z.literal("glob"),
    globPattern: z.string().min(1),
    searchDirectoryPath: z.string().min(1).optional(),
    matchedPathCount: z.number().int().nonnegative().optional(),
    returnedPathCount: z.number().int().nonnegative().optional(),
    matchedPaths: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type ToolCallGlobDetail = z.infer<typeof ToolCallGlobDetailSchema>;

export const UnifiedDiffTextSchema = z.string().min(1);
export type UnifiedDiffText = z.infer<typeof UnifiedDiffTextSchema>;

export const ToolCallEditDetailSchema = z
  .object({
    toolName: z.literal("edit"),
    editedFilePath: z.string().min(1),
    addedLineCount: z.number().int().nonnegative().optional(),
    removedLineCount: z.number().int().nonnegative().optional(),
    unifiedDiffText: UnifiedDiffTextSchema.optional(),
  })
  .strict();
export type ToolCallEditDetail = z.infer<typeof ToolCallEditDetailSchema>;

export const ToolCallEditManyDetailSchema = z
  .object({
    toolName: z.literal("edit_many"),
    editCount: z.number().int().positive(),
    editedFileCount: z.number().int().nonnegative().optional(),
    addedLineCount: z.number().int().nonnegative().optional(),
    removedLineCount: z.number().int().nonnegative().optional(),
    changedFiles: z.array(WorkspacePatchFileDiffSchema).optional(),
  })
  .strict();
export type ToolCallEditManyDetail = z.infer<typeof ToolCallEditManyDetailSchema>;

export const ToolCallPatchDetailSchema = z
  .object({
    toolName: z.literal("patch"),
    patchTargetText: z.string().min(1),
    changedFileCount: z.number().int().nonnegative().optional(),
    addedLineCount: z.number().int().nonnegative().optional(),
    removedLineCount: z.number().int().nonnegative().optional(),
    changedFiles: z.array(WorkspacePatchFileDiffSchema).optional(),
  })
  .strict();
export type ToolCallPatchDetail = z.infer<typeof ToolCallPatchDetailSchema>;

export const ToolCallPatchManyDetailSchema = z
  .object({
    toolName: z.literal("patch_many"),
    patchTargetText: z.string().min(1),
    changedFileCount: z.number().int().nonnegative().optional(),
    addedLineCount: z.number().int().nonnegative().optional(),
    removedLineCount: z.number().int().nonnegative().optional(),
    changedFiles: z.array(WorkspacePatchFileDiffSchema).optional(),
  })
  .strict();
export type ToolCallPatchManyDetail = z.infer<typeof ToolCallPatchManyDetailSchema>;

export const ToolCallWriteDetailSchema = z
  .object({
    toolName: z.literal("write"),
    writtenFilePath: z.string().min(1),
    addedLineCount: z.number().int().nonnegative().optional(),
    removedLineCount: z.number().int().nonnegative().optional(),
    unifiedDiffText: UnifiedDiffTextSchema.optional(),
  })
  .strict();
export type ToolCallWriteDetail = z.infer<typeof ToolCallWriteDetailSchema>;

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
    commandDescription: z.string().min(1).optional(),
    workingDirectoryPath: z.string().min(1).optional(),
    timeoutMilliseconds: z.number().int().positive().optional(),
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

export const ToolCallSkillSourceKindSchema = z.enum(["built_in", "buli", "claude", "agents"]);
export type ToolCallSkillSourceKind = z.infer<typeof ToolCallSkillSourceKindSchema>;

export const ToolCallSkillDetailSchema = z
  .object({
    toolName: z.literal("skill"),
    skillName: z.string().min(1),
    skillDescription: z.string().min(1).optional(),
    skillSourceKind: ToolCallSkillSourceKindSchema.optional(),
    skillInstructionFilePath: z.string().min(1).optional(),
  })
  .strict();
export type ToolCallSkillDetail = z.infer<typeof ToolCallSkillDetailSchema>;

export const ToolCallLocateCodebaseSymbolsDetailSchema = z
  .object({
    toolName: z.literal("locate_codebase_symbols"),
    symbolNames: z.array(z.string().min(1)).optional(),
    filePaths: z.array(z.string().min(1)).optional(),
    matchedKnowledgeCount: z.number().int().nonnegative().optional(),
    recommendedReadCount: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ToolCallLocateCodebaseSymbolsDetail = z.infer<typeof ToolCallLocateCodebaseSymbolsDetailSchema>;

export const SubagentChildTaskToolCallDetailSchema = z
  .object({
    toolName: z.literal("task"),
    subagentName: AssistantSubagentNameSchema,
    subagentDescription: z.string().min(1),
    subagentPrompt: z.string().optional(),
  })
  .strict();
export type SubagentChildTaskToolCallDetail = z.infer<typeof SubagentChildTaskToolCallDetailSchema>;

export const SubagentChildToolCallStatusSchema = z.enum(["running", "completed", "failed", "denied", "interrupted"]);
export type SubagentChildToolCallStatus = z.infer<typeof SubagentChildToolCallStatusSchema>;

export const SubagentChildToolCallDetailSchema = z.discriminatedUnion("toolName", [
  ToolCallReadDetailSchema,
  ToolCallGlobDetailSchema,
  ToolCallGrepDetailSchema,
  ToolCallLocateCodebaseSymbolsDetailSchema,
  ToolCallBashDetailSchema,
  ToolCallEditDetailSchema,
  ToolCallEditManyDetailSchema,
  ToolCallPatchDetailSchema,
  ToolCallPatchManyDetailSchema,
  ToolCallWriteDetailSchema,
  ToolCallSkillDetailSchema,
  SubagentChildTaskToolCallDetailSchema,
]);
export type SubagentChildToolCallDetail = z.infer<typeof SubagentChildToolCallDetailSchema>;

export const SubagentChildToolCallSchema = z
  .object({
    subagentChildToolCallId: z.string().min(1),
    subagentChildToolCallStatus: SubagentChildToolCallStatusSchema,
    subagentChildToolCallStartedAtMs: z.number().int().nonnegative(),
    subagentChildToolCallDetail: SubagentChildToolCallDetailSchema,
    subagentChildToolCallDurationMs: z.number().int().nonnegative().optional(),
    subagentChildToolCallErrorText: z.string().min(1).optional(),
    subagentChildToolCallDenialText: z.string().min(1).optional(),
  })
  .strict();
export type SubagentChildToolCall = z.infer<typeof SubagentChildToolCallSchema>;

export const SubagentResearchCheckpointReasonSchema = z.enum([
  "child_tool_call_count",
  "child_tool_result_text_length",
  "elapsed_time",
]);
export type SubagentResearchCheckpointReason = z.infer<typeof SubagentResearchCheckpointReasonSchema>;

export const SubagentResearchCheckpointSchema = z
  .object({
    checkpointReason: SubagentResearchCheckpointReasonSchema,
    childToolCallCount: z.number().int().nonnegative(),
    childToolResultTextLength: z.number().int().nonnegative(),
    skippedChildToolCallCount: z.number().int().nonnegative(),
    elapsedMilliseconds: z.number().int().nonnegative().optional(),
    softElapsedTimeCheckpointMilliseconds: z.number().int().positive().optional(),
  })
  .strict();
export type SubagentResearchCheckpoint = z.infer<typeof SubagentResearchCheckpointSchema>;

export const ToolCallTaskDetailSchema = z
  .object({
    toolName: z.literal("task"),
    subagentName: AssistantSubagentNameSchema,
    subagentDescription: z.string().min(1),
    subagentPrompt: z.string().optional(),
    subagentChildToolCalls: z.array(SubagentChildToolCallSchema).optional(),
    subagentResearchCheckpoint: SubagentResearchCheckpointSchema.optional(),
    subagentResultSummary: z.string().optional(),
  })
  .strict();
export type ToolCallTaskDetail = z.infer<typeof ToolCallTaskDetailSchema>;

export const ToolCallDetailSchema = z.discriminatedUnion("toolName", [
  ToolCallReadDetailSchema,
  ToolCallGrepDetailSchema,
  ToolCallGlobDetailSchema,
  ToolCallEditDetailSchema,
  ToolCallEditManyDetailSchema,
  ToolCallPatchDetailSchema,
  ToolCallPatchManyDetailSchema,
  ToolCallWriteDetailSchema,
  ToolCallBashDetailSchema,
  ToolCallTodoWriteDetailSchema,
  ToolCallTaskDetailSchema,
  ToolCallSkillDetailSchema,
  ToolCallLocateCodebaseSymbolsDetailSchema,
]);
export type ToolCallDetail = z.infer<typeof ToolCallDetailSchema>;
