import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ReasoningCollapsedChip } from "../../src/components/ReasoningCollapsedChip.tsx";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
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
  // Chalk merges adjacent same-color spans into one ANSI run, so the textDim
  // separator ` · ` and the textDim `1248 tokens` end up as a single span
  // beginning with the textDim sequence.
  const dimSeq = ansi24BitFg(chatScreenTheme.textDim);
  expect(ansiOutput).toContain(`${dimSeq} · 1248 tokens`);
});
