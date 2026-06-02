import {
  type GlobToolCallRequest,
  type GrepToolCallRequest,
  type LocateCodebaseSymbolsToolCallRequest,
  type ReadToolCallRequest,
  type WorkspaceInspectionToolCallRequest,
} from "@buli/contracts";
import { escapeModelFacingXmlText } from "./modelFacingXmlEscaping.ts";

const DUPLICATE_READ_ONLY_TOOL_RESULT_TAG = "duplicate_read_only_tool_result";

export function createSameStepDuplicateReadOnlyToolResultText(input: {
  toolName: string;
  previousToolCallId: string;
}): string {
  return [
    `<${DUPLICATE_READ_ONLY_TOOL_RESULT_TAG}>`,
    "<status>completed</status>",
    `<toolName>${escapeModelFacingXmlText(input.toolName)}</toolName>`,
    `<previousToolCallId>${escapeModelFacingXmlText(input.previousToolCallId)}</previousToolCallId>`,
    "<evidence>same response step duplicate</evidence>",
    "<note>The same read-only result was already returned for another tool call in this response step. Use that prior result; this duplicate call was not re-executed.</note>",
    `</${DUPLICATE_READ_ONLY_TOOL_RESULT_TAG}>`,
  ].join("\n");
}

export function isDuplicateReadOnlyToolResultText(toolResultText: string): boolean {
  return toolResultText.includes(`<${DUPLICATE_READ_ONLY_TOOL_RESULT_TAG}>`);
}

export function createReadOnlyToolCallExecutionKey(toolCallRequest: WorkspaceInspectionToolCallRequest): string {
  if (toolCallRequest.toolName === "read") {
    return createReadToolCallExecutionKey(toolCallRequest);
  }

  if (toolCallRequest.toolName === "glob") {
    return createGlobToolCallExecutionKey(toolCallRequest);
  }

  if (toolCallRequest.toolName === "grep") {
    return createGrepToolCallExecutionKey(toolCallRequest);
  }

  if (toolCallRequest.toolName === "locate_codebase_symbols") {
    return createLocateCodebaseSymbolsToolCallExecutionKey(toolCallRequest);
  }

  return assertUnhandledWorkspaceInspectionToolCallRequest(toolCallRequest);
}

function createReadToolCallExecutionKey(readToolCallRequest: ReadToolCallRequest): string {
  return JSON.stringify([
    "read",
    readToolCallRequest.readTargetPath,
    readToolCallRequest.offsetLineNumber ?? null,
    readToolCallRequest.maximumLineCount ?? null,
  ]);
}

function createGlobToolCallExecutionKey(globToolCallRequest: GlobToolCallRequest): string {
  return JSON.stringify([
    "glob",
    globToolCallRequest.globPattern,
    globToolCallRequest.searchDirectoryPath ?? null,
  ]);
}

function createGrepToolCallExecutionKey(grepToolCallRequest: GrepToolCallRequest): string {
  return JSON.stringify([
    "grep",
    grepToolCallRequest.regexPattern,
    grepToolCallRequest.searchPath ?? null,
    grepToolCallRequest.includeGlobPattern ?? null,
    grepToolCallRequest.contextLineCount ?? null,
  ]);
}

function createLocateCodebaseSymbolsToolCallExecutionKey(
  locateCodebaseSymbolsToolCallRequest: LocateCodebaseSymbolsToolCallRequest,
): string {
  return JSON.stringify([
    "locate_codebase_symbols",
    normalizeExactSymbolLocatorHints(locateCodebaseSymbolsToolCallRequest.symbolNames),
    normalizeExactSymbolLocatorHints(locateCodebaseSymbolsToolCallRequest.filePaths),
  ]);
}

function normalizeExactSymbolLocatorHints(hintValues: readonly string[] | undefined): string[] {
  if (!hintValues || hintValues.length === 0) {
    return [];
  }

  return [...new Set(hintValues.map((hintValue) => hintValue.trim()).filter((hintValue) => hintValue.length > 0))].sort();
}

function assertUnhandledWorkspaceInspectionToolCallRequest(toolCallRequest: never): never {
  throw new Error(`Unhandled workspace inspection tool call request: ${JSON.stringify(toolCallRequest)}`);
}
