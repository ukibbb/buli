import type { ReactNode } from "react";
import { useKeyboard } from "@opentui/react";
import type { KeyEvent } from "@opentui/core";
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

export function ShortcutsModal(props: ShortcutsModalProps): ReactNode {
  useKeyboard((e: KeyEvent) => {
    if (e.name === "escape" || e.name === "?") {
      props.onCloseRequested();
    }
  });

  return (
    <box
      borderStyle="rounded"
      borderColor={chatScreenTheme.accentGreen}
      flexDirection="column"
      backgroundColor={chatScreenTheme.surfaceOne}
    >
      <box backgroundColor={chatScreenTheme.accentGreen} height={1} />
      <box flexDirection="row" justifyContent="space-between" paddingX={2} paddingY={1}>
        <text fg={chatScreenTheme.textPrimary}>
          <b>{"help · shortcuts"}</b>
        </text>
        <text fg={chatScreenTheme.textDim}>{"[ esc ] close"}</text>
      </box>
      <box backgroundColor={chatScreenTheme.borderSubtle} height={1} />
      <box flexDirection="column" paddingX={2} paddingY={1}>
        <ShortcutLegendSection
          sectionLabel="// keyboard"
          sectionLabelColor={chatScreenTheme.accentGreen}
          keyLabelColor={chatScreenTheme.accentCyan}
          rows={keyboardShortcutLegendRows}
        />
        <box backgroundColor={chatScreenTheme.borderSubtle} height={1} marginY={1} />
        <ShortcutLegendSection
          sectionLabel="// help"
          sectionLabelColor={chatScreenTheme.accentCyan}
          keyLabelColor={chatScreenTheme.accentAmber}
          rows={helpShortcutLegendRows}
        />
      </box>
      <box
        backgroundColor={chatScreenTheme.surfaceTwo}
        flexDirection="row"
        justifyContent="space-between"
        paddingX={2}
      >
        <text fg={chatScreenTheme.textDim}>{"buli · tui · v0.1"}</text>
        <text fg={chatScreenTheme.textMuted}>{"close with ? or esc"}</text>
      </box>
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
