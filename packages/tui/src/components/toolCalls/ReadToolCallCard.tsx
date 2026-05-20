import { useState, type ReactNode } from "react";
import type { ToolCallReadDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { FencedCodeBlock } from "../primitives/FencedCodeBlock.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { ToolCallCompactHeader } from "./ToolCallCardHeaderSlots.tsx";

export type ReadToolCallCardProps = {
  toolCallDetail: ToolCallReadDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

export function ReadToolCallCard(props: ReadToolCallCardProps): ReactNode {
  const [isReadPreviewExpanded, setIsReadPreviewExpanded] = useState(false);
  const accentColor =
    props.renderState === "failed"
      ? chatScreenTheme.accentRed
      : props.renderState === "streaming"
        ? chatScreenTheme.accentAmber
        : chatScreenTheme.accentGreen;
  const statusKind =
    props.renderState === "completed"
      ? "success"
      : props.renderState === "failed"
        ? "error"
        : "pending";
  const hasReadPreviewContent = props.renderState !== "failed" && (props.toolCallDetail.previewLines?.length ?? 0) > 0;
  return (
    <SurfaceCard
      accentColor={accentColor}
      density="compact"
      headerLeft={
        <ToolCallCompactHeader
          accentColor={accentColor}
          disclosureState={hasReadPreviewContent
            ? {
                isContentExpandable: true,
                isContentExpanded: isReadPreviewExpanded,
                onContentExpansionToggle: () => {
                  setIsReadPreviewExpanded((currentReadPreviewExpanded) => !currentReadPreviewExpanded);
                },
              }
            : { isContentExpandable: false }}
          statusColor={accentColor}
          statusKind={statusKind}
          statusLabel={buildReadStatusLabel(props)}
          toolNameLabel="Read"
          toolTargetText={props.toolCallDetail.readFilePath}
        />
      }
      bodyContent={hasReadPreviewContent && isReadPreviewExpanded ? buildReadBodyContent(props) : undefined}
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
      <FencedCodeBlock
        variant="embedded"
        filePath={props.toolCallDetail.readFilePath}
        codeLines={previewLines.map((previewLine) => ({
          lineNumber: previewLine.lineNumber,
          lineText: previewLine.lineText,
          ...(previewLine.syntaxHighlightSpans
            ? { syntaxHighlightSpans: previewLine.syntaxHighlightSpans }
            : {}),
        }))}
      />
    </box>
  );
}
