import type { ReactNode } from "react";
import type { ToolCallEditDetail, WorkspacePatch } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { DiffBlock } from "../primitives/DiffBlock.tsx";
import {
  formatWorkspacePatchCompactSummary,
  WorkspacePatchChangedFilesView,
} from "../workspacePatch/WorkspacePatchChangedFilesView.tsx";
import { AlwaysVisibleToolCallCard, resolveDefaultToolCallRenderStatePresentation } from "./ExpandableToolCallCard.tsx";

export type EditToolCallCardProps = {
  toolCallDetail: ToolCallEditDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
  workspacePatch?: WorkspacePatch;
};

export function EditToolCallCard(props: EditToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  const accentColor = props.workspacePatch && props.renderState === "completed"
    ? chatScreenTheme.accentPrimary
    : toolCallPresentation.accentColor;
  const hasEditDiffContent = Boolean(props.workspacePatch) ||
    (props.renderState !== "failed" && Boolean(props.toolCallDetail.unifiedDiffText));
  return (
    <AlwaysVisibleToolCallCard
      accentColor={accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      hasVisibleContent={hasEditDiffContent}
      renderVisibleContent={() => buildEditBodyContent(props)}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildEditStatusLabel(props)}
      toolNameLabel="Edit"
      toolTargetText={props.toolCallDetail.editedFilePath}
    />
  );
}

function buildEditStatusLabel(props: EditToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "edit failed";
  }
  if (props.renderState === "streaming") {
    return "editing…";
  }
  if (props.workspacePatch) {
    return formatWorkspacePatchCompactSummary(props.workspacePatch);
  }
  const addedLineCount = props.toolCallDetail.addedLineCount;
  const removedLineCount = props.toolCallDetail.removedLineCount;
  const parts: string[] = [];
  if (addedLineCount !== undefined) {
    parts.push(`+${addedLineCount}`);
  }
  if (removedLineCount !== undefined) {
    parts.push(`−${removedLineCount}`);
  }
  return parts.length > 0 ? parts.join(" ") : "edited";
}

function buildEditBodyContent(props: EditToolCallCardProps): ReactNode {
  if (props.workspacePatch) {
    return <WorkspacePatchChangedFilesView workspacePatch={props.workspacePatch} />;
  }

  const unifiedDiffText = props.toolCallDetail.unifiedDiffText;
  if (!unifiedDiffText) {
    return undefined;
  }
  return <DiffBlock filePath={props.toolCallDetail.editedFilePath} unifiedDiffText={unifiedDiffText} />;
}
