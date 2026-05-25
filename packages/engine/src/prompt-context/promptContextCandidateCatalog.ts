import { resolvePromptContextPathScope } from "./promptContextPathScope.ts";
import type { BuliDiagnosticLogger } from "@buli/contracts";
import { logEngineDiagnosticEvent } from "../runtimeDiagnostics.ts";
import {
  DEFAULT_MAXIMUM_PROMPT_CONTEXT_CANDIDATE_COUNT,
  DEFAULT_MAXIMUM_PROMPT_CONTEXT_SEARCH_ENTRY_COUNT,
  determinePromptContextQueryLoadStrategy,
  filterAndSortPromptContextEntries,
  listFuzzyPromptContextEntries,
  listPromptContextCandidates,
} from "./listPromptContextCandidates.ts";
import type { PromptContextCandidate } from "./types.ts";
import {
  isRecursivePromptContextEntrySnapshotFresh,
  type RecursivePromptContextEntrySnapshot,
} from "./recursivePromptContextEntrySnapshot.ts";

const DEFAULT_RECURSIVE_PROMPT_CONTEXT_ENTRY_SNAPSHOT_TIME_TO_LIVE_MS = 2_000;

export class PromptContextCandidateCatalog {
  readonly promptContextBrowseRootPath: string;
  readonly promptContextStartingDirectoryPath: string;
  readonly maximumCandidateCount: number;
  readonly maximumSearchEntryCount: number;
  readonly recursiveSnapshotTimeToLiveMs: number;
  readonly nowMs: () => number;
  readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  private promptContextPathScopePromise: Promise<Awaited<ReturnType<typeof resolvePromptContextPathScope>>> | undefined;
  private recursivePromptContextEntrySnapshot: RecursivePromptContextEntrySnapshot | undefined;

  constructor(input: {
    promptContextBrowseRootPath: string;
    promptContextStartingDirectoryPath: string;
    maximumCandidateCount?: number;
    maximumSearchEntryCount?: number;
    recursiveSnapshotTimeToLiveMs?: number;
    nowMs?: () => number;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
  }) {
    this.promptContextBrowseRootPath = input.promptContextBrowseRootPath;
    this.promptContextStartingDirectoryPath = input.promptContextStartingDirectoryPath;
    this.maximumCandidateCount = input.maximumCandidateCount ?? DEFAULT_MAXIMUM_PROMPT_CONTEXT_CANDIDATE_COUNT;
    this.maximumSearchEntryCount = input.maximumSearchEntryCount ?? DEFAULT_MAXIMUM_PROMPT_CONTEXT_SEARCH_ENTRY_COUNT;
    this.recursiveSnapshotTimeToLiveMs =
      input.recursiveSnapshotTimeToLiveMs ?? DEFAULT_RECURSIVE_PROMPT_CONTEXT_ENTRY_SNAPSHOT_TIME_TO_LIVE_MS;
    this.nowMs = input.nowMs ?? Date.now;
    this.diagnosticLogger = input.diagnosticLogger;
  }

  async listPromptContextCandidates(promptContextQueryText: string): Promise<readonly PromptContextCandidate[]> {
    const candidatesLoadStartedAtMs = Date.now();
    const promptContextQueryLoadStrategy = determinePromptContextQueryLoadStrategy(promptContextQueryText);
    if (promptContextQueryLoadStrategy !== "fuzzy_query") {
      const promptContextCandidates = await listPromptContextCandidates({
        promptContextBrowseRootPath: this.promptContextBrowseRootPath,
        promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
        promptContextQueryText,
        maximumCandidateCount: this.maximumCandidateCount,
        maximumSearchEntryCount: this.maximumSearchEntryCount,
      });
      this.logPromptContextCandidatesLoaded({
        promptContextQueryLoadStrategy,
        cacheStatus: "bypassed",
        durationMs: Date.now() - candidatesLoadStartedAtMs,
        candidateCount: promptContextCandidates.length,
      });
      return promptContextCandidates;
    }

    const promptContextPathScope = await this.resolvePromptContextPathScope();
    const recursivePromptContextEntrySnapshotResult = await this.listFreshRecursivePromptContextEntrySnapshot(
      promptContextPathScope,
      promptContextQueryText,
    );
    const promptContextCandidates = filterAndSortPromptContextEntries({
      promptContextEntries: recursivePromptContextEntrySnapshotResult.recursivePromptContextEntrySnapshot.promptContextEntries,
      promptContextQueryText,
      maximumCandidateCount: this.maximumCandidateCount,
      promptContextStartingDirectoryPath: promptContextPathScope.promptContextStartingDirectoryPath,
      treatsEntriesAsPathQueryResults: false,
    });
    this.logPromptContextCandidatesLoaded({
      promptContextQueryLoadStrategy,
      cacheStatus: recursivePromptContextEntrySnapshotResult.cacheStatus,
      durationMs: Date.now() - candidatesLoadStartedAtMs,
      candidateCount: promptContextCandidates.length,
      scannedEntryCount:
        recursivePromptContextEntrySnapshotResult.recursivePromptContextEntrySnapshot.scannedPromptContextEntryCount,
    });
    return promptContextCandidates;
  }

  private resolvePromptContextPathScope() {
    if (!this.promptContextPathScopePromise) {
      this.promptContextPathScopePromise = resolvePromptContextPathScope({
        promptContextBrowseRootPath: this.promptContextBrowseRootPath,
        promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
      });
    }

    return this.promptContextPathScopePromise;
  }

  private async listFreshRecursivePromptContextEntrySnapshot(
    promptContextPathScope: Awaited<ReturnType<typeof resolvePromptContextPathScope>>,
    promptContextQueryText: string,
  ): Promise<{
    recursivePromptContextEntrySnapshot: RecursivePromptContextEntrySnapshot;
    cacheStatus: "hit" | "miss";
  }> {
    const nowMs = this.nowMs();
    if (
      this.recursivePromptContextEntrySnapshot &&
      isRecursivePromptContextEntrySnapshotFresh({
        recursivePromptContextEntrySnapshot: this.recursivePromptContextEntrySnapshot,
        nowMs,
        recursiveSnapshotTimeToLiveMs: this.recursiveSnapshotTimeToLiveMs,
        promptContextBrowseRootPath: promptContextPathScope.promptContextBrowseRootPath,
        promptContextStartingDirectoryPath: promptContextPathScope.promptContextStartingDirectoryPath,
        promptContextQueryText,
      })
    ) {
      return { recursivePromptContextEntrySnapshot: this.recursivePromptContextEntrySnapshot, cacheStatus: "hit" };
    }

    const promptContextEntryScanResult = await listFuzzyPromptContextEntries({
      promptContextPathScope,
      maximumSearchEntryCount: this.maximumSearchEntryCount,
      promptContextQueryText,
    });
    this.recursivePromptContextEntrySnapshot = {
      promptContextBrowseRootPath: promptContextPathScope.promptContextBrowseRootPath,
      promptContextStartingDirectoryPath: promptContextPathScope.promptContextStartingDirectoryPath,
      promptContextQueryText,
      promptContextEntries: promptContextEntryScanResult.promptContextEntries,
      scannedPromptContextEntryCount: promptContextEntryScanResult.scannedPromptContextEntryCount,
      scannedAtMs: nowMs,
    };
    return { recursivePromptContextEntrySnapshot: this.recursivePromptContextEntrySnapshot, cacheStatus: "miss" };
  }

  private logPromptContextCandidatesLoaded(input: {
    promptContextQueryLoadStrategy: ReturnType<typeof determinePromptContextQueryLoadStrategy>;
    cacheStatus: "hit" | "miss" | "bypassed";
    durationMs: number;
    candidateCount: number;
    scannedEntryCount?: number | undefined;
  }): void {
    logEngineDiagnosticEvent(this.diagnosticLogger, "prompt_context.candidates_loaded", {
      promptContextQueryLoadStrategy: input.promptContextQueryLoadStrategy,
      cacheStatus: input.cacheStatus,
      durationMs: input.durationMs,
      candidateCount: input.candidateCount,
      ...(input.scannedEntryCount !== undefined ? { scannedEntryCount: input.scannedEntryCount } : {}),
    });
  }
}
