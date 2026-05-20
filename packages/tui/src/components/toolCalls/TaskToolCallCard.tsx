import { useState, type ReactNode } from "react";
import type { SubagentChildToolCall, ToolCallTaskDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { AssistantMarkdownBlock } from "../primitives/AssistantMarkdownBlock.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { BashToolCallCard } from "./BashToolCallCard.tsx";
import { EditToolCallCard } from "./EditToolCallCard.tsx";
import { GlobToolCallCard } from "./GlobToolCallCard.tsx";
import { GrepToolCallCard } from "./GrepToolCallCard.tsx";
import { ReadToolCallCard } from "./ReadToolCallCard.tsx";
import { WriteToolCallCard } from "./WriteToolCallCard.tsx";
import { ToolCallCompactHeader } from "./ToolCallCardHeaderSlots.tsx";

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
  const hasSubagentContent = hasTaskBodyContent(props);
  return (
    <SurfaceCard
      accentColor={accentColor}
      density="compact"
      headerLeft={
        <ToolCallCompactHeader
          accentColor={accentColor}
          disclosureState={hasSubagentContent
            ? {
                isContentExpandable: true,
                isContentExpanded: isSubagentContentExpanded,
                onContentExpansionToggle: () => {
                  setIsSubagentContentExpanded((currentSubagentContentExpanded) => !currentSubagentContentExpanded);
                },
              }
            : { isContentExpandable: false }}
          statusColor={accentColor}
          statusKind={statusKind}
          pendingSnakeVariant={isStreamingExploreAgentTask(props) ? "eatingApple" : "sixCell"}
          statusLabel={buildTaskStatusLabel(props)}
          toolNameLabel={formatTaskToolNameLabel(props)}
          toolTargetText={formatTaskTargetText(props.toolCallDetail)}
        />
      }
      bodyContent={hasSubagentContent && isSubagentContentExpanded
        ? buildTaskBodyContent({
            accentColor,
            taskToolCallCardProps: props,
          })
        : undefined}
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
    props.durationMs === undefined ? "" : ` · ${formatDurationMs(props.durationMs)}`;
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
