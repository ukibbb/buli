import type { ReactNode } from "react";
import type { SlashCommand } from "@buli/chat-session-state";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import {
  calculateVisibleSelectionWindow,
  resolveSelectionPaneRowTextColor,
  SelectionPaneHighlightedRow,
} from "./SelectionPaneRows.tsx";

const MAX_VISIBLE_SLASH_COMMAND_COUNT = 10;
const SLASH_COMMAND_COMMAND_COLUMN_WIDTH = 18;
const SLASH_COMMAND_PANE_HORIZONTAL_MARGIN = 2;

export type SlashCommandSelectionPaneProps = {
  availableSlashCommands: readonly SlashCommand[];
  highlightedSlashCommandIndex: number;
  accentColor: string;
};

export function SlashCommandSelectionPane(props: SlashCommandSelectionPaneProps): ReactNode {
  const visibleSlashCommandWindow = calculateVisibleSelectionWindow({
    selectionItems: props.availableSlashCommands,
    highlightedSelectionItemIndex: props.highlightedSlashCommandIndex,
    maxVisibleSelectionItemCount: MAX_VISIBLE_SLASH_COMMAND_COUNT,
  });
  const slashCommandPaneInnerRowCount =
    props.availableSlashCommands.length === 0 ? 1 : visibleSlashCommandWindow.visibleSelectionItems.length;
  const slashCommandPaneHeight = slashCommandPaneInnerRowCount + 1;

  return (
    <box
      backgroundColor={chatScreenTheme.surfaceOne}
      borderStyle="rounded"
      borderColor={props.accentColor}
      border={["top", "left", "right"]}
      flexDirection="column"
      flexShrink={0}
      height={slashCommandPaneHeight}
      marginX={SLASH_COMMAND_PANE_HORIZONTAL_MARGIN}
      paddingX={1}
    >
      {props.availableSlashCommands.length === 0 ? (
        <text fg={chatScreenTheme.textSecondary}>No matching commands.</text>
      ) : (
        visibleSlashCommandWindow.visibleSelectionItems.map((slashCommand, visibleSlashCommandOffset) => {
          const slashCommandIndex = visibleSlashCommandWindow.firstVisibleSelectionItemIndex + visibleSlashCommandOffset;
          const isHighlightedSlashCommand = slashCommandIndex === visibleSlashCommandWindow.highlightedSelectionItemIndex;

          return (
            <SelectionPaneHighlightedRow isHighlighted={isHighlightedSlashCommand} key={slashCommand.value}>
              <box flexShrink={0} width={SLASH_COMMAND_COMMAND_COLUMN_WIDTH}>
                <text
                  fg={resolveSelectionPaneRowTextColor({
                    isHighlighted: isHighlightedSlashCommand,
                    unhighlightedTextColor: chatScreenTheme.textSecondary,
                  })}
                  truncate={true}
                  wrapMode="none"
                >
                  {`/${slashCommand.name}`}
                </text>
              </box>
              <text
                fg={resolveSelectionPaneRowTextColor({
                  isHighlighted: isHighlightedSlashCommand,
                  unhighlightedTextColor: chatScreenTheme.textMuted,
                })}
                truncate={true}
                wrapMode="none"
              >
                {slashCommand.description}
              </text>
            </SelectionPaneHighlightedRow>
          );
        })
      )}
    </box>
  );
}
