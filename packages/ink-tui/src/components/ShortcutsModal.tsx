import { Box, Text, useInput } from "ink";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// Mirrors the modal shell from the design, but the legend rows stay limited to
// shortcuts the current build actually supports. KEYBOARD_SHORTCUT_KEY_COLUMN_WIDTH
// pins the key column so the description column lines up across every row.
const KEYBOARD_SHORTCUT_KEY_COLUMN_WIDTH_IN_CELLS = 18;

type ShortcutLegendRow = {
  keyLabel: string;
  description: string;
};

const keyboardShortcutLegendRows: ShortcutLegendRow[] = [
  { keyLabel: "[ enter ]", description: "send non-empty draft" },
  { keyLabel: "[ ctrl + l ]", description: "open model picker when idle" },
  { keyLabel: "[ up / down ]", description: "scroll transcript by row" },
  { keyLabel: "[ pgup / pgdn ]", description: "scroll transcript by page" },
  { keyLabel: "[ home / end ]", description: "jump oldest · newest" },
];

const helpShortcutLegendRows: ShortcutLegendRow[] = [
  { keyLabel: "[ ? ]", description: "open help from an empty draft" },
  { keyLabel: "[ esc ]", description: "close this modal or picker" },
];

export type ShortcutsModalProps = {
  // Fired when the user presses Esc or "?" while the modal is visible. The
  // modal does not close itself — ownership of the isVisible flag stays with
  // the parent so every modal surface consistently coordinates visibility
  // through ChatScreenState, and so tests can render the modal without a
  // parent tree.
  onCloseRequested: () => void;
};

export function ShortcutsModal(props: ShortcutsModalProps) {
  useInput((typedText, pressedKey) => {
    if (pressedKey.escape || typedText === "?") {
      props.onCloseRequested();
    }
  });

  return (
    <Box
      borderStyle="round"
      borderColor={chatScreenTheme.accentGreen}
      flexDirection="column"
      backgroundColor={chatScreenTheme.surfaceOne}
    >
      <Box backgroundColor={chatScreenTheme.accentGreen} height={1} />
      <Box justifyContent="space-between" paddingX={2} paddingY={1}>
        <Text bold color={chatScreenTheme.textPrimary}>
          help · shortcuts
        </Text>
        <Text color={chatScreenTheme.textDim}>[ esc ] close</Text>
      </Box>
      <Box backgroundColor={chatScreenTheme.borderSubtle} height={1} />
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <ShortcutLegendSection
          sectionLabel="// keyboard"
          sectionLabelColor={chatScreenTheme.accentGreen}
          keyLabelColor={chatScreenTheme.accentCyan}
          rows={keyboardShortcutLegendRows}
        />
        <Box backgroundColor={chatScreenTheme.borderSubtle} height={1} marginY={1} />
        <ShortcutLegendSection
          sectionLabel="// help"
          sectionLabelColor={chatScreenTheme.accentCyan}
          keyLabelColor={chatScreenTheme.accentAmber}
          rows={helpShortcutLegendRows}
        />
      </Box>
      <Box
        backgroundColor={chatScreenTheme.surfaceTwo}
        justifyContent="space-between"
        paddingX={2}
      >
        <Text color={chatScreenTheme.textDim}>buli · tui · v0.1</Text>
        <Text color={chatScreenTheme.textMuted}>close with ? or esc</Text>
      </Box>
    </Box>
  );
}

type ShortcutLegendSectionProps = {
  sectionLabel: string;
  sectionLabelColor: string;
  keyLabelColor: string;
  rows: ShortcutLegendRow[];
};

function ShortcutLegendSection(props: ShortcutLegendSectionProps) {
  return (
    <Box flexDirection="column">
      <Text color={props.sectionLabelColor}>{props.sectionLabel}</Text>
      {props.rows.map((legendRow) => (
        <Box key={legendRow.keyLabel}>
          <Box width={KEYBOARD_SHORTCUT_KEY_COLUMN_WIDTH_IN_CELLS}>
            <Text bold color={props.keyLabelColor}>
              {legendRow.keyLabel}
            </Text>
          </Box>
          <Text color={chatScreenTheme.textSecondary}>{legendRow.description}</Text>
        </Box>
      ))}
    </Box>
  );
}
