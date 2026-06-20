import type { ReactNode } from "react";
import type { ToolCallWebSearchDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { AlwaysVisibleToolCallCard, resolveDefaultToolCallRenderStatePresentation } from "./ExpandableToolCallCard.tsx";

export type WebSearchToolCallCardProps = {
  toolCallDetail: ToolCallWebSearchDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
};

export function WebSearchToolCallCard(props: WebSearchToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  const hasVisibleContent = props.renderState !== "failed" &&
    ((props.toolCallDetail.sources?.length ?? 0) > 0 ||
      (props.toolCallDetail.results?.length ?? 0) > 0 ||
      (props.toolCallDetail.searchQueryTexts?.length ?? 0) > 1);

  return (
    <AlwaysVisibleToolCallCard
      accentColor={toolCallPresentation.accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      hasVisibleContent={hasVisibleContent}
      renderVisibleContent={() => buildWebSearchBodyContent(props.toolCallDetail)}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildWebSearchStatusLabel(props)}
      toolNameLabel="WebSearch"
      toolTargetText={buildWebSearchTargetText(props.toolCallDetail)}
    />
  );
}

function buildWebSearchStatusLabel(props: WebSearchToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "web search failed";
  }

  if (props.renderState === "streaming") {
    if (props.toolCallDetail.webSearchStatus === "searching") {
      return "searching…";
    }
    if (props.toolCallDetail.webSearchActionKind === "open_page") {
      return "opening…";
    }
    if (props.toolCallDetail.webSearchActionKind === "find_in_page") {
      return "finding…";
    }
    return "starting…";
  }

  const resultLabels = [
    ...(props.toolCallDetail.sourceCount !== undefined
      ? [`${props.toolCallDetail.sourceCount} ${props.toolCallDetail.sourceCount === 1 ? "source" : "sources"}`]
      : []),
    ...(props.toolCallDetail.resultCount !== undefined
      ? [`${props.toolCallDetail.resultCount} ${props.toolCallDetail.resultCount === 1 ? "result" : "results"}`]
      : []),
    ...(props.toolCallDetail.imageResultCount !== undefined
      ? [`${props.toolCallDetail.imageResultCount} ${props.toolCallDetail.imageResultCount === 1 ? "image" : "images"}`]
      : []),
  ];
  return resultLabels.length > 0 ? `done · ${resultLabels.join(" · ")}` : "done";
}

function buildWebSearchTargetText(toolCallDetail: ToolCallWebSearchDetail): string {
  if (toolCallDetail.searchQueryTexts && toolCallDetail.searchQueryTexts.length > 0) {
    return toolCallDetail.searchQueryTexts.join("; ");
  }
  if (toolCallDetail.openedPageUrl !== undefined && toolCallDetail.findPattern !== undefined) {
    return `${toolCallDetail.openedPageUrl} · ${toolCallDetail.findPattern}`;
  }
  if (toolCallDetail.openedPageUrl !== undefined) {
    return toolCallDetail.openedPageUrl;
  }
  if (toolCallDetail.findPattern !== undefined) {
    return toolCallDetail.findPattern;
  }
  return "provider-hosted web";
}

function buildWebSearchBodyContent(toolCallDetail: ToolCallWebSearchDetail): ReactNode {
  const sources = toolCallDetail.sources ?? [];
  const searchResults = toolCallDetail.results?.slice(0, 3) ?? [];
  const extraQueries = toolCallDetail.searchQueryTexts?.slice(1) ?? [];

  return (
    <box flexDirection="column" paddingX={1} width="100%">
      {extraQueries.map((searchQueryText, searchQueryIndex) => (
        <text key={`query-${searchQueryIndex}`} fg={chatScreenTheme.textDim} wrapMode="word" width="100%">
          Query: {searchQueryText}
        </text>
      ))}
      {sources.map((source, sourceIndex) => (
        <text key={`${source.sourceUrl}-${sourceIndex}`} fg={chatScreenTheme.textDim} wrapMode="word" width="100%">
          {source.sourceTitle ? `${source.sourceTitle} · ` : ""}{source.sourceUrl}
        </text>
      ))}
      {searchResults.map((searchResult, searchResultIndex) => (
        <box key={`result-${searchResultIndex}`} flexDirection="column" width="100%">
          <text fg={chatScreenTheme.textDim} wrapMode="word" width="100%">
            {formatWebSearchResultTitle(searchResult)}
          </text>
        </box>
      ))}
    </box>
  );
}

function formatWebSearchResultTitle(
  searchResult: NonNullable<ToolCallWebSearchDetail["results"]>[number],
): string {
  if (searchResult.resultKind === "image") {
    const imageTargetText = searchResult.resultSourceUrl ?? searchResult.resultImageUrl ?? searchResult.resultThumbnailUrl ?? "image result";
    return `${searchResult.resultTitle ? `${searchResult.resultTitle} · ` : "Image · "}${imageTargetText}`;
  }

  return searchResult.resultTitle ? `${searchResult.resultTitle} · ${searchResult.resultUrl}` : searchResult.resultUrl;
}
