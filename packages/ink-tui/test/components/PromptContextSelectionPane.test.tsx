import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { PromptContextSelectionPane } from "../../src/components/PromptContextSelectionPane.tsx";

function renderWithoutAnsi(node: React.ReactElement, columns = 80) {
  return stripVTControlCharacters(renderToString(node, { columns }));
}

test("PromptContextSelectionPane keeps each long candidate on one visual row", () => {
  const longDisplayPath = "/Users/lukasz/Desktop/Projekty/buli/.bun/install/cache/@babel/helper-annotate-as-pure@7.27.3@@@1/README.md";
  const output = renderWithoutAnsi(
    <PromptContextSelectionPane
      promptContextCandidates={[
        {
          kind: "file",
          displayPath: longDisplayPath,
          promptReferenceText: `@${longDisplayPath}`,
        },
      ]}
      highlightedPromptContextCandidateIndex={0}
    />,
    58,
  );

  expect(output.trimEnd().split("\n")).toHaveLength(4);
  expect(output).toContain("/Users/lukasz");
});

test("PromptContextSelectionPane keeps the highlighted candidate visible after the first six results", () => {
  const output = renderWithoutAnsi(
    <PromptContextSelectionPane
      promptContextCandidates={Array.from({ length: 8 }, (_value, index) => ({
        kind: "file" as const,
        displayPath: `project/file-${index + 1}.ts`,
        promptReferenceText: `@project/file-${index + 1}.ts`,
      }))}
      highlightedPromptContextCandidateIndex={6}
    />,
    80,
  );

  expect(output).toContain("project/file-7.ts");
  expect(output).not.toContain("project/file-1.ts");
});
