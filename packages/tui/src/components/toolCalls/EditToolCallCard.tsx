import type { ReactNode } from "react";
import type { ToolCallEditDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { DiffBlock } from "../primitives/DiffBlock.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { glyphs } from "../glyphs.ts";
import { BracketedTarget } from "./BracketedTarget.tsx";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "./ToolCallCardHeaderSlots.tsx";

export type EditToolCallCardProps = {
  toolCallDetail: ToolCallEditDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

export function EditToolCallCard(props: EditToolCallCardProps): ReactNode {
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
          toolGlyph={glyphs.editPencil}
          toolGlyphColor={accentColor}
          toolNameLabel="Edit"
          toolTargetContent={
            <BracketedTarget accentColor={accentColor} targetText={props.toolCallDetail.editedFilePath} />
          }
        />
      }
      headerRight={
        <ToolCallHeaderRight
          statusColor={accentColor}
          statusKind={statusKind}
          statusLabel={buildEditStatusLabel(props)}
        />
      }
      bodyContent={buildEditBodyContent(props)}
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
  if (props.renderState === "failed") {
    return undefined;
  }
  const diffLines = props.toolCallDetail.diffLines;
  if (!diffLines || diffLines.length === 0) {
    return undefined;
  }
  return <DiffBlock diffLines={diffLines} />;
}
