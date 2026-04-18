import { expect, test } from "bun:test";
import { renderToString } from "ink";
import { Text } from "ink";
import { BulletedList } from "../../../src/components/primitives/BulletedList.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

test("BulletedList renders >_ markers in accentCyan and items in textPrimary", () => {
  const ansiOutput = renderToString(
    <BulletedList itemContents={[
      <Text>read the brief twice</Text>,
      <Text>map out the happy path</Text>,
      <Text>sketch the first frame</Text>,
    ]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentCyan));
  expect(ansiOutput).toContain(">_");
  expect(ansiOutput).toContain("read the brief twice");
  expect(ansiOutput).toContain("sketch the first frame");
});
