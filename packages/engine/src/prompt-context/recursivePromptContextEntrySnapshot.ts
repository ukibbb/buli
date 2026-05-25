import type { PromptContextEntry } from "./listPromptContextCandidates.ts";

export type RecursivePromptContextEntrySnapshot = {
  promptContextBrowseRootPath: string;
  promptContextStartingDirectoryPath: string;
  promptContextQueryText: string;
  promptContextEntries: PromptContextEntry[];
  scannedPromptContextEntryCount: number;
  scannedAtMs: number;
};

export function isRecursivePromptContextEntrySnapshotFresh(input: {
  recursivePromptContextEntrySnapshot: RecursivePromptContextEntrySnapshot;
  nowMs: number;
  recursiveSnapshotTimeToLiveMs: number;
  promptContextBrowseRootPath: string;
  promptContextStartingDirectoryPath: string;
  promptContextQueryText: string;
}): boolean {
  return (
    input.recursivePromptContextEntrySnapshot.promptContextBrowseRootPath === input.promptContextBrowseRootPath &&
    input.recursivePromptContextEntrySnapshot.promptContextStartingDirectoryPath === input.promptContextStartingDirectoryPath &&
    input.recursivePromptContextEntrySnapshot.promptContextQueryText === input.promptContextQueryText &&
    input.nowMs - input.recursivePromptContextEntrySnapshot.scannedAtMs <= input.recursiveSnapshotTimeToLiveMs
  );
}
