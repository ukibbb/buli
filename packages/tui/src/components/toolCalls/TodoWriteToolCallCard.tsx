import type { ReactNode } from "react";
import type { ToolCallTodoWriteDetail } from "@buli/contracts";
import { Checklist } from "../primitives/Checklist.tsx";
import { ExpandableToolCallCard, resolveDefaultToolCallRenderStatePresentation } from "./ExpandableToolCallCard.tsx";

export type TodoWriteToolCallCardProps = {
  toolCallDetail: ToolCallTodoWriteDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
};

export function TodoWriteToolCallCard(props: TodoWriteToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  const hasTodoListContent = props.renderState !== "failed" && props.toolCallDetail.todoItems.length > 0;
  return (
    <ExpandableToolCallCard
      accentColor={toolCallPresentation.accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      hasExpandableContent={hasTodoListContent}
      renderExpandedContent={() => buildTodoBodyContent(props)}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildTodoStatusLabel(props)}
      toolNameLabel="TodoWrite"
      toolTargetText={buildTodoTargetText(props)}
    />
  );
}

function buildTodoBodyContent(props: TodoWriteToolCallCardProps): ReactNode {
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
