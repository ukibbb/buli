import { z } from "zod";

export const WorkspacePatchFileChangeKindSchema = z.enum(["added", "deleted", "modified"]);
export type WorkspacePatchFileChangeKind = z.infer<typeof WorkspacePatchFileChangeKindSchema>;

export const WorkspacePatchFileDiffSchema = z
  .object({
    filePath: z.string().min(1),
    changeKind: WorkspacePatchFileChangeKindSchema,
    addedLineCount: z.number().int().nonnegative(),
    removedLineCount: z.number().int().nonnegative(),
    unifiedDiffText: z.string().optional(),
  })
  .strict();
export type WorkspacePatchFileDiff = z.infer<typeof WorkspacePatchFileDiffSchema>;

export const WorkspacePatchSchema = z
  .object({
    workspacePatchId: z.string().min(1),
    toolCallId: z.string().min(1),
    capturedAtMs: z.number().int().nonnegative(),
    baselineSnapshotHash: z.string().min(1),
    resultingSnapshotHash: z.string().min(1),
    changedFileCount: z.number().int().nonnegative(),
    addedLineCount: z.number().int().nonnegative(),
    removedLineCount: z.number().int().nonnegative(),
    changedFiles: z.array(WorkspacePatchFileDiffSchema),
  })
  .strict();
export type WorkspacePatch = z.infer<typeof WorkspacePatchSchema>;
