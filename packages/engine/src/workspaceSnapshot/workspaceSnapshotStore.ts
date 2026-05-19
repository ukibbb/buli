import type { WorkspacePatch } from "@buli/contracts";

export type CaptureWorkspacePatchInput = {
  baselineSnapshotHash: string;
  toolCallId: string;
  abortSignal?: AbortSignal | undefined;
};

export type WorkspaceSnapshotStore = {
  trackWorkspaceSnapshot(input?: { abortSignal?: AbortSignal | undefined }): Promise<string | undefined>;
  captureWorkspacePatch(input: CaptureWorkspacePatchInput): Promise<WorkspacePatch | undefined>;
  revertWorkspacePatches(input: {
    workspacePatches: readonly WorkspacePatch[];
    abortSignal?: AbortSignal | undefined;
  }): Promise<void>;
};
