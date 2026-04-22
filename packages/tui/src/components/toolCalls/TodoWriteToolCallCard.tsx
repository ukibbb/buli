import type { ReactNode } from "react";
import type { ToolCallTodoWriteDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { Checklist } from "../primitives/Checklist.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { glyphs } from "../glyphs.ts";
import { BracketedTarget } from "./BracketedTarget.tsx";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "./ToolCallCardHeaderSlots.tsx";

export type TodoWriteToolCallCardProps = {
  toolCallDetail: ToolCallTodoWriteDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

export function TodoWriteToolCallCard(props: TodoWriteToolCallCardProps): ReactNode {
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
          toolGlyph={glyphs.todoList}
          toolGlyphColor={accentColor}
          toolNameLabel="TodoWrite"
          toolTargetContent={
            <BracketedTarget accentColor={accentColor} targetText={buildTodoTargetText(props)} />
          }
        />
      }
      headerRight={
        <ToolCallHeaderRight
          statusColor={accentColor}
          statusKind={statusKind}
          statusLabel={buildTodoStatusLabel(props)}
        />
      }
      bodyContent={buildTodoBodyContent(props)}
    />
  );
}

function buildTodoBodyContent(props: TodoWriteToolCallCardProps): ReactNode {
  if (props.renderState === "failed") {
    return (
      <text fg={chatScreenTheme.accentRed}>
        {props.errorText ?? "Failed to update plan."}
      </text>
    );
  }
  if (props.toolCallDetail.todoItems.length === 0) {
    return undefined;
  }
  return (
    <Checklist
      items={props.toolCallDetail.todoItems.map((toolCallTodoItem) => ({
        itemTitle: toolCallTodoItem.todoItemTitle,
        itemStatus: toolCallTodoItem.todoItemStatus,
      }))}
    />
  );
}

function buildTodoTargetText(props: TodoWriteToolCallCardProps): string {
  const todoItems = props.toolCallDetail.todoItems;
  const totalCount = todoItems.length;
  const inProgressCount = todoItems.filter(
    (toolCallTodoItem) => toolCallTodoItem.todoItemStatus === "in_progress",
  ).length;
  if (inProgressCount > 0) {
    return `${totalCount} items · ${inProgressCount} in progress`;
  }
  return `${totalCount} items`;
}

function buildTodoStatusLabel(props: TodoWriteToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "plan update failed";
  }
  if (props.renderState === "streaming") {
    return "updating…";
  }
  return "updated";
}
