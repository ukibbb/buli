import type { ReactNode } from "react";
import type { ToolCallQueryCodebaseKnowledgeDetail } from "@buli/contracts";
import { FileReference } from "../primitives/FileReference.tsx";
import { ExpandableToolCallCard, resolveDefaultToolCallRenderStatePresentation } from "./ExpandableToolCallCard.tsx";

export type QueryCodebaseKnowledgeToolCallCardProps = {
  toolCallDetail: ToolCallQueryCodebaseKnowledgeDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
};

export function QueryCodebaseKnowledgeToolCallCard(props: QueryCodebaseKnowledgeToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  const hasQueryContext = (props.toolCallDetail.knownRelevantFilePaths?.length ?? 0) > 0 ||
    (props.toolCallDetail.knownRelevantSymbolNames?.length ?? 0) > 0;

  return (
    <ExpandableToolCallCard
      accentColor={toolCallPresentation.accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      hasExpandableContent={hasQueryContext}
      renderExpandedContent={() => buildQueryCodebaseKnowledgeBodyContent(props.toolCallDetail)}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildQueryCodebaseKnowledgeStatusLabel(props)}
      toolNameLabel="Knowledge"
      toolTargetText={props.toolCallDetail.codebaseProblemDescription}
    />
  );
}

function buildQueryCodebaseKnowledgeStatusLabel(props: QueryCodebaseKnowledgeToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "knowledge query failed";
  }
  if (props.renderState === "streaming") {
    return "querying…";
  }

  const matchedKnowledgeCount = props.toolCallDetail.matchedKnowledgeCount;
  if (matchedKnowledgeCount === undefined) {
    return "done";
  }

  const matchLabel = `${matchedKnowledgeCount} ${matchedKnowledgeCount === 1 ? "match" : "matches"}`;
  const recommendedReadCount = props.toolCallDetail.recommendedReadCount;
  if (recommendedReadCount === undefined) {
    return matchLabel;
  }

  return `${matchLabel} · ${recommendedReadCount} ${recommendedReadCount === 1 ? "read" : "reads"}`;
}

function buildQueryCodebaseKnowledgeBodyContent(toolCallDetail: ToolCallQueryCodebaseKnowledgeDetail): ReactNode {
  const knownRelevantFilePaths = toolCallDetail.knownRelevantFilePaths ?? [];
  const knownRelevantSymbolNames = toolCallDetail.knownRelevantSymbolNames ?? [];

  return (
    <box flexDirection="column" width="100%">
      <box flexDirection="column" paddingX={1} width="100%">
        {knownRelevantFilePaths.map((knownRelevantFilePath, index) => (
          <box key={`known-file-${index}`} width="100%">
            <text><span>known file </span></text>
            <FileReference filePath={knownRelevantFilePath} variant="inline" />
          </box>
        ))}
        {knownRelevantSymbolNames.map((knownRelevantSymbolName, index) => (
          <box key={`known-symbol-${index}`} width="100%">
            <text>{`known symbol ${knownRelevantSymbolName}`}</text>
          </box>
        ))}
      </box>
    </box>
  );
}
