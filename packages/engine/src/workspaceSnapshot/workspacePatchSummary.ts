import type { WorkspacePatch } from "@buli/contracts";

export function formatWorkspacePatchSummaryForToolResult(workspacePatch: WorkspacePatch): string {
  const changedFileLines = workspacePatch.changedFiles.map((changedFile) => {
    const changeLabel = changedFile.changeKind === "added"
      ? "added"
      : changedFile.changeKind === "deleted"
      ? "deleted"
      : "modified";
    return `- ${changeLabel} ${changedFile.filePath} (+${changedFile.addedLineCount} -${changedFile.removedLineCount})`;
  });

  return [
    "Workspace changes:",
    `Changed files: ${workspacePatch.changedFileCount}`,
    `Added lines: ${workspacePatch.addedLineCount}`,
    `Removed lines: ${workspacePatch.removedLineCount}`,
    ...changedFileLines,
  ].join("\n");
}

export function appendWorkspacePatchSummaryToToolResultText(input: {
  toolResultText: string;
  workspacePatch: WorkspacePatch | undefined;
}): string {
  if (!input.workspacePatch) {
    return input.toolResultText;
  }

  return [
    input.toolResultText,
    "",
    formatWorkspacePatchSummaryForToolResult(input.workspacePatch),
  ].join("\n");
}
