import { useState, type ReactNode } from "react";
import type { ToolCallReadDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { FencedCodeBlock } from "../primitives/FencedCodeBlock.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { BracketedTarget } from "./BracketedTarget.tsx";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "./ToolCallCardHeaderSlots.tsx";
import { ToolCallResultDisclosureControl } from "./ToolCallResultDisclosureControl.tsx";

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
  return (
    <SurfaceCard
      accentColor={accentColor}
      headerLeft={
        <ToolCallHeaderLeft
          toolNameLabel="Read"
          toolTargetContent={
            <BracketedTarget accentColor={accentColor} targetText={props.toolCallDetail.readFilePath} />
          }
        />
      }
      headerRight={
        <ToolCallHeaderRight
          statusColor={accentColor}
          statusKind={statusKind}
          statusLabel={buildReadStatusLabel(props)}
        />
      }
      bodyContent={buildReadBodyContent({
        isReadPreviewExpanded,
        onReadPreviewExpansionToggle: () => {
          setIsReadPreviewExpanded((currentReadPreviewExpanded) => !currentReadPreviewExpanded);
        },
        readToolCallCardProps: props,
      })}
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
  const byteCount = props.toolCallDetail.readByteCount;
  const truncationLabel = props.toolCallDetail.wasLineCountTruncated || props.toolCallDetail.wasLongLineTruncated
    ? " · truncated"
    : "";
  if (lineCount !== undefined && returnedLineCount !== undefined && returnedLineCount !== lineCount) {
    return `${returnedLineCount} of ${lineCount} lines${truncationLabel}`;
  }
  if (lineCount !== undefined && byteCount !== undefined) {
    return `${lineCount} lines · ${formatByteCount(byteCount)}${truncationLabel}`;
  }
  if (lineCount !== undefined) {
    return `${lineCount} lines${truncationLabel}`;
  }
  return "read";
}

type ReadBodyContentInput = {
  readToolCallCardProps: ReadToolCallCardProps;
  isReadPreviewExpanded: boolean;
  onReadPreviewExpansionToggle: () => void;
};

function buildReadBodyContent(input: ReadBodyContentInput): ReactNode {
  const props = input.readToolCallCardProps;
  if (props.renderState === "failed") {
    if (props.errorText !== undefined) {
      // Status header already carries errorText; suppress body to avoid duplicating it.
      return undefined;
    }
    return (
      <text fg={chatScreenTheme.accentRed}>{"The file could not be read."}</text>
    );
  }
  const previewLines = props.toolCallDetail.previewLines;
  if (!previewLines || previewLines.length === 0) {
    return undefined;
  }
  return (
    <box flexDirection="column" width="100%">
      <ReadPreviewDisclosureControl
        isReadPreviewExpanded={input.isReadPreviewExpanded}
        onReadPreviewExpansionToggle={input.onReadPreviewExpansionToggle}
        readPreviewSummaryText={buildReadPreviewSummaryText(props.toolCallDetail)}
      />
      {input.isReadPreviewExpanded ? (
        <box marginTop={1} width="100%">
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
      ) : null}
    </box>
  );
}

function ReadPreviewDisclosureControl(props: {
  readPreviewSummaryText: string;
  isReadPreviewExpanded: boolean;
  onReadPreviewExpansionToggle: () => void;
}): ReactNode {
  return (
    <ToolCallResultDisclosureControl
      isResultExpanded={props.isReadPreviewExpanded}
      onResultExpansionToggle={props.onReadPreviewExpansionToggle}
      resultSummaryText={props.readPreviewSummaryText}
    />
  );
}

function buildReadPreviewSummaryText(toolCallDetail: ToolCallReadDetail): string {
  const previewLines = toolCallDetail.previewLines ?? [];
  const firstReturnedLineNumber = previewLines.at(0)?.lineNumber;
  const returnedLineCount = toolCallDetail.returnedLineCount ?? previewLines.length;
  const totalReadLineCountText = toolCallDetail.readLineCount !== undefined ? ` of ${toolCallDetail.readLineCount}` : "";

  return `Read ${buildReadLineRangeText({
    firstReturnedLineNumber,
    returnedLineCount,
  })}${totalReadLineCountText} from ${toolCallDetail.readFilePath}`;
}

function buildReadLineRangeText(input: {
  firstReturnedLineNumber: number | undefined;
  returnedLineCount: number;
}): string {
  if (input.firstReturnedLineNumber === undefined || input.returnedLineCount <= 0) {
    return "content";
  }

  const lastReturnedLineNumber = input.firstReturnedLineNumber + input.returnedLineCount - 1;
  if (input.firstReturnedLineNumber === lastReturnedLineNumber) {
    return `line ${input.firstReturnedLineNumber}`;
  }

  return `lines ${input.firstReturnedLineNumber}-${lastReturnedLineNumber}`;
}

function formatByteCount(byteCount: number): string {
  if (byteCount < 1024) {
    return `${byteCount} B`;
  }
  if (byteCount < 1024 * 1024) {
    return `${(byteCount / 1024).toFixed(1)} KB`;
  }
  return `${(byteCount / (1024 * 1024)).toFixed(1)} MB`;
}
