import { Box, Text, useInput } from "ink";
import {
  chatScreenTheme,
  comfortableTerminalSizeTier,
  planShortcutsModalRowBudget,
  type TerminalSizeTierForChatScreen,
} from "@buli/assistant-design-tokens";

// Presentational shell of the design's shortcuts modal. The modal does not
// touch terminal dimensions or tier classification on its own — ChatScreen
// owns the layout and hands the modal an exact row budget plus the tier the
// surrounding chat screen is in. The modal then asks
// planShortcutsModalRowBudget how much content fits and renders that much, so
// the visual collapses cleanly as the terminal shrinks.
const KEYBOARD_SHORTCUT_KEY_COLUMN_WIDTH_IN_CELLS = 18;
const SHORTCUTS_MODAL_MAX_WIDTH_IN_CELLS = 70;

type ShortcutLegendRow = {
  keyLabel: string;
  description: string;
};

const keyboardShortcutLegendRows: ShortcutLegendRow[] = [
  { keyLabel: "[ enter ]", description: "send non-empty draft" },
  { keyLabel: "[ ctrl + l ]", description: "open model picker when idle" },
  { keyLabel: "[ ← / → ]", description: "move caret inside draft" },
  { keyLabel: "[ backspace / del ]", description: "delete around caret" },
  { keyLabel: "[ @ picker ]", description: "↑ ↓ choose · enter insert" },
  { keyLabel: "[ up / down ]", description: "scroll transcript by row" },
  { keyLabel: "[ pgup / pgdn ]", description: "scroll transcript by page" },
  { keyLabel: "[ home / end ]", description: "jump oldest · newest" },
  { keyLabel: "[ wheel ]", description: "scroll transcript under pointer" },
];

const helpShortcutLegendRows: ShortcutLegendRow[] = [
  { keyLabel: "[ ? ]", description: "open help from an empty draft" },
  { keyLabel: "[ esc ]", description: "close this modal or picker" },
];

export type ShortcutsModalProps = {
  onCloseRequested: () => void;
  availableModalRowCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
};

export function ShortcutsModal(props: ShortcutsModalProps) {
  useInput((typedText, pressedKey) => {
    if (pressedKey.escape || typedText === "?") {
      props.onCloseRequested();
    }
  });

  const rendersComfortableChrome =
    props.terminalSizeTierForChatScreen === comfortableTerminalSizeTier;
  const shortcutsModalRowBudgetPlan = planShortcutsModalRowBudget({
    availableModalRowCount: props.availableModalRowCount,
    keyboardLegendRowCountAtFull: keyboardShortcutLegendRows.length,
    helpLegendRowCountAtFull: helpShortcutLegendRows.length,
    rendersComfortableChrome,
  });
  const visibleKeyboardLegendRows = keyboardShortcutLegendRows.slice(
    0,
    shortcutsModalRowBudgetPlan.visibleKeyboardLegendRowCount,
  );

  return (
    <Box
      borderStyle="round"
      borderColor={chatScreenTheme.accentGreen}
      flexDirection="column"
      backgroundColor={chatScreenTheme.surfaceOne}
      flexShrink={1}
      width={SHORTCUTS_MODAL_MAX_WIDTH_IN_CELLS}
      overflow="hidden"
    >
      {rendersComfortableChrome ? (
        <Box backgroundColor={chatScreenTheme.accentGreen} height={1} flexShrink={0} />
      ) : null}
      <Box
        justifyContent="space-between"
        paddingX={2}
        paddingY={rendersComfortableChrome ? 1 : 0}
        flexShrink={0}
      >
        <Text bold color={chatScreenTheme.textPrimary}>
          help · shortcuts
        </Text>
        <Text color={chatScreenTheme.textDim}>[ esc ] close</Text>
      </Box>
      {rendersComfortableChrome ? (
        <Box backgroundColor={chatScreenTheme.borderSubtle} height={1} flexShrink={0} />
      ) : null}
      <Box
        flexDirection="column"
        paddingX={2}
        paddingY={rendersComfortableChrome ? 1 : 0}
        flexShrink={0}
      >
        <ShortcutLegendSection
          sectionLabel="// keyboard"
          sectionLabelColor={chatScreenTheme.accentGreen}
          keyLabelColor={chatScreenTheme.accentCyan}
          rows={visibleKeyboardLegendRows}
        />
        {shortcutsModalRowBudgetPlan.showsHelpSection ? (
          <>
            {rendersComfortableChrome ? (
              <Box
                backgroundColor={chatScreenTheme.borderSubtle}
                height={1}
                marginY={1}
                flexShrink={0}
              />
            ) : null}
            <ShortcutLegendSection
              sectionLabel="// help"
              sectionLabelColor={chatScreenTheme.accentCyan}
              keyLabelColor={chatScreenTheme.accentAmber}
              rows={helpShortcutLegendRows}
            />
          </>
        ) : null}
      </Box>
      {rendersComfortableChrome ? (
        <Box
          backgroundColor={chatScreenTheme.surfaceTwo}
          justifyContent="space-between"
          paddingX={2}
          flexShrink={0}
        >
          <Text color={chatScreenTheme.textDim}>buli · tui · v0.1</Text>
          <Text color={chatScreenTheme.textMuted}>close with ? or esc</Text>
        </Box>
      ) : null}
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
