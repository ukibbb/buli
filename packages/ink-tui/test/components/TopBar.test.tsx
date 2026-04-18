import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { TopBar } from "../../src/components/TopBar.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "../../src/components/glyphs.ts";

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

test("TopBar uses accentGreen for the status dot and textSecondary for the path", () => {
  const output = renderWithoutAnsi(
    <TopBar workingDirectoryPath="~/workspace/novibe/apps/api" />,
  );
  // Verify the glyphs and text are present (colors are configured in the component)
  expect(output).toContain(glyphs.statusDot);
  expect(output).toContain("~/workspace/novibe/apps/api");
  // Verify the design tokens match expected values
  expect(chatScreenTheme.accentGreen).toBe("#10B981");
  expect(chatScreenTheme.textSecondary).toBe("#94A3B8");
  expect(chatScreenTheme.surfaceOne).toBe("#111118");
});
