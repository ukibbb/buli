import type { ReactNode } from "react";
import type { SlashCommand } from "@buli/chat-session-state";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

const MAX_VISIBLE_SLASH_COMMAND_COUNT = 9;
const SLASH_COMMAND_COMMAND_COLUMN_WIDTH = 18;
const SLASH_COMMAND_PANE_HORIZONTAL_MARGIN = 2;

export type SlashCommandSelectionPaneProps = {
  availableSlashCommands: readonly SlashCommand[];
  highlightedSlashCommandIndex: number;
  accentColor: string;
};

export function SlashCommandSelectionPane(props: SlashCommandSelectionPaneProps): ReactNode {
  const lastPossibleFirstVisibleSlashCommandIndex = Math.max(
    0,
    props.availableSlashCommands.length - MAX_VISIBLE_SLASH_COMMAND_COUNT,
  );
  const highlightedSlashCommandIndex = Math.max(
    0,
    Math.min(props.highlightedSlashCommandIndex, props.availableSlashCommands.length - 1),
  );
  const firstVisibleSlashCommandIndex = Math.min(
    lastPossibleFirstVisibleSlashCommandIndex,
    Math.max(0, highlightedSlashCommandIndex - MAX_VISIBLE_SLASH_COMMAND_COUNT + 1),
  );
  const visibleSlashCommands = props.availableSlashCommands.slice(
    firstVisibleSlashCommandIndex,
    firstVisibleSlashCommandIndex + MAX_VISIBLE_SLASH_COMMAND_COUNT,
  );
  const slashCommandPaneInnerRowCount =
    props.availableSlashCommands.length === 0 ? 1 : visibleSlashCommands.length;
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
        visibleSlashCommands.map((slashCommand, visibleSlashCommandOffset) => {
          const slashCommandIndex = firstVisibleSlashCommandIndex + visibleSlashCommandOffset;
          const isHighlightedSlashCommand = slashCommandIndex === highlightedSlashCommandIndex;

          return (
            <box
              backgroundColor={isHighlightedSlashCommand ? chatScreenTheme.borderSubtle : chatScreenTheme.surfaceOne}
              flexDirection="row"
              flexShrink={0}
              height={1}
              key={slashCommand.value}
              width="100%"
            >
              <box flexShrink={0} width={SLASH_COMMAND_COMMAND_COLUMN_WIDTH}>
                <text
                  fg={isHighlightedSlashCommand ? chatScreenTheme.textPrimary : chatScreenTheme.textSecondary}
                  truncate={true}
                  wrapMode="none"
                >
                  {`/${slashCommand.name}`}
                </text>
              </box>
              <text
                fg={isHighlightedSlashCommand ? chatScreenTheme.textPrimary : chatScreenTheme.textMuted}
                truncate={true}
                wrapMode="none"
              >
                {slashCommand.description}
              </text>
            </box>
          );
        })
      )}
    </box>
  );
}
