import { Box, Text } from "ink";
import type { ReactNode } from "react";
import type { ToolCallTaskDetail } from "@buli/contracts";
import { chatScreenTheme } from "../../chatScreenTheme.ts";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { glyphs } from "../glyphs.ts";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "./ToolCallCardHeaderSlots.tsx";

// TaskToolCallCard surfaces a sub-agent invocation: the description the
// assistant gave the sub-agent, the full prompt it dispatched (optional),
// and the result summary that came back.
export type TaskToolCallCardProps = {
  toolCallDetail: ToolCallTaskDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

export function TaskToolCallCard(props: TaskToolCallCardProps): ReactNode {
  const stripeColor =
    props.renderState === "failed" ? chatScreenTheme.accentRed : chatScreenTheme.accentPurple;
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
          toolGlyph={glyphs.taskSpawn}
          toolGlyphColor={stripeColor}
          toolNameLabel="Task"
          toolTargetContent={
            <Text color={chatScreenTheme.textSecondary}>{props.toolCallDetail.subagentDescription}</Text>
          }
        />
      }
      headerRight={
        <ToolCallHeaderRight
          statusColor={stripeColor}
          statusKind={statusKind}
          statusLabel={
            props.renderState === "failed"
              ? props.errorText ?? "sub-agent failed"
              : props.renderState === "streaming"
                ? "dispatched…"
                : "returned"
          }
        />
      }
      bodyContent={buildTaskBodyContent(props)}
    />
  );
}

function buildTaskBodyContent(props: TaskToolCallCardProps): ReactNode {
  if (props.renderState === "failed") {
    return (
      <Text color={chatScreenTheme.accentRed}>
        {props.errorText ?? "Sub-agent returned no result."}
      </Text>
    );
  }
  const { subagentPrompt, subagentResultSummary } = props.toolCallDetail;
  if (!subagentPrompt && !subagentResultSummary) {
    return undefined;
  }
  return (
    <Box flexDirection="column" paddingX={1} width="100%">
      {subagentPrompt ? (
        <Box width="100%">
          <Text color={chatScreenTheme.textMuted}>{"// prompt"}</Text>
        </Box>
      ) : null}
      {subagentPrompt ? (
        <Box width="100%">
          <Text color={chatScreenTheme.textSecondary}>{subagentPrompt}</Text>
        </Box>
      ) : null}
      {subagentResultSummary ? (
        <Box marginTop={subagentPrompt ? 1 : 0} width="100%">
          <Text color={chatScreenTheme.textMuted}>{"// result"}</Text>
        </Box>
      ) : null}
      {subagentResultSummary ? (
        <Box width="100%">
          <Text color={chatScreenTheme.textPrimary}>{subagentResultSummary}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
