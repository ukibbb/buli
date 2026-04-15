import { Text } from "ink";
import type { ReactNode } from "react";
import type { ToolCallReadDetail } from "@buli/contracts";
import { chatScreenTheme } from "../../chatScreenTheme.ts";
import { FencedCodeBlock } from "../primitives/FencedCodeBlock.tsx";
import { FileReference } from "../primitives/FileReference.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { glyphs } from "../glyphs.ts";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "./ToolCallCardHeaderSlots.tsx";

// ReadToolCallCard renders the design's component/ToolCall-Read: green stripe,
// file icon, tool name, file-path target, and a lineCount · byteCount status.
// While in flight we show a pending dot; once completed the status flips to
// ✓ and the preview body renders with line numbers and optional syntax
// highlighting.
export type ReadToolCallCardProps = {
  toolCallDetail: ToolCallReadDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

export function ReadToolCallCard(props: ReadToolCallCardProps): ReactNode {
  const stripeColor =
    props.renderState === "failed" ? chatScreenTheme.accentRed : chatScreenTheme.accentGreen;
  const statusColor = stripeColor;
  const statusLabel = buildReadStatusLabel(props);
  const statusKind =
    props.renderState === "completed"
      ? "success"
      : props.renderState === "failed"
        ? "error"
        : "pending";
  return (
    <SurfaceCard
      stripeColor={stripeColor}
      headerLeft={
        <ToolCallHeaderLeft
          toolGlyph={glyphs.fileText}
          toolGlyphColor={stripeColor}
          toolNameLabel="Read"
          toolTargetContent={<FileReference filePath={props.toolCallDetail.readFilePath} variant="inline" />}
        />
      }
      headerRight={
        <ToolCallHeaderRight statusColor={statusColor} statusKind={statusKind} statusLabel={statusLabel} />
      }
      bodyContent={buildReadBodyContent(props)}
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
  const byteCount = props.toolCallDetail.readByteCount;
  if (lineCount !== undefined && byteCount !== undefined) {
    return `${lineCount} lines · ${formatByteCount(byteCount)}`;
  }
  if (lineCount !== undefined) {
    return `${lineCount} lines`;
  }
  return "read";
}

function buildReadBodyContent(props: ReadToolCallCardProps): ReactNode {
  if (props.renderState === "failed") {
    return (
      <Text color={chatScreenTheme.accentRed}>
        {props.errorText ?? "The file could not be read."}
      </Text>
    );
  }
  const previewLines = props.toolCallDetail.previewLines;
  if (!previewLines || previewLines.length === 0) {
    return undefined;
  }
  return (
    <FencedCodeBlock
      codeLines={previewLines.map((previewLine) => ({
        lineNumber: previewLine.lineNumber,
        lineText: previewLine.lineText,
        ...(previewLine.syntaxHighlightSpans
          ? { syntaxHighlightSpans: previewLine.syntaxHighlightSpans }
          : {}),
      }))}
    />
  );
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
