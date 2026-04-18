import { expect, test } from "bun:test";
import { renderToString } from "ink";
import { BashToolCallCard } from "../../src/components/toolCalls/BashToolCallCard.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

test("BashToolCallCard streaming uses accentAmber stripe and 'running…' label", () => {
  const ansiOutput = renderToString(
    <BashToolCallCard
      toolCallDetail={{ toolName: "bash", commandLine: "bun test" }}
      renderState="streaming"
    />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentAmber));
  expect(ansiOutput).toContain("Bash");
  expect(ansiOutput).toContain("bun test");
  expect(ansiOutput).toContain("running");
});

test("BashToolCallCard completed exit 0 shows accentGreen status", () => {
  const ansiOutput = renderToString(
    <BashToolCallCard
      toolCallDetail={{ toolName: "bash", commandLine: "ls", exitCode: 0 }}
      renderState="completed"
      durationMs={250}
    />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentGreen));
  expect(ansiOutput).toContain("exit 0");
});

test("BashToolCallCard completed exit non-zero shows accentRed status", () => {
  const ansiOutput = renderToString(
    <BashToolCallCard
      toolCallDetail={{ toolName: "bash", commandLine: "false", exitCode: 1 }}
      renderState="completed"
      durationMs={50}
    />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentRed));
  expect(ansiOutput).toContain("exit 1");
});

test("BashToolCallCard failed renders accentRed stripe and error text", () => {
  const ansiOutput = renderToString(
    <BashToolCallCard
      toolCallDetail={{ toolName: "bash", commandLine: "ls /nope" }}
      renderState="failed"
      errorText="command not found"
    />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentRed));
  expect(ansiOutput).toContain("command not found");
});
