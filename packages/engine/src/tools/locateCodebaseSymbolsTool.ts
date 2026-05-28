import {
  buildCodebaseKnowledgeToolResultText,
  type CodebaseKnowledgeQuery,
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
  const queryResult = await input.workspaceCodebaseKnowledgeIndex.queryCodebaseKnowledge(
    createCodebaseKnowledgeQuery(input.locateCodebaseSymbolsToolCallRequest),
    { abortSignal: input.abortSignal },
  );
  throwIfLocateCodebaseSymbolsToolAborted(input.abortSignal);
  const completedToolCallDetail: ToolCallLocateCodebaseSymbolsDetail = {
    ...startedToolCallDetail,
    matchedKnowledgeCount: queryResult.matches.length,
    recommendedReadCount: queryResult.matches.reduce(
      (recommendedReadCount, match) => recommendedReadCount + match.recommendedReads.length,
      0,
    ),
  };

  return {
    outcomeKind: "completed",
    toolCallDetail: completedToolCallDetail,
    toolResultText: buildCodebaseKnowledgeToolResultText(queryResult),
    durationMilliseconds: Date.now() - startedAtMilliseconds,
  };
}

function createCodebaseKnowledgeQuery(
  locateCodebaseSymbolsToolCallRequest: LocateCodebaseSymbolsToolCallRequest,
): CodebaseKnowledgeQuery {
  return {
    ...(locateCodebaseSymbolsToolCallRequest.symbolNames !== undefined
      ? { symbolNames: locateCodebaseSymbolsToolCallRequest.symbolNames }
      : {}),
    ...(locateCodebaseSymbolsToolCallRequest.filePaths !== undefined
      ? { filePaths: locateCodebaseSymbolsToolCallRequest.filePaths }
      : {}),
    ...(locateCodebaseSymbolsToolCallRequest.maximumResultCount !== undefined
      ? { maximumResultCount: locateCodebaseSymbolsToolCallRequest.maximumResultCount }
      : {}),
  };
}

function throwIfLocateCodebaseSymbolsToolAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Codebase symbol lookup interrupted");
  }
}
