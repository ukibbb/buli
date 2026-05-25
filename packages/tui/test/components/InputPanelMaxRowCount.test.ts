import { expect, test } from "bun:test";
import { INPUT_PANEL_MAX_ROW_COUNT } from "../../src/components/InputPanel.tsx";
import { INPUT_STATUS_STRIP_ROW_COUNT } from "../../src/components/InputStatusStrip.tsx";
import { PROMPT_TEXTAREA_MAX_ROW_COUNT } from "../../src/components/PromptTextarea.tsx";

// Frame is pure prompt: 2 border rows + the textarea body.
test("input region row budget equals frame borders plus textarea", () => {
  expect(INPUT_PANEL_MAX_ROW_COUNT).toBe(2 + PROMPT_TEXTAREA_MAX_ROW_COUNT);
});

test("status strip reserves one content row plus one bottom gap", () => {
  expect(INPUT_STATUS_STRIP_ROW_COUNT).toBe(2);
});

test("total input region row budget includes restored status strip", () => {
  const fullInputRegionRowBudget = 2 + 1 + PROMPT_TEXTAREA_MAX_ROW_COUNT + 1;
  expect(INPUT_PANEL_MAX_ROW_COUNT + INPUT_STATUS_STRIP_ROW_COUNT).toBe(fullInputRegionRowBudget);
});
