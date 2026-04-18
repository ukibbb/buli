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

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

test("TopBar uses accentGreen for the status dot and textSecondary for the path", () => {
  const ansiOutput = renderToString(
    <TopBar workingDirectoryPath="~/workspace/novibe/apps/api" />,
  );
  const greenSeq = ansi24BitFg(chatScreenTheme.accentGreen);
  const secondarySeq = ansi24BitFg(chatScreenTheme.textSecondary);
  expect(ansiOutput).toContain(`${greenSeq}${glyphs.statusDot}`);
  expect(ansiOutput).toContain(`${secondarySeq}~/workspace/novibe/apps/api`);
});
