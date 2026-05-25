import type { ReactNode } from "react";
import type { ToolCallReadManyDetail, ToolCallReadManyResult, ToolCallReadPreviewLine } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { FencedCodeBlock } from "../primitives/FencedCodeBlock.tsx";
import { SourceLocationLabel, type SourceLineRange } from "../primitives/SourceLocationLabel.tsx";
import { ExpandableToolCallCard, resolveDefaultToolCallRenderStatePresentation } from "./ExpandableToolCallCard.tsx";

export type ReadManyToolCallCardProps = {
  toolCallDetail: ToolCallReadManyDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
};

export function ReadManyToolCallCard(props: ReadManyToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  const readResults = props.toolCallDetail.readResults ?? [];
  const hasReadManyPreviewContent = props.renderState !== "failed" && readResults.length > 0;
  return (
    <ExpandableToolCallCard
      accentColor={toolCallPresentation.accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      hasExpandableContent={hasReadManyPreviewContent}
      renderExpandedContent={() => buildReadManyBodyContent(readResults)}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildReadManyStatusLabel(props)}
      toolNameLabel="ReadMany"
      toolTargetText={formatReadManyTargetText(props.toolCallDetail.requestedReadTargetPaths.length)}
    />
  );
}

function buildReadManyStatusLabel(props: ReadManyToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "read_many failed";
  }
  const requestedReadTargetCount = props.toolCallDetail.requestedReadTargetPaths.length;
  if (props.renderState === "streaming") {
    return `reading ${formatReadManyTargetText(requestedReadTargetCount)}…`;
  }

  const completedReadCount = props.toolCallDetail.completedReadCount;
  const failedReadCount = props.toolCallDetail.failedReadCount ?? 0;
  if (completedReadCount === undefined) {
    return "read";
  }
  if (failedReadCount > 0) {
    return `${completedReadCount}/${requestedReadTargetCount} read, ${failedReadCount} failed`;
  }
  return `${completedReadCount} read`;
}

function formatReadManyTargetText(requestedReadTargetCount: number): string {
  return `${requestedReadTargetCount} ${requestedReadTargetCount === 1 ? "path" : "paths"}`;
}

function buildReadManyBodyContent(readResults: readonly ToolCallReadManyResult[]): ReactNode {
  if (readResults.length === 0) {
    return undefined;
  }

  return (
    <box flexDirection="column" paddingX={1} width="100%">
      {readResults.map((readResult, readResultIndex) => (
        <box
          key={`read-many-result-${readResultIndex}`}
          flexDirection="column"
          {...(readResultIndex > 0
            ? {
                border: ["top"] as const,
                borderColor: chatScreenTheme.borderSubtle,
                marginTop: 1,
                paddingTop: 1,
              }
            : {})}
          width="100%"
        >
          <ReadManyResultBody readResult={readResult} />
        </box>
      ))}
    </box>
  );
}

function ReadManyResultBody(props: { readResult: ToolCallReadManyResult }): ReactNode {
  const readDetail = props.readResult.readDetail;
  if (props.readResult.readStatus === "failed") {
    return (
      <box flexDirection="column" width="100%">
        <SourceLocationLabel filePath={readDetail.readFilePath} />
        <text fg={chatScreenTheme.accentRed} wrapMode="word">{props.readResult.failureExplanation}</text>
      </box>
    );
  }

  if (!readDetail.previewLines || readDetail.previewLines.length === 0) {
    return <SourceLocationLabel filePath={readDetail.readFilePath} />;
  }

  return (
    <box flexDirection="column" width="100%">
      <SourceLocationLabel
        filePath={readDetail.readFilePath}
        sourceLineRange={resolveReadPreviewSourceLineRange(readDetail.previewLines)}
      />
      <FencedCodeBlock
        variant="embedded"
        filePath={readDetail.readFilePath}
        showLineNumbers={false}
        wrapMode="char"
        codeLines={readDetail.previewLines.map((previewLine) => ({
          lineNumber: previewLine.lineNumber,
          lineText: previewLine.lineText,
          ...(previewLine.syntaxHighlightSpans
            ? { syntaxHighlightSpans: previewLine.syntaxHighlightSpans }
            : {}),
        }))}
      />
    </box>
  );
}

function resolveReadPreviewSourceLineRange(previewLines: readonly ToolCallReadPreviewLine[]): SourceLineRange | undefined {
  const firstPreviewLine = previewLines.at(0);
  const lastPreviewLine = previewLines.at(-1);
  if (!firstPreviewLine || !lastPreviewLine) {
    return undefined;
  }

  return {
    sourceStartLineNumber: firstPreviewLine.lineNumber,
    sourceEndLineNumber: lastPreviewLine.lineNumber,
  };
}
