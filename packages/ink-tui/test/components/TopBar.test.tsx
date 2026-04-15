import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { TopBar } from "../../src/components/TopBar.tsx";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

test("TopBar renders the working directory path as the sole status indicator", () => {
  const output = renderWithoutAnsi(<TopBar workingDirectoryPath="~/workspace/novibe/apps/api" />);
  expect(output).toContain("~/workspace/novibe/apps/api");
});

test("TopBar no longer renders the mode chip, model chip, or close glyph", () => {
  const output = renderWithoutAnsi(<TopBar workingDirectoryPath="/tmp" />);
  expect(output).not.toContain("implementation");
  expect(output).not.toContain("opus-4.6");
  expect(output).not.toContain("×");
});
