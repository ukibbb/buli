import type { ReactNode } from "react";
import type { ToolCallGrepDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { FileReference } from "../primitives/FileReference.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { glyphs } from "../glyphs.ts";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "./ToolCallCardHeaderSlots.tsx";

// GrepToolCallCard renders the design's component/ToolCall-Grep: cyan stripe,
// search glyph, the search pattern as the target, and a matches · files
// status. The body lists each hit with a cyan path:line reference followed by
// a muted snippet on the same row.
export type GrepToolCallCardProps = {
  toolCallDetail: ToolCallGrepDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

export function GrepToolCallCard(props: GrepToolCallCardProps): ReactNode {
  const stripeColor =
    props.renderState === "failed" ? chatScreenTheme.accentRed : chatScreenTheme.accentCyan;
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
          toolGlyph={glyphs.grepSearch}
          toolGlyphColor={stripeColor}
          toolNameLabel="Grep"
          toolTargetContent={
            <text fg={chatScreenTheme.accentCyan}>{`"${props.toolCallDetail.searchPattern}"`}</text>
          }
        />
      }
      headerRight={
        <ToolCallHeaderRight
          statusColor={stripeColor}
          statusKind={statusKind}
          statusLabel={buildGrepStatusLabel(props)}
        />
      }
      bodyContent={buildGrepBodyContent(props)}
    />
  );
}

function buildGrepStatusLabel(props: GrepToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "grep failed";
  }
  if (props.renderState === "streaming") {
    return "searching…";
  }
  const matchCount = props.toolCallDetail.totalMatchCount;
  const fileCount = props.toolCallDetail.matchedFileCount;
  if (matchCount !== undefined && fileCount !== undefined) {
    return `${matchCount} matches · ${fileCount} files`;
  }
  if (matchCount !== undefined) {
    return `${matchCount} matches`;
  }
  return "done";
}

function buildGrepBodyContent(props: GrepToolCallCardProps): ReactNode {
  if (props.renderState === "failed") {
    return (
      <text fg={chatScreenTheme.accentRed}>
        {props.errorText ?? "grep failed to run"}
      </text>
    );
  }
  const matchHits = props.toolCallDetail.matchHits;
  if (!matchHits || matchHits.length === 0) {
    return undefined;
  }
  return (
    <box flexDirection="column" paddingX={1} width="100%">
      {matchHits.map((matchHit, index) => (
        <box key={`grep-hit-${index}`} width="100%">
          <box flexShrink={0} marginRight={2}>
            <FileReference
              filePath={matchHit.matchFilePath}
              lineNumber={matchHit.matchLineNumber}
              variant="inline"
            />
          </box>
          <box flexShrink={1}>
            <text fg={chatScreenTheme.textMuted}>{matchHit.matchSnippet}</text>
          </box>
        </box>
      ))}
    </box>
  );
}
