import { expect, test } from "bun:test";
import {
  buildHeadTailBudgetedText,
  buildProviderVisibleToolResultBudgetGateText,
} from "../src/tools/toolResultTextBudget.ts";

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

test("buildProviderVisibleToolResultBudgetGateText keeps short complete evidence unchanged", () => {
  expect(buildProviderVisibleToolResultBudgetGateText({
    toolName: "grep",
    sourceText: "short complete output",
    maximumCharacterCount: 1_000,
    metadataLines: ["pattern: marker"],
    guidanceLines: ["Narrow the regex before retrying."],
    rawEvidenceStorage: "canonical_tool_result_text_stored",
  })).toBe("short complete output");
});

test("buildProviderVisibleToolResultBudgetGateText gates oversized evidence without raw head or tail snippets", () => {
  const budgetedText = buildProviderVisibleToolResultBudgetGateText({
    toolName: "grep",
    sourceText: `RAW_HEAD ${"x".repeat(2_000)} RAW_TAIL`,
    maximumCharacterCount: 1_200,
    metadataLines: ["pattern: marker", "matches: 500"],
    guidanceLines: ["Narrow the path, regex, include glob, or context lines before retrying."],
    rawEvidenceStorage: "canonical_tool_result_text_stored",
  });

  expect(budgetedText.length).toBeLessThanOrEqual(1_200);
  expect(budgetedText).toContain("<status>too_broad_incomplete</status>");
  expect(budgetedText).toContain("<original_character_count>");
  expect(budgetedText).toContain("<provider_visible_character_limit>1200</provider_visible_character_limit>");
  expect(budgetedText).toContain("Do not make absence, completeness, or coverage claims");
  expect(budgetedText).toContain("Narrow the path, regex, include glob, or context lines before retrying.");
  expect(budgetedText).not.toContain("RAW_HEAD");
  expect(budgetedText).not.toContain("RAW_TAIL");
});
