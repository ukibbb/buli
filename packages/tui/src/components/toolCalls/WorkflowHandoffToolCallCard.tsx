import type { ReactNode } from "react";
import type { ToolCallRecordWorkflowHandoffDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import {
  ExpandableToolCallCard,
  formatToolCallDurationMs,
  resolveDefaultToolCallRenderStatePresentation,
} from "./ExpandableToolCallCard.tsx";

export type WorkflowHandoffToolCallCardProps = {
  toolCallDetail: ToolCallRecordWorkflowHandoffDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
};

export function WorkflowHandoffToolCallCard(props: WorkflowHandoffToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  return (
    <ExpandableToolCallCard
      accentColor={toolCallPresentation.accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      hasExpandableContent={props.toolCallDetail.handoffSummary.length > 0}
      renderExpandedContent={() => buildWorkflowHandoffBodyContent(props.toolCallDetail)}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildWorkflowHandoffStatusLabel(props)}
      toolNameLabel="WorkflowHandoff"
      toolTargetText={props.toolCallDetail.handoffKind}
    />
  );
}

function buildWorkflowHandoffStatusLabel(props: WorkflowHandoffToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "handoff failed";
  }
  if (props.renderState === "streaming") {
    return "recording…";
  }

  return props.durationMs === undefined ? "recorded" : `recorded · ${formatToolCallDurationMs(props.durationMs)}`;
}

function buildWorkflowHandoffBodyContent(toolCallDetail: ToolCallRecordWorkflowHandoffDetail): ReactNode {
  return (
    <box flexDirection="column" paddingX={1} width="100%">
      <text fg={chatScreenTheme.textSecondary}>{toolCallDetail.handoffSummary}</text>
    </box>
  );
}
