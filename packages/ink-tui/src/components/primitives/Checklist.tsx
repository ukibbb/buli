import { Box, Text } from "ink";
import type { ReactNode } from "react";
import type { ChecklistItem, ToolCallTodoItemStatus } from "@buli/contracts";
export type { ChecklistItem };
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "../glyphs.ts";

// Checklist reuses ToolCallTodoItemStatus so a TodoWrite tool card and a
// standalone checklist block share the same status semantics. Done items get
// a strikethrough to match the pen-file Checklist component; in-progress
// items get an amber arrow so the "currently working" step reads at a glance.
export type ChecklistProps = {
  items: ChecklistItem[];
};

const statusGlyphs: Record<ToolCallTodoItemStatus, string> = {
  pending: "·",
  in_progress: glyphs.arrowDown === "↓" ? "▸" : "▸",
  completed: glyphs.checkMark,
};

const statusColors: Record<ToolCallTodoItemStatus, string> = {
  pending: chatScreenTheme.textDim,
  in_progress: chatScreenTheme.accentAmber,
  completed: chatScreenTheme.accentGreen,
};

const statusTextColors: Record<ToolCallTodoItemStatus, string> = {
  pending: chatScreenTheme.textSecondary,
  in_progress: chatScreenTheme.textPrimary,
  completed: chatScreenTheme.textMuted,
};

export function Checklist(props: ChecklistProps): ReactNode {
  return (
    <Box flexDirection="column" width="100%">
      {props.items.map((checklistItem, index) => (
        <Box key={`checklist-item-${index}`} width="100%">
          <Box flexShrink={0} marginRight={1}>
            <Text color={statusColors[checklistItem.itemStatus]}>
              {statusGlyphs[checklistItem.itemStatus]}
            </Text>
          </Box>
          <Box flexShrink={1}>
            <Text
              color={statusTextColors[checklistItem.itemStatus]}
              strikethrough={checklistItem.itemStatus === "completed"}
            >
              {checklistItem.itemTitle}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
