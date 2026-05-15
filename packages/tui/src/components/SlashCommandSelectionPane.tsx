import type { ReactNode } from "react";
import type { SlashCommand } from "@buli/chat-session-state";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { SelectionPaneFrame } from "./SelectionPaneFrame.tsx";
import { SelectionPaneSelect } from "./SelectionPaneSelect.tsx";

const MAX_VISIBLE_SLASH_COMMAND_COUNT = 10;
const SLASH_COMMAND_COMMAND_COLUMN_WIDTH = 18;

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

  return (
    <SelectionPaneFrame headingText="Commands" accentColor={props.accentColor}>
      {props.availableSlashCommands.length === 0 ? (
        <text fg={chatScreenTheme.textSecondary}>No matching commands.</text>
      ) : (
        <SelectionPaneSelect
          optionNames={visibleSlashCommands.map(formatSlashCommandSelectionOptionName)}
          highlightedOptionIndex={highlightedSlashCommandIndex - firstVisibleSlashCommandIndex}
          maxVisibleOptionCount={MAX_VISIBLE_SLASH_COMMAND_COUNT}
        />
      )}
    </SelectionPaneFrame>
  );
}

function formatSlashCommandSelectionOptionName(slashCommand: SlashCommand): string {
  return `${`/${slashCommand.name}`.padEnd(SLASH_COMMAND_COMMAND_COLUMN_WIDTH)}${slashCommand.description}`;
}
