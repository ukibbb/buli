import type { ReactNode } from "react";
import type { ChecklistItem, ToolCallTodoItemStatus } from "@buli/contracts";
export type { ChecklistItem };
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "../glyphs.ts";
import { TextAttributes } from "@opentui/core";

// Checklist reuses ToolCallTodoItemStatus so a TodoWrite tool card and a
// standalone checklist block share the same status semantics. Done items get
// a strikethrough to match the pen-file Checklist component; in-progress
// items get an amber arrow so the "currently working" step reads at a glance.
export type ChecklistProps = {
  items: ChecklistItem[];
};

const statusGlyphs: Record<ToolCallTodoItemStatus, string> = {
  pending: "·",
  in_progress: "▸",
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
    <box flexDirection="column" width="100%">
      {props.items.map((checklistItem, index) => (
        <box key={`checklist-item-${index}`} width="100%">
          <box flexShrink={0} marginRight={1}>
            <text>
              <span fg={statusColors[checklistItem.itemStatus]}>
                {statusGlyphs[checklistItem.itemStatus]}
              </span>
            </text>
          </box>
          <box flexShrink={1}>
            <text>
              {/* ink's strikethrough prop maps to TextAttributes.STRIKETHROUGH for completed items */}
              {checklistItem.itemStatus === "completed" ? (
                <span
                  fg={statusTextColors[checklistItem.itemStatus]}
                  attributes={TextAttributes.STRIKETHROUGH}
                >
                  {checklistItem.itemTitle}
                </span>
              ) : (
                <span fg={statusTextColors[checklistItem.itemStatus]}>
                  {checklistItem.itemTitle}
                </span>
              )}
            </text>
          </box>
        </box>
      ))}
    </box>
  );
}
