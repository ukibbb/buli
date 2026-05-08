import type { ReactNode } from "react";
import type { SlashCommand } from "@buli/chat-session-state";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { SelectionPaneSelect } from "./SelectionPaneSelect.tsx";

const MAX_VISIBLE_SLASH_COMMAND_COUNT = 8;

export type SlashCommandSelectionPaneProps = {
  availableSlashCommands: readonly SlashCommand[];
  highlightedSlashCommandIndex: number;
};

export function SlashCommandSelectionPane(props: SlashCommandSelectionPaneProps): ReactNode {
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
      {props.availableSlashCommands.length === 0 ? (
        <text fg={chatScreenTheme.textSecondary}>No matching commands.</text>
      ) : (
        <SelectionPaneSelect
          optionNames={props.availableSlashCommands.map((slashCommand) =>
            `/${slashCommand.name} ${slashCommand.description}`
          )}
          highlightedOptionIndex={props.highlightedSlashCommandIndex}
          maxVisibleOptionCount={MAX_VISIBLE_SLASH_COMMAND_COUNT}
        />
      )}
    </box>
  );
}
