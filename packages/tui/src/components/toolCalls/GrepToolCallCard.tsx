import type { ReactNode } from "react";
import type { ToolCallGrepDetail, ToolCallGrepMatch } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { FencedCodeBlock } from "../primitives/FencedCodeBlock.tsx";
import { limitVisibleItems, VisibleContentLimitNotice } from "../primitives/VisibleContentLimit.tsx";
import { ExpandableToolCallCard, resolveDefaultToolCallRenderStatePresentation } from "./ExpandableToolCallCard.tsx";

const MAX_EXPANDED_GREP_MATCH_HIT_COUNT = 50;

export type GrepToolCallCardProps = {
  toolCallDetail: ToolCallGrepDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
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
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  const hasGrepResultContent = props.renderState !== "failed" && (props.toolCallDetail.matchHits?.length ?? 0) > 0;
  return (
    <ExpandableToolCallCard
      accentColor={toolCallPresentation.accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      hasExpandableContent={hasGrepResultContent}
      renderExpandedContent={() => buildGrepBodyContent(props)}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildGrepStatusLabel(props)}
      toolNameLabel="Grep"
      toolTargetText={props.toolCallDetail.searchPattern}
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
  if (matchCount !== undefined && fileCount !== undefined) {
    if (returnedMatchHitCount !== undefined && returnedMatchHitCount !== matchCount) {
      return `${returnedMatchHitCount}/${matchCount} matches · ${fileCount} ${fileCount === 1 ? "file" : "files"}`;
    }
    const matchCountLabel = `${matchCount} matches`;
    return `${matchCountLabel} · ${fileCount} ${fileCount === 1 ? "file" : "files"}`;
  }
  if (matchCount !== undefined) {
    return `${matchCount} matches`;
  }
  return "done";
}

function buildGrepBodyContent(props: GrepToolCallCardProps): ReactNode {
  const matchHits = props.toolCallDetail.matchHits;
  if (!matchHits || matchHits.length === 0) {
    return undefined;
  }
  const limitedMatchHits = limitVisibleItems({
    items: matchHits,
    maximumVisibleItemCount: MAX_EXPANDED_GREP_MATCH_HIT_COUNT,
  });
  const grepMatchFileSections = groupGrepMatchesByFile(limitedMatchHits.visibleItems);
  return (
    <box flexDirection="column" width="100%">
      <box flexDirection="column" paddingX={1} width="100%">
        <VisibleContentLimitNotice
          visibleItemCount={limitedMatchHits.visibleItems.length}
          totalItemCount={limitedMatchHits.totalItemCount}
          itemLabelPlural="matches"
        />
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
              wrapMode="char"
              codeLines={grepMatchFileSection.matchLines}
            />
          </box>
        ))}
      </box>
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
    <text fg={chatScreenTheme.textSecondary} wrapMode="char" width="100%">
      {props.matchFilePath}
    </text>
  );
}
