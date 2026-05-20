import { useState, type ReactNode } from "react";
import type { ToolCallWriteDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { DiffBlock } from "../primitives/DiffBlock.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { ToolCallCompactHeader } from "./ToolCallCardHeaderSlots.tsx";

export type WriteToolCallCardProps = {
  toolCallDetail: ToolCallWriteDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

const MAX_VISIBLE_WRITE_DIFF_LINES = 80;

export function WriteToolCallCard(props: WriteToolCallCardProps): ReactNode {
  const [isWriteDiffExpanded, setIsWriteDiffExpanded] = useState(false);
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
  const hasWriteDiffContent = props.renderState !== "failed" && Boolean(props.toolCallDetail.unifiedDiffText);
  return (
    <SurfaceCard
      accentColor={accentColor}
      density="compact"
      headerLeft={
        <ToolCallCompactHeader
          accentColor={accentColor}
          disclosureState={hasWriteDiffContent
            ? {
                isContentExpandable: true,
                isContentExpanded: isWriteDiffExpanded,
                onContentExpansionToggle: () => {
                  setIsWriteDiffExpanded((currentWriteDiffExpanded) => !currentWriteDiffExpanded);
                },
              }
            : { isContentExpandable: false }}
          statusColor={accentColor}
          statusKind={statusKind}
          statusLabel={buildWriteStatusLabel(props)}
          toolNameLabel="Write"
          toolTargetText={props.toolCallDetail.writtenFilePath}
        />
      }
      bodyContent={hasWriteDiffContent && isWriteDiffExpanded ? buildWriteBodyContent(props) : undefined}
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
  const unifiedDiffText = props.toolCallDetail.unifiedDiffText;
  if (!unifiedDiffText) {
    return undefined;
  }
  return <DiffBlock maximumVisibleLineCount={MAX_VISIBLE_WRITE_DIFF_LINES} unifiedDiffText={unifiedDiffText} />;
}
