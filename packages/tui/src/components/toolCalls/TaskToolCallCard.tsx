import { useState, type ReactNode } from "react";
import type { SubagentChildToolCall, ToolCallTaskDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { AssistantMarkdownBlock } from "../primitives/AssistantMarkdownBlock.tsx";
import { SnakeAnimationIndicator } from "../SnakeAnimationIndicator.tsx";
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

export type TaskToolCallCardProps = {
  toolCallDetail: ToolCallTaskDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

const MAX_VISIBLE_TASK_SECTION_LINES = 24;
const MAX_VISIBLE_TASK_SECTION_CHARACTERS = 4_000;

type VisibleTaskSectionText = {
  visibleText: string;
  truncationSummaryText?: string;
};

export function TaskToolCallCard(props: TaskToolCallCardProps): ReactNode {
  const [isSubagentContentExpanded, setIsSubagentContentExpanded] = useState(false);
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
          toolNameLabel={formatTaskToolNameLabel(props)}
          toolTargetContent={
            <BracketedTarget accentColor={accentColor} targetText={formatTaskTargetText(props.toolCallDetail)} />
          }
        />
      }
      headerRight={
        <ToolCallHeaderRight
          statusColor={accentColor}
          statusKind={statusKind}
          {...buildTaskStatusHeaderContent(props)}
        />
      }
      bodyContent={buildTaskBodyContent({
        accentColor,
        isSubagentContentExpanded,
        onSubagentContentExpansionToggle: () => {
          setIsSubagentContentExpanded((currentSubagentContentExpanded) => !currentSubagentContentExpanded);
        },
        taskToolCallCardProps: props,
      })}
    />
  );
}

function formatTaskToolNameLabel(props: TaskToolCallCardProps): string {
  return isStreamingExploreAgentTask(props) ? "Explore Agent" : "Task";
}

function formatTaskTargetText(toolCallDetail: ToolCallTaskDetail): string {
  return `${toolCallDetail.subagentName}: ${toolCallDetail.subagentDescription}`;
}

function buildTaskStatusHeaderContent(props: TaskToolCallCardProps):
  | { statusLabel: string }
  | { statusContent: ReactNode } {
  if (isStreamingExploreAgentTask(props)) {
    return {
      statusContent: <ExploreAgentStreamingStatusContent toolCallDetail={props.toolCallDetail} />,
    };
  }

  return { statusLabel: buildTaskStatusLabel(props) };
}

function buildTaskStatusLabel(props: TaskToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "sub-agent failed";
  }
  if (props.renderState === "streaming") {
    return "running…";
  }
  const durationLabel =
    props.durationMs === undefined ? "" : ` · ${formatDurationMs(props.durationMs)}`;
  return `returned${durationLabel}`;
}

function ExploreAgentStreamingStatusContent(props: { toolCallDetail: ToolCallTaskDetail }): ReactNode {
  return (
    <box flexDirection="row" alignItems="center" gap={1} minWidth={0} overflow="hidden">
      <SnakeAnimationIndicator variant="eatingApple" />
      <text fg={chatScreenTheme.textMuted} truncate={true} wrapMode="none">
        {buildExploreAgentStageText(props.toolCallDetail)}
      </text>
    </box>
  );
}

function isStreamingExploreAgentTask(props: TaskToolCallCardProps): boolean {
  return props.renderState === "streaming" && props.toolCallDetail.subagentName === "explore";
}

function buildExploreAgentStageText(toolCallDetail: ToolCallTaskDetail): string {
  const subagentChildToolCalls = toolCallDetail.subagentChildToolCalls ?? [];
  const latestRunningChildToolCall = findLatestSubagentChildToolCallByStatus(subagentChildToolCalls, "running");
  if (latestRunningChildToolCall) {
    return formatExploreAgentRunningChildToolCallStage(latestRunningChildToolCall);
  }

  const latestDeniedNestedTask = [...subagentChildToolCalls].reverse().find(
    (subagentChildToolCall) =>
      subagentChildToolCall.subagentChildToolCallStatus === "denied" &&
      subagentChildToolCall.subagentChildToolCallDetail.toolName === "task",
  );
  if (latestDeniedNestedTask) {
    return "blocked nested subagent";
  }

  if (subagentChildToolCalls.length > 0) {
    return "summarizing findings";
  }

  return "starting explore agent";
}

function findLatestSubagentChildToolCallByStatus(
  subagentChildToolCalls: readonly SubagentChildToolCall[],
  subagentChildToolCallStatus: SubagentChildToolCall["subagentChildToolCallStatus"],
): SubagentChildToolCall | undefined {
  return [...subagentChildToolCalls].reverse().find(
    (subagentChildToolCall) => subagentChildToolCall.subagentChildToolCallStatus === subagentChildToolCallStatus,
  );
}

function formatExploreAgentRunningChildToolCallStage(subagentChildToolCall: SubagentChildToolCall): string {
  const subagentChildToolCallDetail = subagentChildToolCall.subagentChildToolCallDetail;
  if (subagentChildToolCallDetail.toolName === "read") {
    return `reading ${subagentChildToolCallDetail.readFilePath}`;
  }
  if (subagentChildToolCallDetail.toolName === "glob") {
    return `finding ${subagentChildToolCallDetail.globPattern}`;
  }
  if (subagentChildToolCallDetail.toolName === "grep") {
    return `searching ${subagentChildToolCallDetail.searchPattern}`;
  }
  if (subagentChildToolCallDetail.toolName === "task") {
    return "blocked nested subagent";
  }

  return "inspecting workspace";
}

type TaskBodyContentInput = {
  taskToolCallCardProps: TaskToolCallCardProps;
  isSubagentContentExpanded: boolean;
  onSubagentContentExpansionToggle: () => void;
  accentColor: string;
};

function buildTaskBodyContent(input: TaskBodyContentInput): ReactNode {
  const props = input.taskToolCallCardProps;
  if (props.renderState === "failed") {
    return (
      <text fg={chatScreenTheme.accentRed}>
        {props.errorText ?? "Sub-agent returned no result."}
      </text>
    );
  }
  const { subagentPrompt, subagentChildToolCalls, subagentResultSummary } = props.toolCallDetail;
  const hasSubagentChildToolCalls = subagentChildToolCalls !== undefined && subagentChildToolCalls.length > 0;
  if (!subagentPrompt && !hasSubagentChildToolCalls && !subagentResultSummary) {
    return undefined;
  }

  if (hasSubagentChildToolCalls) {
    return (
      <box flexDirection="column" width="100%">
        <ToolCallResultDisclosureControl
          isResultExpanded={input.isSubagentContentExpanded}
          onResultExpansionToggle={input.onSubagentContentExpansionToggle}
          resultSummaryText={buildTaskDisclosureSummaryText(props.toolCallDetail)}
        />
        {input.isSubagentContentExpanded ? (
          <box flexDirection="column" marginTop={1} paddingX={1} width="100%">
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
              {subagentChildToolCalls.map((subagentChildToolCall, index) => (
                <box
                  key={subagentChildToolCall.subagentChildToolCallId}
                  flexDirection="column"
                  {...(index > 0 ? { marginTop: 1 } : {})}
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
        ) : null}
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

function buildTaskDisclosureSummaryText(toolCallDetail: ToolCallTaskDetail): string {
  const subagentContentSectionNames: string[] = [];
  if (toolCallDetail.subagentPrompt) {
    subagentContentSectionNames.push("prompt");
  }
  if (toolCallDetail.subagentChildToolCalls && toolCallDetail.subagentChildToolCalls.length > 0) {
    subagentContentSectionNames.push("activity");
  }
  if (toolCallDetail.subagentResultSummary) {
    subagentContentSectionNames.push("result");
  }

  return subagentContentSectionNames.length > 0
    ? `Task details: ${subagentContentSectionNames.join(", ")}`
    : "Task details";
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

  if (subagentChildToolCallDetail.toolName === "read") {
    return (
      <ReadToolCallCard
        renderState={subagentChildToolCallRenderState}
        toolCallDetail={subagentChildToolCallDetail}
        {...durationProps}
        {...errorProps}
      />
    );
  }

  if (subagentChildToolCallDetail.toolName === "glob") {
    return (
      <GlobToolCallCard
        renderState={subagentChildToolCallRenderState}
        toolCallDetail={subagentChildToolCallDetail}
        {...durationProps}
        {...errorProps}
      />
    );
  }

  if (subagentChildToolCallDetail.toolName === "grep") {
    return (
      <GrepToolCallCard
        renderState={subagentChildToolCallRenderState}
        toolCallDetail={subagentChildToolCallDetail}
        {...durationProps}
        {...errorProps}
      />
    );
  }

  if (subagentChildToolCallDetail.toolName === "bash") {
    return (
      <BashToolCallCard
        renderState={subagentChildToolCallRenderState}
        toolCallDetail={subagentChildToolCallDetail}
        {...durationProps}
        {...errorProps}
      />
    );
  }

  if (subagentChildToolCallDetail.toolName === "edit") {
    return (
      <EditToolCallCard
        renderState={subagentChildToolCallRenderState}
        toolCallDetail={subagentChildToolCallDetail}
        {...durationProps}
        {...errorProps}
      />
    );
  }

  if (subagentChildToolCallDetail.toolName === "write") {
    return (
      <WriteToolCallCard
        renderState={subagentChildToolCallRenderState}
        toolCallDetail={subagentChildToolCallDetail}
        {...durationProps}
        {...errorProps}
      />
    );
  }

  return (
    <TaskToolCallCard
      renderState={subagentChildToolCallRenderState}
      toolCallDetail={subagentChildToolCallDetail}
      {...durationProps}
      {...errorProps}
    />
  );
}

function resolveSubagentChildToolCallRenderState(
  subagentChildToolCallStatus: SubagentChildToolCall["subagentChildToolCallStatus"],
): TaskToolCallCardProps["renderState"] {
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
  const visibleTaskSectionText = buildVisibleTaskSectionText(props.taskSectionText);
  return (
    <box flexDirection="column" width="100%">
      {props.presentation === "plain" ? (
        <text fg={props.foregroundColor} wrapMode="word">{visibleTaskSectionText.visibleText}</text>
      ) : (
        <AssistantMarkdownBlock
          horizontalRuleColor={props.horizontalRuleColor}
          isStreaming={false}
          markdownText={visibleTaskSectionText.visibleText}
        />
      )}
      {visibleTaskSectionText.truncationSummaryText ? (
        <box width="100%">
          <text fg={chatScreenTheme.textMuted}>{visibleTaskSectionText.truncationSummaryText}</text>
        </box>
      ) : null}
    </box>
  );
}

function resolveTaskResultMarkdownRuleColor(renderState: TaskToolCallCardProps["renderState"]): string {
  if (renderState === "streaming") {
    return chatScreenTheme.accentAmber;
  }

  return chatScreenTheme.accentGreen;
}

function buildVisibleTaskSectionText(taskSectionText: string): VisibleTaskSectionText {
  const taskSectionLines = taskSectionText.split("\n");
  const lineLimitedTaskSectionText = taskSectionLines.slice(0, MAX_VISIBLE_TASK_SECTION_LINES).join("\n");
  const isLineLimited = taskSectionLines.length > MAX_VISIBLE_TASK_SECTION_LINES;
  const isCharacterLimited = lineLimitedTaskSectionText.length > MAX_VISIBLE_TASK_SECTION_CHARACTERS;
  const visibleText = isCharacterLimited
    ? lineLimitedTaskSectionText.slice(0, MAX_VISIBLE_TASK_SECTION_CHARACTERS)
    : lineLimitedTaskSectionText;

  if (isLineLimited) {
    const visibleLineCount = visibleText.length === 0 ? 0 : visibleText.split("\n").length;
    return {
      visibleText,
      truncationSummaryText: `... showing first ${visibleLineCount} of ${taskSectionLines.length} lines`,
    };
  }

  if (isCharacterLimited) {
    return {
      visibleText,
      truncationSummaryText: "... content truncated",
    };
  }

  return { visibleText };
}

function formatDurationMs(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}
