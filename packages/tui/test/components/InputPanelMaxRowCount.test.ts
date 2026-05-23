import { expect, test } from "bun:test";
import { INPUT_PANEL_MAX_ROW_COUNT } from "../../src/components/InputPanel.tsx";
import { PROMPT_TEXTAREA_MAX_ROW_COUNT } from "../../src/components/PromptTextarea.tsx";
import { INPUT_STATUS_STRIP_ROW_COUNT } from "../../src/components/InputStatusStrip.tsx";

// Frame is pure prompt: 2 border rows + the textarea body. The strip below the
// frame is one content row plus a one-row marginBottom that leaves a breathing
// gap between the chip line and whatever the host shell renders underneath
// (tmux bar, shell prompt, etc.). Total input region row budget therefore
// matches the pre-redesign formula exactly.
test("input region row budget equals frame borders + textarea + status strip", () => {
  expect(INPUT_PANEL_MAX_ROW_COUNT).toBe(2 + PROMPT_TEXTAREA_MAX_ROW_COUNT);
});

test("status strip reserves one content row plus a one-row bottom gap", () => {
  expect(INPUT_STATUS_STRIP_ROW_COUNT).toBe(2);
});

test("total input region row budget matches the pre-redesign formula", () => {
  const preRedesignInputRegionRowBudget = 2 + 1 + PROMPT_TEXTAREA_MAX_ROW_COUNT + 1;
  expect(INPUT_PANEL_MAX_ROW_COUNT + INPUT_STATUS_STRIP_ROW_COUNT).toBe(preRedesignInputRegionRowBudget);
});
