import { expect, test } from "bun:test";
import { INPUT_PANEL_MAX_ROW_COUNT } from "../../src/components/InputPanel.tsx";
import { PROMPT_TEXTAREA_MAX_ROW_COUNT } from "../../src/components/PromptTextarea.tsx";

// Frame is pure prompt: 2 border rows + the textarea body.
test("input region row budget equals frame borders plus textarea", () => {
  expect(INPUT_PANEL_MAX_ROW_COUNT).toBe(2 + PROMPT_TEXTAREA_MAX_ROW_COUNT);
});
