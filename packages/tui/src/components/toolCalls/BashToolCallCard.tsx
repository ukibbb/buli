import type { ReactNode } from "react";
import type { ToolCallBashDetail, WorkspacePatch } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ShellBlock } from "../primitives/ShellBlock.tsx";
import {
  formatWorkspacePatchCompactSummary,
  WorkspacePatchChangedFilesView,
} from "../workspacePatch/WorkspacePatchChangedFilesView.tsx";
import {
  ExpandableToolCallCard,
  formatToolCallDurationMs,
  type ToolCallRenderStatePresentation,
} from "./ExpandableToolCallCard.tsx";

export type BashToolCallCardProps = {
  toolCallDetail: ToolCallBashDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
  workspacePatch?: WorkspacePatch;
};

const MAX_AUTO_EXPANDED_BASH_OUTPUT_LINE_COUNT = 8;
const MAX_AUTO_EXPANDED_BASH_OUTPUT_CHARACTER_COUNT = 800;

export function BashToolCallCard(props: BashToolCallCardProps): ReactNode {
  const bashToolCallPresentation = resolveBashToolCallRenderStatePresentation(props);
  const accentColor = props.workspacePatch && bashToolCallPresentation.statusKind === "success"
    ? chatScreenTheme.accentPrimary
    : bashToolCallPresentation.accentColor;
  const hasBashOutputContent = (props.toolCallDetail.outputLines?.length ?? 0) > 0 || Boolean(props.workspacePatch);
  return (
    <ExpandableToolCallCard
      accentColor={accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      hasExpandableContent={hasBashOutputContent}
      defaultIsContentExpanded={shouldAutoExpandBashBodyContent(props)}
      renderExpandedContent={() => buildBashBodyContent(props)}
      statusKind={bashToolCallPresentation.statusKind}
      statusLabel={buildBashStatusLabel(props)}
      toolNameLabel="Bash"
      toolTargetText={props.toolCallDetail.commandLine}
    />
  );
}

function shouldAutoExpandBashBodyContent(props: BashToolCallCardProps): boolean {
  if (props.workspacePatch) {
    return false;
  }

  const outputLines = props.toolCallDetail.outputLines ?? [];
  if (outputLines.length === 0 || outputLines.length > MAX_AUTO_EXPANDED_BASH_OUTPUT_LINE_COUNT) {
    return false;
  }

  const outputCharacterCount = outputLines.reduce(
    (totalCharacterCount, outputLine) => totalCharacterCount + outputLine.lineText.length,
    0,
  );
  return outputCharacterCount <= MAX_AUTO_EXPANDED_BASH_OUTPUT_CHARACTER_COUNT;
}

function resolveBashToolCallRenderStatePresentation(props: BashToolCallCardProps): ToolCallRenderStatePresentation {
  if (props.renderState === "failed") {
    return { accentColor: chatScreenTheme.accentRed, statusKind: "error" };
  }
  if (props.renderState === "streaming") {
    return { accentColor: chatScreenTheme.accentAmber, statusKind: "pending" };
  }
  if (props.toolCallDetail.exitCode !== undefined && props.toolCallDetail.exitCode !== 0) {
    return { accentColor: chatScreenTheme.accentRed, statusKind: "error" };
  }
  return { accentColor: chatScreenTheme.accentGreen, statusKind: "success" };
}

function buildBashStatusLabel(props: BashToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "bash failed";
  }
  if (props.renderState === "streaming") {
    return "running…";
  }
  const exitCodeLabel =
    props.toolCallDetail.exitCode === undefined
      ? "exited"
      : `exit ${props.toolCallDetail.exitCode}`;
  const durationLabel =
    props.durationMs === undefined ? "" : ` · ${formatToolCallDurationMs(props.durationMs)}`;
  const workspacePatchSummaryLabel = props.workspacePatch
    ? ` · ${formatWorkspacePatchCompactSummary(props.workspacePatch)}`
    : "";
  return `${exitCodeLabel}${durationLabel}${workspacePatchSummaryLabel}`;
}

function buildBashBodyContent(props: BashToolCallCardProps): ReactNode {
  const outputLines = props.toolCallDetail.outputLines;
  const hasBashOutputLines = outputLines !== undefined && outputLines.length > 0;
  if (!hasBashOutputLines && !props.workspacePatch) {
    return undefined;
  }

  return (
    <box flexDirection="column" width="100%">
      {hasBashOutputLines ? <ShellBlock outputLines={outputLines} /> : null}
      {props.workspacePatch ? (
        <box marginTop={hasBashOutputLines ? 1 : 0} width="100%">
          <WorkspacePatchChangedFilesView workspacePatch={props.workspacePatch} />
        </box>
      ) : null}
    </box>
  );
}
