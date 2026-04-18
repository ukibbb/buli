import { expect, test } from "bun:test";
import { renderToString } from "ink";
import { TodoWriteToolCallCard } from "../../src/components/toolCalls/TodoWriteToolCallCard.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

test("TodoWriteToolCallCard uses accentPrimaryMuted stripe and shows progress label", () => {
  const ansiOutput = renderToString(
    <TodoWriteToolCallCard
      toolCallDetail={{
        toolName: "todowrite",
        todoItems: [
          { todoItemTitle: "draft palette", todoItemStatus: "completed" },
          { todoItemTitle: "render gallery", todoItemStatus: "in_progress" },
          { todoItemTitle: "wire reader", todoItemStatus: "pending" },
        ],
      }}
      renderState="completed"
    />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentPrimaryMuted));
  expect(ansiOutput).toContain("Plan");
  expect(ansiOutput).toContain("1/3 done");
  expect(ansiOutput).toContain("1 active");
  expect(ansiOutput).toContain("draft palette");
  expect(ansiOutput).toContain("render gallery");
});

test("TodoWriteToolCallCard failed renders accentRed stripe and error text", () => {
  const ansiOutput = renderToString(
    <TodoWriteToolCallCard
      toolCallDetail={{ toolName: "todowrite", todoItems: [] }}
      renderState="failed"
      errorText="plan storage offline"
    />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentRed));
  expect(ansiOutput).toContain("plan storage offline");
});
