import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { ReasoningCollapsedChip } from "../../src/components/ReasoningCollapsedChip.tsx";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
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
