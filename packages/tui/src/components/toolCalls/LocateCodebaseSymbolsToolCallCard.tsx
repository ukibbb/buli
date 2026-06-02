import type { ReactNode } from "react";
import type { ToolCallLocateCodebaseSymbolsDetail } from "@buli/contracts";
import { FileReference } from "../primitives/FileReference.tsx";
import { ExpandableToolCallCard, resolveDefaultToolCallRenderStatePresentation } from "./ExpandableToolCallCard.tsx";

export type LocateCodebaseSymbolsToolCallCardProps = {
  toolCallDetail: ToolCallLocateCodebaseSymbolsDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
};

export function LocateCodebaseSymbolsToolCallCard(props: LocateCodebaseSymbolsToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  const hasLocateContext = (props.toolCallDetail.filePaths?.length ?? 0) > 0 ||
    (props.toolCallDetail.symbolNames?.length ?? 0) > 0;

  return (
    <ExpandableToolCallCard
      accentColor={toolCallPresentation.accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      hasExpandableContent={hasLocateContext}
      renderExpandedContent={() => buildLocateCodebaseSymbolsBodyContent(props.toolCallDetail)}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildLocateCodebaseSymbolsStatusLabel(props)}
      toolNameLabel="LocateSymbols"
      toolTargetText={buildLocateCodebaseSymbolsTargetText(props.toolCallDetail)}
    />
  );
}

function buildLocateCodebaseSymbolsStatusLabel(props: LocateCodebaseSymbolsToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "symbol lookup failed";
  }
  if (props.renderState === "streaming") {
    return "locating…";
  }

  const locatedSymbolCount = props.toolCallDetail.locatedSymbolCount;
  if (locatedSymbolCount === undefined) {
    return "located";
  }

  const locatedSymbolLabel = `${locatedSymbolCount} ${locatedSymbolCount === 1 ? "definition" : "definitions"}`;
  const verificationReadCount = props.toolCallDetail.verificationReadCount;
  if (verificationReadCount === undefined) {
    return locatedSymbolLabel;
  }

  return `${locatedSymbolLabel} · ${verificationReadCount} ${verificationReadCount === 1 ? "read" : "reads"}`;
}

function buildLocateCodebaseSymbolsTargetText(toolCallDetail: ToolCallLocateCodebaseSymbolsDetail): string {
  const symbolCount = toolCallDetail.symbolNames?.length ?? 0;
  const fileCount = toolCallDetail.filePaths?.length ?? 0;
  const targetParts: string[] = [];

  if (symbolCount > 0) {
    targetParts.push(`${symbolCount} ${symbolCount === 1 ? "symbol" : "symbols"}`);
  }
  if (fileCount > 0) {
    targetParts.push(`${fileCount} ${fileCount === 1 ? "file" : "files"}`);
  }

  return targetParts.length > 0 ? targetParts.join(" · ") : "codebase symbols";
}

function buildLocateCodebaseSymbolsBodyContent(toolCallDetail: ToolCallLocateCodebaseSymbolsDetail): ReactNode {
  const filePaths = toolCallDetail.filePaths ?? [];
  const symbolNames = toolCallDetail.symbolNames ?? [];

  return (
    <box flexDirection="column" width="100%">
      <box flexDirection="column" paddingX={1} width="100%">
        {filePaths.map((filePath, index) => (
          <box key={`locate-file-${index}`} width="100%">
            <text><span>file </span></text>
            <FileReference filePath={filePath} variant="inline" />
          </box>
        ))}
        {symbolNames.map((symbolName, index) => (
          <box key={`locate-symbol-${index}`} width="100%">
            <text>{`symbol ${symbolName}`}</text>
          </box>
        ))}
      </box>
    </box>
  );
}
