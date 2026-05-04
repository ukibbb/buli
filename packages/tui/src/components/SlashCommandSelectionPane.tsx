import type { ReactNode } from "react";
import type { SlashCommand } from "@buli/chat-session-state";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

const MAX_VISIBLE_SLASH_COMMAND_COUNT = 8;

function selectVisibleSlashCommandWindow(input: {
  availableSlashCommands: readonly SlashCommand[];
  highlightedSlashCommandIndex: number;
}): {
  firstVisibleSlashCommandIndex: number;
  visibleSlashCommands: readonly SlashCommand[];
} {
  const latestFirstVisibleSlashCommandIndex = Math.max(
    0,
    input.availableSlashCommands.length - MAX_VISIBLE_SLASH_COMMAND_COUNT,
  );
  const firstVisibleSlashCommandIndex = Math.min(
    Math.max(0, input.highlightedSlashCommandIndex - (MAX_VISIBLE_SLASH_COMMAND_COUNT - 1)),
    latestFirstVisibleSlashCommandIndex,
  );

  return {
    firstVisibleSlashCommandIndex,
    visibleSlashCommands: input.availableSlashCommands.slice(
      firstVisibleSlashCommandIndex,
      firstVisibleSlashCommandIndex + MAX_VISIBLE_SLASH_COMMAND_COUNT,
    ),
  };
}

export type SlashCommandSelectionPaneProps = {
  availableSlashCommands: readonly SlashCommand[];
  highlightedSlashCommandIndex: number;
};

export function SlashCommandSelectionPane(props: SlashCommandSelectionPaneProps): ReactNode {
  const { firstVisibleSlashCommandIndex, visibleSlashCommands } = selectVisibleSlashCommandWindow({
    availableSlashCommands: props.availableSlashCommands,
    highlightedSlashCommandIndex: props.highlightedSlashCommandIndex,
  });

  return (
    <box
      borderStyle="rounded"
      borderColor={chatScreenTheme.border}
      backgroundColor={chatScreenTheme.surfaceOne}
      flexDirection="column"
      flexShrink={0}
      marginX={2}
      marginBottom={1}
      paddingX={1}
    >
      <text fg={chatScreenTheme.textMuted}>Commands</text>
      {visibleSlashCommands.length === 0 ? (
        <text fg={chatScreenTheme.textSecondary}>No matching commands.</text>
      ) : (
        visibleSlashCommands.map((slashCommand, index) => {
          const isHighlightedSlashCommand =
            firstVisibleSlashCommandIndex + index === props.highlightedSlashCommandIndex;
          return (
            <box key={slashCommand.value} flexDirection="row" gap={1} width="100%">
              <text fg={isHighlightedSlashCommand ? chatScreenTheme.accentGreen : chatScreenTheme.textDim}>
                {isHighlightedSlashCommand ? ">" : " "}
              </text>
              <text
                fg={isHighlightedSlashCommand ? chatScreenTheme.textPrimary : chatScreenTheme.textSecondary}
                wrapMode="none"
              >
                {`/${slashCommand.name}`}
              </text>
              <box flexGrow={1}>
                <text fg={chatScreenTheme.textMuted} wrapMode="none" truncate={true}>
                  {slashCommand.description}
                </text>
              </box>
            </box>
          );
        })
      )}
    </box>
  );
}
