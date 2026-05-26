import type { ReactNode } from "react";
import type { SlashCommand } from "@buli/chat-session-state";
import {
  chatScreenTheme,
  comfortableTerminalSizeTier,
  type TerminalSizeTierForChatScreen,
} from "@buli/assistant-design-tokens";
import {
  listChatScreenKeyboardShortcutHelpEntries,
  type ChatScreenKeyboardShortcutCatalogEntry,
} from "../keyboard/chatScreenKeyboardShortcutCatalog.ts";

const COMMAND_HELP_COLUMN_WIDTH_IN_CELLS = 56;
const COMMAND_NAME_COLUMN_WIDTH_IN_CELLS = 16;
const KEYBOARD_SHORTCUT_COLUMN_WIDTH_IN_CELLS = 18;
const COMMAND_HELP_MODAL_MAX_WIDTH_IN_CELLS = 112;

type CommandHelpModalRow =
  | { rowKind: "column_headings" }
  | {
      rowKind: "command_and_shortcut";
      slashCommand: SlashCommand | undefined;
      keyboardShortcut: ChatScreenKeyboardShortcutCatalogEntry | undefined;
    };

export type CommandHelpModalProps = {
  onCloseRequested: () => void;
  availableModalRowCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
  availableSlashCommands: readonly SlashCommand[];
};

export function CommandHelpModal(props: CommandHelpModalProps): ReactNode {
  const rendersComfortableChrome =
    props.terminalSizeTierForChatScreen === comfortableTerminalSizeTier;
  const nonHelpRowCount = rendersComfortableChrome ? 3 : 1;
  const visibleHelpRowCount = Math.max(0, props.availableModalRowCount - nonHelpRowCount);
  const visibleHelpRows = buildCommandHelpModalRows(props.availableSlashCommands).slice(0, visibleHelpRowCount);

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
          <b>{"help · commands + shortcuts"}</b>
        </text>
      </box>
      {rendersComfortableChrome ? (
        <box backgroundColor={chatScreenTheme.borderSubtle} height={1} flexShrink={0} />
      ) : null}
      <box flexDirection="column" paddingX={2} paddingY={rendersComfortableChrome ? 1 : 0} flexShrink={0}>
        {visibleHelpRows.map((commandHelpModalRow) => renderCommandHelpModalRow(commandHelpModalRow))}
      </box>
    </box>
  );
}

function buildCommandHelpModalRows(availableSlashCommands: readonly SlashCommand[]): readonly CommandHelpModalRow[] {
  const keyboardShortcutHelpEntries = listChatScreenKeyboardShortcutHelpEntries();
  const commandOrShortcutRowCount = Math.max(
    availableSlashCommands.length,
    keyboardShortcutHelpEntries.length,
  );

  return [
    { rowKind: "column_headings" },
    ...Array.from({ length: commandOrShortcutRowCount }, (_unusedValue, rowIndex) => ({
      rowKind: "command_and_shortcut" as const,
      slashCommand: availableSlashCommands[rowIndex],
      keyboardShortcut: keyboardShortcutHelpEntries[rowIndex],
    })),
  ];
}

function renderCommandHelpModalRow(commandHelpModalRow: CommandHelpModalRow): ReactNode {
  if (commandHelpModalRow.rowKind === "column_headings") {
    return (
      <box flexDirection="row" key="column-headings">
        <box width={COMMAND_HELP_COLUMN_WIDTH_IN_CELLS}>
          <text fg={chatScreenTheme.textMuted} wrapMode="none">
            <b>{"commands"}</b>
          </text>
        </box>
        <box marginLeft={2}>
          <text fg={chatScreenTheme.textMuted} wrapMode="none">
            <b>{"shortcuts"}</b>
          </text>
        </box>
      </box>
    );
  }

  return (
    <box
      flexDirection="row"
      key={[
        "row",
        commandHelpModalRow.slashCommand?.value ?? "none",
        commandHelpModalRow.keyboardShortcut?.shortcutId ?? "none",
      ].join(":")}
    >
      <box flexDirection="row" width={COMMAND_HELP_COLUMN_WIDTH_IN_CELLS}>
        {commandHelpModalRow.slashCommand ? renderSlashCommandHelp(commandHelpModalRow.slashCommand) : null}
      </box>
      <box flexDirection="row" marginLeft={2} flexGrow={1} minWidth={0}>
        {commandHelpModalRow.keyboardShortcut
          ? renderKeyboardShortcutHelp(commandHelpModalRow.keyboardShortcut)
          : null}
      </box>
    </box>
  );
}

function renderSlashCommandHelp(slashCommand: SlashCommand): ReactNode {
  return (
    <>
      <box width={COMMAND_NAME_COLUMN_WIDTH_IN_CELLS}>
        <text fg={chatScreenTheme.accentCyan} wrapMode="none">
          <b>{`/${slashCommand.name}`}</b>
        </text>
      </box>
      <text fg={chatScreenTheme.textSecondary} wrapMode="none" truncate={true}>
        {slashCommand.description}
      </text>
    </>
  );
}

function renderKeyboardShortcutHelp(keyboardShortcut: ChatScreenKeyboardShortcutCatalogEntry): ReactNode {
  return (
    <>
      <box width={KEYBOARD_SHORTCUT_COLUMN_WIDTH_IN_CELLS}>
        <text fg={chatScreenTheme.accentGreen} wrapMode="none">
          <b>{keyboardShortcut.helpLabel}</b>
        </text>
      </box>
      <text fg={chatScreenTheme.textSecondary} wrapMode="none" truncate={true}>
        {keyboardShortcut.description}
      </text>
    </>
  );
}
