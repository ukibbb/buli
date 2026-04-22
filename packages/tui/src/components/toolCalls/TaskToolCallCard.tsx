import type { ReactNode } from "react";
import type { ToolCallTaskDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { glyphs } from "../glyphs.ts";
import { BracketedTarget } from "./BracketedTarget.tsx";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "./ToolCallCardHeaderSlots.tsx";

export type TaskToolCallCardProps = {
  toolCallDetail: ToolCallTaskDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

export function TaskToolCallCard(props: TaskToolCallCardProps): ReactNode {
  const accentColor =
    props.renderState === "failed"
      ? chatScreenTheme.accentRed
      : props.renderState === "streaming"
        ? chatScreenTheme.accentAmber
        : chatScreenTheme.accentGreen;
  const statusKind =
    props.renderState === "completed"
      ? "success"
      : props.renderState === "failed"
        ? "error"
        : "pending";
  return (
    <SurfaceCard
      accentColor={accentColor}
      headerLeft={
        <ToolCallHeaderLeft
          toolGlyph={glyphs.taskSpawn}
          toolGlyphColor={accentColor}
          toolNameLabel="Task"
          toolTargetContent={
            <BracketedTarget accentColor={accentColor} targetText={props.toolCallDetail.subagentDescription} />
          }
        />
      }
      headerRight={
        <ToolCallHeaderRight
          statusColor={accentColor}
          statusKind={statusKind}
          statusLabel={buildTaskStatusLabel(props)}
        />
      }
      bodyContent={buildTaskBodyContent(props)}
    />
  );
}

function buildTaskStatusLabel(props: TaskToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "sub-agent failed";
  }
  if (props.renderState === "streaming") {
    return "dispatched…";
  }
  const durationLabel =
    props.durationMs === undefined ? "" : ` · ${formatDurationMs(props.durationMs)}`;
  return `returned${durationLabel}`;
}

function buildTaskBodyContent(props: TaskToolCallCardProps): ReactNode {
  if (props.renderState === "failed") {
    return (
      <text fg={chatScreenTheme.accentRed}>
        {props.errorText ?? "Sub-agent returned no result."}
      </text>
    );
  }
  const { subagentPrompt, subagentResultSummary } = props.toolCallDetail;
  if (!subagentPrompt && !subagentResultSummary) {
    return undefined;
  }
  return (
    <box flexDirection="column" paddingX={1} width="100%">
      {subagentPrompt ? (
        <box width="100%">
          <text fg={chatScreenTheme.textMuted}>{"// prompt"}</text>
        </box>
      ) : null}
      {subagentPrompt ? (
        <box width="100%">
          <text fg={chatScreenTheme.textSecondary}>{subagentPrompt}</text>
        </box>
      ) : null}
      {subagentResultSummary ? (
        <box {...(subagentPrompt ? { marginTop: 1 } : {})} width="100%">
          <text fg={chatScreenTheme.textMuted}>{"// result"}</text>
        </box>
      ) : null}
      {subagentResultSummary ? (
        <box width="100%">
          <text fg={chatScreenTheme.textPrimary}>{subagentResultSummary}</text>
        </box>
      ) : null}
    </box>
  );
}

function formatDurationMs(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}
