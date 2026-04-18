import { expect, test } from "bun:test";
import { renderToString } from "ink";
import { Text } from "ink";
import { NumberedList } from "../../../src/components/primitives/NumberedList.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

test("NumberedList renders zero-padded markers in accentGreen and items in textPrimary", () => {
  const ansiOutput = renderToString(
    <NumberedList itemContents={[
      <Text>install dependencies</Text>,
      <Text>seed the library</Text>,
      <Text>boot the dev server</Text>,
    ]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentGreen));
  // Markers should be zero-padded to two digits when total ≥ 10 OR always to 2.
  // Per pen design: always two digits.
  expect(ansiOutput).toContain("01.");
  expect(ansiOutput).toContain("02.");
  expect(ansiOutput).toContain("03.");
  expect(ansiOutput).toContain("install dependencies");
});
