import { useState, type ReactNode } from "react";
import type { ExplorerChildToolCall, ToolCallExploreDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { AssistantMarkdownBlock } from "../primitives/AssistantMarkdownBlock.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { BashToolCallCard } from "./BashToolCallCard.tsx";
import { BracketedTarget } from "./BracketedTarget.tsx";
import { EditToolCallCard } from "./EditToolCallCard.tsx";
import { GlobToolCallCard } from "./GlobToolCallCard.tsx";
import { GrepToolCallCard } from "./GrepToolCallCard.tsx";
import { ReadToolCallCard } from "./ReadToolCallCard.tsx";
import { ToolCallResultDisclosureControl } from "./ToolCallResultDisclosureControl.tsx";
import { WriteToolCallCard } from "./WriteToolCallCard.tsx";
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
  const [isExplorerContentExpanded, setIsExplorerContentExpanded] = useState(false);
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
      bodyContent={buildExplorerBodyContent({
        accentColor,
        explorerToolCallCardProps: props,
        isExplorerContentExpanded,
        onExplorerContentExpansionToggle: () => {
          setIsExplorerContentExpanded((currentExplorerContentExpanded) => !currentExplorerContentExpanded);
        },
      })}
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

type ExplorerBodyContentInput = {
  explorerToolCallCardProps: ExplorerToolCallCardProps;
  isExplorerContentExpanded: boolean;
  onExplorerContentExpansionToggle: () => void;
  accentColor: string;
};

function buildExplorerBodyContent(input: ExplorerBodyContentInput): ReactNode {
  const props = input.explorerToolCallCardProps;
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
    <box flexDirection="column" width="100%">
      <ToolCallResultDisclosureControl
        isResultExpanded={input.isExplorerContentExpanded}
        onResultExpansionToggle={input.onExplorerContentExpansionToggle}
        resultSummaryText={buildExplorerDisclosureSummaryText(props.toolCallDetail)}
      />
      {input.isExplorerContentExpanded ? (
        <box flexDirection="column" marginTop={1} paddingX={1} width="100%">
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
              <AssistantMarkdownBlock
                horizontalRuleColor={input.accentColor}
                isStreaming={props.renderState === "streaming"}
                markdownText={explorationResultSummary}
              />
            </box>
          ) : null}
        </box>
      ) : null}
    </box>
  );
}

function buildExplorerDisclosureSummaryText(toolCallDetail: ToolCallExploreDetail): string {
  const explorerContentSectionNames: string[] = [];
  if (toolCallDetail.explorationPrompt) {
    explorerContentSectionNames.push("prompt");
  }
  if (toolCallDetail.explorationChildToolCalls && toolCallDetail.explorationChildToolCalls.length > 0) {
    explorerContentSectionNames.push("activity");
  }
  if (toolCallDetail.explorationResultSummary) {
    explorerContentSectionNames.push("result");
  }

  return explorerContentSectionNames.length > 0
    ? `Explorer details: ${explorerContentSectionNames.join(", ")}`
    : "Explorer details";
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
  const explorerChildToolCallDetail = props.explorerChildToolCall.explorerChildToolCallDetail;

  if (explorerChildToolCallDetail.toolName === "read") {
    return (
      <ReadToolCallCard
        renderState={explorerChildToolCallRenderState}
        toolCallDetail={explorerChildToolCallDetail}
        {...durationProps}
        {...errorProps}
      />
    );
  }

  if (explorerChildToolCallDetail.toolName === "glob") {
    return (
      <GlobToolCallCard
        renderState={explorerChildToolCallRenderState}
        toolCallDetail={explorerChildToolCallDetail}
        {...durationProps}
        {...errorProps}
      />
    );
  }

  if (explorerChildToolCallDetail.toolName === "grep") {
    return (
      <GrepToolCallCard
        renderState={explorerChildToolCallRenderState}
        toolCallDetail={explorerChildToolCallDetail}
        {...durationProps}
        {...errorProps}
      />
    );
  }

  if (explorerChildToolCallDetail.toolName === "bash") {
    return (
      <BashToolCallCard
        renderState={explorerChildToolCallRenderState}
        toolCallDetail={explorerChildToolCallDetail}
        {...durationProps}
        {...errorProps}
      />
    );
  }

  if (explorerChildToolCallDetail.toolName === "edit") {
    return (
      <EditToolCallCard
        renderState={explorerChildToolCallRenderState}
        toolCallDetail={explorerChildToolCallDetail}
        {...durationProps}
        {...errorProps}
      />
    );
  }

  if (explorerChildToolCallDetail.toolName === "write") {
    return (
      <WriteToolCallCard
        renderState={explorerChildToolCallRenderState}
        toolCallDetail={explorerChildToolCallDetail}
        {...durationProps}
        {...errorProps}
      />
    );
  }

  return (
    <ExplorerToolCallCard
      renderState={explorerChildToolCallRenderState}
      toolCallDetail={explorerChildToolCallDetail}
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
