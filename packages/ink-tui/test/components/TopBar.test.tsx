import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { TopBar } from "../../src/components/TopBar.tsx";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

test("TopBar renders the working directory path in the left slot", () => {
  const output = renderWithoutAnsi(
    <TopBar
      workingDirectoryPath="~/workspace/novibe/apps/api"
      modeLabel="implementation"
      modelIdentifier="opus-4.6"
      reasoningEffortLabel="high"
    />,
  );
  expect(output).toContain("~/workspace/novibe/apps/api");
});

test("TopBar renders mode and model chips in the right slot", () => {
  const output = renderWithoutAnsi(
    <TopBar
      workingDirectoryPath="/tmp"
      modeLabel="implementation"
      modelIdentifier="opus-4.6"
      reasoningEffortLabel="high"
    />,
  );
  expect(output).toContain("implementation");
  expect(output).toContain("opus-4.6 · high");
});
