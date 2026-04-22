import type { ReactNode } from "react";
import type { ToolCallBashDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ShellBlock } from "../primitives/ShellBlock.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { glyphs } from "../glyphs.ts";
import { BracketedTarget } from "./BracketedTarget.tsx";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "./ToolCallCardHeaderSlots.tsx";

export type BashToolCallCardProps = {
  toolCallDetail: ToolCallBashDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

const MAX_VISIBLE_BASH_OUTPUT_LINES = 24;

export function BashToolCallCard(props: BashToolCallCardProps): ReactNode {
  const accentColor = deriveBashAccentColor(props);
  const statusKind =
    props.renderState === "completed" &&
    (props.toolCallDetail.exitCode === undefined || props.toolCallDetail.exitCode === 0)
      ? "success"
      : props.renderState === "completed" || props.renderState === "failed"
        ? "error"
        : "pending";
  return (
    <SurfaceCard
      accentColor={accentColor}
      headerLeft={
        <ToolCallHeaderLeft
          toolGlyph={glyphs.bashTerminal}
          toolGlyphColor={accentColor}
          toolNameLabel="Bash"
          toolTargetContent={
            <BracketedTarget accentColor={accentColor} targetText={props.toolCallDetail.commandLine} />
          }
        />
      }
      headerRight={
        <ToolCallHeaderRight
          statusColor={accentColor}
          statusKind={statusKind}
          statusLabel={buildBashStatusLabel(props)}
        />
      }
      bodyContent={buildBashBodyContent(props)}
    />
  );
}

function deriveBashAccentColor(props: BashToolCallCardProps): string {
  if (props.renderState === "failed") {
    return chatScreenTheme.accentRed;
  }
  if (props.renderState === "streaming") {
    return chatScreenTheme.accentAmber;
  }
  if (props.toolCallDetail.exitCode !== undefined && props.toolCallDetail.exitCode !== 0) {
    return chatScreenTheme.accentRed;
  }
  return chatScreenTheme.accentGreen;
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
    props.durationMs === undefined ? "" : ` · ${formatDurationMs(props.durationMs)}`;
  return `${exitCodeLabel}${durationLabel}`;
}

function buildBashBodyContent(props: BashToolCallCardProps): ReactNode {
  if (props.renderState === "failed") {
    return (
      <text fg={chatScreenTheme.accentRed}>
        {props.errorText ?? "Command did not run."}
      </text>
    );
  }
  const outputLines = props.toolCallDetail.outputLines;
  if (!outputLines || outputLines.length === 0) {
    return undefined;
  }
  return <ShellBlock maxVisibleLines={MAX_VISIBLE_BASH_OUTPUT_LINES} outputLines={outputLines} />;
}

function formatDurationMs(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}
