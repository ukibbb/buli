import type { ReactNode } from "react";
import type { ToolCallWriteDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { DiffBlock } from "../primitives/DiffBlock.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { BracketedTarget } from "./BracketedTarget.tsx";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "./ToolCallCardHeaderSlots.tsx";

export type WriteToolCallCardProps = {
  toolCallDetail: ToolCallWriteDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

export function WriteToolCallCard(props: WriteToolCallCardProps): ReactNode {
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
          toolNameLabel="Write"
          toolTargetContent={
            <BracketedTarget accentColor={accentColor} targetText={props.toolCallDetail.writtenFilePath} />
          }
        />
      }
      headerRight={
        <ToolCallHeaderRight
          statusColor={accentColor}
          statusKind={statusKind}
          statusLabel={buildWriteStatusLabel(props)}
        />
      }
      bodyContent={buildWriteBodyContent(props)}
    />
  );
}

function buildWriteStatusLabel(props: WriteToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "write failed";
  }
  if (props.renderState === "streaming") {
    return "writing…";
  }
  const addedLineCount = props.toolCallDetail.addedLineCount;
  const removedLineCount = props.toolCallDetail.removedLineCount;
  const parts: string[] = [];
  if (addedLineCount !== undefined) {
    parts.push(`+${addedLineCount}`);
  }
  if (removedLineCount !== undefined) {
    parts.push(`−${removedLineCount}`);
  }
  return parts.length > 0 ? parts.join(" ") : "wrote";
}

function buildWriteBodyContent(props: WriteToolCallCardProps): ReactNode {
  if (props.renderState === "failed") {
    return undefined;
  }
  const unifiedDiffText = props.toolCallDetail.unifiedDiffText;
  if (!unifiedDiffText) {
    return undefined;
  }
  return <DiffBlock unifiedDiffText={unifiedDiffText} />;
}
