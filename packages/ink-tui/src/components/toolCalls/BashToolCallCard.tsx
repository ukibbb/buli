import { Text } from "ink";
import type { ReactNode } from "react";
import type { ToolCallBashDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ShellBlock } from "../primitives/ShellBlock.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { glyphs } from "../glyphs.ts";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "./ToolCallCardHeaderSlots.tsx";

// BashToolCallCard renders the design's component/ToolCall-Bash: amber stripe,
// terminal glyph, the command as the target, and an exit · duration status.
// Non-zero exit codes flip the status colour to red so failing commands are
// immediately recognisable in the transcript.
export type BashToolCallCardProps = {
  toolCallDetail: ToolCallBashDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

export function BashToolCallCard(props: BashToolCallCardProps): ReactNode {
  const stripeColor =
    props.renderState === "failed" ? chatScreenTheme.accentRed : chatScreenTheme.accentAmber;
  const statusColor = deriveBashStatusColor(props);
  const statusKind =
    props.renderState === "completed" &&
    (props.toolCallDetail.exitCode === undefined || props.toolCallDetail.exitCode === 0)
      ? "success"
      : props.renderState === "completed" || props.renderState === "failed"
        ? "error"
        : "pending";
  return (
    <SurfaceCard
      stripeColor={stripeColor}
      headerLeft={
        <ToolCallHeaderLeft
          toolGlyph={glyphs.bashTerminal}
          toolGlyphColor={stripeColor}
          toolNameLabel="Bash"
          toolTargetContent={
            <Text color={chatScreenTheme.textMuted}>{props.toolCallDetail.commandLine}</Text>
          }
        />
      }
      headerRight={
        <ToolCallHeaderRight
          statusColor={statusColor}
          statusKind={statusKind}
          statusLabel={buildBashStatusLabel(props)}
        />
      }
      bodyContent={buildBashBodyContent(props)}
    />
  );
}

function deriveBashStatusColor(props: BashToolCallCardProps): string {
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
      <Text color={chatScreenTheme.accentRed}>
        {props.errorText ?? "Command did not run."}
      </Text>
    );
  }
  const outputLines = props.toolCallDetail.outputLines;
  if (!outputLines || outputLines.length === 0) {
    return undefined;
  }
  return <ShellBlock outputLines={outputLines} />;
}

function formatDurationMs(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}
