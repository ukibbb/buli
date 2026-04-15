import { Box, Text } from "ink";
import type { ReactNode } from "react";
import type { ToolCallEditDetail } from "@buli/contracts";
import { chatScreenTheme } from "../../chatScreenTheme.ts";
import { DiffBlock } from "../primitives/DiffBlock.tsx";
import { FileReference } from "../primitives/FileReference.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { glyphs } from "../glyphs.ts";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "./ToolCallCardHeaderSlots.tsx";

// EditToolCallCard covers both the success and error variants from the pen
// file (toolCall_edit_success / toolCall_edit_error). Success uses the green
// stripe plus diff body; error uses the red stripe, no body, and surfaces the
// error message in the status slot.
export type EditToolCallCardProps = {
  toolCallDetail: ToolCallEditDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

export function EditToolCallCard(props: EditToolCallCardProps): ReactNode {
  const stripeColor =
    props.renderState === "failed" ? chatScreenTheme.accentRed : chatScreenTheme.accentGreen;
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
          toolGlyph={glyphs.editPencil}
          toolGlyphColor={stripeColor}
          toolNameLabel="Edit"
          toolTargetContent={
            <FileReference filePath={props.toolCallDetail.editedFilePath} variant="inline" />
          }
        />
      }
      headerRight={
        props.renderState === "completed" ? (
          <EditSuccessStatusSlot
            {...(props.toolCallDetail.addedLineCount !== undefined
              ? { addedLineCount: props.toolCallDetail.addedLineCount }
              : {})}
            {...(props.toolCallDetail.removedLineCount !== undefined
              ? { removedLineCount: props.toolCallDetail.removedLineCount }
              : {})}
          />
        ) : (
          <ToolCallHeaderRight
            statusColor={stripeColor}
            statusKind={statusKind}
            statusLabel={props.renderState === "failed" ? props.errorText ?? "edit failed" : "editing…"}
          />
        )
      }
      bodyContent={buildEditBodyContent(props)}
    />
  );
}

function EditSuccessStatusSlot(props: {
  addedLineCount?: number;
  removedLineCount?: number;
}): ReactNode {
  return (
    <Box>
      {props.addedLineCount !== undefined ? (
        <Text bold color={chatScreenTheme.accentGreen}>
          {`+${props.addedLineCount}`}
        </Text>
      ) : null}
      {props.removedLineCount !== undefined ? (
        <Box marginLeft={1}>
          <Text bold color={chatScreenTheme.accentRed}>
            {`-${props.removedLineCount}`}
          </Text>
        </Box>
      ) : null}
      <Box marginLeft={1}>
        <Text color={chatScreenTheme.accentGreen}>{glyphs.checkMark}</Text>
      </Box>
    </Box>
  );
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
