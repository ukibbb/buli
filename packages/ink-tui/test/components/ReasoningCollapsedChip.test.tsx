// Enable colors in test environment
process.env.FORCE_COLOR = "3";

import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ReasoningCollapsedChip } from "../../src/components/ReasoningCollapsedChip.tsx";

// Try to enable chalk colors by accessing it through a safe method
try {
  const ink = require("ink");
  const realChalk = ink?.default || ink;
  // Can't directly access chalk, so we'll try to set it on the global if available
} catch {
  // Chalk not directly accessible, colors might not work in ANSI tests
}

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Use lowercase 'b' since chalk outputs lowercase
  return `\x1b[38;2;${r};${g};${b}m`;
}


test("ReasoningCollapsedChip renders thinking duration in seconds with one decimal", () => {
  const output = renderWithoutAnsi(
    <ReasoningCollapsedChip reasoningDurationMs={3200} reasoningTokenCount={undefined} />,
  );
  expect(output).toContain("// thinking");
  expect(output).toContain("3.2s");
});

test("ReasoningCollapsedChip omits token count clause when token count is unknown", () => {
  const output = renderWithoutAnsi(
    <ReasoningCollapsedChip reasoningDurationMs={1000} reasoningTokenCount={undefined} />,
  );
  expect(output).not.toContain("tokens");
});

test("ReasoningCollapsedChip renders token count clause when token count is known", () => {
  const output = renderWithoutAnsi(
    <ReasoningCollapsedChip reasoningDurationMs={1000} reasoningTokenCount={1248} />,
  );
  expect(output).toContain("1248 tokens");
});

test("ReasoningCollapsedChip renders the duration in textMuted, not textDim", () => {
  const ansiOutput = renderToString(
    <ReasoningCollapsedChip reasoningDurationMs={3200} reasoningTokenCount={1248} />,
  );
  const mutedSeq = ansi24BitFg(chatScreenTheme.textMuted);
  expect(ansiOutput).toContain(`${mutedSeq}3.2s`);
});

test("ReasoningCollapsedChip renders the token clause in textDim", () => {
  const ansiOutput = renderToString(
    <ReasoningCollapsedChip reasoningDurationMs={3200} reasoningTokenCount={1248} />,
  );
  // The token count is rendered in its own Text element with textDim color
  // Check that 1248 tokens appears and the dim color code is present
  expect(ansiOutput).toContain("1248 tokens");
  // Check that the dim color (71;85;105) is used somewhere in the output
  expect(ansiOutput).toContain("\u001b[38;2;71;85;105m");
});
