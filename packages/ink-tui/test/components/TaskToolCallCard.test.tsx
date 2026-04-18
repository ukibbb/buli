import { expect, test } from "bun:test";
import { renderToString } from "ink";
import { stripVTControlCharacters } from "node:util";
import { TaskToolCallCard } from "../../src/components/toolCalls/TaskToolCallCard.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

test("TaskToolCallCard completed uses accentPurple stripe and renders prompt + result", () => {
  const ansiOutput = renderToString(
    <TaskToolCallCard
      toolCallDetail={{
        toolName: "task",
        subagentDescription: "summarize the indexer doc",
        subagentPrompt: "Summarize docs/atlas-indexer.md in 3 bullet points.",
        subagentResultSummary: "Walks the project tree, extracts module nodes, upserts to Neo4j.",
      }}
      renderState="completed"
    />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentPurple));
  expect(ansiOutput).toContain("Task");
  const plain = stripVTControlCharacters(ansiOutput);
  expect(plain).toContain("summarize the indexer doc");
  expect(plain).toContain("// prompt");
  expect(plain).toContain("Summarize docs/atlas-indexer.md");
  expect(plain).toContain("// result");
  expect(plain).toContain("Walks the project tree");
});

test("TaskToolCallCard failed renders accentRed stripe and error text", () => {
  const ansiOutput = renderToString(
    <TaskToolCallCard
      toolCallDetail={{ toolName: "task", subagentDescription: "any" }}
      renderState="failed"
      errorText="sub-agent crashed"
    />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentRed));
  expect(ansiOutput).toContain("sub-agent crashed");
});
