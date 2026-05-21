import type { ReactNode } from "react";
import type { SubagentChildToolCall, ToolCallTaskDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { AssistantMarkdownBlock } from "../primitives/AssistantMarkdownBlock.tsx";
import { limitVisibleItems, VisibleContentLimitNotice } from "../primitives/VisibleContentLimit.tsx";
import {
  ExpandableToolCallCard,
  formatToolCallDurationMs,
  resolveDefaultToolCallRenderStatePresentation,
  type ToolCallRenderState,
} from "./ExpandableToolCallCard.tsx";
import { ToolCallEntryView } from "./ToolCallEntryView.tsx";

const MAX_EXPANDED_TASK_TEXT_LINE_COUNT = 50;
const MAX_EXPANDED_SUBAGENT_CHILD_TOOL_CALL_COUNT = 50;

export type TaskToolCallCardProps = {
  toolCallDetail: ToolCallTaskDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

export function TaskToolCallCard(props: TaskToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  const hasSubagentContent = hasTaskBodyContent(props);
  return (
    <ExpandableToolCallCard
      accentColor={toolCallPresentation.accentColor}
      hasExpandableContent={hasSubagentContent}
      renderExpandedContent={() => buildTaskBodyContent({
        accentColor: toolCallPresentation.accentColor,
        taskToolCallCardProps: props,
      })}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildTaskStatusLabel(props)}
      toolNameLabel={formatTaskToolNameLabel(props)}
      toolTargetText={formatTaskTargetText(props.toolCallDetail)}
    />
  );
}

function hasTaskBodyContent(props: TaskToolCallCardProps): boolean {
  if (props.renderState === "failed") {
    return false;
  }

  return Boolean(
    props.toolCallDetail.subagentPrompt ||
      props.toolCallDetail.subagentResultSummary ||
      (props.toolCallDetail.subagentChildToolCalls && props.toolCallDetail.subagentChildToolCalls.length > 0),
  );
}

function formatTaskToolNameLabel(props: TaskToolCallCardProps): string {
  return isStreamingExploreAgentTask(props) ? "Explore Agent" : "Task";
}

function formatTaskTargetText(toolCallDetail: ToolCallTaskDetail): string {
  return `${toolCallDetail.subagentName}: ${toolCallDetail.subagentDescription}`;
}

function buildTaskStatusLabel(props: TaskToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "sub-agent failed";
  }
  if (props.renderState === "streaming") {
    return "running…";
  }
  const durationLabel =
    props.durationMs === undefined ? "" : ` · ${formatToolCallDurationMs(props.durationMs)}`;
  return `returned${durationLabel}`;
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
  const { subagentPrompt, subagentChildToolCalls, subagentResultSummary } = props.toolCallDetail;
  const hasSubagentChildToolCalls = subagentChildToolCalls !== undefined && subagentChildToolCalls.length > 0;
  if (!subagentPrompt && !hasSubagentChildToolCalls && !subagentResultSummary) {
    return undefined;
  }

  if (hasSubagentChildToolCalls) {
    const limitedSubagentChildToolCalls = limitVisibleItems({
      items: subagentChildToolCalls,
      maximumVisibleItemCount: MAX_EXPANDED_SUBAGENT_CHILD_TOOL_CALL_COUNT,
    });
    return (
      <box flexDirection="column" width="100%">
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
          <box {...(subagentPrompt ? { marginTop: 1 } : {})} width="100%">
            <text fg={chatScreenTheme.textMuted}>{"// activity"}</text>
          </box>
          <box flexDirection="column" width="100%">
            <VisibleContentLimitNotice
              visibleItemCount={limitedSubagentChildToolCalls.visibleItems.length}
              totalItemCount={limitedSubagentChildToolCalls.totalItemCount}
              itemLabelPlural="tool calls"
            />
            {limitedSubagentChildToolCalls.visibleItems.map((subagentChildToolCall) => (
              <box
                key={subagentChildToolCall.subagentChildToolCallId}
                flexDirection="column"
                width="100%"
              >
                <SubagentChildToolCallCard subagentChildToolCall={subagentChildToolCall} />
              </box>
            ))}
          </box>
          {subagentResultSummary ? (
            <box marginTop={1} width="100%">
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
      </box>
    );
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
      {subagentResultSummary ? (
        <box {...(subagentPrompt ? { marginTop: 1 } : {})} width="100%">
          <text fg={chatScreenTheme.textMuted}>{"// result"}</text>
        </box>
      ) : null}
      {subagentResultSummary ? (
        <box width="100%">
          <TaskTextSection
            horizontalRuleColor={resolveTaskResultMarkdownRuleColor(props.renderState)}
            presentation="markdown"
            taskSectionText={subagentResultSummary}
          />
        </box>
      ) : null}
    </box>
  );
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
  const limitedTaskSectionLines = limitVisibleItems({
    items: splitTaskSectionTextIntoLines(props.taskSectionText),
    maximumVisibleItemCount: MAX_EXPANDED_TASK_TEXT_LINE_COUNT,
  });
  const visibleTaskSectionText = limitedTaskSectionLines.visibleItems.join("\n");

  return (
    <box flexDirection="column" width="100%">
      {props.presentation === "plain" ? (
        <text fg={props.foregroundColor} wrapMode="word">{visibleTaskSectionText}</text>
      ) : (
        <AssistantMarkdownBlock
          horizontalRuleColor={props.horizontalRuleColor}
          isStreaming={false}
          markdownText={visibleTaskSectionText}
        />
      )}
      <VisibleContentLimitNotice
        visibleItemCount={limitedTaskSectionLines.visibleItems.length}
        totalItemCount={limitedTaskSectionLines.totalItemCount}
        itemLabelPlural="lines"
      />
    </box>
  );
}

function splitTaskSectionTextIntoLines(taskSectionText: string): string[] {
  return taskSectionText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function resolveTaskResultMarkdownRuleColor(renderState: TaskToolCallCardProps["renderState"]): string {
  if (renderState === "streaming") {
    return chatScreenTheme.accentAmber;
  }

  return chatScreenTheme.accentGreen;
}
