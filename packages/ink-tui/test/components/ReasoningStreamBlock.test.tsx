import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { ReasoningStreamBlock } from "../../src/components/ReasoningStreamBlock.tsx";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
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
