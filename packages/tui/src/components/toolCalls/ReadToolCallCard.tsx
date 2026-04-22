import type { ReactNode } from "react";
import type { ToolCallReadDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { FencedCodeBlock } from "../primitives/FencedCodeBlock.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { glyphs } from "../glyphs.ts";
import { BracketedTarget } from "./BracketedTarget.tsx";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "./ToolCallCardHeaderSlots.tsx";

export type ReadToolCallCardProps = {
  toolCallDetail: ToolCallReadDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

export function ReadToolCallCard(props: ReadToolCallCardProps): ReactNode {
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
          toolGlyph={glyphs.fileText}
          toolGlyphColor={accentColor}
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
      <text fg={chatScreenTheme.accentRed}>
        {props.errorText ?? "The file could not be read."}
      </text>
    );
  }
  const previewLines = props.toolCallDetail.previewLines;
  if (!previewLines || previewLines.length === 0) {
    return undefined;
  }
  return (
    <FencedCodeBlock
      variant="embedded"
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
