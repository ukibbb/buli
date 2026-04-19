import type { ReactNode } from "react";
import { useKeyboard } from "@opentui/react";
import type { KeyEvent } from "@opentui/core";
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
// planShortcutsModalRowBudget how much content fits and renders that much,
// because OpenTUI's text renderer blends rows that overflow a flex parent
// (rows visually mash together instead of getting cropped).
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
  // Fired when the user presses Esc or "?" while the modal is visible. The
  // modal does not close itself — ownership of the isVisible flag stays with
  // the parent so every modal surface consistently coordinates visibility
  // through ChatScreenState, and so tests can render the modal without a
  // parent tree.
  onCloseRequested: () => void;
  // Number of rows the modal is allowed to occupy in the chat screen's
  // middle area. Computed by ChatScreen from the terminal height minus the
  // top bar, the middle paddingTop, and the active input region.
  availableModalRowCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
};

export function ShortcutsModal(props: ShortcutsModalProps): ReactNode {
  useKeyboard((e: KeyEvent) => {
    if (e.name === "escape" || e.name === "?") {
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
    <box
      borderStyle="rounded"
      borderColor={chatScreenTheme.accentGreen}
      flexDirection="column"
      backgroundColor={chatScreenTheme.surfaceOne}
      maxWidth={SHORTCUTS_MODAL_MAX_WIDTH_IN_CELLS}
      maxHeight={props.availableModalRowCount}
      overflow="hidden"
    >
      {rendersComfortableChrome ? (
        <box backgroundColor={chatScreenTheme.accentGreen} height={1} flexShrink={0} />
      ) : null}
      <box
        flexDirection="row"
        justifyContent="space-between"
        paddingX={2}
        paddingY={rendersComfortableChrome ? 1 : 0}
        flexShrink={0}
      >
        <text fg={chatScreenTheme.textPrimary}>
          <b>{"help · shortcuts"}</b>
        </text>
        <text fg={chatScreenTheme.textDim}>{"[ esc ] close"}</text>
      </box>
      {rendersComfortableChrome ? (
        <box backgroundColor={chatScreenTheme.borderSubtle} height={1} flexShrink={0} />
      ) : null}
      <box
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
              <box
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
      </box>
      {rendersComfortableChrome ? (
        <box
          backgroundColor={chatScreenTheme.surfaceTwo}
          flexDirection="row"
          justifyContent="space-between"
          paddingX={2}
          flexShrink={0}
        >
          <text fg={chatScreenTheme.textDim}>{"buli · tui · v0.1"}</text>
          <text fg={chatScreenTheme.textMuted}>{"close with ? or esc"}</text>
        </box>
      ) : null}
    </box>
  );
}

type ShortcutLegendSectionProps = {
  sectionLabel: string;
  sectionLabelColor: string;
  keyLabelColor: string;
  rows: ShortcutLegendRow[];
};

function ShortcutLegendSection(props: ShortcutLegendSectionProps): ReactNode {
  return (
    <box flexDirection="column">
      <text fg={props.sectionLabelColor}>{props.sectionLabel}</text>
      {props.rows.map((legendRow) => (
        <box flexDirection="row" key={legendRow.keyLabel}>
          <box width={KEYBOARD_SHORTCUT_KEY_COLUMN_WIDTH_IN_CELLS}>
            <text fg={props.keyLabelColor}>
              <b>{legendRow.keyLabel}</b>
            </text>
          </box>
          <text fg={chatScreenTheme.textSecondary}>{legendRow.description}</text>
        </box>
      ))}
    </box>
  );
}
