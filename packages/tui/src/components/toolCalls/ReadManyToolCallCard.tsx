import type { ReactNode } from "react";
import type { ToolCallReadManyDetail, ToolCallReadManyResult } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ReadFilePreviewBlock } from "../primitives/ReadFilePreviewBlock.tsx";
import { ExpandableToolCallCard, resolveDefaultToolCallRenderStatePresentation } from "./ExpandableToolCallCard.tsx";

const readManyResultSeparatorText = "─".repeat(120);

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
          {...(readResultIndex > 0 ? { marginTop: 1 } : {})}
          width="100%"
        >
          {readResultIndex > 0 ? <ReadManyResultSeparator /> : null}
          <box width="100%">
            <text fg={chatScreenTheme.textMuted}>
              {formatReadManyResultHeader(readResult, readResultIndex)}
            </text>
          </box>
          <ReadManyResultBody readResult={readResult} />
        </box>
      ))}
    </box>
  );
}

function ReadManyResultSeparator(): ReactNode {
  return (
    <box marginBottom={1} width="100%">
      <text fg={chatScreenTheme.accentGreen} wrapMode="none" width="100%">
        {readManyResultSeparatorText}
      </text>
    </box>
  );
}

function formatReadManyResultHeader(readResult: ToolCallReadManyResult, readResultIndex: number): string {
  return `${readResultIndex + 1}. ${readResult.readDetail.readFilePath} - ${readResult.readStatus}`;
}

function ReadManyResultBody(props: { readResult: ToolCallReadManyResult }): ReactNode {
  if (props.readResult.readStatus === "failed") {
    return (
      <box width="100%">
        <text fg={chatScreenTheme.accentRed} wrapMode="word">{props.readResult.failureExplanation}</text>
      </box>
    );
  }

  const readDetail = props.readResult.readDetail;
  if (!readDetail.previewLines || readDetail.previewLines.length === 0) {
    return undefined;
  }

  return (
    <ReadFilePreviewBlock
      previewLines={readDetail.previewLines}
      readFilePath={readDetail.readFilePath}
      {...(readDetail.readLineCount !== undefined ? { readLineCount: readDetail.readLineCount } : {})}
      {...(readDetail.returnedLineCount !== undefined ? { returnedLineCount: readDetail.returnedLineCount } : {})}
      {...(readDetail.wasLineCountTruncated !== undefined ? { wasLineCountTruncated: readDetail.wasLineCountTruncated } : {})}
    />
  );
}
