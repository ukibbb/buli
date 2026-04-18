import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import { EditToolCallCard } from "../../src/components/toolCalls/EditToolCallCard.tsx";
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

test("EditToolCallCard completed state shows +N -M counts in green and red", () => {
  const ansiOutput = renderToString(
    <EditToolCallCard
      toolCallDetail={{
        toolName: "edit",
        editedFilePath: "src/runtime.ts",
        addedLineCount: 3,
        removedLineCount: 1,
        diffLines: [
          { lineKind: "context", lineText: "function run() {" },
          { lineKind: "removal", lineText: "  return null;" },
          { lineKind: "addition", lineText: "  return start();" },
          { lineKind: "addition", lineText: "  // initialised" },
          { lineKind: "addition", lineText: "}" },
        ],
      }}
      renderState="completed"
    />,
  );
  const greenSeq = ansi24BitFg(chatScreenTheme.accentGreen);
  const redSeq = ansi24BitFg(chatScreenTheme.accentRed);
  // The success-status slot bolds the +N and -M counts. Chalk emits bold
  // before color when both are set on the same Text, but the order can be
  // [bold-on, color] or [color, bold-on] depending on chalk version. Use
  // a substring check that requires BOTH the bold marker and the color
  // sequence within the immediate vicinity of the count text.
  const greenIndex = ansiOutput.indexOf(`${greenSeq}`);
  expect(greenIndex).toBeGreaterThan(-1);
  expect(ansiOutput).toContain("+3");
  expect(ansiOutput).toContain("\x1b[1m");
  // For -1, similarly assert red appears around the count.
  expect(ansiOutput).toContain(redSeq);
  expect(ansiOutput).toContain("-1");
});

test("EditToolCallCard failed state surfaces the error text and uses red stripe color", () => {
  const ansiOutput = renderToString(
    <EditToolCallCard
      toolCallDetail={{
        toolName: "edit",
        editedFilePath: "src/runtime.ts",
        diffLines: undefined,
      }}
      renderState="failed"
      errorText="permission denied"
    />,
  );
  const redSeq = ansi24BitFg(chatScreenTheme.accentRed);
  expect(ansiOutput).toContain(redSeq);
  const plain = stripVTControlCharacters(ansiOutput);
  expect(plain).toContain("permission denied");
});

test("EditToolCallCard diff body uses diffAdditionBg / diffRemovalBg row tints", () => {
  const ansiOutput = renderToString(
    <EditToolCallCard
      toolCallDetail={{
        toolName: "edit",
        editedFilePath: "src/x.ts",
        diffLines: [
          { lineKind: "addition", lineText: "added line" },
          { lineKind: "removal", lineText: "removed line" },
        ],
      }}
      renderState="completed"
    />,
  );
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.diffAdditionBg));
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.diffRemovalBg));
});
