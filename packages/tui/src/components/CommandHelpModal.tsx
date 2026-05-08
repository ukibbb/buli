import type { ReactNode } from "react";
import type { SlashCommand } from "@buli/chat-session-state";
import {
  chatScreenTheme,
  comfortableTerminalSizeTier,
  type TerminalSizeTierForChatScreen,
} from "@buli/assistant-design-tokens";

const COMMAND_NAME_COLUMN_WIDTH_IN_CELLS = 18;
const COMMAND_HELP_MODAL_MAX_WIDTH_IN_CELLS = 70;

export type CommandHelpModalProps = {
  onCloseRequested: () => void;
  availableModalRowCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
  availableSlashCommands: readonly SlashCommand[];
};

export function CommandHelpModal(props: CommandHelpModalProps): ReactNode {
  const rendersComfortableChrome =
    props.terminalSizeTierForChatScreen === comfortableTerminalSizeTier;
  const nonCommandRowCount = rendersComfortableChrome ? 3 : 1;
  const visibleCommandRowCount = Math.max(0, props.availableModalRowCount - nonCommandRowCount);
  const visibleSlashCommands = props.availableSlashCommands.slice(0, visibleCommandRowCount);

  return (
    <box
      borderStyle="rounded"
      borderColor={chatScreenTheme.accentGreen}
      flexDirection="column"
      backgroundColor={chatScreenTheme.surfaceOne}
      maxWidth={COMMAND_HELP_MODAL_MAX_WIDTH_IN_CELLS}
      maxHeight={props.availableModalRowCount}
      overflow="hidden"
    >
      {rendersComfortableChrome ? (
        <box backgroundColor={chatScreenTheme.accentGreen} height={1} flexShrink={0} />
      ) : null}
      <box paddingX={2} paddingY={rendersComfortableChrome ? 1 : 0} flexShrink={0}>
        <text fg={chatScreenTheme.textPrimary}>
          <b>{"help · commands"}</b>
        </text>
      </box>
      {rendersComfortableChrome ? (
        <box backgroundColor={chatScreenTheme.borderSubtle} height={1} flexShrink={0} />
      ) : null}
      <box flexDirection="column" paddingX={2} paddingY={rendersComfortableChrome ? 1 : 0} flexShrink={0}>
        {visibleSlashCommands.map((slashCommand) => (
          <box flexDirection="row" key={slashCommand.value}>
            <box width={COMMAND_NAME_COLUMN_WIDTH_IN_CELLS}>
              <text fg={chatScreenTheme.accentCyan} wrapMode="none">
                <b>{`/${slashCommand.name}`}</b>
              </text>
            </box>
            <text fg={chatScreenTheme.textSecondary} wrapMode="none" truncate={true}>
              {slashCommand.description}
            </text>
          </box>
        ))}
      </box>
    </box>
  );
}
