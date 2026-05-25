import type { ReactNode } from "react";
import type { ToolCallGrepDetail } from "@buli/contracts";
import { GrepMatchResultsBlock } from "./GrepMatchResultsBlock.tsx";
import { ExpandableToolCallCard, resolveDefaultToolCallRenderStatePresentation } from "./ExpandableToolCallCard.tsx";

const MAX_EXPANDED_GREP_MATCH_HIT_COUNT = 50;

export type GrepToolCallCardProps = {
  toolCallDetail: ToolCallGrepDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
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
  return (
    <box flexDirection="column" width="100%">
      <box flexDirection="column" paddingX={1} width="100%">
        <GrepMatchResultsBlock
          matchHits={matchHits}
          maximumVisibleMatchHitCount={MAX_EXPANDED_GREP_MATCH_HIT_COUNT}
        />
      </box>
    </box>
  );
}
