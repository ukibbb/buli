import { describe, expect, test } from "bun:test";
import {
  planShortcutsModalRowBudget,
  type ShortcutsModalRowBudgetInput,
} from "../src/shortcutsModalRowBudgetPlan.ts";

const KEYBOARD_LEGEND_ROW_COUNT_AT_FULL = 5;
const HELP_LEGEND_ROW_COUNT_AT_FULL = 2;

function makeShortcutsModalRowBudgetInput(
  overrides: Partial<ShortcutsModalRowBudgetInput>,
): ShortcutsModalRowBudgetInput {
  return {
    availableModalRowCount: 24,
    keyboardLegendRowCountAtFull: KEYBOARD_LEGEND_ROW_COUNT_AT_FULL,
    helpLegendRowCountAtFull: HELP_LEGEND_ROW_COUNT_AT_FULL,
    rendersComfortableChrome: true,
    ...overrides,
  };
}

describe("planShortcutsModalRowBudget", () => {
  test("renders_full_keyboard_section_and_help_section_when_room_is_plentiful_under_comfortable_chrome", () => {
    const plan = planShortcutsModalRowBudget(
      makeShortcutsModalRowBudgetInput({
        availableModalRowCount: 30,
        rendersComfortableChrome: true,
      }),
    );
    expect(plan.visibleKeyboardLegendRowCount).toBe(KEYBOARD_LEGEND_ROW_COUNT_AT_FULL);
    expect(plan.showsHelpSection).toBe(true);
  });

  test("drops_help_section_first_when_comfortable_chrome_eats_too_much_room_for_both_sections", () => {
    const plan = planShortcutsModalRowBudget(
      makeShortcutsModalRowBudgetInput({
        availableModalRowCount: 17,
        rendersComfortableChrome: true,
      }),
    );
    expect(plan.showsHelpSection).toBe(false);
    expect(plan.visibleKeyboardLegendRowCount).toBe(KEYBOARD_LEGEND_ROW_COUNT_AT_FULL);
  });

  test("renders_full_keyboard_and_help_when_chrome_is_omitted_at_modest_modal_height", () => {
    const plan = planShortcutsModalRowBudget(
      makeShortcutsModalRowBudgetInput({
        availableModalRowCount: 12,
        rendersComfortableChrome: false,
      }),
    );
    expect(plan.visibleKeyboardLegendRowCount).toBe(KEYBOARD_LEGEND_ROW_COUNT_AT_FULL);
    expect(plan.showsHelpSection).toBe(true);
  });

  test("trims_keyboard_rows_to_fit_alongside_help_section_when_no_chrome_is_present_and_room_is_tight", () => {
    const plan = planShortcutsModalRowBudget(
      makeShortcutsModalRowBudgetInput({
        availableModalRowCount: 8,
        rendersComfortableChrome: false,
      }),
    );
    expect(plan.visibleKeyboardLegendRowCount).toBe(1);
    expect(plan.showsHelpSection).toBe(true);
  });

  test("drops_help_section_then_grows_keyboard_section_when_room_falls_below_minimum_for_both_sections", () => {
    const plan = planShortcutsModalRowBudget(
      makeShortcutsModalRowBudgetInput({
        availableModalRowCount: 7,
        rendersComfortableChrome: false,
      }),
    );
    expect(plan.showsHelpSection).toBe(false);
    expect(plan.visibleKeyboardLegendRowCount).toBe(3);
  });

  test("renders_zero_keyboard_rows_when_modal_budget_only_covers_chrome", () => {
    const plan = planShortcutsModalRowBudget(
      makeShortcutsModalRowBudgetInput({
        availableModalRowCount: 3,
        rendersComfortableChrome: false,
      }),
    );
    expect(plan.visibleKeyboardLegendRowCount).toBe(0);
    expect(plan.showsHelpSection).toBe(false);
  });

  test("clamps_visible_keyboard_rows_to_legend_total_so_extra_room_does_not_inflate_the_count", () => {
    const plan = planShortcutsModalRowBudget(
      makeShortcutsModalRowBudgetInput({
        availableModalRowCount: 100,
        rendersComfortableChrome: true,
      }),
    );
    expect(plan.visibleKeyboardLegendRowCount).toBe(KEYBOARD_LEGEND_ROW_COUNT_AT_FULL);
    expect(plan.showsHelpSection).toBe(true);
  });

  test("treats_zero_or_negative_modal_budget_as_zero_visible_rows_and_no_help_section", () => {
    for (const availableModalRowCount of [0, -5]) {
      const plan = planShortcutsModalRowBudget(
        makeShortcutsModalRowBudgetInput({
          availableModalRowCount,
          rendersComfortableChrome: false,
        }),
      );
      expect(plan.visibleKeyboardLegendRowCount).toBe(0);
      expect(plan.showsHelpSection).toBe(false);
    }
  });

  test("respects_a_smaller_keyboard_legend_total_so_planning_works_for_future_legend_changes", () => {
    const plan = planShortcutsModalRowBudget(
      makeShortcutsModalRowBudgetInput({
        availableModalRowCount: 30,
        keyboardLegendRowCountAtFull: 2,
        rendersComfortableChrome: true,
      }),
    );
    expect(plan.visibleKeyboardLegendRowCount).toBe(2);
    expect(plan.showsHelpSection).toBe(true);
  });
});
