import { Box, Text } from "ink";
import type { ReactNode } from "react";
import type { ToolCallDetail } from "@buli/contracts";
import { chatScreenTheme } from "../../chatScreenTheme.ts";
import { BashToolCallCard } from "../toolCalls/BashToolCallCard.tsx";
import { EditToolCallCard } from "../toolCalls/EditToolCallCard.tsx";
import { GrepToolCallCard } from "../toolCalls/GrepToolCallCard.tsx";
import { ReadToolCallCard } from "../toolCalls/ReadToolCallCard.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { TaskToolCallCard } from "../toolCalls/TaskToolCallCard.tsx";
import { TodoWriteToolCallCard } from "../toolCalls/TodoWriteToolCallCard.tsx";
import { glyphs } from "../glyphs.ts";

// ToolApprovalRequestBlock is the UI the agent shows when a pending tool
// invocation needs explicit user approval. It reuses the matching tool card
// (rendered in the streaming state) so the user judges the exact invocation
// they're approving, with the risk explanation and decision hints beneath.
export type ToolApprovalRequestBlockProps = {
  pendingToolCallDetail: ToolCallDetail;
  riskExplanation: string;
};

export function ToolApprovalRequestBlock(props: ToolApprovalRequestBlockProps): ReactNode {
  return (
    <SurfaceCard
      stripeColor={chatScreenTheme.accentAmber}
      headerLeft={
        <Box>
          <Text color={chatScreenTheme.accentAmber}>{glyphs.statusDot}</Text>
          <Text bold color={chatScreenTheme.textPrimary}>
            {` Approval required`}
          </Text>
        </Box>
      }
      headerRight={<Text color={chatScreenTheme.textMuted}>y approve · n deny</Text>}
      bodyContent={
        <Box flexDirection="column" paddingX={1} width="100%">
          <Box marginBottom={1} width="100%">
            <Text color={chatScreenTheme.accentAmber}>{props.riskExplanation}</Text>
          </Box>
          <Box width="100%">
            <PendingToolCallPreview pendingToolCallDetail={props.pendingToolCallDetail} />
          </Box>
        </Box>
      }
    />
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
  // Remaining arm: task. Exhaustive over ToolCallDetail's discriminated union.
  return <TaskToolCallCard renderState="streaming" toolCallDetail={pendingToolCallDetail} />;
}
