import { expect, test } from "bun:test";
import { renderToString } from "ink";
import { stripVTControlCharacters } from "node:util";
import { ModelAndReasoningSelectionPane } from "../../src/components/ModelAndReasoningSelectionPane.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

test("ModelAndReasoningSelectionPane renders heading in bold accentCyan", () => {
  const ansiOutput = renderToString(
    <ModelAndReasoningSelectionPane
      headingText="Choose a model"
      visibleChoices={["opus-4.6", "sonnet-4.6", "haiku-4.5"]}
      highlightedChoiceIndex={0}
    />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentCyan));
  expect(ansiOutput).toContain("\x1b[1m");
  expect(ansiOutput).toContain("Choose a model");
});

test("ModelAndReasoningSelectionPane highlights the chosen index with > marker and accentCyan", () => {
  const ansiOutput = renderToString(
    <ModelAndReasoningSelectionPane
      headingText="Choose a model"
      visibleChoices={["opus-4.6", "sonnet-4.6", "haiku-4.5"]}
      highlightedChoiceIndex={1}
    />,
  );
  const plain = stripVTControlCharacters(ansiOutput);
  expect(plain).toContain("> sonnet-4.6");
  expect(plain).toContain("  opus-4.6");
  expect(plain).toContain("  haiku-4.5");
  // Highlighted choice text is in accentCyan.
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentCyan));
  // Other choices in textPrimary.
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textPrimary));
});

test("ModelAndReasoningSelectionPane renders the footer hint in textMuted", () => {
  const ansiOutput = renderToString(
    <ModelAndReasoningSelectionPane
      headingText="Choose a model"
      visibleChoices={["opus-4.6"]}
      highlightedChoiceIndex={0}
    />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textMuted));
  const plain = stripVTControlCharacters(ansiOutput);
  expect(plain).toContain("Enter select");
  expect(plain).toContain("Esc close");
  expect(plain).toContain("Up/Down move");
});
