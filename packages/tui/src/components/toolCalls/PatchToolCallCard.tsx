import type { ReactNode } from "react";
import type { ToolCallPatchDetail, ToolCallPatchManyDetail, WorkspacePatch, WorkspacePatchFileDiff } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { DiffBlock } from "../primitives/DiffBlock.tsx";
import {
  formatWorkspacePatchCompactSummary,
  WorkspacePatchChangedFilesView,
} from "../workspacePatch/WorkspacePatchChangedFilesView.tsx";
import { AlwaysVisibleToolCallCard, resolveDefaultToolCallRenderStatePresentation } from "./ExpandableToolCallCard.tsx";

export type PatchToolCallCardProps = {
  toolCallDetail: ToolCallPatchDetail | ToolCallPatchManyDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
  workspacePatch?: WorkspacePatch;
};

export function PatchToolCallCard(props: PatchToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  const accentColor = props.workspacePatch && props.renderState === "completed"
    ? chatScreenTheme.accentPrimary
    : toolCallPresentation.accentColor;
  const hasPatchDiffContent = Boolean(props.workspacePatch) ||
    (props.renderState !== "failed" && Boolean(props.toolCallDetail.changedFiles?.length));
  return (
    <AlwaysVisibleToolCallCard
      accentColor={accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      hasVisibleContent={hasPatchDiffContent}
      renderVisibleContent={() => buildPatchBodyContent(props)}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildPatchStatusLabel(props)}
      toolNameLabel={props.toolCallDetail.toolName === "patch" ? "Patch" : "PatchMany"}
      toolTargetText={props.toolCallDetail.patchTargetText}
    />
  );
}

function buildPatchStatusLabel(props: PatchToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? `${props.toolCallDetail.toolName} failed`;
  }
  if (props.renderState === "streaming") {
    return "patching…";
  }
  if (props.workspacePatch) {
    return formatWorkspacePatchCompactSummary(props.workspacePatch);
  }

  return `${props.toolCallDetail.changedFileCount ?? props.toolCallDetail.changedFiles?.length ?? 0} files +${props.toolCallDetail.addedLineCount ?? 0} -${props.toolCallDetail.removedLineCount ?? 0}`;
}

function buildPatchBodyContent(props: PatchToolCallCardProps): ReactNode {
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
          <text fg={chatScreenTheme.textMuted}>{`${changedFile.changeKind} ${changedFile.filePath} (+${changedFile.addedLineCount} -${changedFile.removedLineCount})`}</text>
          {changedFile.unifiedDiffText ? <DiffBlock filePath={changedFile.filePath} unifiedDiffText={changedFile.unifiedDiffText} /> : null}
        </box>
      ))}
    </box>
  );
}
