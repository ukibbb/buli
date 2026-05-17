import type { ReactNode } from "react";
import type { ToolCallTaskDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
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

const MAX_VISIBLE_TASK_SECTION_LINES = 24;
const MAX_VISIBLE_TASK_SECTION_CHARACTERS = 4_000;

type VisibleTaskSectionText = {
  visibleText: string;
  truncationSummaryText?: string;
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
    return "running…";
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
          <TaskTextSection foregroundColor={chatScreenTheme.textSecondary} taskSectionText={subagentPrompt} />
        </box>
      ) : null}
      {subagentResultSummary ? (
        <box {...(subagentPrompt ? { marginTop: 1 } : {})} width="100%">
          <text fg={chatScreenTheme.textMuted}>{"// result"}</text>
        </box>
      ) : null}
      {subagentResultSummary ? (
        <box width="100%">
          <TaskTextSection foregroundColor={chatScreenTheme.textPrimary} taskSectionText={subagentResultSummary} />
        </box>
      ) : null}
    </box>
  );
}

function TaskTextSection(props: {
  foregroundColor: string;
  taskSectionText: string;
}): ReactNode {
  const visibleTaskSectionText = buildVisibleTaskSectionText(props.taskSectionText);
  return (
    <box flexDirection="column" width="100%">
      <text fg={props.foregroundColor} wrapMode="word">{visibleTaskSectionText.visibleText}</text>
      {visibleTaskSectionText.truncationSummaryText ? (
        <box width="100%">
          <text fg={chatScreenTheme.textMuted}>{visibleTaskSectionText.truncationSummaryText}</text>
        </box>
      ) : null}
    </box>
  );
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
