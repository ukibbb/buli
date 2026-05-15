import type { ReactNode } from "react";
import type { ToolCallExploreDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { glyphs } from "../glyphs.ts";
import { BracketedTarget } from "./BracketedTarget.tsx";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "./ToolCallCardHeaderSlots.tsx";

export type ExplorerToolCallCardProps = {
  toolCallDetail: ToolCallExploreDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

export function ExplorerToolCallCard(props: ExplorerToolCallCardProps): ReactNode {
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
          toolNameLabel="Explorer"
          toolTargetContent={
            <BracketedTarget accentColor={accentColor} targetText={props.toolCallDetail.explorationDescription} />
          }
        />
      }
      headerRight={
        <ToolCallHeaderRight
          statusColor={accentColor}
          statusKind={statusKind}
          statusLabel={buildExplorerStatusLabel(props)}
        />
      }
      bodyContent={buildExplorerBodyContent(props)}
    />
  );
}

function buildExplorerStatusLabel(props: ExplorerToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "explorer failed";
  }
  if (props.renderState === "streaming") {
    return "exploring...";
  }
  const durationLabel =
    props.durationMs === undefined ? "" : ` · ${formatDurationMs(props.durationMs)}`;
  return `returned${durationLabel}`;
}

function buildExplorerBodyContent(props: ExplorerToolCallCardProps): ReactNode {
  if (props.renderState === "failed") {
    return (
      <text fg={chatScreenTheme.accentRed}>
        {props.errorText ?? "Explorer returned no result."}
      </text>
    );
  }
  const { explorationPrompt, explorationResultSummary } = props.toolCallDetail;
  if (!explorationPrompt && !explorationResultSummary) {
    return undefined;
  }
  return (
    <box flexDirection="column" paddingX={1} width="100%">
      {explorationPrompt ? (
        <box width="100%">
          <text fg={chatScreenTheme.textMuted}>{"// prompt"}</text>
        </box>
      ) : null}
      {explorationPrompt ? (
        <box width="100%">
          <text fg={chatScreenTheme.textSecondary}>{explorationPrompt}</text>
        </box>
      ) : null}
      {explorationResultSummary ? (
        <box {...(explorationPrompt ? { marginTop: 1 } : {})} width="100%">
          <text fg={chatScreenTheme.textMuted}>{"// result"}</text>
        </box>
      ) : null}
      {explorationResultSummary ? (
        <box width="100%">
          <text fg={chatScreenTheme.textPrimary}>{explorationResultSummary}</text>
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
