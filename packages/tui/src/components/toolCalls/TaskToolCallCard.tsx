import { useEffect, useState, type ReactNode } from "react";
import type { SubagentChildToolCall, SubagentResearchCheckpoint, ToolCallTaskDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { AssistantMarkdownBlock } from "../primitives/AssistantMarkdownBlock.tsx";
import { areTuiAnimationTimersEnabled } from "../tuiAnimationTimerPolicy.ts";
import {
  ExpandableToolCallCard,
  formatToolCallDurationMs,
  resolveDefaultToolCallRenderStatePresentation,
  type ToolCallRenderState,
} from "./ExpandableToolCallCard.tsx";
import { ToolCallEntryView } from "./ToolCallEntryView.tsx";

export type TaskToolCallCardProps = {
  toolCallDetail: ToolCallTaskDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  toolCallStartedAtMs?: number;
  errorText?: string;
};

const MAX_AUTO_EXPANDED_TASK_RESULT_CHARACTER_COUNT = 600;

export function TaskToolCallCard(props: TaskToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  const streamingElapsedDurationLabel = useStreamingTaskElapsedDurationLabel(
    props.renderState === "streaming" ? props.toolCallStartedAtMs : undefined,
  );
  const hasSubagentContent = hasTaskBodyContent(props);
  return (
    <ExpandableToolCallCard
      accentColor={toolCallPresentation.accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      defaultIsContentExpanded={props.renderState === "streaming" || shouldAutoExpandTaskBodyContent(props)}
      hasExpandableContent={hasSubagentContent}
      renderExpandedContent={() => buildTaskBodyContent({
        accentColor: toolCallPresentation.accentColor,
        taskToolCallCardProps: props,
      })}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildTaskStatusLabel({
        taskToolCallCardProps: props,
        streamingElapsedDurationLabel,
      })}
      toolNameLabel={formatTaskToolNameLabel(props)}
      toolTargetText={formatTaskTargetText(props.toolCallDetail)}
    />
  );
}

function shouldAutoExpandTaskBodyContent(props: TaskToolCallCardProps): boolean {
  return props.renderState === "completed" &&
    props.toolCallDetail.subagentPrompt === undefined &&
    props.toolCallDetail.subagentResearchCheckpoint === undefined &&
    (props.toolCallDetail.subagentChildToolCalls?.length ?? 0) === 0 &&
    props.toolCallDetail.subagentResultSummary !== undefined &&
    props.toolCallDetail.subagentResultSummary.length <= MAX_AUTO_EXPANDED_TASK_RESULT_CHARACTER_COUNT;
}

function hasTaskBodyContent(props: TaskToolCallCardProps): boolean {
  return Boolean(
    props.toolCallDetail.subagentPrompt ||
      props.toolCallDetail.subagentResultSummary ||
      props.toolCallDetail.subagentResearchCheckpoint ||
      (props.toolCallDetail.subagentChildToolCalls && props.toolCallDetail.subagentChildToolCalls.length > 0),
  );
}

function formatTaskToolNameLabel(props: TaskToolCallCardProps): string {
  return isStreamingExploreAgentTask(props) ? "Explore Agent" : "Task";
}

function formatTaskTargetText(toolCallDetail: ToolCallTaskDetail): string {
  return `${toolCallDetail.subagentName}: ${toolCallDetail.subagentDescription}`;
}

function buildTaskStatusLabel(input: {
  taskToolCallCardProps: TaskToolCallCardProps;
  streamingElapsedDurationLabel: string | undefined;
}): string {
  const props = input.taskToolCallCardProps;
  if (props.renderState === "failed") {
    return props.errorText ?? "sub-agent failed";
  }
  if (props.renderState === "streaming") {
    return buildStreamingTaskStatusLabel({
      taskToolCallCardProps: props,
      streamingElapsedDurationLabel: input.streamingElapsedDurationLabel,
    });
  }
  const durationLabel =
    props.durationMs === undefined ? "" : ` · ${formatToolCallDurationMs(props.durationMs)}`;
  const completedStatus = props.toolCallDetail.subagentResearchCheckpoint ? "checkpoint returned" : "returned";
  return `${completedStatus}${durationLabel}`;
}

function buildStreamingTaskStatusLabel(input: {
  taskToolCallCardProps: TaskToolCallCardProps;
  streamingElapsedDurationLabel: string | undefined;
}): string {
  const subagentChildToolCalls = input.taskToolCallCardProps.toolCallDetail.subagentChildToolCalls ?? [];
  if (input.taskToolCallCardProps.toolCallDetail.subagentResearchCheckpoint) {
    return `checkpoint requested · ${formatStreamingSubagentToolCallProgressLabel({
      subagentChildToolCallCount: subagentChildToolCalls.length,
      streamingElapsedDurationLabel: input.streamingElapsedDurationLabel,
    })}`;
  }

  if (subagentChildToolCalls.length === 0) {
    return "starting subagent…";
  }

  const activeChildToolCallCount = subagentChildToolCalls.filter((subagentChildToolCall) =>
    subagentChildToolCall.subagentChildToolCallStatus === "running"
  ).length;
  if (activeChildToolCallCount > 0) {
    return `${formatStreamingSubagentToolCallProgressLabel({
      subagentChildToolCallCount: subagentChildToolCalls.length,
      streamingElapsedDurationLabel: input.streamingElapsedDurationLabel,
    })} · ${activeChildToolCallCount} active`;
  }

  return formatStreamingSubagentToolCallProgressLabel({
    subagentChildToolCallCount: subagentChildToolCalls.length,
    streamingElapsedDurationLabel: input.streamingElapsedDurationLabel,
  });
}

function formatStreamingSubagentToolCallProgressLabel(input: {
  subagentChildToolCallCount: number;
  streamingElapsedDurationLabel: string | undefined;
}): string {
  const toolCallCountLabel = formatSubagentToolCallCount(input.subagentChildToolCallCount);
  return input.streamingElapsedDurationLabel
    ? `${toolCallCountLabel} / ${input.streamingElapsedDurationLabel}`
    : toolCallCountLabel;
}

function formatSubagentToolCallCount(childToolCallCount: number): string {
  return `${childToolCallCount} ${childToolCallCount === 1 ? "tool call" : "tool calls"}`;
}

function useStreamingTaskElapsedDurationLabel(toolCallStartedAtMs: number | undefined): string | undefined {
  const [, setElapsedTimerTick] = useState(0);

  useEffect(() => {
    if (toolCallStartedAtMs === undefined || !areTuiAnimationTimersEnabled()) {
      return;
    }

    const timerId = setInterval(() => {
      setElapsedTimerTick((currentElapsedTimerTick) => currentElapsedTimerTick + 1);
    }, 1000);
    return () => clearInterval(timerId);
  }, [toolCallStartedAtMs]);

  if (toolCallStartedAtMs === undefined) {
    return undefined;
  }

  return formatToolCallDurationMs(Math.max(0, Date.now() - toolCallStartedAtMs));
}

function isStreamingExploreAgentTask(props: TaskToolCallCardProps): boolean {
  return props.renderState === "streaming" && props.toolCallDetail.subagentName === "explore";
}

type TaskBodyContentInput = {
  taskToolCallCardProps: TaskToolCallCardProps;
  accentColor: string;
};

function buildTaskBodyContent(input: TaskBodyContentInput): ReactNode {
  const props = input.taskToolCallCardProps;
  const { subagentPrompt, subagentChildToolCalls, subagentResearchCheckpoint, subagentResultSummary } = props.toolCallDetail;
  const hasSubagentChildToolCalls = subagentChildToolCalls !== undefined && subagentChildToolCalls.length > 0;
  if (!subagentPrompt && !hasSubagentChildToolCalls && !subagentResearchCheckpoint && !subagentResultSummary) {
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
          <TaskTextSection
            foregroundColor={chatScreenTheme.textSecondary}
            presentation="plain"
            taskSectionText={subagentPrompt}
          />
        </box>
      ) : null}
      {subagentResearchCheckpoint ? (
        <box {...(subagentPrompt ? { marginTop: 1 } : {})} width="100%">
          <text fg={chatScreenTheme.textMuted}>{"// checkpoint"}</text>
        </box>
      ) : null}
      {subagentResearchCheckpoint ? (
        <box width="100%">
          <TaskTextSection
            foregroundColor={chatScreenTheme.textSecondary}
            presentation="plain"
            taskSectionText={formatSubagentResearchCheckpointText(subagentResearchCheckpoint)}
          />
        </box>
      ) : null}
      {hasSubagentChildToolCalls ? (
        <box {...(subagentPrompt || subagentResearchCheckpoint ? { marginTop: 1 } : {})} width="100%">
          <text fg={chatScreenTheme.textMuted}>{"// activity"}</text>
        </box>
      ) : null}
      {hasSubagentChildToolCalls ? (
        <box flexDirection="column" width="100%">
          {subagentChildToolCalls.map((subagentChildToolCall) => (
            <box
              key={subagentChildToolCall.subagentChildToolCallId}
              flexDirection="column"
              width="100%"
            >
              <SubagentChildToolCallCard subagentChildToolCall={subagentChildToolCall} />
            </box>
          ))}
        </box>
      ) : null}
      {subagentResultSummary ? (
        <box {...(subagentPrompt || subagentResearchCheckpoint || hasSubagentChildToolCalls ? { marginTop: 1 } : {})} width="100%">
          <text fg={chatScreenTheme.textMuted}>{"// result"}</text>
        </box>
      ) : null}
      {subagentResultSummary ? (
        <box width="100%">
          <TaskTextSection
            horizontalRuleColor={input.accentColor}
            presentation="markdown"
            taskSectionText={subagentResultSummary}
          />
        </box>
      ) : null}
    </box>
  );
}

function formatSubagentResearchCheckpointText(subagentResearchCheckpoint: SubagentResearchCheckpoint): string {
  const checkpointReasonText = formatSubagentResearchCheckpointReasonText(subagentResearchCheckpoint.checkpointReason);
  return [
    `Explorer research checkpoint: ${checkpointReasonText}.`,
    `Completed tool calls: ${subagentResearchCheckpoint.childToolCallCount}.`,
    `Tool output: ${subagentResearchCheckpoint.childToolResultTextLength} characters.`,
    `Skipped requested tool calls: ${subagentResearchCheckpoint.skippedChildToolCallCount}.`,
  ].join("\n");
}

function formatSubagentResearchCheckpointReasonText(
  checkpointReason: SubagentResearchCheckpoint["checkpointReason"],
): string {
  switch (checkpointReason) {
    case "child_tool_call_count":
      return "tool-call limit reached";
    case "child_tool_result_text_length":
      return "tool output limit reached";
    case "elapsed_time":
      return "elapsed-time limit reached";
  }
}

function SubagentChildToolCallCard(props: { subagentChildToolCall: SubagentChildToolCall }): ReactNode {
  const subagentChildToolCallRenderState = resolveSubagentChildToolCallRenderState(
    props.subagentChildToolCall.subagentChildToolCallStatus,
  );
  const durationProps = props.subagentChildToolCall.subagentChildToolCallDurationMs !== undefined
    ? { durationMs: props.subagentChildToolCall.subagentChildToolCallDurationMs }
    : {};
  const subagentChildToolCallErrorText = props.subagentChildToolCall.subagentChildToolCallErrorText ??
    props.subagentChildToolCall.subagentChildToolCallDenialText;
  const errorProps = subagentChildToolCallErrorText !== undefined ? { errorText: subagentChildToolCallErrorText } : {};
  const subagentChildToolCallDetail = props.subagentChildToolCall.subagentChildToolCallDetail;

  return (
    <ToolCallEntryView
      renderState={subagentChildToolCallRenderState}
      toolCallDetail={subagentChildToolCallDetail}
      {...durationProps}
      {...errorProps}
    />
  );
}

function resolveSubagentChildToolCallRenderState(
  subagentChildToolCallStatus: SubagentChildToolCall["subagentChildToolCallStatus"],
): ToolCallRenderState {
  if (subagentChildToolCallStatus === "completed") {
    return "completed";
  }

  if (
    subagentChildToolCallStatus === "failed" ||
    subagentChildToolCallStatus === "denied" ||
    subagentChildToolCallStatus === "interrupted"
  ) {
    return "failed";
  }

  return "streaming";
}

type TaskTextSectionProps = {
  taskSectionText: string;
} & (
  { presentation: "plain"; foregroundColor: string } |
  { presentation: "markdown"; horizontalRuleColor: string }
);

function TaskTextSection(props: TaskTextSectionProps): ReactNode {
  return (
    <box flexDirection="column" width="100%">
      {props.presentation === "plain" ? (
        <text fg={props.foregroundColor} wrapMode="word">{props.taskSectionText}</text>
      ) : (
        <AssistantMarkdownBlock
          horizontalRuleColor={props.horizontalRuleColor}
          isStreaming={false}
          markdownText={props.taskSectionText}
        />
      )}
    </box>
  );
}
