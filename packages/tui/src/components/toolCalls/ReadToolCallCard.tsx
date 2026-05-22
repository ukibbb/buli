import type { ReactNode } from "react";
import type { ToolCallReadDetail } from "@buli/contracts";
import { ReadFilePreviewBlock } from "../primitives/ReadFilePreviewBlock.tsx";
import { ExpandableToolCallCard, resolveDefaultToolCallRenderStatePresentation } from "./ExpandableToolCallCard.tsx";

export type ReadToolCallCardProps = {
  toolCallDetail: ToolCallReadDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

export function ReadToolCallCard(props: ReadToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  const hasReadPreviewContent = props.renderState !== "failed" && (props.toolCallDetail.previewLines?.length ?? 0) > 0;
  return (
    <ExpandableToolCallCard
      accentColor={toolCallPresentation.accentColor}
      hasExpandableContent={hasReadPreviewContent}
      renderExpandedContent={() => buildReadBodyContent(props)}
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

function buildReadBodyContent(props: ReadToolCallCardProps): ReactNode {
  const previewLines = props.toolCallDetail.previewLines;
  if (!previewLines || previewLines.length === 0) {
    return undefined;
  }
  return (
    <box width="100%">
      <ReadFilePreviewBlock
        previewLines={previewLines}
        readFilePath={props.toolCallDetail.readFilePath}
        {...(props.toolCallDetail.readLineCount !== undefined
          ? { readLineCount: props.toolCallDetail.readLineCount }
          : {})}
        {...(props.toolCallDetail.returnedLineCount !== undefined
          ? { returnedLineCount: props.toolCallDetail.returnedLineCount }
          : {})}
        {...(props.toolCallDetail.wasLineCountTruncated !== undefined
          ? { wasLineCountTruncated: props.toolCallDetail.wasLineCountTruncated }
          : {})}
      />
    </box>
  );
}
