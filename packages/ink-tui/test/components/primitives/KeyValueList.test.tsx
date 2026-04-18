import { expect, test } from "bun:test";
import { renderToString } from "ink";
import { Text } from "ink";
import { KeyValueList } from "../../../src/components/primitives/KeyValueList.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

test("KeyValueList renders keys in bold accentCyan and value content as supplied", () => {
  const ansiOutput = renderToString(
    <KeyValueList entries={[
      { entryKeyLabel: "$ novibe", entryValueContent: <Text>A reading-first knowledge base</Text> },
      { entryKeyLabel: "$ librarian", entryValueContent: <Text>An agent that reads your library</Text> },
    ]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentCyan));
  expect(ansiOutput).toContain("\x1b[1m");
  expect(ansiOutput).toContain("$ novibe");
  expect(ansiOutput).toContain("$ librarian");
  expect(ansiOutput).toContain("A reading-first knowledge base");
});
