import { Text } from "ink";
import type { ReactNode } from "react";
import type { ToolCallTodoWriteDetail } from "@buli/contracts";
import { chatScreenTheme } from "../../chatScreenTheme.ts";
import { Checklist } from "../primitives/Checklist.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { glyphs } from "../glyphs.ts";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "./ToolCallCardHeaderSlots.tsx";

// TodoWriteToolCallCard renders the agent's live to-do list. The summary
// counts completed over total so the user can glance at the header to see
// overall progress, while the body shows every item with its status glyph.
export type TodoWriteToolCallCardProps = {
  toolCallDetail: ToolCallTodoWriteDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

export function TodoWriteToolCallCard(props: TodoWriteToolCallCardProps): ReactNode {
  const stripeColor =
    props.renderState === "failed" ? chatScreenTheme.accentRed : chatScreenTheme.accentPrimaryMuted;
  const statusKind =
    props.renderState === "completed"
      ? "success"
      : props.renderState === "failed"
        ? "error"
        : "pending";
  return (
    <SurfaceCard
      stripeColor={stripeColor}
      headerLeft={
        <ToolCallHeaderLeft
          toolGlyph={glyphs.todoList}
          toolGlyphColor={stripeColor}
          toolNameLabel="Plan"
        />
      }
      headerRight={
        <ToolCallHeaderRight
          statusColor={stripeColor}
          statusKind={statusKind}
          statusLabel={buildTodoStatusLabel(props)}
        />
      }
      bodyContent={
        props.renderState === "failed" ? (
          <Text color={chatScreenTheme.accentRed}>
            {props.errorText ?? "Failed to update plan."}
          </Text>
        ) : (
          <Checklist
            items={props.toolCallDetail.todoItems.map((toolCallTodoItem) => ({
              itemTitle: toolCallTodoItem.todoItemTitle,
              itemStatus: toolCallTodoItem.todoItemStatus,
            }))}
          />
        )
      }
    />
  );
}

function buildTodoStatusLabel(props: TodoWriteToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "plan update failed";
  }
  const todoItems = props.toolCallDetail.todoItems;
  const completedCount = todoItems.filter((toolCallTodoItem) => toolCallTodoItem.todoItemStatus === "completed").length;
  const inProgressCount = todoItems.filter((toolCallTodoItem) => toolCallTodoItem.todoItemStatus === "in_progress").length;
  return `${completedCount}/${todoItems.length} done${inProgressCount > 0 ? ` · ${inProgressCount} active` : ""}`;
}
