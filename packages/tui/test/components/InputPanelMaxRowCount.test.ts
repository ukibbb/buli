import { expect, test } from "bun:test";
import { INPUT_PANEL_MAX_ROW_COUNT } from "../../src/components/InputPanel.tsx";
import { PROMPT_TEXTAREA_MAX_ROW_COUNT } from "../../src/components/PromptTextarea.tsx";
import { INPUT_STATUS_STRIP_ROW_COUNT } from "../../src/components/InputStatusStrip.tsx";

// Total input region row budget MUST stay constant across the chrome redesign:
//   2 (frame borders) + PROMPT_TEXTAREA_MAX_ROW_COUNT + INPUT_STATUS_STRIP_ROW_COUNT
// equals the pre-redesign value 2 + 1 (header) + PROMPT_TEXTAREA_MAX_ROW_COUNT + 1 (footer).
test("input region row budget equals frame borders + textarea + status strip", () => {
  expect(INPUT_PANEL_MAX_ROW_COUNT).toBe(2 + PROMPT_TEXTAREA_MAX_ROW_COUNT);
});

test("total input region row budget is unchanged from the pre-redesign formula", () => {
  const preRedesignInputRegionRowBudget = 2 + 1 + PROMPT_TEXTAREA_MAX_ROW_COUNT + 1;
  expect(INPUT_PANEL_MAX_ROW_COUNT + INPUT_STATUS_STRIP_ROW_COUNT).toBe(preRedesignInputRegionRowBudget);
});
