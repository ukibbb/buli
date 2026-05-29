import type { ReactNode } from "react";
import type { ToolCallReadDetail } from "@buli/contracts";
import { AlwaysVisibleToolCallCard, resolveDefaultToolCallRenderStatePresentation } from "./ExpandableToolCallCard.tsx";

export type ReadToolCallCardProps = {
  toolCallDetail: ToolCallReadDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
};

export function ReadToolCallCard(props: ReadToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  return (
    <AlwaysVisibleToolCallCard
      accentColor={toolCallPresentation.accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      hasVisibleContent={false}
      renderVisibleContent={() => null}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildReadStatusLabel(props)}
      toolNameLabel="Read"
      toolTargetText={props.toolCallDetail.readFilePath}
    />
  );
}

function buildReadStatusLabel(props: ReadToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "read failed";
  }
  if (props.renderState === "streaming") {
    return "reading…";
  }
  const lineCount = props.toolCallDetail.readLineCount;
  const returnedLineCount = props.toolCallDetail.returnedLineCount;
  const visibleLineCount = returnedLineCount ?? lineCount;
  if (lineCount === 0 || visibleLineCount === 0) {
    return `0:${lineCount ?? "?"}`;
  }
  if (visibleLineCount !== undefined) {
    const firstVisibleLineNumber = props.toolCallDetail.previewLines?.at(0)?.lineNumber ?? 1;
    const lastVisibleLineNumber = firstVisibleLineNumber + visibleLineCount - 1;
    return `${firstVisibleLineNumber}-${lastVisibleLineNumber}:${lineCount ?? "?"}`;
  }
  return "read";
}
