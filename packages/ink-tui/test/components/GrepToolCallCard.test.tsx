import { expect, test } from "bun:test";
import { renderToString } from "ink";
import React from "react";
import { GrepToolCallCard } from "../../src/components/toolCalls/GrepToolCallCard.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

test("GrepToolCallCard uses accentGreen for the tool glyph in completed state", () => {
  const ansiOutput = renderToString(
    <GrepToolCallCard
      toolCallDetail={{
        toolName: "grep",
        searchPattern: "Atlas",
        totalMatchCount: 12,
        matchedFileCount: 4,
      }}
      renderState="completed"
    />,
  );
  const greenSeq = ansi24BitFg(chatScreenTheme.accentGreen);
  // The glyph (header-left tool icon) inherits stripeColor. After the fix,
  // accentGreen must appear in the output and the glyph must follow it.
  expect(ansiOutput).toContain(greenSeq);
  // Sanity: cyan still appears (the search-pattern target uses accentCyan),
  // so we anchor by glyph order. The accentGreen sequence must occur before
  // the literal `Atlas` (search pattern) in the buffer.
  const greenIndex = ansiOutput.indexOf(greenSeq);
  const atlasIndex = ansiOutput.indexOf("Atlas");
  expect(greenIndex).toBeGreaterThan(-1);
  expect(atlasIndex).toBeGreaterThan(greenIndex);
});

test("GrepToolCallCard uses accentRed in failed state", () => {
  const ansiOutput = renderToString(
    <GrepToolCallCard
      toolCallDetail={{
        toolName: "grep",
        searchPattern: "Atlas",
        totalMatchCount: 0,
        matchedFileCount: 0,
      }}
      renderState="failed"
      errorText="ripgrep is not on PATH"
    />,
  );
  const redSeq = ansi24BitFg(chatScreenTheme.accentRed);
  expect(ansiOutput).toContain(redSeq);
});
