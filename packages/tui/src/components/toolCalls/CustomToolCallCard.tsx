import type { ReactNode } from "react";
import type { CustomToolCallDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { FencedCodeBlock } from "../primitives/FencedCodeBlock.tsx";
import {
  ExpandableToolCallCard,
  formatToolCallDurationMs,
  resolveDefaultToolCallRenderStatePresentation,
} from "./ExpandableToolCallCard.tsx";

export type CustomToolCallCardProps = {
  toolCallDetail: CustomToolCallDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
};

export function CustomToolCallCard(props: CustomToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  return (
    <ExpandableToolCallCard
      accentColor={toolCallPresentation.accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      defaultIsContentExpanded={true}
      hasExpandableContent={hasCustomToolBodyContent(props.toolCallDetail)}
      renderExpandedContent={() => buildCustomToolBodyContent(props.toolCallDetail)}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildCustomToolStatusLabel(props)}
      toolNameLabel={props.toolCallDetail.toolDisplayName ?? formatCustomToolDisplayName(props.toolCallDetail.toolName)}
      toolTargetText={props.toolCallDetail.toolResultSummary ?? "custom tool"}
    />
  );
}

function buildCustomToolStatusLabel(props: CustomToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "custom tool failed";
  }
  if (props.renderState === "streaming") {
    return "running…";
  }

  return props.durationMs === undefined ? "completed" : `completed · ${formatToolCallDurationMs(props.durationMs)}`;
}

function hasCustomToolBodyContent(toolCallDetail: CustomToolCallDetail): boolean {
  return Boolean(
    toolCallDetail.toolArgumentsJson !== undefined ||
      toolCallDetail.toolResultJson !== undefined ||
      toolCallDetail.toolResultSummary !== undefined,
  );
}

function buildCustomToolBodyContent(toolCallDetail: CustomToolCallDetail): ReactNode {
  if (!hasCustomToolBodyContent(toolCallDetail)) {
    return undefined;
  }

  return (
    <box flexDirection="column" paddingX={1} width="100%">
      {toolCallDetail.toolResultSummary ? (
        <box width="100%">
          <text fg={chatScreenTheme.textSecondary}>{toolCallDetail.toolResultSummary}</text>
        </box>
      ) : null}
      {toolCallDetail.toolArgumentsJson !== undefined ? (
        <box {...(toolCallDetail.toolResultSummary ? { marginTop: 1 } : {})} width="100%">
          <FencedCodeBlock
            codeText={JSON.stringify(toolCallDetail.toolArgumentsJson, null, 2)}
            displayLabel="Arguments"
            languageLabel="json"
            showLineNumbers={false}
            variant="embedded"
          />
        </box>
      ) : null}
      {toolCallDetail.toolResultJson !== undefined ? (
        <box marginTop={1} width="100%">
          <FencedCodeBlock
            codeText={JSON.stringify(toolCallDetail.toolResultJson, null, 2)}
            displayLabel="Result"
            languageLabel="json"
            showLineNumbers={false}
            variant="embedded"
          />
        </box>
      ) : null}
    </box>
  );
}

function formatCustomToolDisplayName(toolName: string): string {
  return toolName
    .split(/[_\-.]+/)
    .filter((toolNamePart) => toolNamePart.length > 0)
    .map((toolNamePart) => `${toolNamePart.charAt(0).toUpperCase()}${toolNamePart.slice(1)}`)
    .join("") || toolName;
}
