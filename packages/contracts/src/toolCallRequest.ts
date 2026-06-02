import { z } from "zod";
import { AssistantSubagentNameSchema } from "./assistantAgent.ts";
import { WorkflowHandoffSchema } from "./workflowHandoff.ts";

export const MAX_BASH_TOOL_TIMEOUT_MILLISECONDS = 300_000;
export const MAX_TOOL_CALL_PATH_LENGTH = 4_096;
export const MAX_READ_TOOL_LINE_COUNT = 600;
export const MAX_BASH_TOOL_COMMAND_LENGTH = 20_000;
export const MAX_BASH_TOOL_DESCRIPTION_LENGTH = 2_000;
export const MAX_GLOB_TOOL_PATTERN_LENGTH = 4_096;
export const MAX_GREP_TOOL_PATTERN_LENGTH = 4_096;
export const MAX_GREP_CONTEXT_LINE_COUNT = 5;
export const MAX_INSPECTION_QUESTION_LENGTH = 2_000;
export const MAX_EDIT_TOOL_SEARCH_TEXT_LENGTH = 1_000_000;
export const MAX_EDIT_TOOL_REPLACEMENT_TEXT_LENGTH = 1_000_000;
export const MAX_EDIT_MANY_TOOL_EDIT_COUNT = 100;
export const MAX_PATCH_TOOL_PATCH_TEXT_LENGTH = 1_000_000;
export const MAX_WRITE_TOOL_FILE_CONTENT_LENGTH = 1_000_000;
export const MAX_TASK_TOOL_DESCRIPTION_LENGTH = 2_000;
export const MAX_TASK_TOOL_PROMPT_LENGTH = 100_000;
export const MAX_SKILL_NAME_LENGTH = 64;
export const SKILL_NAME_PATTERN_TEXT = "^[a-z0-9]+(?:-[a-z0-9]+)*$";
export const MAX_CODEBASE_KNOWLEDGE_REFERENCE_COUNT = 50;
export const MAX_CODEBASE_KNOWLEDGE_SYMBOL_NAME_LENGTH = 512;

const WorkspacePathSchema = z.string().min(1).max(MAX_TOOL_CALL_PATH_LENGTH);
const InspectionQuestionSchema = z.string().min(1).max(MAX_INSPECTION_QUESTION_LENGTH);
const PATCH_FILE_SECTION_HEADER_PREFIXES = ["*** Add File:", "*** Update File:", "*** Delete File:"] as const;
const PATCH_TEXT_WITH_EXACTLY_ONE_FILE_SECTION_PATTERN = /^\s*\*\*\* Begin Patch\n(?:[ \t]*\n)*(?:\*\*\* (?:Add File|Update File|Delete File): [^\n]+\n?)(?:(?!\n\*\*\* (?:Add File|Update File|Delete File):)[\s\S])*\n\*\*\* End Patch\s*$/;
const PATCH_TEXT_WITH_ONE_OR_MORE_FILE_SECTIONS_PATTERN = /^\s*\*\*\* Begin Patch\n[\s\S]*\*\*\* (?:Add File|Update File|Delete File): [^\n]+[\s\S]*\n\*\*\* End Patch\s*$/;

type PatchTextStructure = {
  hasValidEnvelope: boolean;
  fileSectionCount: number;
  hasMalformedFileSectionHeader: boolean;
};

const PatchToolPatchTextSchema = z.string()
  .min(1)
  .max(MAX_PATCH_TOOL_PATCH_TEXT_LENGTH)
  .regex(PATCH_TEXT_WITH_EXACTLY_ONE_FILE_SECTION_PATTERN, "Patch text must contain exactly one file section inside Begin/End markers")
  .superRefine((patchText, context) => {
    const patchTextStructure = inspectPatchTextStructure(patchText);
    addPatchTextEnvelopeIssues(patchTextStructure, context);
    if (patchTextStructure.hasValidEnvelope && patchTextStructure.fileSectionCount !== 1) {
      context.addIssue({
        code: "custom",
        message: `Patch must contain exactly one file section; received ${patchTextStructure.fileSectionCount}`,
      });
    }
  });

const PatchManyToolPatchTextSchema = z.string()
  .min(1)
  .max(MAX_PATCH_TOOL_PATCH_TEXT_LENGTH)
  .regex(PATCH_TEXT_WITH_ONE_OR_MORE_FILE_SECTIONS_PATTERN, "PatchMany text must contain one or more file sections inside Begin/End markers")
  .superRefine((patchText, context) => {
    const patchTextStructure = inspectPatchTextStructure(patchText);
    addPatchTextEnvelopeIssues(patchTextStructure, context);
    if (patchTextStructure.hasValidEnvelope && patchTextStructure.fileSectionCount < 1) {
      context.addIssue({
        code: "custom",
        message: "PatchMany must contain at least one file section",
      });
    }
  });

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
    maximumLineCount: z.number().int().positive().max(MAX_READ_TOOL_LINE_COUNT).optional(),
    inspectionQuestion: InspectionQuestionSchema.optional(),
  })
  .strict();

export const GlobToolCallRequestSchema = z
  .object({
    toolName: z.literal("glob"),
    globPattern: z.string().min(1).max(MAX_GLOB_TOOL_PATTERN_LENGTH),
    searchDirectoryPath: WorkspacePathSchema.optional(),
    inspectionQuestion: InspectionQuestionSchema.optional(),
  })
  .strict();

export const GrepToolCallRequestSchema = z
  .object({
    toolName: z.literal("grep"),
    regexPattern: z.string().min(1).max(MAX_GREP_TOOL_PATTERN_LENGTH),
    searchPath: WorkspacePathSchema.optional(),
    includeGlobPattern: z.string().min(1).max(MAX_GLOB_TOOL_PATTERN_LENGTH).optional(),
    contextLineCount: z.number().int().nonnegative().max(MAX_GREP_CONTEXT_LINE_COUNT).optional(),
    inspectionQuestion: InspectionQuestionSchema.optional(),
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

export const EditManyToolCallEditSchema = z
  .object({
    editTargetPath: WorkspacePathSchema,
    oldString: z.string().min(1).max(MAX_EDIT_TOOL_SEARCH_TEXT_LENGTH),
    newString: z.string().max(MAX_EDIT_TOOL_REPLACEMENT_TEXT_LENGTH),
    replaceAll: z.boolean().optional(),
  })
  .strict();

export const EditManyToolCallRequestSchema = z
  .object({
    toolName: z.literal("edit_many"),
    edits: z.array(EditManyToolCallEditSchema).min(1).max(MAX_EDIT_MANY_TOOL_EDIT_COUNT),
  })
  .strict();

export const PatchToolCallRequestSchema = z
  .object({
    toolName: z.literal("patch"),
    patchText: PatchToolPatchTextSchema,
  })
  .strict();

export const PatchManyToolCallRequestSchema = z
  .object({
    toolName: z.literal("patch_many"),
    patchText: PatchManyToolPatchTextSchema,
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

export const SkillToolCallRequestSchema = z
  .object({
    toolName: z.literal("skill"),
    skillName: z.string().min(1).max(MAX_SKILL_NAME_LENGTH).regex(new RegExp(SKILL_NAME_PATTERN_TEXT)),
  })
  .strict();

export const RecordWorkflowHandoffToolCallRequestSchema = z
  .object({
    toolName: z.literal("record_workflow_handoff"),
    workflowHandoff: WorkflowHandoffSchema,
  })
  .strict();

export const LocateCodebaseSymbolsToolCallRequestSchema = z
  .object({
    toolName: z.literal("locate_codebase_symbols"),
    symbolNames: z
      .array(z.string().min(1).max(MAX_CODEBASE_KNOWLEDGE_SYMBOL_NAME_LENGTH))
      .min(1)
      .max(MAX_CODEBASE_KNOWLEDGE_REFERENCE_COUNT),
    filePaths: z.array(WorkspacePathSchema).max(MAX_CODEBASE_KNOWLEDGE_REFERENCE_COUNT).optional(),
  })
  .strict();

export const AssistantToolCallRequestSchema = z.discriminatedUnion("toolName", [
  BashToolCallRequestSchema,
  ReadToolCallRequestSchema,
  GlobToolCallRequestSchema,
  GrepToolCallRequestSchema,
  EditToolCallRequestSchema,
  EditManyToolCallRequestSchema,
  PatchToolCallRequestSchema,
  PatchManyToolCallRequestSchema,
  WriteToolCallRequestSchema,
  TaskToolCallRequestSchema,
  SkillToolCallRequestSchema,
  RecordWorkflowHandoffToolCallRequestSchema,
  LocateCodebaseSymbolsToolCallRequestSchema,
]);

export const ToolCallRequestSchema = z.discriminatedUnion("toolName", [
  BashToolCallRequestSchema,
  ReadToolCallRequestSchema,
  GlobToolCallRequestSchema,
  GrepToolCallRequestSchema,
  EditToolCallRequestSchema,
  EditManyToolCallRequestSchema,
  PatchToolCallRequestSchema,
  PatchManyToolCallRequestSchema,
  WriteToolCallRequestSchema,
  TaskToolCallRequestSchema,
  SkillToolCallRequestSchema,
  RecordWorkflowHandoffToolCallRequestSchema,
  LocateCodebaseSymbolsToolCallRequestSchema,
]);

export type BashToolCallRequest = z.infer<typeof BashToolCallRequestSchema>;
export type ReadToolCallRequest = z.infer<typeof ReadToolCallRequestSchema>;
export type GlobToolCallRequest = z.infer<typeof GlobToolCallRequestSchema>;
export type GrepToolCallRequest = z.infer<typeof GrepToolCallRequestSchema>;
export type EditToolCallRequest = z.infer<typeof EditToolCallRequestSchema>;
export type EditManyToolCallEdit = z.infer<typeof EditManyToolCallEditSchema>;
export type EditManyToolCallRequest = z.infer<typeof EditManyToolCallRequestSchema>;
export type PatchToolCallRequest = z.infer<typeof PatchToolCallRequestSchema>;
export type PatchManyToolCallRequest = z.infer<typeof PatchManyToolCallRequestSchema>;
export type WriteToolCallRequest = z.infer<typeof WriteToolCallRequestSchema>;
export type TaskToolCallRequest = z.infer<typeof TaskToolCallRequestSchema>;
export type SkillToolCallRequest = z.infer<typeof SkillToolCallRequestSchema>;
export type RecordWorkflowHandoffToolCallRequest = z.infer<typeof RecordWorkflowHandoffToolCallRequestSchema>;
export type LocateCodebaseSymbolsToolCallRequest = z.infer<typeof LocateCodebaseSymbolsToolCallRequestSchema>;
export type AssistantToolCallRequest = z.infer<typeof AssistantToolCallRequestSchema>;
export type ToolCallRequest = z.infer<typeof ToolCallRequestSchema>;

function inspectPatchTextStructure(patchText: string): PatchTextStructure {
  const patchLines = patchText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n");
  const beginPatchLineIndex = patchLines.findIndex((patchLine) => patchLine.trim() === "*** Begin Patch");
  const endPatchLineIndex = patchLines.findIndex((patchLine, patchLineIndex) =>
    patchLineIndex > beginPatchLineIndex && patchLine.trim() === "*** End Patch"
  );
  if (beginPatchLineIndex < 0 || endPatchLineIndex < 0 || beginPatchLineIndex >= endPatchLineIndex) {
    return { hasValidEnvelope: false, fileSectionCount: 0, hasMalformedFileSectionHeader: false };
  }

  let fileSectionCount = 0;
  let hasMalformedFileSectionHeader = false;
  for (const patchLine of patchLines.slice(beginPatchLineIndex + 1, endPatchLineIndex)) {
    const headerPrefix = PATCH_FILE_SECTION_HEADER_PREFIXES.find((prefix) => patchLine.startsWith(prefix));
    if (headerPrefix === undefined) {
      continue;
    }

    fileSectionCount += 1;
    if (patchLine.slice(headerPrefix.length).trim().length === 0) {
      hasMalformedFileSectionHeader = true;
    }
  }

  return { hasValidEnvelope: true, fileSectionCount, hasMalformedFileSectionHeader };
}

function addPatchTextEnvelopeIssues(
  patchTextStructure: PatchTextStructure,
  context: z.RefinementCtx,
): void {
  if (!patchTextStructure.hasValidEnvelope) {
    context.addIssue({
      code: "custom",
      message: "Patch text must contain *** Begin Patch and *** End Patch markers in order",
    });
    return;
  }
  if (patchTextStructure.hasMalformedFileSectionHeader) {
    context.addIssue({
      code: "custom",
      message: "Patch file section headers must include a path",
    });
  }
}
