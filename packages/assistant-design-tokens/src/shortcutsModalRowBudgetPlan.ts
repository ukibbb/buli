// Pure layout planner for the chat screen's shortcuts modal. The modal lives
// inside the chat screen's middle area and shares its budget with the
// transcript pane and the input region. OpenTUI's text renderer blends rows
// that overflow a flex parent (rows visually mash into adjacent cells instead
// of getting cropped), so we never let the modal render more rows than the
// parent has actually granted it. The planner takes the row budget the parent
// computed, plus whether the parent has authorised "comfortable" chrome (the
// accent strip / footer / dividers from the design), and returns the exact
// content shape the modal should render: how many keyboard legend rows fit and
// whether the help section can join them. The modal is then a thin presenter
// over this plan.

// Row counts of every fixed piece of modal chrome. They are exposed as
// constants so the same numbers drive both the planner's arithmetic and the
// modal's rendering — keeping them in sync prevents content from silently
// outgrowing the budget the planner assumed.
export const SHORTCUTS_MODAL_ROUNDED_BORDER_TOP_AND_BOTTOM_ROW_COUNT = 2;
export const SHORTCUTS_MODAL_HEADER_ROW_COUNT = 1;
export const SHORTCUTS_MODAL_ACCENT_STRIP_ROW_COUNT_AT_COMFORTABLE_CHROME = 1;
export const SHORTCUTS_MODAL_HEADER_PADDING_Y_ROW_COUNT_AT_COMFORTABLE_CHROME = 2;
export const SHORTCUTS_MODAL_AFTER_HEADER_DIVIDER_ROW_COUNT_AT_COMFORTABLE_CHROME = 1;
export const SHORTCUTS_MODAL_BODY_PADDING_Y_ROW_COUNT_AT_COMFORTABLE_CHROME = 2;
export const SHORTCUTS_MODAL_FOOTER_ROW_COUNT_AT_COMFORTABLE_CHROME = 1;
export const SHORTCUTS_MODAL_KEYBOARD_SECTION_LABEL_ROW_COUNT = 1;
export const SHORTCUTS_MODAL_HELP_SECTION_LABEL_ROW_COUNT = 1;
export const SHORTCUTS_MODAL_BETWEEN_SECTIONS_DIVIDER_WITH_MARGIN_ROW_COUNT_AT_COMFORTABLE_CHROME = 3;

export type ShortcutsModalRowBudgetInput = {
  availableModalRowCount: number;
  keyboardLegendRowCountAtFull: number;
  helpLegendRowCountAtFull: number;
  rendersComfortableChrome: boolean;
};

export type ShortcutsModalRowBudgetPlan = {
  visibleKeyboardLegendRowCount: number;
  showsHelpSection: boolean;
};

export function planShortcutsModalRowBudget(
  input: ShortcutsModalRowBudgetInput,
): ShortcutsModalRowBudgetPlan {
  const chromeRowCount = computeShortcutsModalChromeRowCount(input.rendersComfortableChrome);
  const bodyContentRowBudget = Math.max(0, input.availableModalRowCount - chromeRowCount);

  const betweenSectionsDividerRowCount = input.rendersComfortableChrome
    ? SHORTCUTS_MODAL_BETWEEN_SECTIONS_DIVIDER_WITH_MARGIN_ROW_COUNT_AT_COMFORTABLE_CHROME
    : 0;

  // Help section requires both labels, the between-sections divider (if
  // chrome is on), and at least one keyboard row alongside it. Below this
  // threshold we drop help entirely so the keyboard rows reclaim the room.
  const minimumBodyRowCountForBothSections =
    SHORTCUTS_MODAL_KEYBOARD_SECTION_LABEL_ROW_COUNT
    + 1
    + betweenSectionsDividerRowCount
    + SHORTCUTS_MODAL_HELP_SECTION_LABEL_ROW_COUNT
    + input.helpLegendRowCountAtFull;

  const showsHelpSection = bodyContentRowBudget >= minimumBodyRowCountForBothSections;

  const keyboardSectionContentRowBudget = showsHelpSection
    ? bodyContentRowBudget
      - betweenSectionsDividerRowCount
      - SHORTCUTS_MODAL_HELP_SECTION_LABEL_ROW_COUNT
      - input.helpLegendRowCountAtFull
    : bodyContentRowBudget;

  const visibleKeyboardLegendRowCount = Math.min(
    input.keyboardLegendRowCountAtFull,
    Math.max(0, keyboardSectionContentRowBudget - SHORTCUTS_MODAL_KEYBOARD_SECTION_LABEL_ROW_COUNT),
  );

  return {
    visibleKeyboardLegendRowCount,
    showsHelpSection,
  };
}

function computeShortcutsModalChromeRowCount(rendersComfortableChrome: boolean): number {
  if (rendersComfortableChrome) {
    return (
      SHORTCUTS_MODAL_ROUNDED_BORDER_TOP_AND_BOTTOM_ROW_COUNT
      + SHORTCUTS_MODAL_ACCENT_STRIP_ROW_COUNT_AT_COMFORTABLE_CHROME
      + SHORTCUTS_MODAL_HEADER_PADDING_Y_ROW_COUNT_AT_COMFORTABLE_CHROME
      + SHORTCUTS_MODAL_HEADER_ROW_COUNT
      + SHORTCUTS_MODAL_AFTER_HEADER_DIVIDER_ROW_COUNT_AT_COMFORTABLE_CHROME
      + SHORTCUTS_MODAL_BODY_PADDING_Y_ROW_COUNT_AT_COMFORTABLE_CHROME
      + SHORTCUTS_MODAL_FOOTER_ROW_COUNT_AT_COMFORTABLE_CHROME
    );
  }
  return (
    SHORTCUTS_MODAL_ROUNDED_BORDER_TOP_AND_BOTTOM_ROW_COUNT
    + SHORTCUTS_MODAL_HEADER_ROW_COUNT
  );
}
