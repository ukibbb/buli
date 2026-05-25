import type { ReactNode } from "react";
import type { ToolCallGrepMatch, ToolCallSearchManyDetail, ToolCallSearchManyResult } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { FencedCodeBlock } from "../primitives/FencedCodeBlock.tsx";
import { FileReference } from "../primitives/FileReference.tsx";
import { limitVisibleItems, VisibleContentLimitNotice } from "../primitives/VisibleContentLimit.tsx";
import { ExpandableToolCallCard, resolveDefaultToolCallRenderStatePresentation } from "./ExpandableToolCallCard.tsx";

const MAX_EXPANDED_SEARCH_MANY_GLOB_PATH_COUNT = 25;
const MAX_EXPANDED_SEARCH_MANY_GREP_MATCH_HIT_COUNT = 25;

export type SearchManyToolCallCardProps = {
  toolCallDetail: ToolCallSearchManyDetail;
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

export function SearchManyToolCallCard(props: SearchManyToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  const searchResults = props.toolCallDetail.searchResults ?? [];
  const hasSearchManyPreviewContent = props.renderState !== "failed" && searchResults.length > 0;
  return (
    <ExpandableToolCallCard
      accentColor={toolCallPresentation.accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      hasExpandableContent={hasSearchManyPreviewContent}
      renderExpandedContent={() => buildSearchManyBodyContent(searchResults)}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildSearchManyStatusLabel(props)}
      toolNameLabel="SearchMany"
      toolTargetText={formatSearchManyTargetText(props.toolCallDetail.requestedSearches.length)}
    />
  );
}

function buildSearchManyStatusLabel(props: SearchManyToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "SearchMany failed";
  }
  const requestedSearchCount = props.toolCallDetail.requestedSearches.length;
  if (props.renderState === "streaming") {
    return `searching ${formatSearchManyTargetText(requestedSearchCount)}…`;
  }

  const completedSearchCount = props.toolCallDetail.completedSearchCount;
  const failedSearchCount = props.toolCallDetail.failedSearchCount ?? 0;
  if (completedSearchCount === undefined) {
    return "searched";
  }
  if (failedSearchCount > 0) {
    return `${completedSearchCount}/${requestedSearchCount} searched, ${failedSearchCount} failed`;
  }
  return `${completedSearchCount} searched`;
}

function formatSearchManyTargetText(requestedSearchCount: number): string {
  return `${requestedSearchCount} ${requestedSearchCount === 1 ? "search" : "searches"}`;
}

function buildSearchManyBodyContent(searchResults: readonly ToolCallSearchManyResult[]): ReactNode {
  if (searchResults.length === 0) {
    return undefined;
  }

  return (
    <box flexDirection="column" paddingX={1} width="100%">
      {searchResults.map((searchResult, searchResultIndex) => (
        <box
          key={`search-many-result-${searchResultIndex}`}
          flexDirection="column"
          {...(searchResultIndex > 0
            ? {
                border: ["top"] as const,
                borderColor: chatScreenTheme.borderSubtle,
                marginTop: 1,
                paddingTop: 1,
              }
            : {})}
          width="100%"
        >
          <box width="100%">
            <text fg={chatScreenTheme.textMuted} wrapMode="char" width="100%">
              {formatSearchManyResultHeader(searchResult, searchResultIndex)}
            </text>
          </box>
          <SearchManyResultBody searchResult={searchResult} />
        </box>
      ))}
    </box>
  );
}

function formatSearchManyResultHeader(searchResult: ToolCallSearchManyResult, searchResultIndex: number): string {
  const searchDetail = searchResult.searchDetail;
  if (searchDetail.toolName === "glob") {
    return `${searchResultIndex + 1}. glob ${searchDetail.globPattern} - ${searchResult.searchStatus}`;
  }

  return `${searchResultIndex + 1}. grep ${searchDetail.searchPattern} - ${searchResult.searchStatus}`;
}

function SearchManyResultBody(props: { searchResult: ToolCallSearchManyResult }): ReactNode {
  if (props.searchResult.searchStatus === "failed") {
    return (
      <box width="100%">
        <text fg={chatScreenTheme.accentRed} wrapMode="word">{props.searchResult.failureExplanation}</text>
      </box>
    );
  }

  const searchDetail = props.searchResult.searchDetail;
  if (searchDetail.toolName === "glob") {
    return <SearchManyGlobResultBody matchedPaths={searchDetail.matchedPaths ?? []} />;
  }

  return <SearchManyGrepResultBody matchHits={searchDetail.matchHits ?? []} />;
}

function SearchManyGlobResultBody(props: { matchedPaths: readonly string[] }): ReactNode {
  if (props.matchedPaths.length === 0) {
    return <SearchManyEmptyResultNotice noticeText="No files found" />;
  }
  const limitedMatchedPaths = limitVisibleItems({
    items: props.matchedPaths,
    maximumVisibleItemCount: MAX_EXPANDED_SEARCH_MANY_GLOB_PATH_COUNT,
  });

  return (
    <box flexDirection="column" width="100%">
      <VisibleContentLimitNotice
        visibleItemCount={limitedMatchedPaths.visibleItems.length}
        totalItemCount={limitedMatchedPaths.totalItemCount}
        itemLabelPlural="paths"
      />
      {limitedMatchedPaths.visibleItems.map((matchedPath, index) => (
        <box key={`search-many-glob-path-${index}`} width="100%">
          <FileReference filePath={matchedPath} variant="inline" />
        </box>
      ))}
    </box>
  );
}

function SearchManyGrepResultBody(props: { matchHits: readonly ToolCallGrepMatch[] }): ReactNode {
  if (props.matchHits.length === 0) {
    return <SearchManyEmptyResultNotice noticeText="No matches found" />;
  }
  const limitedMatchHits = limitVisibleItems({
    items: props.matchHits,
    maximumVisibleItemCount: MAX_EXPANDED_SEARCH_MANY_GREP_MATCH_HIT_COUNT,
  });
  const grepMatchFileSections = groupGrepMatchesByFile(limitedMatchHits.visibleItems);

  return (
    <box flexDirection="column" width="100%">
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
          <text fg={chatScreenTheme.textSecondary} wrapMode="char" width="100%">
            {grepMatchFileSection.matchFilePath}
          </text>
          <FencedCodeBlock
            variant="embedded"
            filePath={grepMatchFileSection.matchFilePath}
            wrapMode="char"
            codeLines={grepMatchFileSection.matchLines}
          />
        </box>
      ))}
    </box>
  );
}

function SearchManyEmptyResultNotice(props: { noticeText: string }): ReactNode {
  return (
    <box width="100%">
      <text fg={chatScreenTheme.textDim} wrapMode="word">{props.noticeText}</text>
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
      appendGrepMatchLines(existingGrepMatchFileSection, matchHit);
      continue;
    }

    const grepMatchFileSection: GrepMatchFileSection = {
      matchFilePath: matchHit.matchFilePath,
      matchLines: [],
    };
    appendGrepMatchLines(grepMatchFileSection, matchHit);
    sectionIndexByMatchFilePath.set(matchHit.matchFilePath, grepMatchFileSections.length);
    grepMatchFileSections.push(grepMatchFileSection);
  }

  return grepMatchFileSections;
}

function appendGrepMatchLines(grepMatchFileSection: GrepMatchFileSection, matchHit: ToolCallGrepMatch): void {
  for (const matchLine of [
    ...(matchHit.contextBeforeLines ?? []),
    { lineNumber: matchHit.matchLineNumber, lineText: matchHit.matchSnippet },
    ...(matchHit.contextAfterLines ?? []),
  ]) {
    if (grepMatchFileSection.matchLines.some((existingLine) => existingLine.lineNumber === matchLine.lineNumber)) {
      continue;
    }

    grepMatchFileSection.matchLines.push(matchLine);
  }
}
