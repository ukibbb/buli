import { useState, type ReactNode } from "react";
import type { ToolCallEditDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { DiffBlock } from "../primitives/DiffBlock.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { ToolCallCompactHeader } from "./ToolCallCardHeaderSlots.tsx";

export type EditToolCallCardProps = {
  toolCallDetail: ToolCallEditDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

const MAX_VISIBLE_EDIT_DIFF_LINES = 80;

export function EditToolCallCard(props: EditToolCallCardProps): ReactNode {
  const [isEditDiffExpanded, setIsEditDiffExpanded] = useState(false);
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
  const hasEditDiffContent = props.renderState !== "failed" && Boolean(props.toolCallDetail.unifiedDiffText);
  return (
    <SurfaceCard
      accentColor={accentColor}
      density="compact"
      headerLeft={
        <ToolCallCompactHeader
          accentColor={accentColor}
          disclosureState={hasEditDiffContent
            ? {
                isContentExpandable: true,
                isContentExpanded: isEditDiffExpanded,
                onContentExpansionToggle: () => {
                  setIsEditDiffExpanded((currentEditDiffExpanded) => !currentEditDiffExpanded);
                },
              }
            : { isContentExpandable: false }}
          statusColor={accentColor}
          statusKind={statusKind}
          statusLabel={buildEditStatusLabel(props)}
          toolNameLabel="Edit"
          toolTargetText={props.toolCallDetail.editedFilePath}
        />
      }
      bodyContent={hasEditDiffContent && isEditDiffExpanded ? buildEditBodyContent(props) : undefined}
    />
  );
}

function buildEditStatusLabel(props: EditToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "edit failed";
  }
  if (props.renderState === "streaming") {
    return "editing…";
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
  return parts.length > 0 ? parts.join(" ") : "edited";
}

function buildEditBodyContent(props: EditToolCallCardProps): ReactNode {
  const unifiedDiffText = props.toolCallDetail.unifiedDiffText;
  if (!unifiedDiffText) {
    return undefined;
  }
  return <DiffBlock maximumVisibleLineCount={MAX_VISIBLE_EDIT_DIFF_LINES} unifiedDiffText={unifiedDiffText} />;
}
