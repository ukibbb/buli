import {
  buildCodebaseKnowledgeToolResultText,
  type CodebaseKnowledgeQuery,
} from "@buli/codebase-knowledge";
import {
  createStartedToolCallDetailFromRequest,
  type QueryCodebaseKnowledgeToolCallRequest,
  type ToolCallQueryCodebaseKnowledgeDetail,
} from "@buli/contracts";
import type { WorkspaceCodebaseKnowledgeIndex } from "../codebaseKnowledge/treeSitterWorkspaceCodebaseKnowledgeIndex.ts";
import type { ToolCallOutcome } from "./toolCallOutcome.ts";

export function createStartedQueryCodebaseKnowledgeToolCallDetail(
  queryCodebaseKnowledgeToolCallRequest: QueryCodebaseKnowledgeToolCallRequest,
): ToolCallQueryCodebaseKnowledgeDetail {
  return createStartedToolCallDetailFromRequest(queryCodebaseKnowledgeToolCallRequest);
}

export async function runQueryCodebaseKnowledgeToolCall(input: {
  queryCodebaseKnowledgeToolCallRequest: QueryCodebaseKnowledgeToolCallRequest;
  workspaceCodebaseKnowledgeIndex: WorkspaceCodebaseKnowledgeIndex;
  abortSignal?: AbortSignal | undefined;
}): Promise<ToolCallOutcome> {
  const startedAtMilliseconds = Date.now();
  const startedToolCallDetail = createStartedQueryCodebaseKnowledgeToolCallDetail(input.queryCodebaseKnowledgeToolCallRequest);

  try {
    throwIfQueryCodebaseKnowledgeToolAborted(input.abortSignal);
    const queryResult = await input.workspaceCodebaseKnowledgeIndex.queryCodebaseKnowledge(
      createCodebaseKnowledgeQuery(input.queryCodebaseKnowledgeToolCallRequest),
      { abortSignal: input.abortSignal },
    );
    throwIfQueryCodebaseKnowledgeToolAborted(input.abortSignal);
    const completedToolCallDetail: ToolCallQueryCodebaseKnowledgeDetail = {
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
  } catch (error) {
    if (input.abortSignal?.aborted) {
      throw error;
    }

    const failureExplanation = error instanceof Error ? error.message : String(error);
    return {
      outcomeKind: "failed",
      toolCallDetail: startedToolCallDetail,
      failureExplanation,
      toolResultText: `Codebase knowledge query failed: ${failureExplanation}`,
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  }
}

function createCodebaseKnowledgeQuery(
  queryCodebaseKnowledgeToolCallRequest: QueryCodebaseKnowledgeToolCallRequest,
): CodebaseKnowledgeQuery {
  return {
    codebaseProblemDescription: queryCodebaseKnowledgeToolCallRequest.codebaseProblemDescription,
    ...(queryCodebaseKnowledgeToolCallRequest.knownRelevantFilePaths !== undefined
      ? { knownRelevantFilePaths: queryCodebaseKnowledgeToolCallRequest.knownRelevantFilePaths }
      : {}),
    ...(queryCodebaseKnowledgeToolCallRequest.knownRelevantSymbolNames !== undefined
      ? { knownRelevantSymbolNames: queryCodebaseKnowledgeToolCallRequest.knownRelevantSymbolNames }
      : {}),
    ...(queryCodebaseKnowledgeToolCallRequest.maximumKnowledgeResultCount !== undefined
      ? { maximumKnowledgeResultCount: queryCodebaseKnowledgeToolCallRequest.maximumKnowledgeResultCount }
      : {}),
  };
}

function throwIfQueryCodebaseKnowledgeToolAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Codebase knowledge query interrupted");
  }
}
