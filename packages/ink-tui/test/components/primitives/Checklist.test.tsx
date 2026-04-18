import { expect, test } from "bun:test";
import { renderToString } from "ink";
import { Checklist } from "../../../src/components/primitives/Checklist.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

test("Checklist pending row uses ☐ glyph in textDim and textSecondary body", () => {
  const ansiOutput = renderToString(
    <Checklist items={[
      { itemTitle: "wire the kinds into the library reader", itemStatus: "pending" },
    ]} />,
  );
  expect(ansiOutput).toContain("☐");
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textDim));
  expect(ansiOutput).toContain("wire the kinds into the library reader");
});

test("Checklist completed row uses ☑ glyph in accentCyan and textMuted body", () => {
  const ansiOutput = renderToString(
    <Checklist items={[
      { itemTitle: "draft the terminal palette", itemStatus: "completed" },
    ]} />,
  );
  expect(ansiOutput).toContain("☑");
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentCyan));
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textMuted));
  expect(ansiOutput).toContain("draft the terminal palette");
});

test("Checklist in_progress row keeps ▸ in accentAmber", () => {
  const ansiOutput = renderToString(
    <Checklist items={[
      { itemTitle: "render each kind in a gallery", itemStatus: "in_progress" },
    ]} />,
  );
  expect(ansiOutput).toContain("▸");
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentAmber));
});
