import type { ReactNode } from "react";
import type { WorkspacePatch, WorkspacePatchFileChangeKind, WorkspacePatchFileDiff } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { DiffBlock } from "../primitives/DiffBlock.tsx";

export function WorkspacePatchChangedFilesView(props: {
  workspacePatch: WorkspacePatch;
}): ReactNode {
  return (
    <box flexDirection="column" width="100%">
      {props.workspacePatch.changedFiles.map((changedFile, index) => (
        <WorkspacePatchChangedFileView
          changedFile={changedFile}
          key={`${changedFile.filePath}-${index}`}
          marginTop={index === 0 ? 0 : 1}
        />
      ))}
    </box>
  );
}

export function formatWorkspacePatchCompactSummary(workspacePatch: WorkspacePatch): string {
  return [
    `${workspacePatch.changedFileCount} ${formatWorkspacePatchFileCountLabel(workspacePatch.changedFileCount)}`,
    `+${workspacePatch.addedLineCount}`,
    `-${workspacePatch.removedLineCount}`,
  ].join(" ");
}

function WorkspacePatchChangedFileView(props: {
  changedFile: WorkspacePatchFileDiff;
  marginTop: number;
}): ReactNode {
  return (
    <box flexDirection="column" marginTop={props.marginTop} width="100%">
      <text fg={chatScreenTheme.textMuted}>{formatWorkspacePatchChangedFileSummary(props.changedFile)}</text>
      {props.changedFile.unifiedDiffText ? (
        <DiffBlock filePath={props.changedFile.filePath} unifiedDiffText={props.changedFile.unifiedDiffText} />
      ) : null}
    </box>
  );
}

function formatWorkspacePatchChangedFileSummary(changedFile: WorkspacePatchFileDiff): string {
  return `${formatWorkspacePatchChangeKind(changedFile.changeKind)} ${changedFile.filePath} (+${changedFile.addedLineCount} -${changedFile.removedLineCount})`;
}

function formatWorkspacePatchFileCountLabel(changedFileCount: number): string {
  return changedFileCount === 1 ? "file" : "files";
}

function formatWorkspacePatchChangeKind(changeKind: WorkspacePatchFileChangeKind): string {
  return changeKind === "added" ? "A" : changeKind === "deleted" ? "D" : "M";
}
