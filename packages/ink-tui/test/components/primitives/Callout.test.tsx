import { expect, test } from "bun:test";
import { renderToString } from "ink";
import { Text } from "ink";
import { Callout } from "../../../src/components/primitives/Callout.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

const severityToAccentToken = {
  info: "accentCyan",
  success: "accentGreen",
  warning: "accentAmber",
  error: "accentRed",
} as const;

for (const [severity, tokenKey] of Object.entries(severityToAccentToken) as Array<[keyof typeof severityToAccentToken, "accentCyan" | "accentGreen" | "accentAmber" | "accentRed"]>) {
  test(`Callout severity ${severity} uses ${tokenKey} for the border accent`, () => {
    const ansiOutput = renderToString(
      <Callout
        severity={severity}
        bodyContent={<Text>{`${severity} body`}</Text>}
      />,
    );
    expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme[tokenKey]));
    expect(ansiOutput).toContain(`${severity} body`);
  });
}

test("Callout renders a fully rounded border (not a left-only line)", () => {
  const ansiOutput = renderToString(
    <Callout severity="info" bodyContent={<Text>quick note</Text>} />,
  );
  // Rounded border emits ╭ ╮ ╰ ╯ corners. Left-only single border emits │
  // without corners. Assert the rounded corners are present.
  expect(ansiOutput).toContain("╭");
  expect(ansiOutput).toContain("╯");
});
