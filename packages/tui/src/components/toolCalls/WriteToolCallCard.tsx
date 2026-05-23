import type { ReactNode } from "react";
import type { ToolCallWriteDetail, WorkspacePatch } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { DiffBlock } from "../primitives/DiffBlock.tsx";
import {
  formatWorkspacePatchCompactSummary,
  WorkspacePatchChangedFilesView,
} from "../workspacePatch/WorkspacePatchChangedFilesView.tsx";
import { ExpandableToolCallCard, resolveDefaultToolCallRenderStatePresentation } from "./ExpandableToolCallCard.tsx";

export type WriteToolCallCardProps = {
  toolCallDetail: ToolCallWriteDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
  workspacePatch?: WorkspacePatch;
};

export function WriteToolCallCard(props: WriteToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  const accentColor = props.workspacePatch && props.renderState === "completed"
    ? chatScreenTheme.accentPrimary
    : toolCallPresentation.accentColor;
  const hasWriteDiffContent = Boolean(props.workspacePatch) ||
    (props.renderState !== "failed" && Boolean(props.toolCallDetail.unifiedDiffText));
  return (
    <ExpandableToolCallCard
      accentColor={accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      hasExpandableContent={hasWriteDiffContent}
      renderExpandedContent={() => buildWriteBodyContent(props)}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildWriteStatusLabel(props)}
      toolNameLabel="Write"
      toolTargetText={props.toolCallDetail.writtenFilePath}
    />
  );
}

function buildWriteStatusLabel(props: WriteToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "write failed";
  }
  if (props.renderState === "streaming") {
    return "writing…";
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
  return parts.length > 0 ? parts.join(" ") : "wrote";
}

function buildWriteBodyContent(props: WriteToolCallCardProps): ReactNode {
  if (props.workspacePatch) {
    return <WorkspacePatchChangedFilesView workspacePatch={props.workspacePatch} />;
  }

  const unifiedDiffText = props.toolCallDetail.unifiedDiffText;
  if (!unifiedDiffText) {
    return undefined;
  }
  return <DiffBlock filePath={props.toolCallDetail.writtenFilePath} unifiedDiffText={unifiedDiffText} />;
}
