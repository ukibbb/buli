import type { ReactNode } from "react";
import type { ToolCallGrepMatch, ToolCallSearchManyDetail, ToolCallSearchManyResult } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { FileReference } from "../primitives/FileReference.tsx";
import { limitVisibleItems, VisibleContentLimitNotice } from "../primitives/VisibleContentLimit.tsx";
import { ExpandableToolCallCard, resolveDefaultToolCallRenderStatePresentation } from "./ExpandableToolCallCard.tsx";
import { GrepMatchResultsBlock } from "./GrepMatchResultsBlock.tsx";

const MAX_EXPANDED_SEARCH_MANY_GLOB_PATH_COUNT = 25;
const MAX_EXPANDED_SEARCH_MANY_GREP_MATCH_HIT_COUNT = 25;

export type SearchManyToolCallCardProps = {
  toolCallDetail: ToolCallSearchManyDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
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
            <SearchManyResultHeader searchResult={searchResult} />
          </box>
          <SearchManyResultBody searchResult={searchResult} />
        </box>
      ))}
    </box>
  );
}

function SearchManyResultHeader(props: { searchResult: ToolCallSearchManyResult }): ReactNode {
  const searchDetail = props.searchResult.searchDetail;
  const searchManyResultAccentColor = props.searchResult.searchStatus === "failed"
    ? chatScreenTheme.accentRed
    : chatScreenTheme.accentGreen;
  if (searchDetail.toolName === "glob") {
    return (
      <text wrapMode="char" width="100%">
        <span fg={chatScreenTheme.textPrimary}>Glob</span>
        <span fg={searchManyResultAccentColor}>{" ["}</span>
        <span fg={chatScreenTheme.textMuted}>{searchDetail.globPattern}</span>
        <span fg={searchManyResultAccentColor}>{"]"}</span>
      </text>
    );
  }

  return (
    <text wrapMode="char" width="100%">
      <span fg={chatScreenTheme.textPrimary}>Grep</span>
      <span fg={searchManyResultAccentColor}>{" ["}</span>
      <span fg={chatScreenTheme.textMuted}>{searchDetail.searchPattern}</span>
      <span fg={searchManyResultAccentColor}>{"]"}</span>
    </text>
  );
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

  return (
    <box flexDirection="column" width="100%">
      <GrepMatchResultsBlock
        matchHits={props.matchHits}
        maximumVisibleMatchHitCount={MAX_EXPANDED_SEARCH_MANY_GREP_MATCH_HIT_COUNT}
      />
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
