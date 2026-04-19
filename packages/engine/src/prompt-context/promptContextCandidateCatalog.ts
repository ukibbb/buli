import { resolvePromptContextPathScope } from "./promptContextPathScope.ts";
import {
  DEFAULT_MAXIMUM_PROMPT_CONTEXT_CANDIDATE_COUNT,
  DEFAULT_MAXIMUM_PROMPT_CONTEXT_SEARCH_ENTRY_COUNT,
  determinePromptContextQueryLoadStrategy,
  filterAndSortPromptContextEntries,
  listCurrentDirectoryPromptContextEntries,
  listPromptContextCandidates,
  listRecursivePromptContextEntries,
  type PromptContextQueryLoadStrategy,
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
  private promptContextPathScopePromise: Promise<Awaited<ReturnType<typeof resolvePromptContextPathScope>>> | undefined;
  private recursivePromptContextEntrySnapshot: RecursivePromptContextEntrySnapshot | undefined;

  constructor(input: {
    promptContextBrowseRootPath: string;
    promptContextStartingDirectoryPath: string;
    maximumCandidateCount?: number;
    maximumSearchEntryCount?: number;
    recursiveSnapshotTimeToLiveMs?: number;
    nowMs?: () => number;
  }) {
    this.promptContextBrowseRootPath = input.promptContextBrowseRootPath;
    this.promptContextStartingDirectoryPath = input.promptContextStartingDirectoryPath;
    this.maximumCandidateCount = input.maximumCandidateCount ?? DEFAULT_MAXIMUM_PROMPT_CONTEXT_CANDIDATE_COUNT;
    this.maximumSearchEntryCount = input.maximumSearchEntryCount ?? DEFAULT_MAXIMUM_PROMPT_CONTEXT_SEARCH_ENTRY_COUNT;
    this.recursiveSnapshotTimeToLiveMs =
      input.recursiveSnapshotTimeToLiveMs ?? DEFAULT_RECURSIVE_PROMPT_CONTEXT_ENTRY_SNAPSHOT_TIME_TO_LIVE_MS;
    this.nowMs = input.nowMs ?? Date.now;
  }

  async listPromptContextCandidates(promptContextQueryText: string): Promise<readonly PromptContextCandidate[]> {
    const promptContextQueryLoadStrategy = determinePromptContextQueryLoadStrategy(promptContextQueryText);
    if (promptContextQueryLoadStrategy !== "fuzzy_query") {
      return listPromptContextCandidates({
        promptContextBrowseRootPath: this.promptContextBrowseRootPath,
        promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
        promptContextQueryText,
        maximumCandidateCount: this.maximumCandidateCount,
        maximumSearchEntryCount: this.maximumSearchEntryCount,
      });
    }

    const promptContextPathScope = await this.resolvePromptContextPathScope();
    const recursivePromptContextEntrySnapshot = await this.listFreshRecursivePromptContextEntrySnapshot(promptContextPathScope);
    return filterAndSortPromptContextEntries({
      promptContextEntries: recursivePromptContextEntrySnapshot.promptContextEntries,
      promptContextQueryText,
      maximumCandidateCount: this.maximumCandidateCount,
      promptContextStartingDirectoryPath: promptContextPathScope.promptContextStartingDirectoryPath,
      treatsEntriesAsPathQueryResults: false,
    });
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
  ): Promise<RecursivePromptContextEntrySnapshot> {
    const nowMs = this.nowMs();
    if (
      this.recursivePromptContextEntrySnapshot &&
      isRecursivePromptContextEntrySnapshotFresh({
        recursivePromptContextEntrySnapshot: this.recursivePromptContextEntrySnapshot,
        nowMs,
        recursiveSnapshotTimeToLiveMs: this.recursiveSnapshotTimeToLiveMs,
        promptContextBrowseRootPath: promptContextPathScope.promptContextBrowseRootPath,
        promptContextStartingDirectoryPath: promptContextPathScope.promptContextStartingDirectoryPath,
      })
    ) {
      return this.recursivePromptContextEntrySnapshot;
    }

    const promptContextEntries = await listRecursivePromptContextEntries({
      promptContextPathScope,
      maximumSearchEntryCount: this.maximumSearchEntryCount,
    });
    this.recursivePromptContextEntrySnapshot = {
      promptContextBrowseRootPath: promptContextPathScope.promptContextBrowseRootPath,
      promptContextStartingDirectoryPath: promptContextPathScope.promptContextStartingDirectoryPath,
      promptContextEntries,
      scannedAtMs: nowMs,
    };
    return this.recursivePromptContextEntrySnapshot;
  }
}
