import { expect, test } from "bun:test";
import { renderToString } from "ink";
import { FencedCodeBlock } from "../../../src/components/primitives/FencedCodeBlock.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

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

test("FencedCodeBlock standalone variant renders surfaceOne background and borderSubtle rounded border", () => {
  const ansiOutput = renderToString(
    <FencedCodeBlock
      languageLabel="typescript"
      codeLines={[
        { lineNumber: 1, lineText: "export const foo = 1;" },
        { lineNumber: 2, lineText: "export const bar = 2;" },
      ]}
    />,
  );
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.surfaceOne));
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.borderSubtle));
  expect(ansiOutput).toContain("// typescript");
  expect(ansiOutput).toContain("export const foo = 1;");
  expect(ansiOutput).toContain("export const bar = 2;");
  // Standalone variant draws rounded corners.
  expect(ansiOutput).toContain("╭");
  expect(ansiOutput).toContain("╯");
});

test("FencedCodeBlock standalone variant without language label still renders surfaceOne chrome", () => {
  const ansiOutput = renderToString(
    <FencedCodeBlock
      codeLines={[{ lineNumber: 1, lineText: "x" }]}
    />,
  );
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.surfaceOne));
  expect(ansiOutput).not.toContain("//");
});

test("FencedCodeBlock embedded variant renders no surfaceOne background and no rounded corners", () => {
  const ansiOutput = renderToString(
    <FencedCodeBlock
      variant="embedded"
      codeLines={[{ lineNumber: 1, lineText: "embedded line" }]}
    />,
  );
  expect(ansiOutput).not.toContain(ansi24BitBg(chatScreenTheme.surfaceOne));
  expect(ansiOutput).not.toContain("╭");
});
