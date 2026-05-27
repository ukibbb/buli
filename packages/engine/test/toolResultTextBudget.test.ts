import { expect, test } from "bun:test";
import { buildHeadTailBudgetedText } from "../src/tools/toolResultTextBudget.ts";

test("buildHeadTailBudgetedText keeps short text unchanged", () => {
  expect(buildHeadTailBudgetedText({
    sourceText: "short output",
    maximumCharacterCount: 100,
    createTruncationNotice: (omittedCharacterCount) => `[omitted ${omittedCharacterCount}]`,
  })).toBe("short output");
});

test("buildHeadTailBudgetedText preserves head and tail within the character budget", () => {
  const budgetedText = buildHeadTailBudgetedText({
    sourceText: `HEAD-${"x".repeat(200)}-TAIL`,
    maximumCharacterCount: 80,
    createTruncationNotice: (omittedCharacterCount) => `[omitted ${omittedCharacterCount} characters]`,
  });

  expect(budgetedText.length).toBeLessThanOrEqual(80);
  expect(budgetedText.startsWith("HEAD-")).toBe(true);
  expect(budgetedText).toContain("omitted");
  expect(budgetedText.endsWith("-TAIL")).toBe(true);
});

test("buildHeadTailBudgetedText returns a bounded notice when the notice fills the budget", () => {
  const budgetedText = buildHeadTailBudgetedText({
    sourceText: "large output",
    maximumCharacterCount: 10,
    createTruncationNotice: (omittedCharacterCount) => `[omitted ${omittedCharacterCount} characters]`,
  });

  expect(budgetedText).toHaveLength(10);
  expect(budgetedText.startsWith("[omitted")).toBe(true);
});
