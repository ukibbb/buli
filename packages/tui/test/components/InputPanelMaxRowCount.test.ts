import { expect, test } from "bun:test";
import { INPUT_PANEL_MAX_ROW_COUNT } from "../../src/components/InputPanel.tsx";
import { PROMPT_TEXTAREA_MAX_ROW_COUNT } from "../../src/components/PromptTextarea.tsx";
import { INPUT_STATUS_STRIP_ROW_COUNT } from "../../src/components/InputStatusStrip.tsx";

// Frame is pure prompt: 2 border rows + the textarea body. The strip below the
// frame is a single row. The redesign reclaims one row of vertical budget vs.
// the pre-redesign (which had a header row AND a footer row inside the frame);
// the regained row is given back to the message-area scrollbox above. This
// test pins the new shape so future edits can't silently grow or shrink it.
test("input region row budget equals frame borders + textarea + status strip", () => {
  expect(INPUT_PANEL_MAX_ROW_COUNT).toBe(2 + PROMPT_TEXTAREA_MAX_ROW_COUNT);
});

test("status strip occupies exactly one row", () => {
  expect(INPUT_STATUS_STRIP_ROW_COUNT).toBe(1);
});

test("total input region row budget is one row smaller than the pre-redesign formula", () => {
  const preRedesignInputRegionRowBudget = 2 + 1 + PROMPT_TEXTAREA_MAX_ROW_COUNT + 1;
  expect(INPUT_PANEL_MAX_ROW_COUNT + INPUT_STATUS_STRIP_ROW_COUNT).toBe(preRedesignInputRegionRowBudget - 1);
});
