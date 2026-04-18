import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import type { ReactElement } from "react";
import { ContextWindowMeter } from "../../src/components/ContextWindowMeter.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function renderWithoutAnsi(node: ReactElement): string {
  return stripVTControlCharacters(renderToString(node));
}

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

test("ContextWindowMeter renders ctx label and percent", () => {
  const plain = renderWithoutAnsi(
    <ContextWindowMeter totalTokensUsed={42_000} contextWindowTokenCapacity={100_000} />,
  );
  expect(plain).toContain("ctx");
  expect(plain).toContain("42%");
});

test("ContextWindowMeter renders the percent in bold accentCyan", () => {
  const ansiOutput = renderToString(
    <ContextWindowMeter totalTokensUsed={42_000} contextWindowTokenCapacity={100_000} />,
  );
  const cyanSeq = ansi24BitFg(chatScreenTheme.accentCyan);
  // chalk emits "\x1b[1m" for bold and the 24-bit fg sequence for color.
  // The order chalk uses with `<Text bold color={...}>` is: bold-on, color, text.
  expect(ansiOutput).toContain(`\x1b[1m${cyanSeq}42%`);
});

test("ContextWindowMeter falls back to ctx -- when usage is undefined", () => {
  const plain = renderWithoutAnsi(
    <ContextWindowMeter totalTokensUsed={undefined} contextWindowTokenCapacity={100_000} />,
  );
  expect(plain).toContain("ctx --");
});
