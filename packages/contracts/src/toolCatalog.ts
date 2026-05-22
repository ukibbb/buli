import type {
  ToolCallBashDetail,
  ToolCallDetail,
  ToolCallEditDetail,
  ToolCallGlobDetail,
  ToolCallGrepDetail,
  ToolCallReadDetail,
  ToolCallTaskDetail,
  ToolCallWriteDetail,
} from "./toolCallDetail.ts";
import type { ToolCallRequest } from "./toolCallRequest.ts";

type CompleteAssistantToolRequestNameList<ToolNames extends readonly ToolCallRequest["toolName"][]> = ToolNames & (
  Exclude<ToolCallRequest["toolName"], ToolNames[number]> extends never
    ? unknown
    : readonly ["Missing assistant tool request names", Exclude<ToolCallRequest["toolName"], ToolNames[number]>]
);

function defineCompleteAssistantToolRequestNameList<const ToolNames extends readonly ToolCallRequest["toolName"][]>(
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
  "write",
  "task",
] as const);
export const ASSISTANT_PRESENTATION_FUNCTION_NAMES = ["present_code_execution_walkthrough"] as const;
export const WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES = ["read", "glob", "grep"] as const satisfies readonly AssistantToolRequestName[];
export const FILE_MUTATION_TOOL_REQUEST_NAMES = ["edit", "write"] as const satisfies readonly AssistantToolRequestName[];
export const READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES = ["read", "glob", "grep", "task"] as const satisfies readonly AssistantToolRequestName[];
export const RENDER_ONLY_TOOL_DETAIL_NAMES = ["todowrite"] as const satisfies readonly ToolCallDetailName[];

export type AssistantToolRequestName = (typeof ASSISTANT_TOOL_REQUEST_NAMES)[number];
export type AssistantPresentationFunctionName = (typeof ASSISTANT_PRESENTATION_FUNCTION_NAMES)[number];
export type ToolCallDetailName = ToolCallDetail["toolName"];
export type ToolCallRequestByName<ToolName extends AssistantToolRequestName> = Extract<
  ToolCallRequest,
  { toolName: ToolName }
>;
export type ToolCallDetailByName<ToolName extends ToolCallDetailName> = Extract<
  ToolCallDetail,
  { toolName: ToolName }
>;
export type StartedToolCallDetailByRequestName<ToolName extends AssistantToolRequestName> = Extract<
  ToolCallDetail,
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
const ASSISTANT_PRESENTATION_FUNCTION_NAME_SET: ReadonlySet<string> = new Set(ASSISTANT_PRESENTATION_FUNCTION_NAMES);
const WORKSPACE_INSPECTION_TOOL_REQUEST_NAME_SET: ReadonlySet<string> = new Set(WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES);
const FILE_MUTATION_TOOL_REQUEST_NAME_SET: ReadonlySet<string> = new Set(FILE_MUTATION_TOOL_REQUEST_NAMES);
const READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAME_SET: ReadonlySet<string> = new Set(READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES);

export function isAssistantToolRequestName(toolName: string): toolName is AssistantToolRequestName {
  return ASSISTANT_TOOL_REQUEST_NAME_SET.has(toolName);
}

export function isAssistantPresentationFunctionName(functionName: string): functionName is AssistantPresentationFunctionName {
  return ASSISTANT_PRESENTATION_FUNCTION_NAME_SET.has(functionName);
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

export function isReadOnlyAssistantModeToolRequestName(
  toolName: AssistantToolRequestName,
): toolName is ReadOnlyAssistantModeToolRequestName {
  return READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAME_SET.has(toolName);
}

export function createStartedToolCallDetailFromRequest<ToolName extends AssistantToolRequestName>(
  toolCallRequest: ToolCallRequestByName<ToolName>,
): StartedToolCallDetailByRequestName<ToolName>;
export function createStartedToolCallDetailFromRequest(toolCallRequest: ToolCallRequest): AssistantToolCallDetail {
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
  if (toolCallRequest.toolName === "write") {
    return createStartedWriteToolCallDetail(toolCallRequest);
  }
  if (toolCallRequest.toolName === "task") {
    return createStartedTaskToolCallDetail(toolCallRequest);
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
  };
}

function createStartedEditToolCallDetail(toolCallRequest: ToolCallRequestByName<"edit">): ToolCallEditDetail {
  return {
    toolName: "edit",
    editedFilePath: toolCallRequest.editTargetPath,
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

function assertUnhandledToolCallRequest(toolCallRequest: never): never {
  throw new Error(`Unhandled tool call request: ${JSON.stringify(toolCallRequest)}`);
}
