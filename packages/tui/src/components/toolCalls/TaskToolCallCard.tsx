import type { ReactNode } from "react";
import type { ToolCallTaskDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
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
            <text fg={chatScreenTheme.textSecondary}>{props.toolCallDetail.subagentDescription}</text>
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
          <text fg={chatScreenTheme.textSecondary}>{subagentPrompt}</text>
        </box>
      ) : null}
      {subagentResultSummary ? (
        <box {...(subagentPrompt ? { marginTop: 1 } : {})} width="100%">
          <text fg={chatScreenTheme.textMuted}>{"// result"}</text>
        </box>
      ) : null}
      {subagentResultSummary ? (
        <box width="100%">
          <text fg={chatScreenTheme.textPrimary}>{subagentResultSummary}</text>
        </box>
      ) : null}
    </box>
  );
}
