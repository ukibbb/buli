import type { ReactNode } from "react";
import type { ToolCallDetail } from "@buli/contracts";
import { BashToolCallCard } from "./BashToolCallCard.tsx";
import { EditToolCallCard } from "./EditToolCallCard.tsx";
import { GrepToolCallCard } from "./GrepToolCallCard.tsx";
import { ReadToolCallCard } from "./ReadToolCallCard.tsx";
import { TaskToolCallCard } from "./TaskToolCallCard.tsx";
import { TodoWriteToolCallCard } from "./TodoWriteToolCallCard.tsx";

// ToolCallEntryView dispatches an assistant tool-call part's ToolCallDetail to
// the correct per-tool card. All cards accept the same renderState /
// durationMs / errorText shape, so the dispatcher stays tiny and exhaustively
// typed over ToolCallDetail's discriminated union.
export type ToolCallEntryViewProps = {
  toolCallDetail: ToolCallDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

export function ToolCallEntryView(props: ToolCallEntryViewProps): ReactNode {
  const { toolCallDetail } = props;
  if (toolCallDetail.toolName === "read") {
    return (
      <ReadToolCallCard
        renderState={props.renderState}
        toolCallDetail={toolCallDetail}
        {...(props.durationMs !== undefined ? { durationMs: props.durationMs } : {})}
        {...(props.errorText !== undefined ? { errorText: props.errorText } : {})}
      />
    );
  }
  if (toolCallDetail.toolName === "grep") {
    return (
      <GrepToolCallCard
        renderState={props.renderState}
        toolCallDetail={toolCallDetail}
        {...(props.durationMs !== undefined ? { durationMs: props.durationMs } : {})}
        {...(props.errorText !== undefined ? { errorText: props.errorText } : {})}
      />
    );
  }
  if (toolCallDetail.toolName === "edit") {
    return (
      <EditToolCallCard
        renderState={props.renderState}
        toolCallDetail={toolCallDetail}
        {...(props.durationMs !== undefined ? { durationMs: props.durationMs } : {})}
        {...(props.errorText !== undefined ? { errorText: props.errorText } : {})}
      />
    );
  }
  if (toolCallDetail.toolName === "bash") {
    return (
      <BashToolCallCard
        renderState={props.renderState}
        toolCallDetail={toolCallDetail}
        {...(props.durationMs !== undefined ? { durationMs: props.durationMs } : {})}
        {...(props.errorText !== undefined ? { errorText: props.errorText } : {})}
      />
    );
  }
  if (toolCallDetail.toolName === "todowrite") {
    return (
      <TodoWriteToolCallCard
        renderState={props.renderState}
        toolCallDetail={toolCallDetail}
        {...(props.durationMs !== undefined ? { durationMs: props.durationMs } : {})}
        {...(props.errorText !== undefined ? { errorText: props.errorText } : {})}
      />
    );
  }
  // Remaining arm: task. Exhaustive over ToolCallDetail's discriminated union.
  return (
    <TaskToolCallCard
      renderState={props.renderState}
      toolCallDetail={toolCallDetail}
      {...(props.durationMs !== undefined ? { durationMs: props.durationMs } : {})}
      {...(props.errorText !== undefined ? { errorText: props.errorText } : {})}
    />
  );
}
