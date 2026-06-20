import type {
  BuiltInToolCallDetail,
  CustomToolCallDetail,
  ToolCallBashDetail,
  ToolCallDetail,
  ToolCallEditDetail,
  ToolCallEditManyDetail,
  ToolCallGlobDetail,
  ToolCallGrepDetail,
  ToolCallPatchDetail,
  ToolCallPatchManyDetail,
  ToolCallReadDetail,
  ToolCallRecordWorkflowHandoffDetail,
  ToolCallSkillDetail,
  ToolCallTaskDetail,
  ToolCallWriteDetail,
} from "./toolCallDetail.ts";
import type { AssistantToolCallRequest, CustomToolCallRequest, ToolCallRequest } from "./toolCallRequest.ts";
import { summarizeWorkflowHandoff } from "./workflowHandoff.ts";

type CompleteAssistantToolRequestNameList<ToolNames extends readonly AssistantToolCallRequest["toolName"][]> = ToolNames & (
  Exclude<AssistantToolCallRequest["toolName"], ToolNames[number]> extends never
    ? unknown
    : readonly ["Missing assistant tool request names", Exclude<AssistantToolCallRequest["toolName"], ToolNames[number]>]
);

function defineCompleteAssistantToolRequestNameList<const ToolNames extends readonly AssistantToolCallRequest["toolName"][]>(
  toolNames: CompleteAssistantToolRequestNameList<ToolNames>,
): ToolNames {
  return toolNames;
}

export const ASSISTANT_TOOL_REQUEST_NAMES = defineCompleteAssistantToolRequestNameList([
  "bash",
  "read",
  "glob",
  "grep",
  "edit",
  "edit_many",
  "patch",
  "patch_many",
  "write",
  "task",
  "skill",
  "record_workflow_handoff",
] as const);
export const WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES = ["read", "glob", "grep"] as const satisfies readonly AssistantToolRequestName[];
export const FILE_MUTATION_TOOL_REQUEST_NAMES = ["edit", "edit_many", "patch", "patch_many", "write"] as const satisfies readonly AssistantToolRequestName[];
export const READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES = ["read", "glob", "grep", "task", "skill", "record_workflow_handoff", "bash"] as const satisfies readonly AssistantToolRequestName[];
export const RENDER_ONLY_TOOL_DETAIL_NAMES = ["todowrite", "web_search"] as const satisfies readonly ToolCallDetailName[];

export type AssistantToolRequestName = (typeof ASSISTANT_TOOL_REQUEST_NAMES)[number];
export type ToolCallRequestName = ToolCallRequest["toolName"];
export type ToolCallDetailName = ToolCallDetail["toolName"];
export type BuiltInToolCallDetailName = AssistantToolRequestName | RenderOnlyToolDetailName;
export type ToolCallRequestByName<ToolName extends ToolCallRequestName> = ToolName extends AssistantToolRequestName ? Extract<
    AssistantToolCallRequest,
    { toolName: ToolName }
  >
  : CustomToolCallRequest;
export type ToolCallDetailByName<ToolName extends ToolCallDetailName> = ToolName extends BuiltInToolCallDetailName ? Extract<
    BuiltInToolCallDetail,
    { toolName: ToolName }
  >
  : CustomToolCallDetail;
export type StartedToolCallDetailByRequestName<ToolName extends AssistantToolRequestName> = Extract<
  BuiltInToolCallDetail,
  { toolName: ToolName }
>;
export type AssistantToolCallDetail = StartedToolCallDetailByRequestName<AssistantToolRequestName>;
export type WorkspaceInspectionToolRequestName = (typeof WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES)[number];
export type WorkspaceInspectionToolCallRequest = ToolCallRequestByName<WorkspaceInspectionToolRequestName>;
export type FileMutationToolRequestName = (typeof FILE_MUTATION_TOOL_REQUEST_NAMES)[number];
export type FileMutationToolCallRequest = ToolCallRequestByName<FileMutationToolRequestName>;
export type ReadOnlyAssistantModeToolRequestName = (typeof READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES)[number];
export type RenderOnlyToolDetailName = (typeof RENDER_ONLY_TOOL_DETAIL_NAMES)[number];

const ASSISTANT_TOOL_REQUEST_NAME_SET: ReadonlySet<string> = new Set(ASSISTANT_TOOL_REQUEST_NAMES);
const RENDER_ONLY_TOOL_DETAIL_NAME_SET: ReadonlySet<string> = new Set(RENDER_ONLY_TOOL_DETAIL_NAMES);
const WORKSPACE_INSPECTION_TOOL_REQUEST_NAME_SET: ReadonlySet<string> = new Set(WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES);
const FILE_MUTATION_TOOL_REQUEST_NAME_SET: ReadonlySet<string> = new Set(FILE_MUTATION_TOOL_REQUEST_NAMES);
const READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAME_SET: ReadonlySet<string> = new Set(READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES);

export function isAssistantToolRequestName(toolName: string): toolName is AssistantToolRequestName {
  return ASSISTANT_TOOL_REQUEST_NAME_SET.has(toolName);
}

export function isRenderOnlyToolDetailName(toolName: string): toolName is RenderOnlyToolDetailName {
  return RENDER_ONLY_TOOL_DETAIL_NAME_SET.has(toolName);
}

export function isBuiltInToolCallDetailName(toolName: string): toolName is BuiltInToolCallDetailName {
  return isAssistantToolRequestName(toolName) || isRenderOnlyToolDetailName(toolName);
}

export function isCustomToolName(toolName: string): boolean {
  return !isAssistantToolRequestName(toolName);
}

export function isCustomToolCallRequest(toolCallRequest: ToolCallRequest): toolCallRequest is CustomToolCallRequest {
  return !isAssistantToolRequestName(toolCallRequest.toolName);
}

export function isCustomToolCallDetail(toolCallDetail: ToolCallDetail): toolCallDetail is CustomToolCallDetail {
  return !isBuiltInToolCallDetailName(toolCallDetail.toolName);
}

export function isWorkspaceInspectionToolCallRequest(
  toolCallRequest: ToolCallRequest,
): toolCallRequest is WorkspaceInspectionToolCallRequest {
  return WORKSPACE_INSPECTION_TOOL_REQUEST_NAME_SET.has(toolCallRequest.toolName);
}

export function isFileMutationToolCallRequest(
  toolCallRequest: ToolCallRequest,
): toolCallRequest is FileMutationToolCallRequest {
  return FILE_MUTATION_TOOL_REQUEST_NAME_SET.has(toolCallRequest.toolName);
}

export function isTaskToolCallRequest(
  toolCallRequest: ToolCallRequest,
): toolCallRequest is ToolCallRequestByName<"task"> {
  return toolCallRequest.toolName === "task";
}

export function isSkillToolCallRequest(
  toolCallRequest: ToolCallRequest,
): toolCallRequest is ToolCallRequestByName<"skill"> {
  return toolCallRequest.toolName === "skill";
}

export function isRecordWorkflowHandoffToolCallRequest(
  toolCallRequest: ToolCallRequest,
): toolCallRequest is ToolCallRequestByName<"record_workflow_handoff"> {
  return toolCallRequest.toolName === "record_workflow_handoff";
}

export function isReadOnlyAssistantModeToolRequestName(
  toolName: AssistantToolRequestName,
): toolName is ReadOnlyAssistantModeToolRequestName {
  return READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAME_SET.has(toolName);
}

export function createStartedToolCallDetailFromRequest<ToolName extends AssistantToolRequestName>(
  toolCallRequest: ToolCallRequestByName<ToolName>,
): StartedToolCallDetailByRequestName<ToolName>;
export function createStartedToolCallDetailFromRequest(toolCallRequest: CustomToolCallRequest): CustomToolCallDetail;
export function createStartedToolCallDetailFromRequest(toolCallRequest: ToolCallRequest): ToolCallDetail;
export function createStartedToolCallDetailFromRequest(toolCallRequest: ToolCallRequest): ToolCallDetail {
  if (isCustomToolCallRequest(toolCallRequest)) {
    return createStartedCustomToolCallDetail(toolCallRequest);
  }

  if (toolCallRequest.toolName === "bash") {
    return createStartedBashToolCallDetail(toolCallRequest);
  }
  if (toolCallRequest.toolName === "read") {
    return createStartedReadToolCallDetail(toolCallRequest);
  }
  if (toolCallRequest.toolName === "glob") {
    return createStartedGlobToolCallDetail(toolCallRequest);
  }
  if (toolCallRequest.toolName === "grep") {
    return createStartedGrepToolCallDetail(toolCallRequest);
  }
  if (toolCallRequest.toolName === "edit") {
    return createStartedEditToolCallDetail(toolCallRequest);
  }
  if (toolCallRequest.toolName === "edit_many") {
    return createStartedEditManyToolCallDetail(toolCallRequest);
  }
  if (toolCallRequest.toolName === "patch") {
    return createStartedPatchToolCallDetail(toolCallRequest);
  }
  if (toolCallRequest.toolName === "patch_many") {
    return createStartedPatchManyToolCallDetail(toolCallRequest);
  }
  if (toolCallRequest.toolName === "write") {
    return createStartedWriteToolCallDetail(toolCallRequest);
  }
  if (toolCallRequest.toolName === "task") {
    return createStartedTaskToolCallDetail(toolCallRequest);
  }
  if (toolCallRequest.toolName === "skill") {
    return createStartedSkillToolCallDetail(toolCallRequest);
  }
  if (toolCallRequest.toolName === "record_workflow_handoff") {
    return createStartedRecordWorkflowHandoffToolCallDetail(toolCallRequest);
  }
  return assertUnhandledToolCallRequest(toolCallRequest);
}

function createStartedBashToolCallDetail(toolCallRequest: ToolCallRequestByName<"bash">): ToolCallBashDetail {
  return {
    toolName: "bash",
    commandLine: toolCallRequest.shellCommand,
    commandDescription: toolCallRequest.commandDescription,
    ...(toolCallRequest.workingDirectoryPath !== undefined ? { workingDirectoryPath: toolCallRequest.workingDirectoryPath } : {}),
    ...(toolCallRequest.timeoutMilliseconds !== undefined ? { timeoutMilliseconds: toolCallRequest.timeoutMilliseconds } : {}),
  };
}

function createStartedReadToolCallDetail(toolCallRequest: ToolCallRequestByName<"read">): ToolCallReadDetail {
  return {
    toolName: "read",
    readFilePath: toolCallRequest.readTargetPath,
  };
}

function createStartedGlobToolCallDetail(toolCallRequest: ToolCallRequestByName<"glob">): ToolCallGlobDetail {
  return {
    toolName: "glob",
    globPattern: toolCallRequest.globPattern,
    ...(toolCallRequest.searchDirectoryPath !== undefined ? { searchDirectoryPath: toolCallRequest.searchDirectoryPath } : {}),
  };
}

function createStartedGrepToolCallDetail(toolCallRequest: ToolCallRequestByName<"grep">): ToolCallGrepDetail {
  return {
    toolName: "grep",
    searchPattern: toolCallRequest.regexPattern,
    ...(toolCallRequest.contextLineCount !== undefined ? { contextLineCount: toolCallRequest.contextLineCount } : {}),
  };
}

function createStartedEditToolCallDetail(toolCallRequest: ToolCallRequestByName<"edit">): ToolCallEditDetail {
  return {
    toolName: "edit",
    editedFilePath: toolCallRequest.editTargetPath,
  };
}

function createStartedEditManyToolCallDetail(toolCallRequest: ToolCallRequestByName<"edit_many">): ToolCallEditManyDetail {
  return {
    toolName: "edit_many",
    editCount: toolCallRequest.edits.length,
  };
}

function createStartedPatchToolCallDetail(_toolCallRequest: ToolCallRequestByName<"patch">): ToolCallPatchDetail {
  return {
    toolName: "patch",
    patchTargetText: "patch",
  };
}

function createStartedPatchManyToolCallDetail(_toolCallRequest: ToolCallRequestByName<"patch_many">): ToolCallPatchManyDetail {
  return {
    toolName: "patch_many",
    patchTargetText: "patch",
  };
}

function createStartedWriteToolCallDetail(toolCallRequest: ToolCallRequestByName<"write">): ToolCallWriteDetail {
  return {
    toolName: "write",
    writtenFilePath: toolCallRequest.writeTargetPath,
  };
}

function createStartedTaskToolCallDetail(toolCallRequest: ToolCallRequestByName<"task">): ToolCallTaskDetail {
  return {
    toolName: "task",
    subagentName: toolCallRequest.subagentName,
    subagentDescription: toolCallRequest.subagentDescription,
    subagentPrompt: toolCallRequest.subagentPrompt,
  };
}

function createStartedSkillToolCallDetail(toolCallRequest: ToolCallRequestByName<"skill">): ToolCallSkillDetail {
  return {
    toolName: "skill",
    skillName: toolCallRequest.skillName,
  };
}

function createStartedRecordWorkflowHandoffToolCallDetail(
  toolCallRequest: ToolCallRequestByName<"record_workflow_handoff">,
): ToolCallRecordWorkflowHandoffDetail {
  return {
    toolName: "record_workflow_handoff",
    handoffKind: toolCallRequest.workflowHandoff.handoffKind,
    handoffSummary: summarizeWorkflowHandoff(toolCallRequest.workflowHandoff),
  };
}

function createStartedCustomToolCallDetail(toolCallRequest: CustomToolCallRequest): CustomToolCallDetail {
  return {
    toolName: toolCallRequest.toolName,
    toolArgumentsJson: toolCallRequest.toolArgumentsJson,
  };
}

function assertUnhandledToolCallRequest(toolCallRequest: never): never {
  throw new Error(`Unhandled tool call request: ${JSON.stringify(toolCallRequest)}`);
}
