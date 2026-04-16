import { Box, Text } from "ink";
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
            <Text color={chatScreenTheme.accentCyan}>{`"${props.toolCallDetail.searchPattern}"`}</Text>
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
      <Text color={chatScreenTheme.accentRed}>
        {props.errorText ?? "grep failed to run"}
      </Text>
    );
  }
  const matchHits = props.toolCallDetail.matchHits;
  if (!matchHits || matchHits.length === 0) {
    return undefined;
  }
  return (
    <Box flexDirection="column" paddingX={1} width="100%">
      {matchHits.map((matchHit, index) => (
        <Box key={`grep-hit-${index}`} width="100%">
          <Box flexShrink={0} marginRight={2}>
            <FileReference
              filePath={matchHit.matchFilePath}
              lineNumber={matchHit.matchLineNumber}
              variant="inline"
            />
          </Box>
          <Box flexShrink={1}>
            <Text color={chatScreenTheme.textMuted}>{matchHit.matchSnippet}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
