import {
  buildCodebaseSymbolDefinitionToolResultText,
  type CodebaseSymbolDefinitionLocatorQuery,
  type CodebaseSymbolDefinitionLocatorResult,
} from "@buli/codebase-knowledge";
import {
  createStartedToolCallDetailFromRequest,
  type LocateCodebaseSymbolsToolCallRequest,
  type ToolCallLocateCodebaseSymbolsDetail,
} from "@buli/contracts";
import type { WorkspaceCodebaseKnowledgeIndex } from "../codebaseKnowledge/treeSitterWorkspaceCodebaseKnowledgeIndex.ts";
import type { ToolCallOutcome } from "./toolCallOutcome.ts";

export function createStartedLocateCodebaseSymbolsToolCallDetail(
  locateCodebaseSymbolsToolCallRequest: LocateCodebaseSymbolsToolCallRequest,
): ToolCallLocateCodebaseSymbolsDetail {
  return createStartedToolCallDetailFromRequest(locateCodebaseSymbolsToolCallRequest);
}

export async function runLocateCodebaseSymbolsToolCall(input: {
  locateCodebaseSymbolsToolCallRequest: LocateCodebaseSymbolsToolCallRequest;
  workspaceCodebaseKnowledgeIndex: WorkspaceCodebaseKnowledgeIndex;
  abortSignal?: AbortSignal | undefined;
}): Promise<ToolCallOutcome> {
  const startedAtMilliseconds = Date.now();
  const startedToolCallDetail = createStartedLocateCodebaseSymbolsToolCallDetail(input.locateCodebaseSymbolsToolCallRequest);

  throwIfLocateCodebaseSymbolsToolAborted(input.abortSignal);
  const locatorResult = await input.workspaceCodebaseKnowledgeIndex.locateSymbolDefinitions(
    createSymbolDefinitionLocatorQuery(input.locateCodebaseSymbolsToolCallRequest),
    { abortSignal: input.abortSignal },
  );
  throwIfLocateCodebaseSymbolsToolAborted(input.abortSignal);
  const completedToolCallDetail: ToolCallLocateCodebaseSymbolsDetail = {
    ...startedToolCallDetail,
    locatedSymbolCount: countLocatedSymbolDefinitions(locatorResult),
    notFoundSymbolCount: countSymbolLookupsByStatus(locatorResult, "not_found"),
    ambiguousSymbolNameCount: countSymbolLookupsByStatus(locatorResult, "ambiguous"),
    verificationReadCount: countVerificationReadTargets(locatorResult),
  };

  return {
    outcomeKind: "completed",
    toolCallDetail: completedToolCallDetail,
    toolResultText: buildCodebaseSymbolDefinitionToolResultText(locatorResult),
    durationMilliseconds: Date.now() - startedAtMilliseconds,
  };
}

function createSymbolDefinitionLocatorQuery(
  locateCodebaseSymbolsToolCallRequest: LocateCodebaseSymbolsToolCallRequest,
): CodebaseSymbolDefinitionLocatorQuery {
  return {
    symbolNames: locateCodebaseSymbolsToolCallRequest.symbolNames,
    ...(locateCodebaseSymbolsToolCallRequest.filePaths !== undefined
      ? { filePaths: locateCodebaseSymbolsToolCallRequest.filePaths }
      : {}),
  };
}

function countLocatedSymbolDefinitions(locatorResult: CodebaseSymbolDefinitionLocatorResult): number {
  return locatorResult.symbolLookups.reduce(
    (locatedDefinitionCount, symbolLookup) => locatedDefinitionCount + symbolLookup.locations.length,
    0,
  );
}

function countSymbolLookupsByStatus(
  locatorResult: CodebaseSymbolDefinitionLocatorResult,
  lookupStatus: "not_found" | "ambiguous",
): number {
  return locatorResult.symbolLookups.filter((symbolLookup) => symbolLookup.lookupStatus === lookupStatus).length;
}

function countVerificationReadTargets(locatorResult: CodebaseSymbolDefinitionLocatorResult): number {
  return locatorResult.symbolLookups.reduce(
    (verificationReadCount, symbolLookup) => verificationReadCount + symbolLookup.locations.length,
    0,
  );
}

function throwIfLocateCodebaseSymbolsToolAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Codebase symbol lookup interrupted");
  }
}
