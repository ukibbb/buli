// Tier classification for the chat screen so every responsive adaptation
// (layout pinning, modal chrome trimming, prompt-strip collapse) branches off
// the same named decision instead of each component hand-rolling its own
// dimension thresholds.
//
// Thresholds are driven by the HERO 1 design's row budget:
//   - comfortableTerminalSizeTier ≥ 24 rows × 80 cols → full design renders
//     with room to spare for the modal, the context meter, and a multi-entry
//     transcript.
//   - compactTerminalSizeTier ≥ 12 rows × 60 cols → TopBar + InputPanel fit
//     with a 4+ row transcript window; the ShortcutsModal drops the accent
//     strip / dividers / footer and wraps its legend in a scroll surface.
//   - minimumTerminalSizeTier otherwise → InputPanel collapses to a
//     single-row prompt strip so the caret stays visible even at ~6 rows
//     total; ShortcutsModal shows only the keyboard section.

export const comfortableTerminalSizeTier = "comfortable" as const;
export const compactTerminalSizeTier = "compact" as const;
export const minimumTerminalSizeTier = "minimum" as const;

export type TerminalSizeTierForChatScreen =
  | typeof comfortableTerminalSizeTier
  | typeof compactTerminalSizeTier
  | typeof minimumTerminalSizeTier;

export type TerminalSizeForChatScreen = {
  rowCount: number;
  columnCount: number;
};

const COMFORTABLE_TIER_MIN_ROW_COUNT = 24;
const COMFORTABLE_TIER_MIN_COLUMN_COUNT = 80;
const COMPACT_TIER_MIN_ROW_COUNT = 12;
const COMPACT_TIER_MIN_COLUMN_COUNT = 60;

export function classifyTerminalSizeTierForChatScreen(
  terminalSize: TerminalSizeForChatScreen,
): TerminalSizeTierForChatScreen {
  if (
    terminalSize.rowCount >= COMFORTABLE_TIER_MIN_ROW_COUNT &&
    terminalSize.columnCount >= COMFORTABLE_TIER_MIN_COLUMN_COUNT
  ) {
    return comfortableTerminalSizeTier;
  }
  if (
    terminalSize.rowCount >= COMPACT_TIER_MIN_ROW_COUNT &&
    terminalSize.columnCount >= COMPACT_TIER_MIN_COLUMN_COUNT
  ) {
    return compactTerminalSizeTier;
  }
  return minimumTerminalSizeTier;
}
