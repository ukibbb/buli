import type { ReactNode } from "react";
import type { ExplorerChildToolCall, ToolCallExploreDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { BracketedTarget } from "./BracketedTarget.tsx";
import { GlobToolCallCard } from "./GlobToolCallCard.tsx";
import { GrepToolCallCard } from "./GrepToolCallCard.tsx";
import { ReadToolCallCard } from "./ReadToolCallCard.tsx";
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
  const { explorationPrompt, explorationChildToolCalls, explorationResultSummary } = props.toolCallDetail;
  const hasExplorationChildToolCalls = explorationChildToolCalls !== undefined && explorationChildToolCalls.length > 0;
  if (!explorationPrompt && !hasExplorationChildToolCalls && !explorationResultSummary) {
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
      {hasExplorationChildToolCalls ? (
        <box {...(explorationPrompt ? { marginTop: 1 } : {})} width="100%">
          <text fg={chatScreenTheme.textMuted}>{"// activity"}</text>
        </box>
      ) : null}
      {hasExplorationChildToolCalls ? (
        <box flexDirection="column" width="100%">
          {explorationChildToolCalls.map((explorerChildToolCall, index) => (
            <box
              key={explorerChildToolCall.explorerChildToolCallId}
              flexDirection="column"
              {...(index > 0 ? { marginTop: 1 } : {})}
              width="100%"
            >
              <ExplorerChildToolCallCard explorerChildToolCall={explorerChildToolCall} />
            </box>
          ))}
        </box>
      ) : null}
      {explorationResultSummary ? (
        <box {...(explorationPrompt || hasExplorationChildToolCalls ? { marginTop: 1 } : {})} width="100%">
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

function ExplorerChildToolCallCard(props: { explorerChildToolCall: ExplorerChildToolCall }): ReactNode {
  const explorerChildToolCallRenderState = resolveExplorerChildToolCallRenderState(
    props.explorerChildToolCall.explorerChildToolCallStatus,
  );
  const durationProps = props.explorerChildToolCall.explorerChildToolCallDurationMs !== undefined
    ? { durationMs: props.explorerChildToolCall.explorerChildToolCallDurationMs }
    : {};
  const explorerChildToolCallErrorText = props.explorerChildToolCall.explorerChildToolCallErrorText ??
    props.explorerChildToolCall.explorerChildToolCallDenialText;
  const errorProps = explorerChildToolCallErrorText !== undefined ? { errorText: explorerChildToolCallErrorText } : {};

  if (props.explorerChildToolCall.explorerChildToolCallDetail.toolName === "read") {
    return (
      <ReadToolCallCard
        renderState={explorerChildToolCallRenderState}
        toolCallDetail={props.explorerChildToolCall.explorerChildToolCallDetail}
        {...durationProps}
        {...errorProps}
      />
    );
  }

  if (props.explorerChildToolCall.explorerChildToolCallDetail.toolName === "glob") {
    return (
      <GlobToolCallCard
        renderState={explorerChildToolCallRenderState}
        toolCallDetail={props.explorerChildToolCall.explorerChildToolCallDetail}
        {...durationProps}
        {...errorProps}
      />
    );
  }

  return (
    <GrepToolCallCard
      renderState={explorerChildToolCallRenderState}
      toolCallDetail={props.explorerChildToolCall.explorerChildToolCallDetail}
      {...durationProps}
      {...errorProps}
    />
  );
}

function resolveExplorerChildToolCallRenderState(
  explorerChildToolCallStatus: ExplorerChildToolCall["explorerChildToolCallStatus"],
): ExplorerToolCallCardProps["renderState"] {
  if (explorerChildToolCallStatus === "completed") {
    return "completed";
  }

  if (
    explorerChildToolCallStatus === "failed" ||
    explorerChildToolCallStatus === "denied" ||
    explorerChildToolCallStatus === "interrupted"
  ) {
    return "failed";
  }

  return "streaming";
}

function formatDurationMs(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}
