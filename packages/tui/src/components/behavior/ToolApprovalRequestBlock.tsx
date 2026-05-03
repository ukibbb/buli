import type { ReactNode } from "react";
import type { ToolCallDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { BashToolCallCard } from "../toolCalls/BashToolCallCard.tsx";
import { EditToolCallCard } from "../toolCalls/EditToolCallCard.tsx";
import { GrepToolCallCard } from "../toolCalls/GrepToolCallCard.tsx";
import { ReadToolCallCard } from "../toolCalls/ReadToolCallCard.tsx";
import { ApprovalDecisionControl } from "../primitives/ApprovalDecisionControl.tsx";
import { TaskToolCallCard } from "../toolCalls/TaskToolCallCard.tsx";
import { TodoWriteToolCallCard } from "../toolCalls/TodoWriteToolCallCard.tsx";
import { glyphs } from "../glyphs.ts";

export type ToolApprovalRequestBlockProps = {
  pendingToolCallDetail: ToolCallDetail;
  riskExplanation: string;
  onApprove: () => void;
  onDeny: () => void;
};

export function ToolApprovalRequestBlock(props: ToolApprovalRequestBlockProps): ReactNode {
  return (
    <box flexDirection="column" width="100%">
      <box
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        paddingX={1}
        width="100%"
      >
        <box flexDirection="row" flexShrink={1} minWidth={0} overflow="hidden">
          <text wrapMode="none">
            <b fg={chatScreenTheme.accentAmber}>{`${glyphs.statusDot} Approval needed`}</b>
            <span fg={chatScreenTheme.textMuted}>{" — "}</span>
            <span fg={chatScreenTheme.accentAmber}>{props.riskExplanation}</span>
          </text>
        </box>
        <box marginLeft={1}>
          <ApprovalDecisionControl onApprove={props.onApprove} onDeny={props.onDeny} />
        </box>
      </box>
      <box width="100%">
        <PendingToolCallPreview pendingToolCallDetail={props.pendingToolCallDetail} />
      </box>
    </box>
  );
}

function PendingToolCallPreview(props: { pendingToolCallDetail: ToolCallDetail }): ReactNode {
  const { pendingToolCallDetail } = props;
  if (pendingToolCallDetail.toolName === "read") {
    return <ReadToolCallCard renderState="streaming" toolCallDetail={pendingToolCallDetail} />;
  }
  if (pendingToolCallDetail.toolName === "grep") {
    return <GrepToolCallCard renderState="streaming" toolCallDetail={pendingToolCallDetail} />;
  }
  if (pendingToolCallDetail.toolName === "edit") {
    return <EditToolCallCard renderState="streaming" toolCallDetail={pendingToolCallDetail} />;
  }
  if (pendingToolCallDetail.toolName === "bash") {
    return <BashToolCallCard renderState="streaming" toolCallDetail={pendingToolCallDetail} />;
  }
  if (pendingToolCallDetail.toolName === "todowrite") {
    return <TodoWriteToolCallCard renderState="streaming" toolCallDetail={pendingToolCallDetail} />;
  }
  // Exhaustive over ToolCallDetail's discriminated union; remaining arm is task.
  return <TaskToolCallCard renderState="streaming" toolCallDetail={pendingToolCallDetail} />;
}
