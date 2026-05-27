import {
  type BuliDiagnosticLogFields,
  createStartedToolCallDetailFromRequest,
  type GlobToolCallRequest,
  type GrepToolCallRequest,
  type SearchManyToolCallSearch,
  type SearchManyToolCallRequest,
  type ToolCallGlobDetail,
  type ToolCallGrepDetail,
  type ToolCallSearchManyDetail,
  type ToolCallSearchManyResult,
} from "@buli/contracts";
import {
  createDuplicateReadOnlyToolResultText,
  type ReadOnlyToolCallEvidenceIndex,
  type ReusableSearchToolEvidence,
} from "../readOnlyToolCallEvidenceIndex.ts";
import { runGlobToolCall } from "./globTool.ts";
import { runGrepToolCall } from "./grepTool.ts";
import type { ToolCallOutcome } from "./toolCallOutcome.ts";
import { buildBudgetedTaggedToolResultText } from "./toolResultTextBudget.ts";

export interface SearchManyToolCallConcurrencyLimiter {
  run<SearchManyChildResult>(
    operation: () => Promise<SearchManyChildResult>,
    diagnosticFields?: BuliDiagnosticLogFields,
  ): Promise<SearchManyChildResult>;
}

type SearchManyChildToolCallOutcome = {
  searchIndex: number;
  searchToolCallOutcome: ToolCallOutcome;
};

const SEARCH_MANY_RESULT_SEPARATOR = "----- next search result -----";
export const MAX_SEARCH_MANY_TOOL_RESULT_TEXT_LENGTH = 32_000;

export function createStartedSearchManyToolCallDetail(
  searchManyToolCallRequest: SearchManyToolCallRequest,
): ToolCallSearchManyDetail {
  return createStartedToolCallDetailFromRequest(searchManyToolCallRequest);
}

export async function runSearchManyToolCall(input: {
  searchManyToolCallRequest: SearchManyToolCallRequest;
  parentToolCallId?: string;
  workspaceRootPath: string;
  readOnlyToolCallConcurrencyLimiter: SearchManyToolCallConcurrencyLimiter;
  readOnlyToolCallEvidenceIndex?: ReadOnlyToolCallEvidenceIndex | undefined;
  abortSignal?: AbortSignal;
}): Promise<ToolCallOutcome> {
  const startedAtMilliseconds = Date.now();
  const startedToolCallDetail = createStartedSearchManyToolCallDetail(input.searchManyToolCallRequest);

  try {
    const childToolCallOutcomes = await Promise.all(
      input.searchManyToolCallRequest.searches.map((search, searchIndex) => {
        const reusableSearchEvidence = input.readOnlyToolCallEvidenceIndex?.findReusableSearchManySearchEvidence(search);
        if (reusableSearchEvidence) {
          return Promise.resolve(createDuplicateSearchManyChildToolCallOutcome({
            searchIndex,
            reusableSearchEvidence,
          }));
        }

        return input.readOnlyToolCallConcurrencyLimiter.run(
          () =>
            runSearchManyChildToolCall({
              search,
              searchIndex,
              workspaceRootPath: input.workspaceRootPath,
              ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
            }),
          {
            ...(input.parentToolCallId !== undefined ? { parentToolCallId: input.parentToolCallId } : {}),
            parentToolName: "search_many",
            toolName: search.searchKind,
            childIndex: searchIndex,
          },
        );
      }),
    );
    const searchResults = childToolCallOutcomes.map(createSearchManyResultFromChildOutcome);
    const completedSearchCount = searchResults.filter((searchResult) => searchResult.searchStatus === "completed").length;
    const failedSearchCount = searchResults.length - completedSearchCount;
    const toolCallDetail: ToolCallSearchManyDetail = {
      toolName: "search_many",
      requestedSearches: input.searchManyToolCallRequest.searches.map((search) => ({ ...search })),
      completedSearchCount,
      failedSearchCount,
      searchResults,
    };

    return {
      outcomeKind: "completed",
      toolCallDetail,
      toolResultText: buildSearchManyToolResultText({
        childToolCallOutcomes,
        completedSearchCount,
        failedSearchCount,
      }),
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
      toolResultText: `Search many failed: ${failureExplanation}`,
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  }
}

function createDuplicateSearchManyChildToolCallOutcome(input: {
  searchIndex: number;
  reusableSearchEvidence: ReusableSearchToolEvidence;
}): SearchManyChildToolCallOutcome {
  return {
    searchIndex: input.searchIndex,
    searchToolCallOutcome: {
      outcomeKind: "completed",
      toolCallDetail: input.reusableSearchEvidence.toolCallDetail,
      toolResultText: createDuplicateReadOnlyToolResultText(input.reusableSearchEvidence),
      durationMilliseconds: 0,
    },
  };
}

async function runSearchManyChildToolCall(input: {
  search: SearchManyToolCallSearch;
  searchIndex: number;
  workspaceRootPath: string;
  abortSignal?: AbortSignal;
}): Promise<SearchManyChildToolCallOutcome> {
  return {
    searchIndex: input.searchIndex,
    searchToolCallOutcome: await runSingleSearchToolCall({
      search: input.search,
      workspaceRootPath: input.workspaceRootPath,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    }),
  };
}

function runSingleSearchToolCall(input: {
  search: SearchManyToolCallSearch;
  workspaceRootPath: string;
  abortSignal?: AbortSignal;
}): Promise<ToolCallOutcome> {
  if (input.search.searchKind === "glob") {
    return runGlobToolCall({
      globToolCallRequest: createGlobToolCallRequestFromSearchManySearch(input.search),
      workspaceRootPath: input.workspaceRootPath,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
  }

  return runGrepToolCall({
    grepToolCallRequest: createGrepToolCallRequestFromSearchManySearch(input.search),
    workspaceRootPath: input.workspaceRootPath,
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
  });
}

function createGlobToolCallRequestFromSearchManySearch(search: Extract<SearchManyToolCallSearch, { searchKind: "glob" }>): GlobToolCallRequest {
  return {
    toolName: "glob",
    globPattern: search.globPattern,
    ...(search.searchDirectoryPath !== undefined ? { searchDirectoryPath: search.searchDirectoryPath } : {}),
  };
}

function createGrepToolCallRequestFromSearchManySearch(search: Extract<SearchManyToolCallSearch, { searchKind: "grep" }>): GrepToolCallRequest {
  return {
    toolName: "grep",
    regexPattern: search.regexPattern,
    ...(search.searchPath !== undefined ? { searchPath: search.searchPath } : {}),
    ...(search.includeGlobPattern !== undefined ? { includeGlobPattern: search.includeGlobPattern } : {}),
    ...(search.contextLineCount !== undefined ? { contextLineCount: search.contextLineCount } : {}),
  };
}

function createSearchManyResultFromChildOutcome(
  childToolCallOutcome: SearchManyChildToolCallOutcome,
): ToolCallSearchManyResult {
  const searchDetail = assertSearchToolCallDetail(childToolCallOutcome.searchToolCallOutcome.toolCallDetail);
  if (childToolCallOutcome.searchToolCallOutcome.outcomeKind === "completed") {
    return {
      searchStatus: "completed",
      searchDetail,
    };
  }

  return {
    searchStatus: "failed",
    searchDetail,
    failureExplanation: childToolCallOutcome.searchToolCallOutcome.failureExplanation,
  };
}

function assertSearchToolCallDetail(toolCallDetail: ToolCallOutcome["toolCallDetail"]): ToolCallGlobDetail | ToolCallGrepDetail {
  if (toolCallDetail.toolName === "glob" || toolCallDetail.toolName === "grep") {
    return toolCallDetail;
  }

  throw new Error(`Search many child returned unexpected tool detail: ${toolCallDetail.toolName}`);
}

function buildSearchManyToolResultText(input: {
  childToolCallOutcomes: readonly SearchManyChildToolCallOutcome[];
  completedSearchCount: number;
  failedSearchCount: number;
}): string {
  return buildBudgetedTaggedToolResultText({
    openingTag: "<search_many>",
    closingTag: "</search_many>",
    contentLines: [
      `<summary>${input.completedSearchCount} completed, ${input.failedSearchCount} failed</summary>`,
      ...input.childToolCallOutcomes.flatMap((childToolCallOutcome, childToolCallOutcomeIndex) => [
        ...(childToolCallOutcomeIndex > 0 ? [SEARCH_MANY_RESULT_SEPARATOR] : []),
        ...formatSearchManyChildToolResultLines(childToolCallOutcome),
      ]),
    ],
    maximumCharacterCount: MAX_SEARCH_MANY_TOOL_RESULT_TEXT_LENGTH,
    truncationTagName: "search_many_truncation",
    continuationGuidanceLines: [
      "Use a narrower grep, glob, or search_many path/pattern to continue with the omitted results.",
    ],
  });
}

function formatSearchManyChildToolResultLines(childToolCallOutcome: SearchManyChildToolCallOutcome): readonly string[] {
  const searchDetail = assertSearchToolCallDetail(childToolCallOutcome.searchToolCallOutcome.toolCallDetail);
  return [
    "<search_many_result>",
    `<index>${childToolCallOutcome.searchIndex + 1}</index>`,
    `<status>${childToolCallOutcome.searchToolCallOutcome.outcomeKind}</status>`,
    `<kind>${searchDetail.toolName}</kind>`,
    ...formatSearchDetailForResultText(searchDetail),
    ...childToolCallOutcome.searchToolCallOutcome.toolResultText.split("\n"),
    "</search_many_result>",
  ];
}

function formatSearchDetailForResultText(searchDetail: ToolCallGlobDetail | ToolCallGrepDetail): string[] {
  if (searchDetail.toolName === "glob") {
    return [
      `<pattern>${searchDetail.globPattern}</pattern>`,
      ...(searchDetail.searchDirectoryPath !== undefined ? [`<path>${searchDetail.searchDirectoryPath}</path>`] : []),
    ];
  }

  return [
    `<pattern>${searchDetail.searchPattern}</pattern>`,
    ...(searchDetail.contextLineCount !== undefined ? [`<contextLineCount>${searchDetail.contextLineCount}</contextLineCount>`] : []),
  ];
}
