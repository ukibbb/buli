import type { PromptContextEntry } from "./listPromptContextCandidates.ts";

export type RecursivePromptContextEntrySnapshot = {
  promptContextBrowseRootPath: string;
  promptContextStartingDirectoryPath: string;
  promptContextEntries: PromptContextEntry[];
  scannedAtMs: number;
};

export function isRecursivePromptContextEntrySnapshotFresh(input: {
  recursivePromptContextEntrySnapshot: RecursivePromptContextEntrySnapshot;
  nowMs: number;
  recursiveSnapshotTimeToLiveMs: number;
  promptContextBrowseRootPath: string;
  promptContextStartingDirectoryPath: string;
}): boolean {
  return (
    input.recursivePromptContextEntrySnapshot.promptContextBrowseRootPath === input.promptContextBrowseRootPath &&
    input.recursivePromptContextEntrySnapshot.promptContextStartingDirectoryPath === input.promptContextStartingDirectoryPath &&
    input.nowMs - input.recursivePromptContextEntrySnapshot.scannedAtMs <= input.recursiveSnapshotTimeToLiveMs
  );
}
