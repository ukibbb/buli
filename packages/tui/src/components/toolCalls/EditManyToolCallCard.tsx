import type { ReactNode } from "react";
import type { ToolCallEditManyDetail, WorkspacePatch, WorkspacePatchFileDiff } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { DiffBlock } from "../primitives/DiffBlock.tsx";
import {
  formatWorkspacePatchCompactSummary,
  WorkspacePatchChangedFilesView,
} from "../workspacePatch/WorkspacePatchChangedFilesView.tsx";
import { AlwaysVisibleToolCallCard, resolveDefaultToolCallRenderStatePresentation } from "./ExpandableToolCallCard.tsx";

export type EditManyToolCallCardProps = {
  toolCallDetail: ToolCallEditManyDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
  workspacePatch?: WorkspacePatch;
};

export function EditManyToolCallCard(props: EditManyToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  const accentColor = props.workspacePatch && props.renderState === "completed"
    ? chatScreenTheme.accentPrimary
    : toolCallPresentation.accentColor;
  const hasEditManyDiffContent = Boolean(props.workspacePatch) ||
    (props.renderState !== "failed" && Boolean(props.toolCallDetail.changedFiles?.length));
  return (
    <AlwaysVisibleToolCallCard
      accentColor={accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      hasVisibleContent={hasEditManyDiffContent}
      renderVisibleContent={() => buildEditManyBodyContent(props)}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildEditManyStatusLabel(props)}
      toolNameLabel="EditMany"
      toolTargetText={`${props.toolCallDetail.editCount} ${props.toolCallDetail.editCount === 1 ? "edit" : "edits"}`}
    />
  );
}

function buildEditManyStatusLabel(props: EditManyToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "edit_many failed";
  }
  if (props.renderState === "streaming") {
    return "editing…";
  }
  if (props.workspacePatch) {
    return formatWorkspacePatchCompactSummary(props.workspacePatch);
  }

  const editedFileCount = props.toolCallDetail.editedFileCount ?? props.toolCallDetail.changedFiles?.length ?? 0;
  return `${editedFileCount} ${editedFileCount === 1 ? "file" : "files"} +${props.toolCallDetail.addedLineCount ?? 0} -${props.toolCallDetail.removedLineCount ?? 0}`;
}

function buildEditManyBodyContent(props: EditManyToolCallCardProps): ReactNode {
  if (props.workspacePatch) {
    return <WorkspacePatchChangedFilesView workspacePatch={props.workspacePatch} />;
  }
  return <ChangedFilesDiffView changedFiles={props.toolCallDetail.changedFiles ?? []} />;
}

function ChangedFilesDiffView(props: { changedFiles: readonly WorkspacePatchFileDiff[] }): ReactNode {
  return (
    <box flexDirection="column" width="100%">
      {props.changedFiles.map((changedFile, index) => (
        <box flexDirection="column" key={`${changedFile.filePath}-${index}`} marginTop={index === 0 ? 0 : 1} width="100%">
          <text fg={chatScreenTheme.textMuted}>{`${changedFile.filePath} (+${changedFile.addedLineCount} -${changedFile.removedLineCount})`}</text>
          {changedFile.unifiedDiffText ? <DiffBlock filePath={changedFile.filePath} unifiedDiffText={changedFile.unifiedDiffText} /> : null}
        </box>
      ))}
    </box>
  );
}
