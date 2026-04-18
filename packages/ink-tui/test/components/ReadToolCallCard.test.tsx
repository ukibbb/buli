import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import type { ReactElement } from "react";
import { ReadToolCallCard } from "../../src/components/toolCalls/ReadToolCallCard.tsx";

function renderWithoutAnsi(node: ReactElement): string {
  return stripVTControlCharacters(renderToString(node));
}

test("ReadToolCallCard completed state renders preview lines and lineCount status", () => {
  const plain = renderWithoutAnsi(
    <ReadToolCallCard
      toolCallDetail={{
        toolName: "read",
        readFilePath: "src/atlas/indexer.ts",
        readLineCount: 220,
        readByteCount: 8_192,
        previewLines: [
          { lineNumber: 1, lineText: "import { Indexer } from './core'" },
          { lineNumber: 2, lineText: "export const indexer = new Indexer()" },
        ],
      }}
      renderState="completed"
    />,
  );
  expect(plain).toContain("Read");
  expect(plain).toContain("src/atlas/indexer.ts");
  expect(plain).toContain("220 lines");
  expect(plain).toContain("import { Indexer }");
});

test("ReadToolCallCard preview body has no inner code-block border (embedded variant)", () => {
  const plain = renderWithoutAnsi(
    <ReadToolCallCard
      toolCallDetail={{
        toolName: "read",
        readFilePath: "src/x.ts",
        readLineCount: 1,
        readByteCount: 10,
        previewLines: [{ lineNumber: 1, lineText: "x" }],
      }}
      renderState="completed"
    />,
  );
  // SurfaceCard provides the only set of rounded corners. The embedded
  // FencedCodeBlock must not draw a second rounded border around the
  // preview lines. Count rounded-corner glyphs — at most 4 (the outer
  // SurfaceCard's 4 corners). If FencedCodeBlock still renders its own
  // rounded border, this jumps to 8.
  const corners = (plain.match(/[╭╮╰╯]/g) ?? []).length;
  expect(corners).toBeLessThanOrEqual(4);
});
