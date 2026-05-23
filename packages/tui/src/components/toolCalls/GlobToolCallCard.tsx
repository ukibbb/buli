import type { ReactNode } from "react";
import type { ToolCallGlobDetail } from "@buli/contracts";
import { FileReference } from "../primitives/FileReference.tsx";
import { limitVisibleItems, VisibleContentLimitNotice } from "../primitives/VisibleContentLimit.tsx";
import { ExpandableToolCallCard, resolveDefaultToolCallRenderStatePresentation } from "./ExpandableToolCallCard.tsx";

const MAX_EXPANDED_GLOB_PATH_COUNT = 50;

export type GlobToolCallCardProps = {
  toolCallDetail: ToolCallGlobDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
};

export function GlobToolCallCard(props: GlobToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  const matchedPaths = props.toolCallDetail.matchedPaths;
  const hasGlobResultContent = props.renderState !== "failed" && (matchedPaths?.length ?? 0) > 0;
  return (
    <ExpandableToolCallCard
      accentColor={toolCallPresentation.accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      hasExpandableContent={hasGlobResultContent}
      renderExpandedContent={() => buildGlobBodyContent(matchedPaths ?? [])}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildGlobStatusLabel(props)}
      toolNameLabel="Glob"
      toolTargetText={props.toolCallDetail.globPattern}
    />
  );
}

function buildGlobStatusLabel(props: GlobToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "glob failed";
  }
  if (props.renderState === "streaming") {
    return "searching…";
  }
  const matchedPathCount = props.toolCallDetail.matchedPathCount;
  const returnedPathCount = props.toolCallDetail.returnedPathCount;
  if (matchedPathCount !== undefined) {
    if (returnedPathCount !== undefined && returnedPathCount !== matchedPathCount) {
      return `${returnedPathCount}/${matchedPathCount} paths`;
    }
    return `${matchedPathCount} paths`;
  }
  return "done";
}

function buildGlobBodyContent(matchedPaths: readonly string[]): ReactNode {
  if (matchedPaths.length === 0) {
    return undefined;
  }
  const limitedMatchedPaths = limitVisibleItems({
    items: matchedPaths,
    maximumVisibleItemCount: MAX_EXPANDED_GLOB_PATH_COUNT,
  });
  return (
    <box flexDirection="column" width="100%">
      <box flexDirection="column" paddingX={1} width="100%">
        <VisibleContentLimitNotice
          visibleItemCount={limitedMatchedPaths.visibleItems.length}
          totalItemCount={limitedMatchedPaths.totalItemCount}
          itemLabelPlural="paths"
        />
        {limitedMatchedPaths.visibleItems.map((matchedPath, index) => (
          <box key={`glob-path-${index}`} width="100%">
            <FileReference filePath={matchedPath} variant="inline" />
          </box>
        ))}
      </box>
    </box>
  );
}
