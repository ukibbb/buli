import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { ReasoningStreamBlock } from "../../src/components/ReasoningStreamBlock.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function ansi24BitBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[48;2;${r};${g};${b}m`;
}

test("ReasoningStreamBlock renders amber dot label and elapsed timer in the header", () => {
  const output = renderWithoutAnsi(
    <ReasoningStreamBlock
      reasoningSummaryText=""
      reasoningStartedAtMs={Date.now() - 500}
    />,
  );
  expect(output).toContain("// reasoning");
});

test("ReasoningStreamBlock renders the streaming reasoning summary text in its body", () => {
  const output = renderWithoutAnsi(
    <ReasoningStreamBlock
      reasoningSummaryText="Tracing the indexer from entry to Neo4j writes."
      reasoningStartedAtMs={Date.now()}
    />,
  );
  expect(output).toContain("Tracing the indexer from entry to Neo4j writes.");
});

test("ReasoningStreamBlock header renders amber dot, '// reasoning' label, and dim elapsed time", () => {
  const startedAtMs = Date.now() - 3200;
  const ansiOutput = renderToString(
    <ReasoningStreamBlock
      reasoningSummaryText="Walking the project tree to find every module that re-exports the indexer."
      reasoningStartedAtMs={startedAtMs}
    />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentAmber));
  expect(ansiOutput).toContain("// reasoning");
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textDim));
  expect(ansiOutput).toMatch(/[0-9]+\.[0-9]s/);
});

test("ReasoningStreamBlock body renders a 2-cell-wide textDim stripe and italic summary text", () => {
  const ansiOutput = renderToString(
    <ReasoningStreamBlock
      reasoningSummaryText="Walking the project tree."
      reasoningStartedAtMs={Date.now()}
    />,
  );
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.textDim));
  expect(ansiOutput).toContain("\x1b[3m");
  expect(ansiOutput).toContain("Walking the project tree.");
});
