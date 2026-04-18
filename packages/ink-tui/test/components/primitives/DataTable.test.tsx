import { expect, test } from "bun:test";
import { renderToString } from "ink";
import { Text } from "ink";
import { DataTable } from "../../../src/components/primitives/DataTable.tsx";
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

test("DataTable wraps the grid in an accentGreen rounded border", () => {
  const ansiOutput = renderToString(
    <DataTable
      columnHeaderLabels={["Endpoint", "Method", "Status"]}
      bodyRowValues={[
        [<Text>/api/library</Text>, <Text>GET</Text>, <Text>200</Text>],
        [<Text>/api/library</Text>, <Text>POST</Text>, <Text>201</Text>],
      ]}
    />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentGreen));
  expect(ansiOutput).toContain("╭");
  expect(ansiOutput).toContain("╯");
  expect(ansiOutput).toContain("Endpoint");
  expect(ansiOutput).toContain("/api/library");
});

test("DataTable header row uses surfaceTwo background", () => {
  const ansiOutput = renderToString(
    <DataTable
      columnHeaderLabels={["A", "B"]}
      bodyRowValues={[[<Text>1</Text>, <Text>2</Text>]]}
    />,
  );
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.surfaceTwo));
});

test("DataTable renders a borderSubtle divider between every body row pair", () => {
  const ansiOutput = renderToString(
    <DataTable
      columnHeaderLabels={["A"]}
      bodyRowValues={[
        [<Text>row 1</Text>],
        [<Text>row 2</Text>],
        [<Text>row 3</Text>],
      ]}
    />,
  );
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.borderSubtle));
  expect(ansiOutput).toContain("row 1");
  expect(ansiOutput).toContain("row 2");
  expect(ansiOutput).toContain("row 3");
});
