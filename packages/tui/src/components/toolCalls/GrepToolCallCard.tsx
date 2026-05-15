import { useState, type ReactNode } from "react";
import type { ToolCallGrepDetail, ToolCallGrepMatch } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { FencedCodeBlock } from "../primitives/FencedCodeBlock.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { glyphs } from "../glyphs.ts";
import { BracketedTarget } from "./BracketedTarget.tsx";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "./ToolCallCardHeaderSlots.tsx";
import { ToolCallResultDisclosureControl } from "./ToolCallResultDisclosureControl.tsx";

export type GrepToolCallCardProps = {
  toolCallDetail: ToolCallGrepDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

type GrepMatchFileSection = {
  matchFilePath: string;
  matchLines: {
    lineNumber: number;
    lineText: string;
  }[];
};

export function GrepToolCallCard(props: GrepToolCallCardProps): ReactNode {
  const [isGrepResultExpanded, setIsGrepResultExpanded] = useState(false);
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
          toolGlyph={glyphs.grepSearch}
          toolGlyphColor={accentColor}
          toolNameLabel="Grep"
          toolTargetContent={
            <BracketedTarget accentColor={accentColor} targetText={props.toolCallDetail.searchPattern} />
          }
        />
      }
      headerRight={
        <ToolCallHeaderRight
          statusColor={accentColor}
          statusKind={statusKind}
          statusLabel={buildGrepStatusLabel(props)}
        />
      }
      bodyContent={buildGrepBodyContent({
        grepToolCallCardProps: props,
        isGrepResultExpanded,
        onGrepResultExpansionToggle: () => {
          setIsGrepResultExpanded((currentGrepResultExpanded) => !currentGrepResultExpanded);
        },
      })}
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
  const returnedMatchHitCount = props.toolCallDetail.returnedMatchHitCount;
  const fileCount = props.toolCallDetail.matchedFileCount;
  const truncationLabel = props.toolCallDetail.wasTruncated || props.toolCallDetail.wasLongLineTruncated
    ? " · truncated"
    : "";
  if (matchCount !== undefined && fileCount !== undefined) {
    if (returnedMatchHitCount !== undefined && returnedMatchHitCount !== matchCount) {
      return `${returnedMatchHitCount} of ${matchCount} matches · truncated`;
    }
    const matchCountLabel = `${matchCount} matches`;
    return `${matchCountLabel} · ${fileCount} ${fileCount === 1 ? "file" : "files"}${truncationLabel}`;
  }
  if (matchCount !== undefined) {
    return `${matchCount} matches${truncationLabel}`;
  }
  return "done";
}

type GrepBodyContentInput = {
  grepToolCallCardProps: GrepToolCallCardProps;
  isGrepResultExpanded: boolean;
  onGrepResultExpansionToggle: () => void;
};

function buildGrepBodyContent(input: GrepBodyContentInput): ReactNode {
  const props = input.grepToolCallCardProps;
  if (props.renderState === "failed") {
    if (props.errorText !== undefined) {
      // Status header already carries errorText; suppress body to avoid duplicating it.
      return undefined;
    }
    return (
      <text fg={chatScreenTheme.accentRed}>{"grep failed to run"}</text>
    );
  }
  const matchHits = props.toolCallDetail.matchHits;
  if (!matchHits || matchHits.length === 0) {
    return undefined;
  }
  const grepMatchFileSections = groupGrepMatchesByFile(matchHits);
  return (
    <box flexDirection="column" width="100%">
      <ToolCallResultDisclosureControl
        isResultExpanded={input.isGrepResultExpanded}
        onResultExpansionToggle={input.onGrepResultExpansionToggle}
        resultSummaryText={buildGrepResultSummaryText(props.toolCallDetail)}
      />
      {input.isGrepResultExpanded ? (
        <box flexDirection="column" marginTop={1} paddingX={1} width="100%">
          {grepMatchFileSections.map((grepMatchFileSection, index) => (
            <box
              key={grepMatchFileSection.matchFilePath}
              flexDirection="column"
              width="100%"
              {...(index > 0 ? { marginTop: 1 } : {})}
            >
              <GrepMatchFileHeading matchFilePath={grepMatchFileSection.matchFilePath} />
              <FencedCodeBlock
                variant="embedded"
                filePath={grepMatchFileSection.matchFilePath}
                codeLines={grepMatchFileSection.matchLines}
              />
            </box>
          ))}
        </box>
      ) : null}
    </box>
  );
}

function groupGrepMatchesByFile(matchHits: readonly ToolCallGrepMatch[]): GrepMatchFileSection[] {
  const grepMatchFileSections: GrepMatchFileSection[] = [];
  const sectionIndexByMatchFilePath = new Map<string, number>();

  for (const matchHit of matchHits) {
    const existingSectionIndex = sectionIndexByMatchFilePath.get(matchHit.matchFilePath);
    if (existingSectionIndex !== undefined) {
      const existingGrepMatchFileSection = grepMatchFileSections[existingSectionIndex];
      if (existingGrepMatchFileSection === undefined) {
        continue;
      }
      existingGrepMatchFileSection.matchLines.push({
        lineNumber: matchHit.matchLineNumber,
        lineText: matchHit.matchSnippet,
      });
      continue;
    }

    sectionIndexByMatchFilePath.set(matchHit.matchFilePath, grepMatchFileSections.length);
    grepMatchFileSections.push({
      matchFilePath: matchHit.matchFilePath,
      matchLines: [{ lineNumber: matchHit.matchLineNumber, lineText: matchHit.matchSnippet }],
    });
  }

  return grepMatchFileSections;
}

function GrepMatchFileHeading(props: { matchFilePath: string }): ReactNode {
  return (
    <text fg={chatScreenTheme.textSecondary} wrapMode="none" width="100%">
      {props.matchFilePath}
    </text>
  );
}

function buildGrepResultSummaryText(toolCallDetail: ToolCallGrepDetail): string {
  const returnedMatchHitCount = toolCallDetail.matchHits?.length ?? toolCallDetail.returnedMatchHitCount ?? 0;
  const totalMatchCount = toolCallDetail.totalMatchCount;
  const matchCountText = totalMatchCount !== undefined && totalMatchCount !== returnedMatchHitCount
    ? `${returnedMatchHitCount} of ${totalMatchCount}`
    : String(returnedMatchHitCount);
  const matchCountForPlural = totalMatchCount ?? returnedMatchHitCount;
  const matchCountLabel = matchCountForPlural === 1 ? "matched line" : "matched lines";
  const fileCountText = toolCallDetail.matchedFileCount === undefined
    ? ""
    : ` across ${toolCallDetail.matchedFileCount} ${toolCallDetail.matchedFileCount === 1 ? "file" : "files"}`;

  return `${matchCountText} ${matchCountLabel}${fileCountText} for ${toolCallDetail.searchPattern}`;
}
