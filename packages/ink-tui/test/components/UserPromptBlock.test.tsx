import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { UserPromptBlock } from "../../src/components/UserPromptBlock.tsx";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

test("UserPromptBlock renders the cyan caret and the prompt text", () => {
  const output = renderWithoutAnsi(
    <UserPromptBlock promptText="explain the atlas indexer" />,
  );
  expect(output).toContain(">");
  expect(output).toContain("explain the atlas indexer");
});
