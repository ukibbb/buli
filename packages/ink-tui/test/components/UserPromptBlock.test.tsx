import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { UserPromptBlock } from "../../src/components/UserPromptBlock.tsx";
import { glyphs } from "../../src/components/glyphs.ts";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

test("UserPromptBlock renders the chevron caret and the prompt text", () => {
  const output = renderWithoutAnsi(
    <UserPromptBlock promptText="explain the atlas indexer" />,
  );
  expect(output).toContain(glyphs.userPromptCaret);
  expect(output).not.toContain(">");
  expect(output).toContain("explain the atlas indexer");
});
